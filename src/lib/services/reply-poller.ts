import { db } from "@/lib/db";
import {
  emailsSent,
  enrollments,
  emailEvents,
  mailboxes,
  plannedSends,
} from "@/lib/db/schema";
import { eq, and, sql, gte, isNotNull } from "drizzle-orm";
import { getGmailService } from "@/lib/gmail/client";
import { subDays } from "date-fns";

const OOO_KEYWORDS = [
  "out of office",
  "away until",
  "back on",
  "returning on",
  "return on",
  "i'm away",
  "i am away",
  "on vacation",
  "on leave",
  "automatic reply",
  "auto-reply",
  "autoreply",
];

function isOoo(text: string): boolean {
  const lower = text.toLowerCase();
  return OOO_KEYWORDS.some((kw) => lower.includes(kw));
}

function extractEmailFromHeaders(
  headers: Array<{ name: string; value: string }>,
  headerName: string
): string {
  const header = headers.find(
    (h) => h.name.toLowerCase() === headerName.toLowerCase()
  );
  if (!header) return "";
  // Extract email from "Name <email@example.com>" format
  const match = header.value.match(/<([^>]+)>/);
  return (match ? match[1] : header.value).toLowerCase().trim();
}

function extractBodyText(payload: any): string {
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf8");
      }
    }
    // Fallback to HTML
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return Buffer.from(part.body.data, "base64")
          .toString("utf8")
          .replace(/<[^>]+>/g, ""); // strip HTML tags
      }
    }
  }
  return "";
}

interface PollResult {
  checked: number;
  repliesFound: number;
  errors: number;
}

/**
 * Poll Gmail threads for replies. Rate-limited per mailbox.
 */
export async function runReplyPolling(): Promise<PollResult> {
  const result: PollResult = { checked: 0, repliesFound: 0, errors: 0 };
  const sixtyDaysAgo = subDays(new Date(), 60);

  // Get all sent emails with active enrollments
  const sentEmails = await db
    .select({
      emailSent: emailsSent,
      enrollment: enrollments,
      mailbox: mailboxes,
    })
    .from(emailsSent)
    .innerJoin(enrollments, eq(emailsSent.enrollmentId, enrollments.id))
    .innerJoin(mailboxes, eq(emailsSent.mailboxId, mailboxes.id))
    .where(
      and(
        sql`${enrollments.status} IN ('active', 'not_sent')`,
        isNotNull(emailsSent.gmailThreadId),
        gte(emailsSent.sentAt, sixtyDaysAgo)
      )
    );

  // Group by mailbox
  const byMailbox = new Map<
    string,
    Array<{ emailSent: typeof emailsSent.$inferSelect; enrollment: typeof enrollments.$inferSelect; mailbox: typeof mailboxes.$inferSelect }>
  >();

  for (const row of sentEmails) {
    const key = row.mailbox.id;
    if (!byMailbox.has(key)) byMailbox.set(key, []);
    byMailbox.get(key)!.push(row);
  }

  // Get all mailbox emails for identifying our own messages
  const allMailboxEmails = new Set(
    (await db.select({ email: mailboxes.email }).from(mailboxes)).map((m) =>
      m.email.toLowerCase()
    )
  );

  for (const [mailboxId, items] of byMailbox) {
    try {
      const gmail = await getGmailService(items[0].mailbox.refreshToken);

      // Deduplicate by thread_id
      const seenThreads = new Map<
        string,
        { emailSent: typeof emailsSent.$inferSelect; enrollment: typeof enrollments.$inferSelect }
      >();

      for (const item of items) {
        const tid = item.emailSent.gmailThreadId;
        if (tid && !seenThreads.has(tid)) {
          seenThreads.set(tid, {
            emailSent: item.emailSent,
            enrollment: item.enrollment,
          });
        }
      }

      // Rate limit: process up to 50 threads per mailbox per cycle
      let processed = 0;
      for (const [threadId, { emailSent, enrollment }] of seenThreads) {
        if (processed >= 50) break;

        try {
          const thread = await gmail.users.threads.get({
            userId: "me",
            id: threadId,
          });

          if (!thread.data.messages) continue;

          for (const message of thread.data.messages) {
            const headers = (message.payload?.headers || []) as Array<{
              name: string;
              value: string;
            }>;
            const sender = extractEmailFromHeaders(headers, "From");
            const msgId = message.id!;

            // Skip our own messages
            if (allMailboxEmails.has(sender)) continue;

            // Check if already recorded
            const [existing] = await db
              .select()
              .from(emailEvents)
              .where(eq(emailEvents.replyGmailMessageId, msgId));
            if (existing) continue;

            // This is a reply from the contact
            const body = extractBodyText(message.payload);

            // Record event
            await db.insert(emailEvents).values({
              emailSentId: emailSent.id,
              enrollmentId: enrollment.id,
              eventType: "reply",
              replyText: body,
              replyGmailMessageId: msgId,
            });

            // Update enrollment
            if (isOoo(body)) {
              await db
                .update(enrollments)
                .set({
                  status: "finished",
                  finishedReason: "replied",
                  finishedAt: new Date(),
                })
                .where(eq(enrollments.id, enrollment.id));
            } else {
              await db
                .update(enrollments)
                .set({
                  status: "finished",
                  finishedReason: "replied",
                  finishedAt: new Date(),
                })
                .where(eq(enrollments.id, enrollment.id));
            }

            // Cancel future planned_sends
            await db
              .update(plannedSends)
              .set({ status: "cancelled" })
              .where(
                and(
                  eq(plannedSends.enrollmentId, enrollment.id),
                  eq(plannedSends.status, "pending")
                )
              );

            result.repliesFound++;
            break; // one reply per thread per cycle
          }

          result.checked++;
          processed++;

          // Simple rate limiting: 200ms between API calls
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (error: any) {
          console.error(`Error checking thread ${threadId}:`, error.message);
          result.errors++;
        }
      }
    } catch (error: any) {
      console.error(`Error processing mailbox ${mailboxId}:`, error.message);
      result.errors++;
    }
  }

  return result;
}
