import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { steps, contacts } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq } from "drizzle-orm";
import { renderTemplate, buildContactVariables } from "@/lib/services/renderer";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;
    const contactId = request.nextUrl.searchParams.get("contact_id");

    const [step] = await db.select().from(steps).where(eq(steps.id, id));
    if (!step) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }

    let variables: Record<string, string | null> = {
      email: "jane@example.com",
      first_name: "Jane",
      last_name: "Doe",
      company: "Acme Inc",
      title: "VP of Sales",
    };

    if (contactId) {
      const [contact] = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, contactId));
      if (contact) {
        variables = buildContactVariables(contact);
      }
    }

    const seed = `${contactId || "preview"}:${id}`;
    const renderedSubject = step.subject
      ? renderTemplate(step.subject, variables, seed)
      : "";
    const renderedBody = step.bodyTemplate
      ? renderTemplate(step.bodyTemplate, variables, seed)
      : "";

    return NextResponse.json({
      subject: renderedSubject,
      body: renderedBody,
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to preview" }, { status: 500 });
  }
}
