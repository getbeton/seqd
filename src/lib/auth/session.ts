import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { workspaces, apiKeys } from "@/lib/db/schema";
import { createHash } from "crypto";

export async function getSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session;
}

async function validateApiKey(
  key: string
): Promise<{ workspaceId: string } | null> {
  const hash = createHash("sha256").update(key).digest("hex");
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hash))
    .limit(1);
  if (!row) return null;
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id));
  return { workspaceId: row.workspaceId };
}

export async function requireSession() {
  // Try session auth first (web UI)
  const session = await getSession();
  if (session) return session;

  // Fall back to API key auth (CLI)
  const h = await headers();
  const authHeader = h.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const key = authHeader.slice(7);
    const result = await validateApiKey(key);
    if (result) return result;
  }

  throw new Error("Unauthorized");
}

export async function getWorkspaceId(): Promise<string> {
  // Single-tenant: return the first (default) workspace
  const [workspace] = await db.select().from(workspaces).limit(1);
  if (!workspace) throw new Error("No workspace found. Run seed first.");
  return workspace.id;
}
