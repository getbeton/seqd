import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mailboxes } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq, and } from "drizzle-orm";

export async function GET() {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const result = await db
      .select({
        id: mailboxes.id,
        email: mailboxes.email,
        displayName: mailboxes.displayName,
        dailyLimit: mailboxes.dailyLimit,
        isActive: mailboxes.isActive,
        createdAt: mailboxes.createdAt,
      })
      .from(mailboxes)
      .where(eq(mailboxes.workspaceId, workspaceId));
    return NextResponse.json(result);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch mailboxes" }, { status: 500 });
  }
}
