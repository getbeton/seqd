import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mailboxes, sequenceSteps } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq, and, sql, count } from "drizzle-orm";
import { addDays, format } from "date-fns";

export async function GET(request: NextRequest) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const dateParam = request.nextUrl.searchParams.get("date");
    const daysParam = parseInt(request.nextUrl.searchParams.get("days") || "14");

    const startDate = dateParam ? new Date(dateParam) : new Date();

    const activeMailboxes = await db
      .select()
      .from(mailboxes)
      .where(
        and(eq(mailboxes.workspaceId, workspaceId), eq(mailboxes.isActive, true))
      );

    const result = [];
    for (let i = 0; i < daysParam; i++) {
      const date = addDays(startDate, i);
      const dateStr = format(date, "yyyy-MM-dd");

      const mailboxCapacity = [];
      for (const mailbox of activeMailboxes) {
        const [usage] = await db
          .select({ count: count() })
          .from(sequenceSteps)
          .where(
            and(
              eq(sequenceSteps.mailboxId, mailbox.id),
              sql`DATE(${sequenceSteps.scheduledAt}) = ${dateStr}::date`,
              eq(sequenceSteps.status, "pending")
            )
          );

        mailboxCapacity.push({
          id: mailbox.id,
          email: mailbox.email,
          dailyLimit: mailbox.dailyLimit,
          reserved: usage.count,
          available: mailbox.dailyLimit - usage.count,
        });
      }

      result.push({ date: dateStr, mailboxes: mailboxCapacity });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch capacity" }, { status: 500 });
  }
}
