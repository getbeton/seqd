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

  if (options.mailboxId) {
    mailboxId = options.mailboxId;
  } else {
    // Find first active mailbox with capacity today
    const activeMailboxes = await db
      .select()
      .from(mailboxes)
      .where(and(eq(mailboxes.workspaceId, workspaceId), eq(mailboxes.isActive, true)));

    if (activeMailboxes.length === 0) {
      throw new Error("No active mailboxes available");
    }

    const today = format(new Date(), "yyyy-MM-dd");
    let picked: string | null = null;

    for (const mb of activeMailboxes) {
      const used = await getMailboxUsageForDate(mb.id, today);
      if (used < mb.dailyLimit) {
        picked = mb.id;
        break;
      }
    }

    if (!picked) {
      throw new Error("No mailbox has capacity today");
    }
    mailboxId = picked;
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
  const startDate = new Date();
  let cumulativeDelay = 0;

  for (const step of resolvedSteps) {
    cumulativeDelay += step.delayDays;
    let targetDate = addDays(startDate, cumulativeDelay);

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
      used
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
  // Count pending sequenceSteps for this mailbox on the given date
  const [result] = await db
    .select({ count: count() })
    .from(sequenceSteps)
    .where(
      and(
        eq(sequenceSteps.mailboxId, mailboxId),
        eq(sequenceSteps.status, "pending"),
        sql`DATE(${sequenceSteps.scheduledAt}) = ${dateStr}::date`
      )
    );
  return result?.count ?? 0;
}

export function computeSendTime(
  date: Date,
  windowStart: string,
  windowEnd: string,
  slotIndex: number
): Date {
  const [startH, startM] = windowStart.split(":").map(Number);
  const [endH, endM] = windowEnd.split(":").map(Number);

  const windowStartMinutes = startH * 60 + startM;
  const windowEndMinutes = endH * 60 + endM;
  const windowDuration = windowEndMinutes - windowStartMinutes;

  // Spread sends across window + add jitter (±2 minutes)
  const baseMinutes = windowStartMinutes + ((slotIndex * 7 + 3) % windowDuration);
  const jitter = Math.floor(Math.random() * 4) - 2;
  const finalMinutes = Math.max(
    windowStartMinutes,
    Math.min(windowEndMinutes, baseMinutes + jitter)
  );

  const result = new Date(date);
  result.setHours(Math.floor(finalMinutes / 60), finalMinutes % 60, 0, 0);
  return result;
}
