import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, getOAuth2Client } from "@/lib/gmail/client";
import { encrypt } from "@/lib/encryption";
import { db } from "@/lib/db";
import { mailboxes } from "@/lib/db/schema";
import { google } from "googleapis";

export async function GET(request: NextRequest) {
  // Check for error param from Google (e.g. ?error=access_denied)
  const googleError = request.nextUrl.searchParams.get("error");
  if (googleError) {
    const description = request.nextUrl.searchParams.get("error_description") || googleError;
    console.error("Google OAuth error:", googleError, description);
    return NextResponse.redirect(
      new URL(`/mailboxes?error=${encodeURIComponent(description)}`, request.url)
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/mailboxes?error=" + encodeURIComponent("Missing code or state parameter"), request.url)
    );
  }

  try {
    const { workspaceId } = JSON.parse(
      Buffer.from(state, "base64url").toString()
    );

    const tokens = await exchangeCode(code);

    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        new URL("/mailboxes?error=" + encodeURIComponent("No refresh token received. Try revoking access at myaccount.google.com/permissions and reconnecting."), request.url)
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
  } catch (error: any) {
    console.error("OAuth callback error:", error?.message, error?.stack);
    const reason = error?.message || "oauth_failed";
    return NextResponse.redirect(
      new URL(`/mailboxes?error=${encodeURIComponent(reason)}`, request.url)
    );
  }
}
