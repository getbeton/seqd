import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  sequences,
  sequenceSteps,
  contacts,
  campaigns,
  templates,
  emailsSent,
  emailEvents,
} from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq, and, asc } from "drizzle-orm";
import { computeSendTime } from "@/lib/services/sequence";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const { id } = await params;

    const [row] = await db
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
      })
      .from(sequences)
      .innerJoin(contacts, eq(contacts.id, sequences.contactId))
      .leftJoin(campaigns, eq(campaigns.id, sequences.campaignId))
      .leftJoin(templates, eq(templates.id, sequences.templateId))
      .where(and(eq(sequences.id, id), eq(sequences.workspaceId, workspaceId)));

    if (!row) {
      return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
    }

    // Fetch all steps for this sequence
    const steps = await db
      .select()
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, id))
      .orderBy(asc(sequenceSteps.stepNumber));

    // Fetch all emails sent for this sequence
    const sentEmails = await db
      .select()
      .from(emailsSent)
      .where(eq(emailsSent.sequenceId, id))
      .orderBy(asc(emailsSent.sentAt));

    // Fetch all events for this sequence
    const events = await db
      .select()
      .from(emailEvents)
      .where(eq(emailEvents.sequenceId, id))
      .orderBy(asc(emailEvents.occurredAt));

    // Map sent emails by sequenceStepId
    const sentByStep = new Map<string, typeof sentEmails[0]>();
    for (const sent of sentEmails) {
      sentByStep.set(sent.sequenceStepId, sent);
    }

    const eventsByEmailSent = new Map<string, typeof events>();
    for (const event of events) {
      if (event.emailSentId) {
        const list = eventsByEmailSent.get(event.emailSentId) ?? [];
        list.push(event);
        eventsByEmailSent.set(event.emailSentId, list);
      }
    }

    const stepTimeline = steps.map((step) => {
      const sent = sentByStep.get(step.id);

      if (sent) {
        const stepEvents = (eventsByEmailSent.get(sent.id) ?? []).map((e) => ({
          type: e.eventType,
          occurredAt: e.occurredAt,
          replyText: e.replyText ?? undefined,
        }));
        return {
          id: step.id,
          stepNumber: step.stepNumber,
          subject: sent.subject ?? step.subject,
          delayDays: step.delayDays,
          status: "sent" as const,
          sentAt: sent.sentAt,
          gmailMessageId: sent.gmailMessageId ?? undefined,
          events: stepEvents,
        };
      }

      if (step.status === "pending" && step.scheduledAt) {
        return {
          id: step.id,
          stepNumber: step.stepNumber,
          subject: step.subject ?? undefined,
          body: step.body ?? undefined,
          delayDays: step.delayDays,
          status: "scheduled" as const,
          scheduledAt: step.scheduledAt,
          bodyPreview: step.body
            ? step.body.slice(0, 100) + (step.body.length > 100 ? "..." : "")
            : undefined,
        };
      }

      return {
        id: step.id,
        stepNumber: step.stepNumber,
        subject: step.subject ?? undefined,
        body: step.body ?? undefined,
        delayDays: step.delayDays,
        status: step.status as "pending" | "skipped" | "cancelled" | "failed",
      };
    });

    return NextResponse.json({
      id: row.sequence.id,
      contact: {
        email: row.contact.email,
        firstName: row.contact.firstName,
        lastName: row.contact.lastName,
        company: row.contact.company,
        title: row.contact.title,
        status: row.contact.status,
      },
      campaign: row.campaign?.id ? { id: row.campaign.id, name: row.campaign.name } : null,
      template: row.template?.id ? { id: row.template.id, name: row.template.name } : null,
      status: row.sequence.status,
      steps: stepTimeline,
      pausedReason: row.sequence.pausedReason,
      lastSentAt: row.sequence.lastSentAt,
      createdAt: row.sequence.createdAt,
    });
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Get sequence error:", error);
    return NextResponse.json({ error: "Failed to fetch sequence" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const { id } = await params;
    const body = await request.json();

    // Verify ownership
    const [existing] = await db
      .select()
      .from(sequences)
      .where(and(eq(sequences.id, id), eq(sequences.workspaceId, workspaceId)));

    if (!existing) {
      return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
    }

    const action = body.action as string | undefined;
    if (!action) {
      return NextResponse.json({ error: "action is required" }, { status: 400 });
    }

    const validActions = ["pause", "resume", "skip", "send_now"];
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 });
    }

    if (action === "pause") {
      if (!["active", "not_sent"].includes(existing.status)) {
        return NextResponse.json({ error: "Sequence is not active" }, { status: 409 });
      }
      // Cancel pending steps
      await db
        .update(sequenceSteps)
        .set({ status: "cancelled" })
        .where(and(eq(sequenceSteps.sequenceId, id), eq(sequenceSteps.status, "pending")));

      const [updated] = await db
        .update(sequences)
        .set({ status: "paused", pausedReason: "manual", pausedAt: new Date() })
        .where(eq(sequences.id, id))
        .returning();
      return NextResponse.json(updated);
    }

    if (action === "resume") {
      if (existing.status !== "paused") {
        return NextResponse.json({ error: "Sequence is not paused" }, { status: 409 });
      }

      // Re-schedule cancelled steps from today
      const cancelledSteps = await db
        .select()
        .from(sequenceSteps)
        .where(and(eq(sequenceSteps.sequenceId, id), eq(sequenceSteps.status, "cancelled")))
        .orderBy(asc(sequenceSteps.stepNumber));

      const today = new Date();
      for (let i = 0; i < cancelledSteps.length; i++) {
        const step = cancelledSteps[i];
        const newScheduledAt = computeSendTime(
          today,
          existing.sendingWindowStart,
          existing.sendingWindowEnd,
          i
        );
        await db
          .update(sequenceSteps)
          .set({ status: "pending", scheduledAt: newScheduledAt })
          .where(eq(sequenceSteps.id, step.id));
      }

      const [updated] = await db
        .update(sequences)
        .set({ status: "active", pausedReason: null, pausedAt: null })
        .where(eq(sequences.id, id))
        .returning();
      return NextResponse.json(updated);
    }

    if (action === "skip") {
      // Mark the next pending step as skipped
      const [nextStep] = await db
        .select()
        .from(sequenceSteps)
        .where(and(eq(sequenceSteps.sequenceId, id), eq(sequenceSteps.status, "pending")))
        .orderBy(asc(sequenceSteps.scheduledAt))
        .limit(1);

      if (nextStep) {
        await db
          .update(sequenceSteps)
          .set({ status: "skipped" })
          .where(eq(sequenceSteps.id, nextStep.id));
      }

      return NextResponse.json({ success: true, skippedStepId: nextStep?.id ?? null });
    }

    if (action === "send_now") {
      const [nextStep] = await db
        .select()
        .from(sequenceSteps)
        .where(and(eq(sequenceSteps.sequenceId, id), eq(sequenceSteps.status, "pending")))
        .orderBy(asc(sequenceSteps.scheduledAt))
        .limit(1);

      if (!nextStep) {
        return NextResponse.json({ error: "No pending step to trigger" }, { status: 409 });
      }

      const [updated] = await db
        .update(sequenceSteps)
        .set({ scheduledAt: new Date() })
        .where(eq(sequenceSteps.id, nextStep.id))
        .returning();
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Unhandled action" }, { status: 500 });
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Patch sequence error:", error);
    return NextResponse.json({ error: "Failed to update sequence" }, { status: 500 });
  }
}
