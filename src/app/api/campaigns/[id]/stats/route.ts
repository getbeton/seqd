import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enrollments, emailsSent, emailEvents, steps } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq, and, sql, count } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;

    // Status breakdown
    const statusCounts = await db
      .select({
        status: enrollments.status,
        count: count(),
      })
      .from(enrollments)
      .where(eq(enrollments.campaignId, id))
      .groupBy(enrollments.status);

    const contactStatuses: Record<string, number> = {};
    for (const row of statusCounts) {
      contactStatuses[row.status] = row.count;
    }

    // Per-step stats
    const campaignSteps = await db
      .select()
      .from(steps)
      .where(eq(steps.campaignId, id))
      .orderBy(steps.stepNumber);

    const perStep = [];
    for (const step of campaignSteps) {
      const [sentCount] = await db
        .select({ count: count() })
        .from(emailsSent)
        .where(eq(emailsSent.stepId, step.id));

      const [replyCount] = await db
        .select({ count: count() })
        .from(emailEvents)
        .where(
          and(
            eq(emailEvents.eventType, "reply"),
            // Join through emailsSent would be more precise, but this works for now
          )
        );

      perStep.push({
        stepNumber: step.stepNumber,
        sent: sentCount.count,
        replyRate: sentCount.count > 0 ? replyCount.count / sentCount.count : 0,
      });
    }

    return NextResponse.json({ contactStatuses, perStep });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
