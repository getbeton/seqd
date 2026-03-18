import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/gmail/client";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import crypto from "crypto";

export async function POST() {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const state = Buffer.from(
      JSON.stringify({ workspaceId, nonce: crypto.randomBytes(16).toString("hex") })
    ).toString("base64url");
    const authUrl = getAuthUrl(state);
    return NextResponse.json({ auth_url: authUrl });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("OAuth start error:", error);
    return NextResponse.json(
      { error: "Failed to start OAuth flow" },
      { status: 500 }
    );
  }
}
