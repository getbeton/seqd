import { db } from "@/lib/db";
import {
  plannedSends,
  enrollments,
  emailsSent,
  steps,
  contacts,
  mailboxes,
  workspaceSettings,
} from "@/lib/db/schema";
import { eq, and, lte, sql } from "drizzle-orm";
import { getGmailService } from "@/lib/gmail/client";
import { sendGmailMessage } from "@/lib/gmail/send";
import { renderTemplate, buildContactVariables } from "@/lib/services/renderer";
import { injectTrackingPixel, buildUnsubscribeFooter } from "@/lib/tracking/pixel";
import { rewriteLinksForTracking } from "@/lib/tracking/links";
import { generateUnsubscribeToken } from "@/lib/tracking/tokens";

interface SendResult {
  sent: number;
  failed: number;
  skipped: number;
  details: Array<{
    enrollmentId: string;
    contactEmail: string;
    stepNumber: number;
    status: "sent" | "failed" | "skipped";
    error?: string;
  }>;
}

/**
 * Get the tracking base URL for a workspace.
 * Uses custom tracking domain if verified, otherwise falls back to app URL.
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
 * Process all pending planned_sends where scheduledAt <= now.
 * This is called by the cron endpoint every minute.
 */
export async function runSendCycle(dryRun = false): Promise<SendResult> {
  const result: SendResult = { sent: 0, failed: 0, skipped: 0, details: [] };

  // Get all pending sends that are due
  const dueSends = await db
    .select({
      plannedSend: plannedSends,
      enrollment: enrollments,
      step: steps,
      contact: contacts,
      mailbox: mailboxes,
    })
    .from(plannedSends)
    .innerJoin(enrollments, eq(plannedSends.enrollmentId, enrollments.id))
    .innerJoin(steps, eq(plannedSends.stepId, steps.id))
    .innerJoin(contacts, eq(enrollments.contactId, contacts.id))
    .innerJoin(mailboxes, eq(plannedSends.mailboxId, mailboxes.id))
    .where(
      and(
        eq(plannedSends.status, "pending"),
        lte(plannedSends.scheduledAt, new Date())
      )
    )
    .orderBy(plannedSends.scheduledAt);

  for (const row of dueSends) {
    const { plannedSend, enrollment, step, contact, mailbox } = row;

    // Skip if enrollment is not active or not_sent
    if (!["active", "not_sent"].includes(enrollment.status)) {
      result.skipped++;
      result.details.push({
        enrollmentId: enrollment.id,
        contactEmail: contact.email,
        stepNumber: step.stepNumber,
        status: "skipped",
        error: `enrollment status is ${enrollment.status}`,
      });
      continue;
    }

    // Skip if contact is unsubscribed or bounced
    if (contact.status !== "active") {
      result.skipped++;
      continue;
    }

    if (dryRun) {
      result.sent++;
      result.details.push({
        enrollmentId: enrollment.id,
        contactEmail: contact.email,
        stepNumber: step.stepNumber,
        status: "sent",
      });
      continue;
    }

    try {
      // Render template
      const variables = buildContactVariables(contact);
      const seed = `${contact.email}:${step.id}`;
      const renderedSubject = step.subject
        ? renderTemplate(step.subject, variables, seed)
        : "(no subject)";
      let renderedBody = step.bodyTemplate
        ? renderTemplate(step.bodyTemplate, variables, seed)
        : "";

      // 1. Create emailsSent record FIRST with status "pending" (need ID for tracking URLs)
      const [emailSent] = await db.insert(emailsSent).values({
        enrollmentId: enrollment.id,
        stepId: step.id,
        plannedSendId: plannedSend.id,
        mailboxId: mailbox.id,
        renderedSubject,
        renderedBody,
        status: "pending",
      }).returning();

      // Get tracking settings
      const tracking = await getTrackingBaseUrl(enrollment.workspaceId);

      // 2. Inject tracking pixel
      if (tracking.openTracking) {
        renderedBody = injectTrackingPixel(renderedBody, emailSent.id, tracking.baseUrl);
      }

      // 3. Rewrite links for click tracking
      if (tracking.clickTracking) {
        renderedBody = rewriteLinksForTracking(renderedBody, emailSent.id, tracking.baseUrl);
      }

      // 4. Build custom headers and unsubscribe footer
      const customHeaders: Record<string, string> = {};
      if (tracking.unsubscribeEnabled) {
        const unsubToken = generateUnsubscribeToken({
          emailSentId: emailSent.id,
          contactId: contact.id,
          enrollmentId: enrollment.id,
        });
        const unsubUrl = `${tracking.baseUrl}/unsub/${unsubToken}`;

        // RFC 8058 headers
        customHeaders["List-Unsubscribe"] = `<${unsubUrl}>`;
        customHeaders["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";

        // Append unsubscribe footer
        renderedBody += buildUnsubscribeFooter(unsubUrl);
      }

      // Find prior thread if reply mode
      let threadId: string | null = null;
      let inReplyTo: string | null = null;
      if (step.isReplyThread && step.stepNumber > 1) {
        const [prior] = await db
          .select()
          .from(emailsSent)
          .where(eq(emailsSent.enrollmentId, enrollment.id))
          .orderBy(emailsSent.sentAt);
        if (prior && prior.id !== emailSent.id) {
          threadId = prior.gmailThreadId;
          inReplyTo = prior.gmailMessageId;
        }
      }

      // 5. Send via Gmail
      const gmail = await getGmailService(mailbox.refreshToken);
      const gmailResult = await sendGmailMessage(gmail, {
        to: contact.email,
        subject: renderedSubject,
        body: renderedBody,
        cc: (step.ccRecipients as string[]) || [],
        bcc: (step.bccRecipients as string[]) || [],
        threadId,
        inReplyTo,
        customHeaders,
      });

      // 6. Update emailsSent with Gmail message/thread IDs and status "sent"
      await db
        .update(emailsSent)
        .set({
          gmailMessageId: gmailResult.id,
          gmailThreadId: gmailResult.threadId,
          renderedBody, // Store the body with tracking injected
          status: "sent",
          sentAt: new Date(),
        })
        .where(eq(emailsSent.id, emailSent.id));

      // Update planned_send status
      await db
        .update(plannedSends)
        .set({ status: "sent" })
        .where(eq(plannedSends.id, plannedSend.id));

      // Update enrollment
      await db
        .update(enrollments)
        .set({
          status: "active",
          currentStepNumber: step.stepNumber,
          lastSentAt: new Date(),
        })
        .where(eq(enrollments.id, enrollment.id));

      // Check if this was the last step
      const allSteps = await db
        .select()
        .from(steps)
        .where(eq(steps.campaignId, enrollment.campaignId))
        .orderBy(steps.stepNumber);
      const lastStep = allSteps[allSteps.length - 1];
      if (lastStep && step.stepNumber === lastStep.stepNumber) {
        // Check if all sends for this enrollment are done
        const [pendingCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(plannedSends)
          .where(
            and(
              eq(plannedSends.enrollmentId, enrollment.id),
              eq(plannedSends.status, "pending")
            )
          );
        if (Number(pendingCount.count) === 0) {
          await db
            .update(enrollments)
            .set({
              status: "finished",
              finishedReason: "completed",
              finishedAt: new Date(),
            })
            .where(eq(enrollments.id, enrollment.id));
        }
      }

      result.sent++;
      result.details.push({
        enrollmentId: enrollment.id,
        contactEmail: contact.email,
        stepNumber: step.stepNumber,
        status: "sent",
      });
    } catch (error: any) {
      console.error(
        `Send failed for enrollment ${enrollment.id}:`,
        error.message
      );

      // Mark as failed
      await db
        .update(plannedSends)
        .set({ status: "failed" })
        .where(eq(plannedSends.id, plannedSend.id));

      await db
        .update(enrollments)
        .set({ status: "failed" })
        .where(eq(enrollments.id, enrollment.id));

      result.failed++;
      result.details.push({
        enrollmentId: enrollment.id,
        contactEmail: contact.email,
        stepNumber: step.stepNumber,
        status: "failed",
        error: error.message,
      });
    }
  }

  return result;
}
