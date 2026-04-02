import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  contacts,
  sequences,
  sequenceSteps,
  campaigns,
  templates,
  emailsSent,
  emailEvents,
} from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq, and, sql, desc } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const { id } = await params;

    // Fetch contact
    const [contact] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.workspaceId, workspaceId)));

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Fetch sequences for this contact
    const seqRows = await db
      .select({
        sequence: sequences,
        campaign: { id: campaigns.id, name: campaigns.name },
        template: { id: templates.id, name: templates.name },
      })
      .from(sequences)
      .leftJoin(campaigns, eq(campaigns.id, sequences.campaignId))
      .leftJoin(templates, eq(templates.id, sequences.templateId))
      .where(and(eq(sequences.contactId, id), eq(sequences.workspaceId, workspaceId)))
      .orderBy(desc(sequences.createdAt));

    const sequenceIds = seqRows.map((r) => r.sequence.id);

    // Fetch all emails sent across all sequences
    let emails: any[] = [];
    if (sequenceIds.length > 0) {
      emails = await db
        .select()
        .from(emailsSent)
        .where(
          sql`${emailsSent.sequenceId} IN (${sql.join(
            sequenceIds.map((sid) => sql`${sid}`),
            sql`, `
          )})`
        )
        .orderBy(desc(emailsSent.sentAt));
    }

    // Fetch all events across all sequences
    let events: any[] = [];
    if (sequenceIds.length > 0) {
      events = await db
        .select()
        .from(emailEvents)
        .where(
          sql`${emailEvents.sequenceId} IN (${sql.join(
            sequenceIds.map((sid) => sql`${sid}`),
            sql`, `
          )})`
        )
        .orderBy(desc(emailEvents.occurredAt));
    }

    // Fetch step counts
    let stepCounts: { sequenceId: string; total: number }[] = [];
    if (sequenceIds.length > 0) {
      stepCounts = await db
        .select({
          sequenceId: sequenceSteps.sequenceId,
          total: sql<number>`count(*)::int`,
        })
        .from(sequenceSteps)
        .where(
          sql`${sequenceSteps.sequenceId} IN (${sql.join(
            sequenceIds.map((sid) => sql`${sid}`),
            sql`, `
          )})`
        )
        .groupBy(sequenceSteps.sequenceId);
    }

    const stepCountMap = new Map(stepCounts.map((s) => [s.sequenceId, s.total]));

    // Aggregate stats
    const stats = {
      totalEmails: emails.length,
      opens: events.filter((e) => e.eventType === "open").length,
      clicks: events.filter((e) => e.eventType === "click").length,
      replies: events.filter((e) => e.eventType === "reply").length,
      bounces: events.filter((e) => e.eventType === "bounce").length,
    };

    // Build response
    const sequenceList = seqRows.map(({ sequence, campaign, template }) => ({
      id: sequence.id,
      campaign: campaign?.id ? { id: campaign.id, name: campaign.name } : null,
      template: template?.id ? { id: template.id, name: template.name } : null,
      status: sequence.status,
      totalSteps: stepCountMap.get(sequence.id) ?? 0,
      createdAt: sequence.createdAt,
      emails: emails
        .filter((e) => e.sequenceId === sequence.id)
        .map((e) => ({
          id: e.id,
          subject: e.subject,
          status: e.status,
          sentAt: e.sentAt,
          events: events
            .filter((ev) => ev.emailSentId === e.id)
            .map((ev) => ({
              type: ev.eventType,
              occurredAt: ev.occurredAt,
              clickedUrl: ev.clickedUrl,
              replyText: ev.replyText,
            })),
        })),
    }));

    return NextResponse.json({
      contact,
      sequences: sequenceList,
      stats,
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Contact details error:", error);
    return NextResponse.json({ error: "Failed to fetch contact details" }, { status: 500 });
  }
}
