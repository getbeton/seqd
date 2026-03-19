import crypto from "crypto";

const HMAC_SECRET_KEY = () => {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  return key;
};

/**
 * Generate an HMAC-signed unsubscribe token.
 * Token format: base64url(JSON({ emailSentId, contactId, enrollmentId })):signature
 */
export function generateUnsubscribeToken(params: {
  emailSentId: string;
  contactId: string;
  enrollmentId: string;
}): string {
  const payload = Buffer.from(JSON.stringify(params)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", HMAC_SECRET_KEY())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

/**
 * Verify and decode an unsubscribe token.
 * Returns null if signature is invalid.
 */
export function verifyUnsubscribeToken(token: string): {
  emailSentId: string;
  contactId: string;
  enrollmentId: string;
} | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = crypto
    .createHmac("sha256", HMAC_SECRET_KEY())
    .update(payload)
    .digest("base64url");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
}
