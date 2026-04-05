import { db } from "@/lib/db";
import {
  sequences,
  sequenceSteps,
  templateSteps,
  contacts,
  mailboxes,
} from "@/lib/db/schema";
import { eq, and, count, sql } from "drizzle-orm";
import { addDays, isWeekend, format } from "date-fns";
import { renderTemplate, buildContactVariables } from "@/lib/services/renderer";

export interface SequenceStepInput {
  subject?: string;
  body: string;
  delayDays?: number;
  isReplyThread?: boolean;
  cc?: string[];
  bcc?: string[];
}

export interface CreateSequenceOptions {
  campaignId?: string;
  templateId?: string;
  mailboxId?: string;
  steps?: SequenceStepInput[];
  sendingWindowStart?: string; // "HH:MM"
  sendingWindowEnd?: string;
  timezone?: string;
  skipWeekends?: boolean;
}

export async function createSequence(
  contactId: string,
  workspaceId: string,
  options: CreateSequenceOptions
) {
  // Load and validate contact
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, workspaceId)));

  if (!contact) {
    throw new Error("Contact not found");
  }
  if (contact.status !== "active") {
    throw new Error(`Contact is not active (status: ${contact.status})`);
  }

  // Resolve steps
  let resolvedSteps: Array<{
    subject?: string;
    body: string;
    delayDays: number;
    isReplyThread: boolean;
    ccRecipients: string[];
    bccRecipients: string[];
    stepNumber: number;
  }> = [];

  if (options.templateId) {
    // Load from template
    const tSteps = await db
      .select()
      .from(templateSteps)
      .where(eq(templateSteps.templateId, options.templateId))
      .orderBy(templateSteps.stepNumber);

    if (tSteps.length === 0) {
      throw new Error("Template has no steps");
    }

    const variables = buildContactVariables(contact);
    resolvedSteps = tSteps.map((step) => {
      const seed = `${contact.email}:${step.id}`;
      return {
        subject: step.subject ? renderTemplate(step.subject, variables, seed) : undefined,
        body: step.bodyTemplate ? renderTemplate(step.bodyTemplate, variables, seed) : "",
        delayDays: step.delayDays,
        isReplyThread: step.isReplyThread,
        ccRecipients: (step.ccRecipients as string[]) || [],
        bccRecipients: (step.bccRecipients as string[]) || [],
        stepNumber: step.stepNumber,
      };
    });
  } else if (options.steps && options.steps.length > 0) {
    resolvedSteps = options.steps.map((s, idx) => ({
      subject: s.subject,
      body: s.body,
      delayDays: s.delayDays ?? 0,
      isReplyThread: s.isReplyThread ?? true,
      ccRecipients: s.cc || [],
      bccRecipients: s.bcc || [],
      stepNumber: idx + 1,
    }));
  } else {
    throw new Error("Must provide either templateId or steps");
  }

  const skipWeekends = options.skipWeekends ?? true;
  const sendingWindowStart = options.sendingWindowStart ?? "08:00";
  const sendingWindowEnd = options.sendingWindowEnd ?? "18:00";
  const timezone = options.timezone ?? "UTC";

  // Pick mailbox
  let mailboxId: string;
  let precomputedSlot: { date: Date; slotIndex: number } | null = null;

  if (options.mailboxId) {
    mailboxId = options.mailboxId;
  } else {
    // Find the mailbox with the earliest available slot across all active mailboxes.
    // We pre-compute the slot here so step 1 doesn't need to re-query.
    const activeMailboxes = await db
      .select()
      .from(mailboxes)
      .where(and(eq(mailboxes.workspaceId, workspaceId), eq(mailboxes.isActive, true)));

    if (activeMailboxes.length === 0) {
      throw new Error("No active mailboxes available");
    }

    let earliest: { date: Date; slotIndex: number; mailboxId: string } | null = null;

    for (const mb of activeMailboxes) {
      try {
        const slot = await findNextAvailableSlot(mb.id, mb.dailyLimit, new Date(), skipWeekends);
        if (!earliest || slot.date < earliest.date) {
          earliest = { ...slot, mailboxId: mb.id };
        }
      } catch {
        // No slots available within 60 days for this mailbox — skip it
      }
    }

    if (!earliest) {
      throw new Error("No mailbox has capacity within the next 60 days");
    }

    mailboxId = earliest.mailboxId;
    precomputedSlot = { date: earliest.date, slotIndex: earliest.slotIndex };
  }

  // Load mailbox for daily limit info
  const [mailbox] = await db
    .select()
    .from(mailboxes)
    .where(eq(mailboxes.id, mailboxId));

  if (!mailbox) {
    throw new Error("Mailbox not found");
  }

  // Create sequence row
  const [sequence] = await db
    .insert(sequences)
    .values({
      workspaceId,
      contactId,
      campaignId: options.campaignId ?? null,
      templateId: options.templateId ?? null,
      mailboxId,
      status: "active",
      sendingWindowStart,
      sendingWindowEnd,
      timezone,
      skipWeekends,
    })
    .returning();

  // Schedule steps
  // Step 1 is scheduled via slot-based logic (respects daily limits).
  // Follow-up steps are pinned relative to step 1's actual send date.
  const startDate = new Date();
  let step1Date: Date | null = null;

  for (const step of resolvedSteps) {

    if (step.stepNumber === 1) {
      // Wrap the slot claim + insert in a transaction to prevent race conditions:
      // two concurrent createSequence calls could both read the same usage count
      // and schedule into the same slot. The transaction serializes the read-then-write.
      const result = await db.transaction(async (tx) => {
        // Re-use precomputed slot from auto-mailbox selection, or find one now
        const slot =
          precomputedSlot ??
          (await findNextAvailableSlot(
            mailboxId,
            mailbox.dailyLimit,
            startDate,
            skipWeekends
          ));

        // Re-read usage inside the transaction to guard against a concurrent request
        // claiming the same slot between our earlier check and this insert.
        const dateStr = format(slot.date, "yyyy-MM-dd");
        const [usage] = await tx
          .select({ count: count() })
          .from(sequenceSteps)
          .where(
            and(
              eq(sequenceSteps.mailboxId, mailboxId),
              sql`${sequenceSteps.status} IN ('pending', 'sent')`,
              sql`DATE(${sequenceSteps.scheduledAt}) = ${dateStr}::date`
            )
          );
        const currentUsage = usage?.count ?? 0;

        const scheduledAt = computeSendTime(
          slot.date,
          sendingWindowStart,
          sendingWindowEnd,
          currentUsage,
          mailbox.dailyLimit
        );

        await tx.insert(sequenceSteps).values({
          sequenceId: sequence.id,
          stepNumber: step.stepNumber,
          subject: step.subject ?? null,
          body: step.body,
          delayDays: step.delayDays,
          isReplyThread: step.isReplyThread,
          ccRecipients: step.ccRecipients,
          bccRecipients: step.bccRecipients,
          mailboxId,
          scheduledAt,
          status: "pending",
        });

        return { scheduledAt, step1Date: slot.date };
      });

      step1Date = result.step1Date;
      continue; // Already inserted inside the transaction
    }

    // Follow-up steps (steps 2-N)
    // Cascade from step 1's actual date, not the creation timestamp.
    // Follow-ups carry lower cold-email risk but still consume Gmail quota.
    // They are not slot-gated by dailyLimit, but will stack on downstream dates
    // if many sequences share the same step-1 date — plan campaign volume accordingly.
    if (!step1Date) throw new Error("step1Date not set before follow-up step");

    let targetDate = addDays(step1Date, step.delayDays);

    if (skipWeekends) {
      while (isWeekend(targetDate)) {
        targetDate = addDays(targetDate, 1);
      }
    }

    const dateStr = format(targetDate, "yyyy-MM-dd");
    const used = await getMailboxUsageForDate(mailboxId, dateStr);
    const scheduledAt = computeSendTime(
      targetDate,
      sendingWindowStart,
      sendingWindowEnd,
      used,
      mailbox.dailyLimit
    );

    await db.insert(sequenceSteps).values({
      sequenceId: sequence.id,
      stepNumber: step.stepNumber,
      subject: step.subject ?? null,
      body: step.body,
      delayDays: step.delayDays,
      isReplyThread: step.isReplyThread,
      ccRecipients: step.ccRecipients,
      bccRecipients: step.bccRecipients,
      mailboxId,
      scheduledAt,
      status: "pending",
    });
  }

  return sequence;
}

// ─── Scheduling helpers ───────────────────────────────────────────────────────

export async function getMailboxUsageForDate(
  mailboxId: string,
  dateStr: string
): Promise<number> {
  // Count ALL non-cancelled, non-failed steps (pending OR sent) for this mailbox on this date.
  // Including "sent" prevents over-counting capacity that's already been consumed.
  const [result] = await db
    .select({ count: count() })
    .from(sequenceSteps)
    .where(
      and(
        eq(sequenceSteps.mailboxId, mailboxId),
        sql`${sequenceSteps.status} IN ('pending', 'sent')`,
        sql`DATE(${sequenceSteps.scheduledAt}) = ${dateStr}::date`
      )
    );
  return result?.count ?? 0;
}

/**
 * Find the next business day on or after `from` that has capacity for the given mailbox.
 * Returns both the date and the current slot index (usage count) for that day.
 */
export async function findNextAvailableSlot(
  mailboxId: string,
  dailyLimit: number,
  from: Date,
  skipWeekends: boolean
): Promise<{ date: Date; slotIndex: number }> {
  const candidate = new Date(from);
  candidate.setHours(0, 0, 0, 0);

  // Walk forward up to 60 days to find a slot with capacity
  for (let i = 0; i < 60; i++) {
    if (skipWeekends && isWeekend(candidate)) {
      candidate.setDate(candidate.getDate() + 1);
      continue;
    }
    const dateStr = format(candidate, "yyyy-MM-dd");
    const used = await getMailboxUsageForDate(mailboxId, dateStr);
    if (used < dailyLimit) {
      return { date: new Date(candidate), slotIndex: used };
    }
    candidate.setDate(candidate.getDate() + 1);
  }

  throw new Error(`No available send slot found within 60 days for mailbox ${mailboxId}`);
}

export function computeSendTime(
  date: Date,
  windowStart: string,
  windowEnd: string,
  slotIndex: number,
  dailyLimit: number = 40
): Date {
  const [startH, startM] = windowStart.split(":").map(Number);
  const [endH, endM] = windowEnd.split(":").map(Number);

  const windowStartMinutes = startH * 60 + startM;
  const windowEndMinutes = endH * 60 + endM;
  const windowDuration = windowEndMinutes - windowStartMinutes;

  // Spread sends uniformly across the window based on slot position within dailyLimit.
  // Using slotIndex/dailyLimit gives an even distribution instead of the old *7 hash
  // which clustered sends and could collide at low volumes.
  const baseMinutes =
    windowStartMinutes +
    Math.round((slotIndex / Math.max(dailyLimit, 1)) * windowDuration);
  const jitter = Math.floor(Math.random() * 4) - 2;
  const finalMinutes = Math.max(
    windowStartMinutes,
    Math.min(windowEndMinutes - 1, baseMinutes + jitter)
  );

  const result = new Date(date);
  result.setHours(Math.floor(finalMinutes / 60), finalMinutes % 60, 0, 0);
  return result;
}
