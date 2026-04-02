#!/usr/bin/env -S npx tsx

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

// ─── Health ─────────────────────────────────────────────────────────────────────

program
  .command("health")
  .description("Check API health")
  .action(async () => {
    const data = (await api("GET", "/api/health")) as Record<string, unknown>;
    console.log(`Status: ${data.status as string}`);
    console.log(`Time:   ${data.timestamp as string}`);
  });

// ─── Mailbox commands ───────────────────────────────────────────────────────────

const mailbox = program.command("mailbox");

mailbox
  .command("list")
  .description("List connected mailboxes")
  .action(async () => {
    const data = (await api("GET", "/api/mailboxes")) as Array<
      Record<string, unknown>
    >;
    formatTable(data, ["id", "email", "displayName", "dailyLimit", "isActive"]);
  });

mailbox
  .command("add")
  .description("Add a new Gmail mailbox via OAuth")
  .action(async () => {
    const data = (await api("POST", "/api/mailboxes/auth/start")) as Record<
      string,
      unknown
    >;
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

mailbox
  .command("delete <email>")
  .description("Delete a mailbox and cancel its pending steps")
  .action(async (email: string) => {
    const mailboxes = await api("GET", "/api/mailboxes");
    const mb = (mailboxes as Array<Record<string, unknown>>).find(
      (m) => (m.email as string).toLowerCase() === email.toLowerCase()
    );
    if (!mb) {
      console.error(`Mailbox ${email} not found`);
      process.exit(1);
    }
    const result = (await api(
      "DELETE",
      `/api/mailboxes/${mb.id}`
    )) as Record<string, unknown>;
    console.log(
      `Deleted ${email} — ${result.cancelledSteps as number} pending steps cancelled`
    );
  });

// ─── Campaign commands ──────────────────────────────────────────────────────────

const campaign = program.command("campaign");

campaign
  .command("list")
  .description("List campaigns")
  .action(async () => {
    const data = (await api("GET", "/api/campaigns")) as Array<
      Record<string, unknown>
    >;
    formatTable(data, [
      "id",
      "name",
      "status",
      "description",
      "sequenceCount",
    ]);
  });

campaign
  .command("show <id>")
  .description("Show campaign details")
  .action(async (id: string) => {
    const data = (await api("GET", `/api/campaigns/${id}`)) as Record<
      string,
      unknown
    >;
    console.log(`ID:          ${data.id as string}`);
    console.log(`Name:        ${data.name as string}`);
    console.log(
      `Description: ${(data.description as string | null) ?? "—"}`
    );
    console.log(`Status:      ${data.status as string}`);
    console.log(
      `Created:     ${new Date(data.createdAt as string).toLocaleString()}`
    );
  });

campaign
  .command("create <name>")
  .description("Create a new campaign")
  .option("--description <description>", "Campaign description")
  .action(async (name: string, options: { description?: string }) => {
    const body: Record<string, unknown> = { name };
    if (options.description) body.description = options.description;
    const data = (await api("POST", "/api/campaigns", body)) as Record<
      string,
      unknown
    >;
    console.log(
      `Created campaign: ${data.name as string} (${data.id as string})`
    );
  });

campaign
  .command("update <id>")
  .description("Update a campaign")
  .option("--name <name>", "New name")
  .option("--description <description>", "New description")
  .option("--status <status>", "New status (active|paused|archived)")
  .action(
    async (
      id: string,
      options: { name?: string; description?: string; status?: string }
    ) => {
      const body: Record<string, unknown> = {};
      if (options.name) body.name = options.name;
      if (options.description !== undefined)
        body.description = options.description;
      if (options.status) body.status = options.status;
      const data = (await api(
        "PATCH",
        `/api/campaigns/${id}`,
        body
      )) as Record<string, unknown>;
      console.log(
        `Updated: ${data.name as string} — status: ${data.status as string}`
      );
    }
  );

campaign
  .command("delete <id>")
  .description("Delete a campaign")
  .action(async (id: string) => {
    await api("DELETE", `/api/campaigns/${id}`);
    console.log("Campaign deleted");
  });

// ─── Template commands ──────────────────────────────────────────────────────────

const template = program.command("template");

template
  .command("list")
  .description("List templates")
  .action(async () => {
    const data = (await api("GET", "/api/templates")) as Array<
      Record<string, unknown>
    >;
    formatTable(data, [
      "id",
      "name",
      "stepCount",
      "sendingWindowStart",
      "sendingWindowEnd",
      "timezone",
      "skipWeekends",
    ]);
  });

template
  .command("show <id>")
  .description("Show template details and steps")
  .action(async (id: string) => {
    const [tmpl, steps] = await Promise.all([
      api("GET", `/api/templates/${id}`) as Promise<Record<string, unknown>>,
      api("GET", `/api/templates/${id}/steps`) as Promise<
        Array<Record<string, unknown>>
      >,
    ]);
    console.log(`ID:          ${tmpl.id as string}`);
    console.log(`Name:        ${tmpl.name as string}`);
    console.log(
      `Description: ${(tmpl.description as string | null) ?? "—"}`
    );
    console.log(
      `Window:      ${tmpl.sendingWindowStart as string} – ${tmpl.sendingWindowEnd as string} ${tmpl.timezone as string}`
    );
    console.log(`Weekends:    ${(tmpl.skipWeekends as boolean) ? "skip" : "include"}`);
    console.log(`\nSteps (${steps.length}):`);
    for (const step of steps) {
      const tag = (step.isReplyThread as boolean) ? " [reply-thread]" : "";
      console.log(
        `  Step ${step.stepNumber as number} — delay ${step.delayDays as number}d${tag}`
      );
      if (step.subject)
        console.log(`    Subject: ${step.subject as string}`);
      if (step.bodyTemplate) {
        const preview = (step.bodyTemplate as string).slice(0, 120);
        console.log(`    Body:    ${preview}${(step.bodyTemplate as string).length > 120 ? "…" : ""}`);
      }
    }
  });

template
  .command("create")
  .description("Create a new template")
  .requiredOption("--name <name>", "Template name")
  .option("--description <description>", "Template description")
  .option("--window-start <time>", "Sending window start (HH:MM)", "08:00")
  .option("--window-end <time>", "Sending window end (HH:MM)", "18:00")
  .option("--timezone <tz>", "Timezone", "UTC")
  .option("--skip-weekends", "Skip weekends", true)
  .option("--no-skip-weekends", "Include weekends")
  .action(
    async (options: {
      name: string;
      description?: string;
      windowStart: string;
      windowEnd: string;
      timezone: string;
      skipWeekends: boolean;
    }) => {
      const data = (await api("POST", "/api/templates", {
        name: options.name,
        description: options.description,
        sending_window_start: options.windowStart,
        sending_window_end: options.windowEnd,
        timezone: options.timezone,
        skip_weekends: options.skipWeekends,
      })) as Record<string, unknown>;
      console.log(
        `Created template: ${data.name as string} (${data.id as string})`
      );
      console.log("Add steps with: seqd template add-step " + (data.id as string));
    }
  );

template
  .command("update <id>")
  .description("Update template metadata")
  .option("--name <name>", "New name")
  .option("--description <description>", "New description")
  .option("--window-start <time>", "Sending window start (HH:MM)")
  .option("--window-end <time>", "Sending window end (HH:MM)")
  .option("--timezone <tz>", "Timezone")
  .option("--skip-weekends", "Skip weekends")
  .option("--no-skip-weekends", "Include weekends")
  .action(
    async (
      id: string,
      options: {
        name?: string;
        description?: string;
        windowStart?: string;
        windowEnd?: string;
        timezone?: string;
        skipWeekends?: boolean;
      }
    ) => {
      const body: Record<string, unknown> = {};
      if (options.name) body.name = options.name;
      if (options.description !== undefined)
        body.description = options.description;
      if (options.windowStart)
        body.sending_window_start = options.windowStart;
      if (options.windowEnd) body.sending_window_end = options.windowEnd;
      if (options.timezone) body.timezone = options.timezone;
      if (options.skipWeekends !== undefined)
        body.skip_weekends = options.skipWeekends;
      const data = (await api(
        "PATCH",
        `/api/templates/${id}`,
        body
      )) as Record<string, unknown>;
      console.log(`Updated: ${data.name as string}`);
    }
  );

template
  .command("delete <id>")
  .description("Delete a template")
  .action(async (id: string) => {
    await api("DELETE", `/api/templates/${id}`);
    console.log("Template deleted");
  });

template
  .command("add-step <id>")
  .description("Add a step to a template")
  .option("--subject <subject>", "Step subject line")
  .requiredOption("--body <body>", "Step body template")
  .option("--delay <days>", "Delay in days before sending", "0")
  .option("--reply-thread", "Send as reply in same thread", true)
  .option("--no-reply-thread", "Send as new thread")
  .action(
    async (
      id: string,
      options: {
        subject?: string;
        body: string;
        delay: string;
        replyThread: boolean;
      }
    ) => {
      const data = (await api("POST", `/api/templates/${id}/steps`, {
        subject: options.subject,
        body_template: options.body,
        delay_days: parseInt(options.delay),
        is_reply_thread: options.replyThread,
      })) as Record<string, unknown>;
      console.log(
        `Added step ${data.stepNumber as number} to template ${id}`
      );
    }
  );

// ─── Contacts commands ──────────────────────────────────────────────────────────

const contacts = program.command("contacts");

contacts
  .command("list")
  .description("List contacts")
  .option("--search <query>", "Search by name, email, or company")
  .option("--status <status>", "Filter by status (active|unsubscribed|bounced)")
  .option("--limit <n>", "Results per page", "50")
  .option("--offset <n>", "Offset for pagination", "0")
  .action(
    async (options: {
      search?: string;
      status?: string;
      limit: string;
      offset: string;
    }) => {
      const params = new URLSearchParams();
      if (options.search) params.set("search", options.search);
      if (options.status) params.set("status", options.status);
      params.set("limit", options.limit);
      params.set("offset", options.offset);
      const result = (await api(
        "GET",
        `/api/contacts?${params.toString()}`
      )) as Record<string, unknown>;
      const data = result.data as Array<Record<string, unknown>>;
      formatTable(data, [
        "id",
        "email",
        "firstName",
        "lastName",
        "company",
        "title",
        "status",
      ]);
      console.log(`\nTotal: ${result.total as number}`);
    }
  );

contacts
  .command("create")
  .description("Create a new contact")
  .requiredOption("--email <email>", "Contact email")
  .option("--first-name <name>", "First name")
  .option("--last-name <name>", "Last name")
  .option("--company <company>", "Company name")
  .option("--title <title>", "Job title")
  .action(
    async (options: {
      email: string;
      firstName?: string;
      lastName?: string;
      company?: string;
      title?: string;
    }) => {
      const data = (await api("POST", "/api/contacts", {
        email: options.email,
        firstName: options.firstName,
        lastName: options.lastName,
        company: options.company,
        title: options.title,
      })) as Record<string, unknown>;
      console.log(
        `Created contact: ${data.email as string} (${data.id as string})`
      );
    }
  );

contacts
  .command("show <id>")
  .description("Show contact details with sequences and engagement stats")
  .action(async (id: string) => {
    const data = (await api(
      "GET",
      `/api/contacts/${id}/details`
    )) as Record<string, unknown>;
    const contact = data.contact as Record<string, unknown>;
    const stats = data.stats as Record<string, unknown>;
    const sequences = data.sequences as Array<Record<string, unknown>>;

    console.log(
      `\n● ${(contact.firstName as string | null) ?? ""} ${(contact.lastName as string | null) ?? ""}`.trim()
    );
    console.log(`  ${contact.email as string}`);
    if (contact.title || contact.company) {
      console.log(
        `  ${(contact.title as string | null) ?? ""} · ${(contact.company as string | null) ?? ""}`
      );
    }
    console.log(`  Status: ${contact.status as string}`);

    console.log(`\n  Engagement:`);
    console.log(`    Emails: ${stats.totalEmails as number}`);
    console.log(`    Opens:  ${stats.opens as number}`);
    console.log(`    Clicks: ${stats.clicks as number}`);
    console.log(`    Replies: ${stats.replies as number}`);
    console.log(`    Bounces: ${stats.bounces as number}`);

    if (sequences.length > 0) {
      console.log(`\n  Sequences (${sequences.length}):`);
      for (const seq of sequences) {
        const camp = seq.campaign as Record<string, unknown> | null;
        console.log(
          `    ${seq.id as string} — ${seq.status as string} — ${camp ? (camp.name as string) : "no campaign"} — ${seq.totalSteps as number} steps`
        );
      }
    }
    console.log("");
  });

contacts
  .command("update <id>")
  .description("Update a contact")
  .option("--first-name <name>", "First name")
  .option("--last-name <name>", "Last name")
  .option("--company <company>", "Company name")
  .option("--title <title>", "Job title")
  .action(
    async (
      id: string,
      options: {
        firstName?: string;
        lastName?: string;
        company?: string;
        title?: string;
      }
    ) => {
      const body: Record<string, unknown> = {};
      if (options.firstName !== undefined) body.firstName = options.firstName;
      if (options.lastName !== undefined) body.lastName = options.lastName;
      if (options.company !== undefined) body.company = options.company;
      if (options.title !== undefined) body.title = options.title;
      const data = (await api(
        "PATCH",
        `/api/contacts/${id}`,
        body
      )) as Record<string, unknown>;
      console.log(`Updated: ${data.email as string}`);
    }
  );

contacts
  .command("unsubscribe <id>")
  .description("Unsubscribe a contact")
  .action(async (id: string) => {
    const data = (await api(
      "POST",
      `/api/contacts/${id}/unsubscribe`
    )) as Record<string, unknown>;
    console.log(`Unsubscribed: ${data.email as string}`);
  });

contacts
  .command("import <file>")
  .description("Import contacts from CSV file")
  .action(async (file: string) => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(file);
    const fileContent = fs.readFileSync(filePath);
    const blob = new Blob([fileContent], { type: "text/csv" });
    const formData = new FormData();
    formData.append("file", blob, path.basename(filePath));

    const headers: Record<string, string> = {};
    const apiKey = process.env.SEQD_API_KEY;
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const res = await fetch(`${API_BASE}/api/contacts/import`, {
      method: "POST",
      headers,
      body: formData,
    });
    const data = await res.json();
    console.log(
      `Imported ${data.imported} contacts (${data.skipped} skipped)`
    );
  });

// ─── Sequence commands ──────────────────────────────────────────────────────────

const sequence = program.command("sequence");

sequence
  .command("list")
  .description("List sequences")
  .option("--campaign <id>", "Filter by campaign ID")
  .option(
    "--status <status>",
    "Filter by status (active|paused|replied|finished|not_sent)"
  )
  .action(async (options: { campaign?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (options.campaign) params.set("campaign_id", options.campaign);
    if (options.status) params.set("status", options.status);
    const query = params.toString() ? `?${params.toString()}` : "";
    const data = (await api("GET", `/api/sequences${query}`)) as Array<
      Record<string, unknown>
    >;
    const rows = data.map((s) => {
      const contact = s.contact as Record<string, unknown>;
      const camp = s.campaign as Record<string, unknown> | null;
      return {
        id: s.id as string,
        contact:
          `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() ||
          (contact.email as string),
        company: (contact.company as string | null) ?? "—",
        campaign: camp ? (camp.name as string) : "—",
        progress: `${s.currentStepNumber as number} / ${s.totalSteps as number}`,
        status: s.status as string,
      };
    });
    formatTable(rows, [
      "id",
      "contact",
      "company",
      "campaign",
      "progress",
      "status",
    ]);
  });

sequence
  .command("show <id>")
  .description("Show sequence details and step timeline")
  .action(async (id: string) => {
    const s = (await api("GET", `/api/sequences/${id}`)) as Record<
      string,
      unknown
    >;
    const contact = s.contact as Record<string, unknown>;
    const camp = s.campaign as Record<string, unknown> | null;
    const tmpl = s.template as Record<string, unknown> | null;
    console.log(
      `\n● ${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim()
    );
    console.log(
      `  ${(contact.title as string | null) ?? ""} · ${(contact.company as string | null) ?? ""}`
    );
    console.log(`  ${contact.email as string}`);
    console.log(
      `\n  Campaign:   ${camp ? (camp.name as string) : "—"}`
    );
    console.log(
      `  Template:   ${tmpl ? (tmpl.name as string) : "—"}`
    );
    console.log(`  Status:     ${s.status as string}`);
    console.log(
      `  Enrolled:   ${new Date(s.createdAt as string).toLocaleDateString()}`
    );
    console.log(`\n  Step Timeline:`);
    const steps = s.steps as Array<Record<string, unknown>>;
    for (const step of steps) {
      const icon =
        step.status === "sent"
          ? "✅"
          : step.status === "scheduled"
            ? "🕐"
            : "○";
      let line = `  ${icon} Step ${step.stepNumber as number}`;
      if (step.status === "sent")
        line += ` · Sent ${new Date(step.sentAt as string).toLocaleString()}`;
      else if (step.status === "scheduled")
        line += ` · Scheduled ${new Date(step.scheduledAt as string).toLocaleString()}`;
      else line += ` · Pending (+${step.delayDays as number}d)`;
      console.log(line);
      if (step.subject)
        console.log(`     Subject: ${step.subject as string}`);
      const events = step.events as
        | Array<Record<string, unknown>>
        | undefined;
      if (events) {
        for (const ev of events) {
          if (ev.type === "replied") {
            console.log(
              `     ↩ Replied ${new Date(ev.occurredAt as string).toLocaleString()}`
            );
            if (ev.replyText)
              console.log(`       "${ev.replyText as string}"`);
          }
        }
      }
    }
    console.log("");
  });

sequence
  .command("create")
  .description("Create a new sequence")
  .requiredOption("--contact <email>", "Contact email")
  .option("--template <id>", "Template ID")
  .option("--campaign <id>", "Campaign ID")
  .option("--mailbox <email>", "Mailbox email to send from")
  .option("--window-start <time>", "Sending window start (HH:MM)")
  .option("--window-end <time>", "Sending window end (HH:MM)")
  .option("--timezone <tz>", "Timezone")
  .option("--skip-weekends", "Skip weekends")
  .option("--no-skip-weekends", "Include weekends")
  .action(
    async (options: {
      contact: string;
      template?: string;
      campaign?: string;
      mailbox?: string;
      windowStart?: string;
      windowEnd?: string;
      timezone?: string;
      skipWeekends?: boolean;
    }) => {
      // Resolve contact email to ID
      const contactsResult = (await api(
        "GET",
        `/api/contacts?search=${encodeURIComponent(options.contact)}&limit=200`
      )) as Record<string, unknown>;
      const contactsList = contactsResult.data as Array<
        Record<string, unknown>
      >;
      const contact = contactsList.find(
        (c) =>
          (c.email as string).toLowerCase() === options.contact.toLowerCase()
      );
      if (!contact) {
        console.error(`Contact not found: ${options.contact}`);
        process.exit(1);
      }

      // Resolve mailbox email to ID if provided
      let mailboxId: string | undefined;
      if (options.mailbox) {
        const mailboxes = (await api("GET", "/api/mailboxes")) as Array<
          Record<string, unknown>
        >;
        const mb = mailboxes.find(
          (m) =>
            (m.email as string).toLowerCase() ===
            options.mailbox!.toLowerCase()
        );
        if (!mb) {
          console.error(`Mailbox not found: ${options.mailbox}`);
          process.exit(1);
        }
        mailboxId = mb.id as string;
      }

      const body: Record<string, unknown> = {
        contact_id: contact.id as string,
      };
      if (options.template) body.template_id = options.template;
      if (options.campaign) body.campaign_id = options.campaign;
      if (mailboxId) body.mailbox_id = mailboxId;
      if (options.windowStart)
        body.sending_window_start = options.windowStart;
      if (options.windowEnd) body.sending_window_end = options.windowEnd;
      if (options.timezone) body.timezone = options.timezone;
      if (options.skipWeekends !== undefined)
        body.skip_weekends = options.skipWeekends;

      const data = (await api("POST", "/api/sequences", body)) as Record<
        string,
        unknown
      >;
      console.log(`Created sequence: ${data.id as string}`);
    }
  );

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

sequence
  .command("edit-step <stepId>")
  .description("Edit a pending sequence step")
  .option("--subject <subject>", "New subject line")
  .option("--body <body>", "New body content")
  .option("--delay <days>", "New delay in days")
  .action(
    async (
      stepId: string,
      options: { subject?: string; body?: string; delay?: string }
    ) => {
      const body: Record<string, unknown> = {};
      if (options.subject !== undefined) body.subject = options.subject;
      if (options.body !== undefined) body.body = options.body;
      if (options.delay !== undefined)
        body.delayDays = parseInt(options.delay);
      const data = (await api(
        "PATCH",
        `/api/sequence-steps/${stepId}`,
        body
      )) as Record<string, unknown>;
      console.log(`Updated step ${data.stepNumber as number}`);
    }
  );

// ─── Replies ────────────────────────────────────────────────────────────────────

const replies = program.command("replies");

replies
  .command("list")
  .description("List replies")
  .option("--campaign <id>", "Filter by campaign ID")
  .option("--limit <n>", "Results per page", "50")
  .option("--offset <n>", "Offset for pagination", "0")
  .action(
    async (options: { campaign?: string; limit: string; offset: string }) => {
      const params = new URLSearchParams();
      if (options.campaign) params.set("campaign_id", options.campaign);
      params.set("limit", options.limit);
      params.set("offset", options.offset);
      const data = (await api(
        "GET",
        `/api/replies?${params.toString()}`
      )) as Array<Record<string, unknown>>;
      if (data.length === 0) {
        console.log("No replies yet.");
        return;
      }
      for (const item of data) {
        const contact = item.contact as Record<string, unknown>;
        const camp = item.campaign as Record<string, unknown>;
        const step = item.step as Record<string, unknown>;
        const event = item.event as Record<string, unknown>;
        const name =
          `${(contact.firstName as string | null) ?? ""} ${(contact.lastName as string | null) ?? ""}`.trim() ||
          (contact.email as string);
        console.log(
          `\n${name} · ${(contact.company as string | null) ?? "—"}`
        );
        console.log(
          `  Campaign: ${camp.name as string} · Step ${step.stepNumber as number}`
        );
        console.log(
          `  Date:     ${new Date(event.occurredAt as string).toLocaleString()}`
        );
        if (event.replyText) {
          const preview = (event.replyText as string).slice(0, 200);
          console.log(
            `  Reply:    ${preview}${(event.replyText as string).length > 200 ? "…" : ""}`
          );
        }
      }
      console.log("");
    }
  );

// ─── Run / send ─────────────────────────────────────────────────────────────────

program
  .command("run")
  .option("--dry-run", "Show what would be sent without sending")
  .description("Trigger immediate send cycle")
  .action(async (options: { dryRun?: boolean }) => {
    const path = options.dryRun
      ? "/api/scheduler/run?dry_run=true"
      : "/api/scheduler/run";
    const data = (await api("POST", path)) as Record<string, unknown>;
    console.log(
      `Sent: ${data.sent as number}, Failed: ${data.failed as number}, Skipped: ${data.skipped as number}`
    );
    if ((data.details as unknown[] | undefined)?.length ?? 0 > 0) {
      formatTable(data.details as Array<Record<string, unknown>>, [
        "contactEmail",
        "stepNumber",
        "status",
        "error",
      ]);
    }
  });

// ─── Capacity ───────────────────────────────────────────────────────────────────

program
  .command("capacity")
  .option("--date <date>", "Start date (YYYY-MM-DD)")
  .description("Show mailbox capacity")
  .action(async (options: { date?: string }) => {
    const params = options.date ? `?date=${options.date}` : "";
    const data = (await api("GET", `/api/capacity${params}`)) as Array<
      Record<string, unknown>
    >;
    for (const day of data) {
      console.log(`\n${day.date as string}:`);
      for (const mb of day.mailboxes as Array<Record<string, unknown>>) {
        const bar =
          "█".repeat(mb.reserved as number) +
          "░".repeat(mb.available as number);
        console.log(
          `  ${mb.email as string}: ${bar} ${mb.reserved as number}/${mb.dailyLimit as number}`
        );
      }
    }
  });

// ─── Settings commands ──────────────────────────────────────────────────────────

const settings = program.command("settings");
const tracking = settings.command("tracking");
const webhook = settings.command("webhook");

tracking
  .command("show")
  .description("Show tracking domain configuration")
  .action(async () => {
    const data = (await api("GET", "/api/tracking-domain")) as Record<
      string,
      unknown
    >;
    console.log(
      `Domain:       ${(data.trackingDomain as string | null) ?? "not configured"}`
    );
    console.log(
      `Verified:     ${(data.trackingDomainVerified as boolean) ? "yes" : "no"}`
    );
    console.log(
      `Open tracking: ${(data.openTrackingEnabled as boolean) ? "on" : "off"}`
    );
    console.log(
      `Click tracking: ${(data.clickTrackingEnabled as boolean) ? "on" : "off"}`
    );
    console.log(
      `Unsubscribe:  ${(data.unsubscribeLinkEnabled as boolean) ? "on" : "off"}`
    );
    if (data.cnameTarget) {
      console.log(`\nCNAME target: ${data.cnameTarget as string}`);
    }
  });

tracking
  .command("set")
  .description("Configure tracking domain and toggles")
  .option("--domain <domain>", "Tracking domain (e.g. track.yourdomain.com)")
  .option("--open-tracking <bool>", "Enable open tracking (true|false)")
  .option("--click-tracking <bool>", "Enable click tracking (true|false)")
  .option(
    "--unsubscribe-links <bool>",
    "Enable unsubscribe links (true|false)"
  )
  .action(
    async (options: {
      domain?: string;
      openTracking?: string;
      clickTracking?: string;
      unsubscribeLinks?: string;
    }) => {
      const body: Record<string, unknown> = {};
      if (options.domain) body.trackingDomain = options.domain;
      if (options.openTracking !== undefined)
        body.openTrackingEnabled = options.openTracking === "true";
      if (options.clickTracking !== undefined)
        body.clickTrackingEnabled = options.clickTracking === "true";
      if (options.unsubscribeLinks !== undefined)
        body.unsubscribeLinkEnabled = options.unsubscribeLinks === "true";
      await api("POST", "/api/tracking-domain", body);
      console.log("Tracking settings updated");
    }
  );

tracking
  .command("verify")
  .description("Verify tracking domain DNS configuration")
  .action(async () => {
    const data = (await api(
      "POST",
      "/api/tracking-domain/verify"
    )) as Record<string, unknown>;
    if (data.verified) {
      console.log("Domain verified ✓");
      if (data.vercelAdded) console.log("Added to Vercel automatically");
    } else {
      console.log("Domain NOT verified");
      if (data.error) console.log(`Error: ${data.error as string}`);
      if (data.records) {
        console.log("DNS records found:");
        for (const r of data.records as string[]) {
          console.log(`  ${r}`);
        }
      }
    }
  });

webhook
  .command("list")
  .description("List webhook configurations")
  .action(async () => {
    const data = (await api("GET", "/api/webhooks")) as Array<
      Record<string, unknown>
    >;
    const rows = data.map((w) => ({
      id: w.id as string,
      url: w.url as string,
      events: ((w.events as string[]) || []).join(", "),
    }));
    formatTable(rows, ["id", "url", "events"]);
  });

webhook
  .command("create")
  .description("Create a webhook")
  .requiredOption("--url <url>", "Webhook URL")
  .option(
    "--events <events>",
    "Comma-separated events (email.sent,email.replied,email.bounced)"
  )
  .action(async (options: { url: string; events?: string }) => {
    const events = options.events
      ? options.events.split(",").map((e) => e.trim())
      : [];
    const data = (await api("POST", "/api/webhooks", {
      url: options.url,
      events,
    })) as Record<string, unknown>;
    console.log(`Created webhook: ${data.id as string}`);
  });

webhook
  .command("delete <id>")
  .description("Delete a webhook")
  .action(async (id: string) => {
    await api("DELETE", `/api/webhooks/${id}`);
    console.log("Webhook deleted");
  });

// ─── Parse ──────────────────────────────────────────────────────────────────────

program.parse();
