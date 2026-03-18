import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";

export async function getSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session;
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function getWorkspaceId(): Promise<string> {
  // Single-tenant: return the first (default) workspace
  const [workspace] = await db.select().from(workspaces).limit(1);
  if (!workspace) throw new Error("No workspace found. Run seed first.");
  return workspace.id;
}
