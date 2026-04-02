import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { workspaceSettings } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq } from "drizzle-orm";

function generateCnameTarget(workspaceId: string): string | null {
  const base = process.env.TRACKING_CNAME_BASE;
  if (!base) return null;
  const short = crypto.createHash("sha256").update(workspaceId).digest("hex").slice(0, 8);
  return `t-${short}.${base}`;
}

export async function GET() {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();

    const [settings] = await db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId))
      .limit(1);

    const cnameTarget = generateCnameTarget(workspaceId);

    return NextResponse.json({
      ...(settings || {
        trackingDomain: null,
        trackingDomainVerified: false,
        openTrackingEnabled: true,
        clickTrackingEnabled: true,
        unsubscribeLinkEnabled: true,
      }),
      cnameTarget,
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const body = await request.json();

    const values = {
      workspaceId,
      trackingDomain: body.trackingDomain || null,
      trackingDomainVerified: false,
      openTrackingEnabled: body.openTrackingEnabled ?? true,
      clickTrackingEnabled: body.clickTrackingEnabled ?? true,
      unsubscribeLinkEnabled: body.unsubscribeLinkEnabled ?? true,
    };

    // Upsert workspace settings
    const [existing] = await db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId))
      .limit(1);

    let result;
    if (existing) {
      [result] = await db
        .update(workspaceSettings)
        .set({
          trackingDomain: values.trackingDomain,
          openTrackingEnabled: values.openTrackingEnabled,
          clickTrackingEnabled: values.clickTrackingEnabled,
          unsubscribeLinkEnabled: values.unsubscribeLinkEnabled,
          // Reset verification when domain changes
          trackingDomainVerified: existing.trackingDomain === values.trackingDomain
            ? existing.trackingDomainVerified
            : false,
        })
        .where(eq(workspaceSettings.id, existing.id))
        .returning();
    } else {
      [result] = await db
        .insert(workspaceSettings)
        .values(values)
        .returning();
    }

    return NextResponse.json(result);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Save tracking domain error:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
