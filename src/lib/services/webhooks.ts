import { db } from "@/lib/db";
import { webhookConfigs } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Dispatch webhook to all configured targets for the given event type.
 * Uses fetch with retry on failure.
 */
export async function dispatchWebhook(
  eventType: string,
  payload: Record<string, any>,
  workspaceId: string
) {
  const configs = await db
    .select()
    .from(webhookConfigs)
    .where(eq(webhookConfigs.workspaceId, workspaceId));

  const matchingConfigs = configs.filter(
    (c) => c.isActive && (c.events as string[]).includes(eventType)
  );

  for (const config of matchingConfigs) {
    // Fire and forget — don't block the main flow
    deliverWebhook(config.url, eventType, payload).catch((err) => {
      console.error(`Webhook delivery failed to ${config.url}:`, err.message);
    });
  }
}

async function deliverWebhook(
  url: string,
  eventType: string,
  payload: Record<string, any>,
  attempt = 1,
  maxAttempts = 5
) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: eventType,
        payload,
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok && response.status >= 500 && attempt < maxAttempts) {
      // Retry with exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return deliverWebhook(url, eventType, payload, attempt + 1, maxAttempts);
    }
  } catch (error: any) {
    if (attempt < maxAttempts) {
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return deliverWebhook(url, eventType, payload, attempt + 1, maxAttempts);
    }
    throw error;
  }
}
