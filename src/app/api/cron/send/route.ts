import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { runSendCycle } from "@/lib/services/sender";

async function handler(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runSendCycle(false);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Send cycle error:", error);
    return NextResponse.json(
      { error: "Send cycle failed", message: error.message },
      { status: 500 }
    );
  }
}

export const GET = handler;
export const POST = handler;
