import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailEvents, emailsSent, sequences, sequenceSteps, contacts, campaigns } from "@/lib/db/schema";
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
      eq(sequences.workspaceId, workspaceId),
    ];
    if (campaignId) {
      conditions.push(eq(sequences.campaignId, campaignId));
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
          stepNumber: sequenceSteps.stepNumber,
        },
      })
      .from(emailEvents)
      .innerJoin(sequences, eq(emailEvents.sequenceId, sequences.id))
      .innerJoin(contacts, eq(sequences.contactId, contacts.id))
      .leftJoin(campaigns, eq(sequences.campaignId, campaigns.id))
      .leftJoin(emailsSent, eq(emailEvents.emailSentId, emailsSent.id))
      .leftJoin(sequenceSteps, eq(emailsSent.sequenceStepId, sequenceSteps.id))
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
