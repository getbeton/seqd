import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enrollments, plannedSends } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq, and } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;

    // Cancel pending sends
    await db
      .update(plannedSends)
      .set({ status: "cancelled" })
      .where(
        and(eq(plannedSends.enrollmentId, id), eq(plannedSends.status, "pending"))
      );

    const [updated] = await db
      .update(enrollments)
      .set({
        status: "paused",
        pausedReason: "manual",
        pausedAt: new Date(),
      })
      .where(
        and(eq(enrollments.id, id), eq(enrollments.status, "active"))
      )
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Enrollment not found or not active" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to pause enrollment" }, { status: 500 });
  }
}
