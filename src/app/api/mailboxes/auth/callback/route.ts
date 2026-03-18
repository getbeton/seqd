import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, getOAuth2Client } from "@/lib/gmail/client";
import { encrypt } from "@/lib/encryption";
import { db } from "@/lib/db";
import { mailboxes } from "@/lib/db/schema";
import { google } from "googleapis";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.json(
      { error: "Missing code or state" },
      { status: 400 }
    );
  }

  try {
    const { workspaceId } = JSON.parse(
      Buffer.from(state, "base64url").toString()
    );

    const tokens = await exchangeCode(code);

    if (!tokens.refresh_token) {
      return NextResponse.json(
        { error: "No refresh token received. Try revoking access and reconnecting." },
        { status: 400 }
      );
    }

    // Get user email from Gmail
    const client = getOAuth2Client();
    client.setCredentials(tokens);
    const gmail = google.gmail({ version: "v1", auth: client });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const email = profile.data.emailAddress!;

    // Encrypt and store
    const encryptedToken = encrypt(tokens.refresh_token);

    const [mailbox] = await db
      .insert(mailboxes)
      .values({
        workspaceId,
        email,
        displayName: email.split("@")[0],
        refreshToken: encryptedToken,
      })
      .onConflictDoNothing()
      .returning();

    // Redirect back to mailboxes page
    return NextResponse.redirect(
      new URL("/mailboxes?success=true", request.url)
    );
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(
      new URL("/mailboxes?error=oauth_failed", request.url)
    );
  }
}
