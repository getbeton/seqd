import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq, and, ilike, or, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const search = request.nextUrl.searchParams.get("search");
    const status = request.nextUrl.searchParams.get("status");
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50");
    const offset = parseInt(request.nextUrl.searchParams.get("offset") || "0");

    let query = db
      .select()
      .from(contacts)
      .where(eq(contacts.workspaceId, workspaceId))
      .limit(limit)
      .offset(offset)
      .orderBy(contacts.createdAt);

    // Apply filters via raw SQL if needed
    const conditions = [eq(contacts.workspaceId, workspaceId)];
    if (status) {
      conditions.push(eq(contacts.status, status));
    }
    if (search) {
      conditions.push(
        or(
          ilike(contacts.email, `%${search}%`),
          ilike(contacts.firstName, `%${search}%`),
          ilike(contacts.lastName, `%${search}%`),
          ilike(contacts.company, `%${search}%`)
        )!
      );
    }

    const result = await db
      .select()
      .from(contacts)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset)
      .orderBy(contacts.createdAt);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(contacts)
      .where(and(...conditions));

    return NextResponse.json({ data: result, total: Number(count) });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const body = await request.json();

    const [contact] = await db
      .insert(contacts)
      .values({
        workspaceId,
        email: body.email,
        firstName: body.firstName || body.first_name,
        lastName: body.lastName || body.last_name,
        company: body.company,
        title: body.title,
        customFields: body.customFields || body.custom_fields || {},
        contactStageId: body.contactStageId,
      })
      .returning();

    return NextResponse.json(contact, { status: 201 });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error.code === "23505") {
      return NextResponse.json({ error: "Contact with this email already exists" }, { status: 409 });
    }
    console.error("Create contact error:", error);
    return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
  }
}
