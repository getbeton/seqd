import { NextRequest } from "next/server";

/**
 * Verify cron endpoint is called with correct secret.
 * Returns true if authorized.
 */
export function verifyCronAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const token = authHeader.replace("Bearer ", "");
  return token === process.env.CRON_SECRET;
}
