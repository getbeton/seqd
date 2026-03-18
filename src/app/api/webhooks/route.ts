import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { webhookConfigs } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const result = await db
      .select()
      .from(webhookConfigs)
      .where(eq(webhookConfigs.workspaceId, workspaceId));
    return NextResponse.json(result);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch webhooks" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const body = await request.json();

    const [webhook] = await db
      .insert(webhookConfigs)
      .values({
        workspaceId,
        url: body.url,
        events: body.events || [],
      })
      .returning();

    return NextResponse.json(webhook, { status: 201 });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to create webhook" }, { status: 500 });
  }
}
