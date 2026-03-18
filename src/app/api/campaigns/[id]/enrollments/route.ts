import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enrollments, contacts } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq, and } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;
    const statusFilter = request.nextUrl.searchParams.get("status");

    const conditions = [eq(enrollments.campaignId, id)];
    if (statusFilter) {
      conditions.push(eq(enrollments.status, statusFilter));
    }

    const result = await db
      .select({
        enrollment: enrollments,
        contact: {
          id: contacts.id,
          email: contacts.email,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          company: contacts.company,
        },
      })
      .from(enrollments)
      .innerJoin(contacts, eq(enrollments.contactId, contacts.id))
      .where(and(...conditions))
      .orderBy(enrollments.createdAt);

    return NextResponse.json(result);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch enrollments" }, { status: 500 });
  }
}
