import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { workspaceSettings } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq } from "drizzle-orm";
import dns from "dns/promises";

/**
 * Add domain to Vercel project via API.
 * Requires VERCEL_TOKEN and VERCEL_PROJECT_ID env vars.
 * Non-blocking — if it fails, domain is still marked verified (user can add manually).
 */
async function addDomainToVercel(domain: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;

  if (!token || !projectId) {
    return { ok: false, error: "VERCEL_TOKEN or VERCEL_PROJECT_ID not configured" };
  }

  const url = new URL(`https://api.vercel.com/v10/projects/${projectId}/domains`);
  if (teamId) url.searchParams.set("teamId", teamId);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: domain }),
  });

  if (res.ok) {
    return { ok: true };
  }

  const data = await res.json().catch(() => ({}));
  // Domain already added is fine
  if (data.error?.code === "domain_already_in_use" || data.error?.code === "domain_already_exists") {
    return { ok: true };
  }

  return { ok: false, error: data.error?.message || `Vercel API ${res.status}` };
}

export async function POST(request: NextRequest) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();

    const [settings] = await db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId))
      .limit(1);

    if (!settings?.trackingDomain) {
      return NextResponse.json(
        { error: "No tracking domain configured" },
        { status: 400 }
      );
    }

    const domain = settings.trackingDomain;

    const base = process.env.TRACKING_CNAME_BASE;
    const cnameTarget = base
      ? `t-${require("crypto").createHash("sha256").update(settings.workspaceId).digest("hex").slice(0, 8)}.${base}`
      : null;

    try {
      const records = await dns.resolveCname(domain);
      const isValid = records.some(
        (r) => r === "cname.vercel-dns.com" || r.endsWith(".vercel-dns.com") || (cnameTarget && r === cnameTarget)
      );

      if (isValid) {
        await db
          .update(workspaceSettings)
          .set({ trackingDomainVerified: true })
          .where(eq(workspaceSettings.id, settings.id));

        // Auto-add domain to Vercel project (fire-and-forget friendly)
        const vercelResult = await addDomainToVercel(domain);

        return NextResponse.json({
          verified: true,
          records,
          vercelAdded: vercelResult.ok,
          vercelError: vercelResult.error,
        });
      } else {
        return NextResponse.json({
          verified: false,
          records,
          error: `CNAME points to ${records.join(", ")} instead of ${cnameTarget || "cname.vercel-dns.com"}`,
        });
      }
    } catch (dnsError: any) {
      return NextResponse.json({
        verified: false,
        error: dnsError.code === "ENOTFOUND" || dnsError.code === "ENODATA"
          ? `No CNAME record found. Please add a CNAME record pointing to ${cnameTarget || "cname.vercel-dns.com"}`
          : `DNS lookup failed: ${dnsError.message}`,
      });
    }
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Verify tracking domain error:", error);
    return NextResponse.json({ error: "Failed to verify domain" }, { status: 500 });
  }
}
