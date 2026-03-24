import { db } from "@/lib/db";
import {
  sequenceSteps,
  sequences,
  emailsSent,
  contacts,
  mailboxes,
  workspaceSettings,
} from "@/lib/db/schema";
import { eq, and, lte, sql, count } from "drizzle-orm";
import { getGmailService } from "@/lib/gmail/client";
import { sendGmailMessage } from "@/lib/gmail/send";
import { injectTrackingPixel, buildUnsubscribeFooter } from "@/lib/tracking/pixel";
import { rewriteLinksForTracking } from "@/lib/tracking/links";
import { generateUnsubscribeToken } from "@/lib/tracking/tokens";

interface SendResult {
  sent: number;
  failed: number;
  skipped: number;
  details: Array<{
    sequenceId: string;
    contactEmail: string;
    stepNumber: number;
    status: "sent" | "failed" | "skipped";
    error?: string;
  }>;
}

/**
 * Get the tracking base URL for a workspace.
 */
async function getTrackingBaseUrl(workspaceId: string): Promise<{
  baseUrl: string;
  openTracking: boolean;
  clickTracking: boolean;
  unsubscribeEnabled: boolean;
}> {
  const [settings] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .limit(1);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (settings?.trackingDomain && settings.trackingDomainVerified) {
    return {
      baseUrl: `https://${settings.trackingDomain}`,
      openTracking: settings.openTrackingEnabled,
      clickTracking: settings.clickTrackingEnabled,
      unsubscribeEnabled: settings.unsubscribeLinkEnabled,
    };
  }

  return {
    baseUrl: appUrl,
    openTracking: settings?.openTrackingEnabled ?? true,
    clickTracking: settings?.clickTrackingEnabled ?? true,
    unsubscribeEnabled: settings?.unsubscribeLinkEnabled ?? true,
  };
}

/**
 * Process all pending sequence_steps where scheduledAt <= now.
 * Called by the cron endpoint every minute.
 */
export async function runSendCycle(dryRun = false): Promise<SendResult> {
  const result: SendResult = { sent: 0, failed: 0, skipped: 0, details: [] };

  // Get all pending sequence steps that are due
  const dueSteps = await db
    .select({
      seqStep: sequenceSteps,
      sequence: sequences,
      contact: contacts,
      mailbox: mailboxes,
    })
    .from(sequenceSteps)
    .innerJoin(sequences, eq(sequenceSteps.sequenceId, sequences.id))
    .innerJoin(contacts, eq(sequences.contactId, contacts.id))
    .innerJoin(mailboxes, eq(
      // step-level mailbox overrides sequence-level; fall back to sequence mailbox
      sql`coalesce(${sequenceSteps.mailboxId}, ${sequences.mailboxId})`,
      mailboxes.id
    ))
    .where(
      and(
        eq(sequenceSteps.status, "pending"),
        lte(sequenceSteps.scheduledAt, new Date())
      )
    )
    .orderBy(sequenceSteps.scheduledAt);

  for (const row of dueSteps) {
    const { seqStep, sequence, contact, mailbox } = row;

    // Skip if sequence is paused/finished/failed
    if (["paused", "finished", "failed"].includes(sequence.status)) {
      result.skipped++;
      result.details.push({
        sequenceId: sequence.id,
        contactEmail: contact.email,
        stepNumber: seqStep.stepNumber,
        status: "skipped",
        error: `sequence status is ${sequence.status}`,
      });
      continue;
    }

    // Skip if contact is not active
    if (contact.status !== "active") {
      result.skipped++;
      result.details.push({
        sequenceId: sequence.id,
        contactEmail: contact.email,
        stepNumber: seqStep.stepNumber,
        status: "skipped",
        error: `contact status is ${contact.status}`,
      });
      continue;
    }

    if (dryRun) {
      result.sent++;
      result.details.push({
        sequenceId: sequence.id,
        contactEmail: contact.email,
        stepNumber: seqStep.stepNumber,
        status: "sent",
      });
      continue;
    }

    try {
      // Body is already rendered — use directly
      const subject = seqStep.subject ?? "(no subject)";
      let body = seqStep.body ?? "";

      // 1. Create emailsSent record FIRST with status "pending" (need ID for tracking URLs)
      const [emailSent] = await db.insert(emailsSent).values({
        sequenceId: sequence.id,
        sequenceStepId: seqStep.id,
        mailboxId: mailbox.id,
        subject,
        body,
        status: "pending",
      }).returning();

      // Get tracking settings
      const tracking = await getTrackingBaseUrl(sequence.workspaceId);

      // 2. Inject tracking pixel
      if (tracking.openTracking) {
        body = injectTrackingPixel(body, emailSent.id, tracking.baseUrl);
      }

      // 3. Rewrite links for click tracking
      if (tracking.clickTracking) {
        body = rewriteLinksForTracking(body, emailSent.id, tracking.baseUrl);
      }

      // 4. Build custom headers and unsubscribe footer
      const customHeaders: Record<string, string> = {};
      if (tracking.unsubscribeEnabled) {
        const unsubToken = generateUnsubscribeToken({
          emailSentId: emailSent.id,
          contactId: contact.id,
          enrollmentId: sequence.id, // sequenceId stored as enrollmentId in token
        });
        const unsubUrl = `${tracking.baseUrl}/unsub/${unsubToken}`;

        customHeaders["List-Unsubscribe"] = `<${unsubUrl}>`;
        customHeaders["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";

        body += buildUnsubscribeFooter(unsubUrl);
      }

      // 5. Find prior thread for reply mode
      let threadId: string | null = null;
      let inReplyTo: string | null = null;
      if (seqStep.isReplyThread && seqStep.stepNumber > 1) {
        const [prior] = await db
          .select()
          .from(emailsSent)
          .where(
            and(
              eq(emailsSent.sequenceId, sequence.id),
              eq(emailsSent.status, "sent")
            )
          )
          .orderBy(emailsSent.sentAt)
          .limit(1);
        if (prior && prior.id !== emailSent.id) {
          threadId = prior.gmailThreadId ?? null;
          inReplyTo = prior.gmailMessageId ?? null;
        }
      }

      // 6. Send via Gmail
      const gmail = await getGmailService(mailbox.refreshToken);
      const gmailResult = await sendGmailMessage(gmail, {
        to: contact.email,
        subject,
        body,
        cc: (seqStep.ccRecipients as string[]) || [],
        bcc: (seqStep.bccRecipients as string[]) || [],
        threadId,
        inReplyTo,
        customHeaders,
      });

      // 7. Update emailsSent with result
      await db
        .update(emailsSent)
        .set({
          gmailMessageId: gmailResult.id,
          gmailThreadId: gmailResult.threadId,
          body, // Store with tracking injected
          status: "sent",
          sentAt: new Date(),
        })
        .where(eq(emailsSent.id, emailSent.id));

      // 8. Update sequenceStep: status='sent', sentAt=now
      await db
        .update(sequenceSteps)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(sequenceSteps.id, seqStep.id));

      // 9. Update sequence: lastSentAt=now
      await db
        .update(sequences)
        .set({ status: "active", lastSentAt: new Date() })
        .where(eq(sequences.id, sequence.id));

      // 10. Check if all steps are done → mark sequence finished
      const [pendingCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(sequenceSteps)
        .where(
          and(
            eq(sequenceSteps.sequenceId, sequence.id),
            eq(sequenceSteps.status, "pending")
          )
        );

      if (Number(pendingCount.count) === 0) {
        // Verify no steps are in non-terminal states besides sent/skipped/cancelled
        const [activeCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(sequenceSteps)
          .where(
            and(
              eq(sequenceSteps.sequenceId, sequence.id),
              sql`${sequenceSteps.status} NOT IN ('sent', 'skipped', 'cancelled')`
            )
          );

        if (Number(activeCount.count) === 0) {
          await db
            .update(sequences)
            .set({
              status: "finished",
              finishedReason: "completed",
              finishedAt: new Date(),
            })
            .where(eq(sequences.id, sequence.id));
        }
      }

      result.sent++;
      result.details.push({
        sequenceId: sequence.id,
        contactEmail: contact.email,
        stepNumber: seqStep.stepNumber,
        status: "sent",
      });
    } catch (error: any) {
      console.error(`Send failed for sequence step ${seqStep.id}:`, error.message);

      await db
        .update(sequenceSteps)
        .set({ status: "failed" })
        .where(eq(sequenceSteps.id, seqStep.id));

      await db
        .update(sequences)
        .set({ status: "failed" })
        .where(eq(sequences.id, sequence.id));

      result.failed++;
      result.details.push({
        sequenceId: sequence.id,
        contactEmail: contact.email,
        stepNumber: seqStep.stepNumber,
        status: "failed",
        error: error.message,
      });
    }
  }

  return result;
}
