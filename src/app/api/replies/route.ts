import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailEvents, emailsSent, enrollments, contacts, campaigns, steps } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq, and, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const campaignId = request.nextUrl.searchParams.get("campaign_id");
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50");
    const offset = parseInt(request.nextUrl.searchParams.get("offset") || "0");

    const conditions = [
      eq(emailEvents.eventType, "reply"),
      eq(enrollments.workspaceId, workspaceId),
    ];
    if (campaignId) {
      conditions.push(eq(enrollments.campaignId, campaignId));
    }

    const result = await db
      .select({
        event: emailEvents,
        contact: {
          id: contacts.id,
          email: contacts.email,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          company: contacts.company,
        },
        campaign: {
          id: campaigns.id,
          name: campaigns.name,
        },
        step: {
          stepNumber: steps.stepNumber,
        },
      })
      .from(emailEvents)
      .innerJoin(enrollments, eq(emailEvents.enrollmentId, enrollments.id))
      .innerJoin(contacts, eq(enrollments.contactId, contacts.id))
      .innerJoin(campaigns, eq(enrollments.campaignId, campaigns.id))
      .leftJoin(emailsSent, eq(emailEvents.emailSentId, emailsSent.id))
      .leftJoin(steps, eq(emailsSent.stepId, steps.id))
      .where(and(...conditions))
      .orderBy(desc(emailEvents.occurredAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json(result);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch replies" }, { status: 500 });
  }
}
