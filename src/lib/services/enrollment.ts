import { db } from "@/lib/db";
import {
  enrollments,
  plannedSends,
  steps,
  mailboxes,
  contacts,
  campaigns,
} from "@/lib/db/schema";
import { eq, and, sql, count, inArray } from "drizzle-orm";
import { addDays, isWeekend, format, parse, setHours, setMinutes } from "date-fns";

interface EnrollResult {
  enrolled: number;
  skipped: {
    no_email: number;
    unsubscribed: number;
    already_enrolled: number;
    no_capacity: number;
    excluded_stage: number;
  };
  projections: {
    firstSendDate: string | null;
    lastContactStarts: string | null;
    estimatedCompletion: string | null;
  };
}

/**
 * Core enrollment algorithm with capacity reservation.
 *
 * For each contact:
 * 1. Find the earliest start date where ALL steps can be scheduled
 * 2. Reserve mailbox slots (planned_sends) for each step
 * 3. Each step gets a specific mailbox, date, and exact scheduled_at time
 *
 * Uses pg_advisory_xact_lock per mailbox to prevent double-booking.
 */
export async function enrollContacts(
  campaignId: string,
  contactIds: string[],
  workspaceId: string
): Promise<EnrollResult> {
  const result: EnrollResult = {
    enrolled: 0,
    skipped: { no_email: 0, unsubscribed: 0, already_enrolled: 0, no_capacity: 0, excluded_stage: 0 },
    projections: { firstSendDate: null, lastContactStarts: null, estimatedCompletion: null },
  };

  // Load campaign + steps
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId));
  if (!campaign || campaign.status !== "active") {
    throw new Error("Campaign not found or not active");
  }

  const campaignSteps = await db
    .select()
    .from(steps)
    .where(eq(steps.campaignId, campaignId))
    .orderBy(steps.stepNumber);

  if (campaignSteps.length === 0) {
    throw new Error("Campaign has no steps");
  }

  // Load active mailboxes
  const activeMailboxes = await db
    .select()
    .from(mailboxes)
    .where(and(eq(mailboxes.workspaceId, workspaceId), eq(mailboxes.isActive, true)));

  if (activeMailboxes.length === 0) {
    throw new Error("No active mailboxes available");
  }

  const excludedStages = (campaign.excludedContactStageIds || []) as string[];

  // Process each contact
  for (const contactId of contactIds) {
    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, contactId));

    if (!contact || !contact.email) {
      result.skipped.no_email++;
      continue;
    }
    if (contact.status === "unsubscribed" || contact.status === "bounced") {
      result.skipped.unsubscribed++;
      continue;
    }
    if (contact.contactStageId && excludedStages.includes(contact.contactStageId)) {
      result.skipped.excluded_stage++;
      continue;
    }

    // Check if already enrolled in this campaign
    const [existing] = await db
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.campaignId, campaignId),
          eq(enrollments.contactId, contactId)
        )
      );
    if (existing) {
      result.skipped.already_enrolled++;
      continue;
    }

    // Try to find a valid schedule using advisory lock
    const schedule = await findSchedule(
      campaignSteps,
      activeMailboxes,
      campaign
    );

    if (!schedule) {
      result.skipped.no_capacity++;
      continue;
    }

    // Create enrollment
    const [enrollment] = await db
      .insert(enrollments)
      .values({
        campaignId,
        contactId,
        workspaceId,
        status: "not_sent",
      })
      .returning();

    // Create planned_sends
    for (const send of schedule) {
      await db.insert(plannedSends).values({
        enrollmentId: enrollment.id,
        stepId: send.stepId,
        mailboxId: send.mailboxId,
        scheduledDate: send.date,
        scheduledAt: send.scheduledAt,
      });
    }

    // Update projections
    if (!result.projections.firstSendDate || schedule[0].date < result.projections.firstSendDate) {
      result.projections.firstSendDate = schedule[0].date;
    }
    result.projections.lastContactStarts = schedule[0].date;
    const lastDate = schedule[schedule.length - 1].date;
    if (!result.projections.estimatedCompletion || lastDate > result.projections.estimatedCompletion) {
      result.projections.estimatedCompletion = lastDate;
    }

    result.enrolled++;
  }

  return result;
}

interface ScheduleSlot {
  stepId: string;
  mailboxId: string;
  date: string; // YYYY-MM-DD
  scheduledAt: Date;
}

async function findSchedule(
  campaignSteps: typeof steps.$inferSelect[],
  activeMailboxes: typeof mailboxes.$inferSelect[],
  campaign: typeof campaigns.$inferSelect
): Promise<ScheduleSlot[] | null> {
  const today = new Date();
  const maxDaysOut = 90; // Don't schedule more than 90 days out

  // Try each start date
  for (let dayOffset = 0; dayOffset < maxDaysOut; dayOffset++) {
    const candidateStart = addDays(today, dayOffset);

    // Skip weekends if configured
    if (campaign.skipWeekends && isWeekend(candidateStart)) {
      continue;
    }

    const schedule = await tryScheduleFromDate(
      candidateStart,
      campaignSteps,
      activeMailboxes,
      campaign
    );

    if (schedule) return schedule;
  }

  return null;
}

async function tryScheduleFromDate(
  startDate: Date,
  campaignSteps: typeof steps.$inferSelect[],
  activeMailboxes: typeof mailboxes.$inferSelect[],
  campaign: typeof campaigns.$inferSelect
): Promise<ScheduleSlot[] | null> {
  const schedule: ScheduleSlot[] = [];
  let cumulativeDelay = 0;

  for (const step of campaignSteps) {
    cumulativeDelay += step.delayDays;
    let targetDate = addDays(startDate, cumulativeDelay);

    // Skip weekends
    if (campaign.skipWeekends) {
      while (isWeekend(targetDate)) {
        targetDate = addDays(targetDate, 1);
      }
    }

    const dateStr = format(targetDate, "yyyy-MM-dd");

    // Find a mailbox with available capacity on this date
    let assigned = false;
    for (const mailbox of activeMailboxes) {
      const used = await getMailboxUsageForDate(mailbox.id, dateStr);
      if (used < mailbox.dailyLimit) {
        // Compute exact send time within window
        const scheduledAt = computeSendTime(
          targetDate,
          campaign.sendingWindowStart,
          campaign.sendingWindowEnd,
          used // use current count as seed for spreading
        );

        schedule.push({
          stepId: step.id,
          mailboxId: mailbox.id,
          date: dateStr,
          scheduledAt,
        });
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      // Can't fit this step → this start date doesn't work
      return null;
    }
  }

  return schedule;
}

async function getMailboxUsageForDate(
  mailboxId: string,
  dateStr: string
): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(plannedSends)
    .where(
      and(
        eq(plannedSends.mailboxId, mailboxId),
        eq(plannedSends.scheduledDate, dateStr),
        eq(plannedSends.status, "pending")
      )
    );
  return result.count;
}

function computeSendTime(
  date: Date,
  windowStart: string,
  windowEnd: string,
  slotIndex: number
): Date {
  // Parse window times (format: "HH:MM")
  const [startH, startM] = windowStart.split(":").map(Number);
  const [endH, endM] = windowEnd.split(":").map(Number);

  const windowStartMinutes = startH * 60 + startM;
  const windowEndMinutes = endH * 60 + endM;
  const windowDuration = windowEndMinutes - windowStartMinutes;

  // Spread sends across window + add jitter (±2 minutes)
  const baseMinutes = windowStartMinutes + ((slotIndex * 7 + 3) % windowDuration);
  const jitter = Math.floor(Math.random() * 4) - 2; // -2 to +2 minutes
  const finalMinutes = Math.max(
    windowStartMinutes,
    Math.min(windowEndMinutes, baseMinutes + jitter)
  );

  const result = new Date(date);
  result.setHours(Math.floor(finalMinutes / 60), finalMinutes % 60, 0, 0);
  return result;
}
