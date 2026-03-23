import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  enrollments,
  contacts,
  campaigns,
  experiments,
  steps,
  emailsSent,
  emailEvents,
  plannedSends,
} from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq, and, asc } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const { id } = await params;

    // Fetch enrollment with contact, campaign, experiment
    const [row] = await db
      .select({
        enrollment: enrollments,
        contact: contacts,
        campaign: {
          id: campaigns.id,
          name: campaigns.name,
        },
        experiment: {
          id: experiments.id,
          name: experiments.name,
        },
      })
      .from(enrollments)
      .innerJoin(contacts, eq(contacts.id, enrollments.contactId))
      .innerJoin(campaigns, eq(campaigns.id, enrollments.campaignId))
      .leftJoin(experiments, eq(experiments.id, enrollments.experimentId))
      .where(and(eq(enrollments.id, id), eq(enrollments.workspaceId, workspaceId)));

    if (!row) {
      return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
    }

    // Fetch all steps for this campaign
    const campaignSteps = await db
      .select()
      .from(steps)
      .where(eq(steps.campaignId, row.campaign.id))
      .orderBy(asc(steps.stepNumber));

    // Fetch all emails sent for this enrollment
    const sentEmails = await db
      .select()
      .from(emailsSent)
      .where(eq(emailsSent.enrollmentId, id))
      .orderBy(asc(emailsSent.sentAt));

    // Fetch all events for this enrollment
    const events = await db
      .select()
      .from(emailEvents)
      .where(eq(emailEvents.enrollmentId, id))
      .orderBy(asc(emailEvents.occurredAt));

    // Fetch pending planned sends
    const pendingSends = await db
      .select()
      .from(plannedSends)
      .where(and(eq(plannedSends.enrollmentId, id), eq(plannedSends.status, "pending")))
      .orderBy(asc(plannedSends.scheduledAt));

    // Build step timeline
    const sentByStep = new Map<string, typeof sentEmails[0]>();
    for (const sent of sentEmails) {
      sentByStep.set(sent.stepId, sent);
    }

    const eventsByEmailSent = new Map<string, typeof events>();
    for (const event of events) {
      if (event.emailSentId) {
        const list = eventsByEmailSent.get(event.emailSentId) ?? [];
        list.push(event);
        eventsByEmailSent.set(event.emailSentId, list);
      }
    }

    const pendingByStep = new Map<string, typeof pendingSends[0]>();
    for (const ps of pendingSends) {
      pendingByStep.set(ps.stepId, ps);
    }

    const stepTimeline = campaignSteps.map((step) => {
      const sent = sentByStep.get(step.id);
      const planned = pendingByStep.get(step.id);

      if (sent) {
        const stepEvents = (eventsByEmailSent.get(sent.id) ?? []).map((e) => ({
          type: e.eventType,
          occurredAt: e.occurredAt,
          replyText: e.replyText ?? undefined,
        }));
        return {
          stepNumber: step.stepNumber,
          subject: sent.renderedSubject ?? step.subject,
          delayDays: step.delayDays,
          status: "sent" as const,
          sentAt: sent.sentAt,
          gmailMessageId: sent.gmailMessageId ?? undefined,
          events: stepEvents,
        };
      }

      if (planned) {
        return {
          stepNumber: step.stepNumber,
          subject: step.subject ?? undefined,
          delayDays: step.delayDays,
          status: "scheduled" as const,
          scheduledAt: planned.scheduledAt,
          bodyPreview: step.bodyTemplate
            ? step.bodyTemplate.slice(0, 100) + (step.bodyTemplate.length > 100 ? "..." : "")
            : undefined,
        };
      }

      return {
        stepNumber: step.stepNumber,
        subject: step.subject ?? undefined,
        delayDays: step.delayDays,
        status: "pending" as const,
      };
    });

    return NextResponse.json({
      id: row.enrollment.id,
      contact: {
        email: row.contact.email,
        firstName: row.contact.firstName,
        lastName: row.contact.lastName,
        company: row.contact.company,
        title: row.contact.title,
        status: row.contact.status,
      },
      experiment: row.experiment?.id
        ? { id: row.experiment.id, name: row.experiment.name }
        : null,
      template: { id: row.campaign.id, name: row.campaign.name },
      status: row.enrollment.status,
      currentStepNumber: row.enrollment.currentStepNumber,
      steps: stepTimeline,
      pausedReason: row.enrollment.pausedReason,
      createdAt: row.enrollment.createdAt,
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
      .from(enrollments)
      .where(and(eq(enrollments.id, id), eq(enrollments.workspaceId, workspaceId)));

    if (!existing) {
      return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
    }

    // Handle experiment assignment
    if (body.experiment_id !== undefined) {
      // Validate experiment belongs to workspace
      if (body.experiment_id !== null) {
        const { experiments: expTable } = await import("@/lib/db/schema");
        const [exp] = await db
          .select()
          .from(expTable)
          .where(and(eq(expTable.id, body.experiment_id), eq(expTable.workspaceId, workspaceId)));
        if (!exp) {
          return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
        }
      }

      const [updated] = await db
        .update(enrollments)
        .set({ experimentId: body.experiment_id })
        .where(eq(enrollments.id, id))
        .returning();

      return NextResponse.json(updated);
    }

    // Handle action
    const action = body.action as string | undefined;
    if (!action) {
      return NextResponse.json({ error: "action or experiment_id required" }, { status: 400 });
    }

    const validActions = ["pause", "resume", "skip", "send_now"];
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 });
    }

    if (action === "pause") {
      if (existing.status !== "active" && existing.status !== "not_sent") {
        return NextResponse.json(
          { error: "Sequence is not active" },
          { status: 409 }
        );
      }
      // Cancel pending sends
      await db
        .update(plannedSends)
        .set({ status: "cancelled" })
        .where(and(eq(plannedSends.enrollmentId, id), eq(plannedSends.status, "pending")));

      const [updated] = await db
        .update(enrollments)
        .set({ status: "paused", pausedReason: "manual", pausedAt: new Date() })
        .where(eq(enrollments.id, id))
        .returning();
      return NextResponse.json(updated);
    }

    if (action === "resume") {
      if (existing.status !== "paused") {
        return NextResponse.json(
          { error: "Sequence is not paused" },
          { status: 409 }
        );
      }
      const [updated] = await db
        .update(enrollments)
        .set({
          status: "active",
          pausedReason: null,
          pausedAt: null,
          autoUnpauseAt: null,
        })
        .where(eq(enrollments.id, id))
        .returning();
      return NextResponse.json(updated);
    }

    if (action === "skip") {
      // Cancel the next pending send and advance step number
      const [nextSend] = await db
        .select()
        .from(plannedSends)
        .where(and(eq(plannedSends.enrollmentId, id), eq(plannedSends.status, "pending")))
        .orderBy(asc(plannedSends.scheduledAt))
        .limit(1);

      if (nextSend) {
        await db
          .update(plannedSends)
          .set({ status: "cancelled" })
          .where(eq(plannedSends.id, nextSend.id));
      }

      const [updated] = await db
        .update(enrollments)
        .set({ currentStepNumber: existing.currentStepNumber + 1 })
        .where(eq(enrollments.id, id))
        .returning();
      return NextResponse.json(updated);
    }

    if (action === "send_now") {
      // Move the next pending send to now
      const [nextSend] = await db
        .select()
        .from(plannedSends)
        .where(and(eq(plannedSends.enrollmentId, id), eq(plannedSends.status, "pending")))
        .orderBy(asc(plannedSends.scheduledAt))
        .limit(1);

      if (!nextSend) {
        return NextResponse.json({ error: "No pending send to trigger" }, { status: 409 });
      }

      const now = new Date();
      const [updated] = await db
        .update(plannedSends)
        .set({
          scheduledAt: now,
          scheduledDate: now.toISOString().split("T")[0],
        })
        .where(eq(plannedSends.id, nextSend.id))
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
