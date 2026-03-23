import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  enrollments,
  contacts,
  campaigns,
  experiments,
  steps,
  plannedSends,
} from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq, and, sql, count, desc, asc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();

    const { searchParams } = new URL(request.url);
    const experimentId = searchParams.get("experiment_id");
    const status = searchParams.get("status");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get("per_page") || "50")));
    const offset = (page - 1) * perPage;

    // Build where conditions
    const conditions = [eq(enrollments.workspaceId, workspaceId)];
    if (experimentId) conditions.push(eq(enrollments.experimentId, experimentId));
    if (status) conditions.push(eq(enrollments.status, status));

    // Fetch enrollments with joins
    const rows = await db
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
      .where(and(...conditions))
      .orderBy(desc(enrollments.createdAt))
      .limit(perPage)
      .offset(offset);

    // For each enrollment get total steps and next scheduled send
    const enrollmentIds = rows.map((r) => r.enrollment.id);

    // Get step counts per campaign
    const stepCounts = enrollmentIds.length > 0
      ? await db
          .select({
            campaignId: steps.campaignId,
            totalSteps: count(),
          })
          .from(steps)
          .where(
            sql`${steps.campaignId} IN (${sql.join(
              rows.map((r) => sql`${r.campaign.id}`),
              sql`, `
            )})`
          )
          .groupBy(steps.campaignId)
      : [];

    const stepCountMap = new Map(stepCounts.map((s) => [s.campaignId, s.totalSteps]));

    // Get next scheduled sends
    const nextSends = enrollmentIds.length > 0
      ? await db
          .select({
            enrollmentId: plannedSends.enrollmentId,
            scheduledAt: plannedSends.scheduledAt,
          })
          .from(plannedSends)
          .where(
            and(
              sql`${plannedSends.enrollmentId} IN (${sql.join(
                enrollmentIds.map((id) => sql`${id}`),
                sql`, `
              )})`,
              eq(plannedSends.status, "pending")
            )
          )
          .orderBy(asc(plannedSends.scheduledAt))
      : [];

    const nextSendMap = new Map<string, Date>();
    for (const ns of nextSends) {
      if (!nextSendMap.has(ns.enrollmentId)) {
        nextSendMap.set(ns.enrollmentId, ns.scheduledAt);
      }
    }

    const result = rows.map(({ enrollment, contact, campaign, experiment }) => ({
      id: enrollment.id,
      contact: {
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        company: contact.company,
        title: contact.title,
      },
      experiment: experiment?.id
        ? { id: experiment.id, name: experiment.name }
        : null,
      template: { id: campaign.id, name: campaign.name },
      status: enrollment.status,
      currentStepNumber: enrollment.currentStepNumber,
      totalSteps: stepCountMap.get(campaign.id) ?? 0,
      lastSentAt: enrollment.lastSentAt,
      nextScheduledAt: nextSendMap.get(enrollment.id) ?? null,
      repliedAt:
        enrollment.finishedReason === "replied" ? enrollment.finishedAt : null,
      createdAt: enrollment.createdAt,
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
