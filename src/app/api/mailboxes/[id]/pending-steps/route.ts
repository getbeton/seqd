import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sequenceSteps } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq, and, count } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;

    const [result] = await db
      .select({ count: count() })
      .from(sequenceSteps)
      .where(
        and(eq(sequenceSteps.mailboxId, id), eq(sequenceSteps.status, "pending"))
      );

    return NextResponse.json({ count: result.count });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to count pending steps" },
      { status: 500 }
    );
  }
}
