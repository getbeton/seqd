import { db } from "./index";
import { workspaces, contactStages } from "./schema";
import { eq } from "drizzle-orm";

export async function seedDefaults() {
  // Create default workspace if none exists
  const existing = await db.select().from(workspaces).limit(1);
  if (existing.length > 0) return existing[0];

  const [workspace] = await db
    .insert(workspaces)
    .values({ name: "Default" })
    .returning();

  // Seed default contact stages
  const defaultStages = [
    { name: "New Lead", order: 0 },
    { name: "Working", order: 1 },
    { name: "Qualified", order: 2 },
    { name: "Customer", order: 3 },
    { name: "Not Interested", order: 4 },
  ];

  for (const stage of defaultStages) {
    await db.insert(contactStages).values({
      workspaceId: workspace.id,
      ...stage,
    });
  }

  return workspace;
}

export async function getDefaultWorkspace() {
  const [workspace] = await db.select().from(workspaces).limit(1);
  return workspace;
}
