import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enrollments, plannedSends } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq, and } from "drizzle-orm";

export async function DELETE(
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

    // Mark enrollment as finished
    const [updated] = await db
      .update(enrollments)
      .set({
        status: "finished",
        finishedReason: "manually_removed",
        finishedAt: new Date(),
      })
      .where(eq(enrollments.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to unenroll" }, { status: 500 });
  }
}
