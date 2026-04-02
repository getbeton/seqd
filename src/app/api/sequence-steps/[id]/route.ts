import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sequenceSteps } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;
    const body = await request.json();

    const updates: Record<string, any> = {};
    if (body.subject !== undefined) updates.subject = body.subject;
    if (body.body !== undefined) updates.body = body.body;
    if (body.delayDays !== undefined) updates.delayDays = body.delayDays;

    const [updated] = await db
      .update(sequenceSteps)
      .set(updates)
      .where(eq(sequenceSteps.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to update step" },
      { status: 500 }
    );
  }
}
