import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  sequences,
  sequenceSteps,
  contacts,
  campaigns,
  templates,
  experiments,
} from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq, and, count, sql, desc, asc } from "drizzle-orm";
import { createSequence } from "@/lib/services/sequence";

export async function GET(request: NextRequest) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();

    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaign_id");
    const status = searchParams.get("status");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get("per_page") || "50")));
    const offset = (page - 1) * perPage;

    const conditions = [eq(sequences.workspaceId, workspaceId)];
    if (campaignId) conditions.push(eq(sequences.campaignId, campaignId));
    if (status) conditions.push(eq(sequences.status, status));

    const rows = await db
      .select({
        sequence: sequences,
        contact: contacts,
        campaign: {
          id: campaigns.id,
          name: campaigns.name,
        },
        template: {
          id: templates.id,
          name: templates.name,
        },
        experiment: {
          id: experiments.id,
          name: experiments.name,
        },
      })
      .from(sequences)
      .innerJoin(contacts, eq(contacts.id, sequences.contactId))
      .leftJoin(campaigns, eq(campaigns.id, sequences.campaignId))
      .leftJoin(templates, eq(templates.id, sequences.templateId))
      .leftJoin(experiments, eq(experiments.id, sequences.experimentId))
      .where(and(...conditions))
      .orderBy(desc(sequences.createdAt))
      .limit(perPage)
      .offset(offset);

    const sequenceIds = rows.map((r) => r.sequence.id);

    // Get step counts per sequence
    const stepCounts = sequenceIds.length > 0
      ? await db
          .select({
            sequenceId: sequenceSteps.sequenceId,
            total: count(),
          })
          .from(sequenceSteps)
          .where(
            sql`${sequenceSteps.sequenceId} IN (${sql.join(
              sequenceIds.map((id) => sql`${id}`),
              sql`, `
            )})`
          )
          .groupBy(sequenceSteps.sequenceId)
      : [];

    const stepCountMap = new Map(stepCounts.map((s) => [s.sequenceId, s.total]));

    // Get next scheduled step per sequence
    const nextSteps = sequenceIds.length > 0
      ? await db
          .select({
            sequenceId: sequenceSteps.sequenceId,
            scheduledAt: sequenceSteps.scheduledAt,
          })
          .from(sequenceSteps)
          .where(
            and(
              sql`${sequenceSteps.sequenceId} IN (${sql.join(
                sequenceIds.map((id) => sql`${id}`),
                sql`, `
              )})`,
              eq(sequenceSteps.status, "pending")
            )
          )
          .orderBy(asc(sequenceSteps.scheduledAt))
      : [];

    const nextStepMap = new Map<string, Date | null>();
    for (const ns of nextSteps) {
      if (!nextStepMap.has(ns.sequenceId)) {
        nextStepMap.set(ns.sequenceId, ns.scheduledAt);
      }
    }

    const result = rows.map(({ sequence, contact, campaign, template, experiment }) => ({
      id: sequence.id,
      contact: {
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        company: contact.company,
        title: contact.title,
      },
      campaign: campaign?.id ? { id: campaign.id, name: campaign.name } : null,
      template: template?.id ? { id: template.id, name: template.name } : null,
      experiment: experiment?.id ? { id: experiment.id, name: experiment.name } : null,
      status: sequence.status,
      totalSteps: stepCountMap.get(sequence.id) ?? 0,
      lastSentAt: sequence.lastSentAt,
      nextScheduledAt: nextStepMap.get(sequence.id) ?? null,
      createdAt: sequence.createdAt,
    }));

    return NextResponse.json(result);
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("List sequences error:", error);
    return NextResponse.json({ error: "Failed to fetch sequences" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const body = await request.json();

    if (!body.contact_id) {
      return NextResponse.json({ error: "contact_id is required" }, { status: 400 });
    }

    const sequence = await createSequence(body.contact_id, workspaceId, {
      campaignId: body.campaign_id,
      templateId: body.template_id,
      mailboxId: body.mailbox_id,
      steps: body.steps?.map((s: any) => ({
        subject: s.subject,
        body: s.body,
        delayDays: s.delay_days,
        isReplyThread: s.is_reply_thread,
        cc: s.cc,
        bcc: s.bcc,
      })),
      sendingWindowStart: body.sending_window_start,
      sendingWindowEnd: body.sending_window_end,
      timezone: body.timezone,
      skipWeekends: body.skip_weekends,
      experimentId: body.experiment_id,
    });

    return NextResponse.json(sequence, { status: 201 });
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Create sequence error:", error);
    return NextResponse.json({ error: error.message || "Failed to create sequence" }, { status: 500 });
  }
}
