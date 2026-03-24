import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailEvents, emailsSent } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ emailSentId: string }> }
) {
  const { emailSentId } = await params;
  const url = request.nextUrl.searchParams.get("url");

  // Validate URL - only allow http/https
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    return new NextResponse("Invalid URL", { status: 400 });
  }

  // Fire-and-forget: record click event
  recordClick(emailSentId, url).catch((err) =>
    console.error("Failed to record click:", err.message)
  );

  return NextResponse.redirect(url, 302);
}

async function recordClick(emailSentId: string, clickedUrl: string) {
  const [sent] = await db
    .select({ sequenceId: emailsSent.sequenceId })
    .from(emailsSent)
    .where(eq(emailsSent.id, emailSentId))
    .limit(1);

  if (!sent) return;

  await db.insert(emailEvents).values({
    emailSentId,
    sequenceId: sent.sequenceId,
    eventType: "click",
    clickedUrl,
  });
}
