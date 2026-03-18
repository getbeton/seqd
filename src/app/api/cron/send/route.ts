import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { runSendCycle } from "@/lib/services/sender";

export async function POST(request: NextRequest) {
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
