#!/usr/bin/env node

import { Command } from "commander";

const program = new Command();

const API_BASE = process.env.SEQD_API_URL || "http://localhost:3000";

async function api(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<unknown> {
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

function formatTable(rows: Record<string, unknown>[], columns?: string[]) {
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
    const data = await api("GET", "/api/mailboxes") as Array<Record<string, unknown>>;
    formatTable(data, ["email", "displayName", "dailyLimit", "isActive"]);
  });

mailbox
  .command("add")
  .description("Add a new Gmail mailbox via OAuth")
  .action(async () => {
    const data = await api("POST", "/api/mailboxes/auth/start") as Record<string, unknown>;
    console.log("Open this URL to authorize:\n");
    console.log(data.auth_url);
    console.log("\nWaiting for authorization... (check your browser)");
  });

mailbox
  .command("set-limit <email> <limit>")
  .description("Set daily send limit for a mailbox")
  .action(async (email: string, limit: string) => {
    const mailboxes = await api("GET", "/api/mailboxes");
    const mb = (mailboxes as Array<Record<string, unknown>>).find(
      (m) => (m.email as string).toLowerCase() === email.toLowerCase()
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
    const data = await api("GET", "/api/campaigns") as Array<Record<string, unknown>>;
    formatTable(data, ["name", "status", "timezone"]);
  });

campaign
  .command("create <name>")
  .description("Create a new campaign")
  .action(async (name: string) => {
    const data = await api("POST", "/api/campaigns", { name }) as Record<string, unknown>;
    console.log(`Created campaign: ${data.name as string} (${data.id as string})`);
  });

campaign
  .command("stats <id>")
  .description("Show campaign statistics")
  .action(async (id: string) => {
    const data = await api("GET", `/api/campaigns/${id}/stats`) as Record<string, unknown>;
    console.log("Contact Statuses:");
    for (const [status, count] of Object.entries((data.contactStatuses as Record<string, unknown>) || {})) {
      console.log(`  ${status}: ${count as number}`);
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
      }) as Record<string, unknown>;
      console.log(`Enrolled: ${result.enrolled as number}`);
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
    }) as Record<string, unknown>;
    console.log(`Enrolled: ${result.enrolled as number}`);
    if (result.skipped) {
      const skips = Object.entries(result.skipped as Record<string, unknown>)
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
    const data = await api("POST", path) as Record<string, unknown>;
    console.log(`Sent: ${data.sent as number}, Failed: ${data.failed as number}, Skipped: ${data.skipped as number}`);
    if ((data.details as unknown[] | undefined)?.length ?? 0 > 0) {
      formatTable(data.details as Array<Record<string, unknown>>, [
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
    const data = await api("GET", `/api/capacity${params}`) as Array<Record<string, unknown>>;
    for (const day of data) {
      console.log(`\n${day.date as string}:`);
      for (const mb of day.mailboxes as Array<Record<string, unknown>>) {
        const bar = "█".repeat(mb.reserved as number) + "░".repeat(mb.available as number);
        console.log(
          `  ${mb.email as string}: ${bar} ${mb.reserved as number}/${mb.dailyLimit as number}`
        );
      }
    }
  });

// ─── Experiment commands ──────────────────────────────────────────────────────

const experiment = program.command("experiment");

experiment
  .command("list")
  .description("List experiments")
  .action(async () => {
    const data = await api("GET", "/api/experiments") as Array<Record<string, unknown>>;
    formatTable(data, ["name", "status", "sequenceCount", "activeCount", "repliedCount", "createdAt"]);
  });

experiment
  .command("create")
  .description("Create a new experiment")
  .requiredOption("--name <name>", "Experiment name")
  .option("--description <description>", "Optional description")
  .action(async (options: { name: string; description?: string }) => {
    const data = await api("POST", "/api/experiments", {
      name: options.name,
      description: options.description,
    }) as Record<string, unknown>;
    console.log(`Created experiment: ${data.name as string} (${data.id as string})`);
  });

experiment
  .command("show <id>")
  .description("Show experiment details")
  .action(async (id: string) => {
    const data = await api("GET", `/api/experiments/${id}`) as Record<string, unknown>;
    console.log(`ID:          ${data.id as string}`);
    console.log(`Name:        ${data.name as string}`);
    console.log(`Description: ${(data.description as string | null) ?? "—"}`);
    console.log(`Status:      ${data.status as string}`);
    console.log(`Sequences:   ${data.sequenceCount as number} total, ${data.activeCount as number} active, ${data.repliedCount as number} replied`);
    console.log(`Created:     ${new Date(data.createdAt as string).toLocaleString()}`);
  });

experiment
  .command("update <id>")
  .description("Update experiment name/description/status")
  .option("--name <name>", "New name")
  .option("--description <description>", "New description")
  .option("--status <status>", "New status (active|paused|archived)")
  .action(async (id: string, options: { name?: string; description?: string; status?: string }) => {
    const body: Record<string, unknown> = {};
    if (options.name) body.name = options.name;
    if (options.description !== undefined) body.description = options.description;
    if (options.status) body.status = options.status;
    const data = await api("PATCH", `/api/experiments/${id}`, body) as Record<string, unknown>;
    console.log(`Updated: ${data.name as string} — status: ${data.status as string}`);
  });

// ─── Sequence commands ────────────────────────────────────────────────────────

const sequence = program.command("sequence");

sequence
  .command("list")
  .description("List sequences")
  .option("--experiment <id>", "Filter by experiment ID")
  .option("--status <status>", "Filter by status (active|paused|replied|finished|not_sent)")
  .action(async (options: { experiment?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (options.experiment) params.set("experiment_id", options.experiment);
    if (options.status) params.set("status", options.status);
    const query = params.toString() ? `?${params.toString()}` : "";
    const data = await api("GET", `/api/sequences${query}`) as Array<Record<string, unknown>>;
    const rows = data.map((s) => {
      const contact = s.contact as Record<string, unknown>;
      const exp = s.experiment as Record<string, unknown> | null;
      return {
        contact: `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || (contact.email as string),
        company: (contact.company as string | null) ?? "—",
        experiment: exp ? (exp.name as string) : "—",
        progress: `${s.currentStepNumber as number} / ${s.totalSteps as number}`,
        status: s.status as string,
      };
    });
    formatTable(rows, ["contact", "company", "experiment", "progress", "status"]);
  });

sequence
  .command("show <id>")
  .description("Show sequence details and step timeline")
  .action(async (id: string) => {
    const s = await api("GET", `/api/sequences/${id}`) as Record<string, unknown>;
    const contact = s.contact as Record<string, unknown>;
    const exp = s.experiment as Record<string, unknown> | null;
    const template = s.template as Record<string, unknown>;
    console.log(`\n● ${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim());
    console.log(`  ${(contact.title as string | null) ?? ""} · ${(contact.company as string | null) ?? ""}`);
    console.log(`  ${contact.email as string}`);
    console.log(`\n  Experiment: ${exp ? (exp.name as string) : "—"}`);
    console.log(`  Template:   ${template.name as string}`);
    console.log(`  Status:     ${s.status as string}`);
    console.log(`  Enrolled:   ${new Date(s.createdAt as string).toLocaleDateString()}`);
    console.log(`\n  Step Timeline:`);
    const steps = s.steps as Array<Record<string, unknown>>;
    for (const step of steps) {
      const icon = step.status === "sent" ? "✅" : step.status === "scheduled" ? "🕐" : "○";
      let line = `  ${icon} Step ${step.stepNumber as number}`;
      if (step.status === "sent") line += ` · Sent ${new Date(step.sentAt as string).toLocaleString()}`;
      else if (step.status === "scheduled") line += ` · Scheduled ${new Date(step.scheduledAt as string).toLocaleString()}`;
      else line += ` · Pending (+${step.delayDays as number}d)`;
      console.log(line);
      if (step.subject) console.log(`     Subject: ${step.subject as string}`);
      const events = step.events as Array<Record<string, unknown>> | undefined;
      if (events) {
        for (const ev of events) {
          if (ev.type === "replied") {
            console.log(`     ↩ Replied ${new Date(ev.occurredAt as string).toLocaleString()}`);
            if (ev.replyText) console.log(`       "${ev.replyText as string}"`);
          }
        }
      }
    }
    console.log("");
  });

sequence
  .command("create")
  .description("Create a new sequence (enroll contact in template)")
  .requiredOption("--contact <email>", "Contact email")
  .requiredOption("--template <id>", "Template (campaign) ID")
  .option("--experiment <id>", "Experiment ID to assign")
  .action(async (options: { contact: string; template: string; experiment?: string }) => {
    // Find contact by email
    const contactsData = await api("GET", "/api/contacts") as Array<Record<string, unknown>>;
    const contact = contactsData.find(
      (c) => (c.email as string).toLowerCase() === options.contact.toLowerCase()
    );
    if (!contact) {
      console.error(`Contact not found: ${options.contact}`);
      process.exit(1);
    }
    // Enroll via campaigns API
    const result = await api("POST", `/api/campaigns/${options.template}/enroll`, {
      contactIds: [contact.id as string],
    }) as Record<string, unknown>;
    console.log(`Enrolled: ${result.enrolled as number}`);
    // If experiment specified, find the enrollment and assign
    if (options.experiment && (result.enrolled as number) > 0) {
      // Get sequences for this contact
      const seqs = await api("GET", `/api/sequences?contact_id=${contact.id as string}`) as Array<Record<string, unknown>>;
      const seq = seqs.find((s) => {
        const tmpl = s.template as Record<string, unknown>;
        return tmpl.id === options.template;
      });
      if (seq) {
        await api("PATCH", `/api/sequences/${seq.id as string}`, {
          experiment_id: options.experiment,
        });
        console.log(`Assigned to experiment ${options.experiment}`);
      }
    }
  });

sequence
  .command("pause <id>")
  .description("Pause a sequence")
  .action(async (id: string) => {
    await api("PATCH", `/api/sequences/${id}`, { action: "pause" });
    console.log("Sequence paused");
  });

sequence
  .command("resume <id>")
  .description("Resume a paused sequence")
  .action(async (id: string) => {
    await api("PATCH", `/api/sequences/${id}`, { action: "resume" });
    console.log("Sequence resumed");
  });

sequence
  .command("skip <id>")
  .description("Skip current step of a sequence")
  .action(async (id: string) => {
    await api("PATCH", `/api/sequences/${id}`, { action: "skip" });
    console.log("Step skipped");
  });

sequence
  .command("send-now <id>")
  .description("Force immediate send of current pending step")
  .action(async (id: string) => {
    await api("PATCH", `/api/sequences/${id}`, { action: "send_now" });
    console.log("Scheduled for immediate send");
  });

program.parse();
