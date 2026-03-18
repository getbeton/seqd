import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enrollments } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq, and } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;

    // TODO: Re-run enrollment algorithm from current step to create new planned_sends
    // For now, just update status
    const [updated] = await db
      .update(enrollments)
      .set({
        status: "active",
        pausedReason: null,
        pausedAt: null,
        autoUnpauseAt: null,
      })
      .where(
        and(eq(enrollments.id, id), eq(enrollments.status, "paused"))
      )
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Enrollment not found or not paused" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to resume enrollment" }, { status: 500 });
  }
}
