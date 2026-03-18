import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contactStages } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq, and } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const { id } = await params;
    const body = await request.json();

    const updates: Record<string, any> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.order !== undefined) updates.order = body.order;

    const [updated] = await db
      .update(contactStages)
      .set(updates)
      .where(
        and(
          eq(contactStages.id, id),
          eq(contactStages.workspaceId, workspaceId)
        )
      )
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Stage not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to update stage" }, { status: 500 });
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

    const [deleted] = await db
      .delete(contactStages)
      .where(
        and(
          eq(contactStages.id, id),
          eq(contactStages.workspaceId, workspaceId)
        )
      )
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Stage not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to delete stage" }, { status: 500 });
  }
}
