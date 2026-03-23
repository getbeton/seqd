import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { experiments, enrollments } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq, sql, count } from "drizzle-orm";

export async function GET() {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();

    // Fetch experiments with sequence counts
    const rows = await db
      .select({
        id: experiments.id,
        name: experiments.name,
        description: experiments.description,
        status: experiments.status,
        createdAt: experiments.createdAt,
        sequenceCount: count(enrollments.id),
        activeCount: sql<number>`count(case when ${enrollments.status} = 'active' then 1 end)::int`,
        repliedCount: sql<number>`count(case when ${enrollments.finishedReason} = 'replied' then 1 end)::int`,
      })
      .from(experiments)
      .leftJoin(enrollments, eq(enrollments.experimentId, experiments.id))
      .where(eq(experiments.workspaceId, workspaceId))
      .groupBy(experiments.id)
      .orderBy(experiments.createdAt);

    return NextResponse.json(rows);
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("List experiments error:", error);
    return NextResponse.json({ error: "Failed to fetch experiments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const body = await request.json();

    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const [experiment] = await db
      .insert(experiments)
      .values({
        workspaceId,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        status: "active",
      })
      .returning();

    return NextResponse.json(experiment, { status: 201 });
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Create experiment error:", error);
    return NextResponse.json({ error: "Failed to create experiment" }, { status: 500 });
  }
}
