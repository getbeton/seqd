import { google, gmail_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { decrypt } from "@/lib/encryption";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];

export function getOAuth2Client(): OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
}

export function getAuthUrl(state: string): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    state,
    prompt: "consent",
  });
}

export async function exchangeCode(code: string) {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens;
}

export async function getAuthenticatedClient(
  encryptedRefreshToken: string
): Promise<OAuth2Client> {
  const client = getOAuth2Client();
  const refreshToken = decrypt(encryptedRefreshToken);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

export async function getGmailService(
  encryptedRefreshToken: string
): Promise<gmail_v1.Gmail> {
  const auth = await getAuthenticatedClient(encryptedRefreshToken);
  return google.gmail({ version: "v1", auth });
}

export async function getUserEmail(
  encryptedRefreshToken: string
): Promise<string> {
  const gmail = await getGmailService(encryptedRefreshToken);
  const profile = await gmail.users.getProfile({ userId: "me" });
  return profile.data.emailAddress || "";
}
