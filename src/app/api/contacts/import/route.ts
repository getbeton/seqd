import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { parse } from "csv-parse/sync";

const STANDARD_FIELDS = new Set([
  "email",
  "first_name",
  "firstname",
  "last_name",
  "lastname",
  "company",
  "title",
]);

function normalizeFieldName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, "_");
}

export async function POST(request: NextRequest) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const text = await file.text();
    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const record of records) {
      // Normalize field names
      const normalized: Record<string, string> = {};
      for (const key of Object.keys(record)) {
        normalized[normalizeFieldName(key)] = record[key];
      }

      const email = normalized.email;
      if (!email) {
        skipped++;
        continue;
      }

      // Extract standard fields
      const firstName =
        normalized.first_name || normalized.firstname || null;
      const lastName =
        normalized.last_name || normalized.lastname || null;
      const company = normalized.company || null;
      const title = normalized.title || null;

      // Everything else goes to custom_fields
      const customFields: Record<string, string> = {};
      for (const [key, value] of Object.entries(normalized)) {
        if (!STANDARD_FIELDS.has(key) && key !== "email" && value) {
          customFields[key] = value;
        }
      }

      try {
        await db
          .insert(contacts)
          .values({
            workspaceId,
            email,
            firstName,
            lastName,
            company,
            title,
            customFields,
          })
          .onConflictDoNothing();
        imported++;
      } catch {
        skipped++;
      }
    }

    return NextResponse.json({
      imported,
      skipped,
      total: records.length,
      errors,
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("CSV import error:", error);
    return NextResponse.json({ error: "Failed to import contacts" }, { status: 500 });
  }
}
