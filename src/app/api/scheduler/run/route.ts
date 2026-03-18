import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { runSendCycle } from "@/lib/services/sender";

export async function POST(request: NextRequest) {
  try {
    await requireSession();
    const dryRun = request.nextUrl.searchParams.get("dry_run") === "true";
    const result = await runSendCycle(dryRun);
    return NextResponse.json(result);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Manual send cycle error:", error);
    return NextResponse.json(
      { error: "Send cycle failed", message: error.message },
      { status: 500 }
    );
  }
}
