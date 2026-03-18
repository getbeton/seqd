import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { runReplyPolling } from "@/lib/services/reply-poller";

export async function POST(request: NextRequest) {
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
