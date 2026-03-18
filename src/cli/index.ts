#!/usr/bin/env node

import { Command } from "commander";

const program = new Command();

const API_BASE = process.env.SEQD_API_URL || "http://localhost:3000";

async function api(
  method: string,
  path: string,
  body?: any
): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const apiKey = process.env.SEQD_API_KEY;
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function formatTable(rows: Record<string, any>[], columns?: string[]) {
  if (rows.length === 0) {
    console.log("(no results)");
    return;
  }
  const cols = columns || Object.keys(rows[0]);
  const widths = cols.map((col) =>
    Math.max(col.length, ...rows.map((r) => String(r[col] ?? "").length))
  );
  const header = cols.map((col, i) => col.padEnd(widths[i])).join("  ");
  const sep = cols.map((_, i) => "-".repeat(widths[i])).join("  ");
  console.log(header);
  console.log(sep);
  for (const row of rows) {
    console.log(
      cols.map((col, i) => String(row[col] ?? "").padEnd(widths[i])).join("  ")
    );
  }
}

program
  .name("seqd")
  .description("seqd CLI — personal email sequencer")
  .version("0.1.0");

// Mailbox commands
const mailbox = program.command("mailbox");

mailbox
  .command("list")
  .description("List connected mailboxes")
  .action(async () => {
    const data = await api("GET", "/api/mailboxes");
    formatTable(data, ["email", "displayName", "dailyLimit", "isActive"]);
  });

mailbox
  .command("add")
  .description("Add a new Gmail mailbox via OAuth")
  .action(async () => {
    const data = await api("POST", "/api/mailboxes/auth/start");
    console.log("Open this URL to authorize:\n");
    console.log(data.auth_url);
    console.log("\nWaiting for authorization... (check your browser)");
  });

mailbox
  .command("set-limit <email> <limit>")
  .description("Set daily send limit for a mailbox")
  .action(async (email: string, limit: string) => {
    const mailboxes = await api("GET", "/api/mailboxes");
    const mb = mailboxes.find(
      (m: any) => m.email.toLowerCase() === email.toLowerCase()
    );
    if (!mb) {
      console.error(`Mailbox ${email} not found`);
      process.exit(1);
    }
    await api("PATCH", `/api/mailboxes/${mb.id}`, {
      dailyLimit: parseInt(limit),
    });
    console.log(`Updated ${email} daily limit to ${limit}`);
  });

// Campaign commands
const campaign = program.command("campaign");

campaign
  .command("list")
  .description("List campaigns")
  .action(async () => {
    const data = await api("GET", "/api/campaigns");
    formatTable(data, ["name", "status", "timezone"]);
  });

campaign
  .command("create <name>")
  .description("Create a new campaign")
  .action(async (name: string) => {
    const data = await api("POST", "/api/campaigns", { name });
    console.log(`Created campaign: ${data.name} (${data.id})`);
  });

campaign
  .command("stats <id>")
  .description("Show campaign statistics")
  .action(async (id: string) => {
    const data = await api("GET", `/api/campaigns/${id}/stats`);
    console.log("Contact Statuses:");
    for (const [status, count] of Object.entries(data.contactStatuses || {})) {
      console.log(`  ${status}: ${count}`);
    }
  });

campaign
  .command("pause <id>")
  .description("Pause a campaign")
  .action(async (id: string) => {
    await api("POST", `/api/campaigns/${id}/pause`);
    console.log("Campaign paused");
  });

campaign
  .command("resume <id>")
  .description("Resume a paused campaign")
  .action(async (id: string) => {
    await api("POST", `/api/campaigns/${id}/resume`);
    console.log("Campaign resumed");
  });

// Contacts commands
const contacts = program.command("contacts");

contacts
  .command("import <file>")
  .option("--campaign <id>", "Also enroll in campaign after import")
  .description("Import contacts from CSV file")
  .action(async (file: string, options: { campaign?: string }) => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(file);
    const fileContent = fs.readFileSync(filePath);
    const blob = new Blob([fileContent], { type: "text/csv" });
    const formData = new FormData();
    formData.append("file", blob, path.basename(filePath));

    const res = await fetch(`${API_BASE}/api/contacts/import`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    console.log(
      `Imported ${data.imported} contacts (${data.skipped} skipped)`
    );

    if (options.campaign) {
      console.log(`Enrolling all contacts in campaign ${options.campaign}...`);
      const result = await api("POST", `/api/campaigns/${options.campaign}/enroll`, {
        all: true,
      });
      console.log(`Enrolled: ${result.enrolled}`);
    }
  });

contacts
  .command("enroll")
  .requiredOption("--campaign <id>", "Campaign ID")
  .option("--all", "Enroll all contacts")
  .description("Enroll contacts in a campaign")
  .action(async (options: { campaign: string; all?: boolean }) => {
    const result = await api("POST", `/api/campaigns/${options.campaign}/enroll`, {
      all: options.all || false,
    });
    console.log(`Enrolled: ${result.enrolled}`);
    if (result.skipped) {
      const skips = Object.entries(result.skipped)
        .filter(([, v]) => (v as number) > 0)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      if (skips) console.log(`Skipped: ${skips}`);
    }
  });

// Run / send commands
program
  .command("run")
  .option("--dry-run", "Show what would be sent without sending")
  .description("Trigger immediate send cycle")
  .action(async (options: { dryRun?: boolean }) => {
    const path = options.dryRun
      ? "/api/scheduler/run?dry_run=true"
      : "/api/scheduler/run";
    const data = await api("POST", path);
    console.log(`Sent: ${data.sent}, Failed: ${data.failed}, Skipped: ${data.skipped}`);
    if (data.details?.length > 0) {
      formatTable(data.details, [
        "contactEmail",
        "stepNumber",
        "status",
        "error",
      ]);
    }
  });

// Capacity
program
  .command("capacity")
  .option("--date <date>", "Start date (YYYY-MM-DD)")
  .description("Show mailbox capacity")
  .action(async (options: { date?: string }) => {
    const params = options.date ? `?date=${options.date}` : "";
    const data = await api("GET", `/api/capacity${params}`);
    for (const day of data) {
      console.log(`\n${day.date}:`);
      for (const mb of day.mailboxes) {
        const bar = "█".repeat(mb.reserved) + "░".repeat(mb.available);
        console.log(
          `  ${mb.email}: ${bar} ${mb.reserved}/${mb.dailyLimit}`
        );
      }
    }
  });

program.parse();
