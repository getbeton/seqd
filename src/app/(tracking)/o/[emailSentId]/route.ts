import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailEvents, emailsSent } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// 43-byte transparent 1x1 GIF
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ emailSentId: string }> }
) {
  const { emailSentId } = await params;

  // Fire-and-forget: record open event, don't wait
  recordOpen(emailSentId).catch((err) =>
    console.error("Failed to record open:", err.message)
  );

  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(TRANSPARENT_GIF.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

async function recordOpen(emailSentId: string) {
  const [sent] = await db
    .select({ sequenceId: emailsSent.sequenceId })
    .from(emailsSent)
    .where(eq(emailsSent.id, emailSentId))
    .limit(1);

  if (!sent) return;

  await db.insert(emailEvents).values({
    emailSentId,
    sequenceId: sent.sequenceId,
    eventType: "open",
  });
}
