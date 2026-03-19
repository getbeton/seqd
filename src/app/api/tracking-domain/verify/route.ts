import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { workspaceSettings } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq } from "drizzle-orm";
import dns from "dns/promises";

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

    try {
      const records = await dns.resolveCname(domain);
      const isValid = records.some(
        (r) => r === "cname.vercel-dns.com" || r.endsWith(".vercel-dns.com")
      );

      if (isValid) {
        await db
          .update(workspaceSettings)
          .set({ trackingDomainVerified: true })
          .where(eq(workspaceSettings.id, settings.id));

        return NextResponse.json({ verified: true, records });
      } else {
        return NextResponse.json({
          verified: false,
          records,
          error: `CNAME points to ${records.join(", ")} instead of cname.vercel-dns.com`,
        });
      }
    } catch (dnsError: any) {
      return NextResponse.json({
        verified: false,
        error: dnsError.code === "ENOTFOUND" || dnsError.code === "ENODATA"
          ? "No CNAME record found. Please add a CNAME record pointing to cname.vercel-dns.com"
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
