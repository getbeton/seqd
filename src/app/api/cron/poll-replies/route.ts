import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { runReplyPolling } from "@/lib/services/reply-poller";

async function handler(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runReplyPolling();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Reply polling error:", error);
    return NextResponse.json(
      { error: "Reply polling failed", message: error.message },
      { status: 500 }
    );
  }
}

export const GET = handler;
export const POST = handler;
