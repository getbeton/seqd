import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { enrollContacts } from "@/lib/services/enrollment";
import { eq } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const { id } = await params;
    const body = await request.json();

    let contactIds: string[];

    if (body.all) {
      // Enroll all contacts in workspace
      const allContacts = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(eq(contacts.workspaceId, workspaceId));
      contactIds = allContacts.map((c) => c.id);
    } else if (body.contact_ids || body.contactIds) {
      contactIds = body.contact_ids || body.contactIds;
    } else {
      return NextResponse.json(
        { error: "Provide contact_ids array or set all: true" },
        { status: 400 }
      );
    }

    const result = await enrollContacts(id, contactIds, workspaceId);
    return NextResponse.json(result);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Enrollment error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to enroll contacts" },
      { status: 500 }
    );
  }
}
