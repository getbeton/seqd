import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contactStages } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const result = await db
      .select()
      .from(contactStages)
      .where(eq(contactStages.workspaceId, workspaceId))
      .orderBy(contactStages.order);
    return NextResponse.json(result);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch stages" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const body = await request.json();
    const [stage] = await db
      .insert(contactStages)
      .values({
        workspaceId,
        name: body.name,
        order: body.order || 0,
      })
      .returning();
    return NextResponse.json(stage, { status: 201 });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to create stage" }, { status: 500 });
  }
}
