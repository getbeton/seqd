import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { experiments, sequences } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq, and, count, sql } from "drizzle-orm";

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
        id: experiments.id,
        name: experiments.name,
        description: experiments.description,
        status: experiments.status,
        createdAt: experiments.createdAt,
        sequenceCount: count(sequences.id),
        activeCount: sql<number>`count(case when ${sequences.status} = 'active' then 1 end)::int`,
        repliedCount: sql<number>`count(case when ${sequences.finishedReason} = 'replied' then 1 end)::int`,
      })
      .from(experiments)
      .leftJoin(sequences, eq(sequences.experimentId, experiments.id))
      .where(and(eq(experiments.id, id), eq(experiments.workspaceId, workspaceId)))
      .groupBy(experiments.id);

    if (!row) {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch experiment" }, { status: 500 });
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

    const updates: Record<string, string | null> = {};
    if (body.name !== undefined) updates.name = (body.name as string).trim();
    if (body.description !== undefined) updates.description = (body.description as string | undefined)?.trim() ?? null;
    if (body.status !== undefined) {
      const validStatuses = ["active", "paused", "archived"];
      if (!validStatuses.includes(body.status as string)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.status = body.status as string;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const [updated] = await db
      .update(experiments)
      .set(updates)
      .where(and(eq(experiments.id, id), eq(experiments.workspaceId, workspaceId)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to update experiment" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const { id } = await params;

    // Check no sequences are assigned
    const [{ seqCount }] = await db
      .select({ seqCount: count() })
      .from(sequences)
      .where(eq(sequences.experimentId, id));

    if (seqCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete experiment with ${seqCount} sequence(s) assigned` },
        { status: 409 }
      );
    }

    const [deleted] = await db
      .delete(experiments)
      .where(and(eq(experiments.id, id), eq(experiments.workspaceId, workspaceId)))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to delete experiment" }, { status: 500 });
  }
}
