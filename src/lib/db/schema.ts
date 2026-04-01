import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  time,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Auth (BetterAuth) ────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Workspaces ───────────────────────────────────────────────────────────────

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().default("Default"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Mailboxes ────────────────────────────────────────────────────────────────

export const mailboxes = pgTable("mailboxes", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  email: text("email").notNull(),
  displayName: text("display_name"),
  refreshToken: text("refresh_token").notNull(), // encrypted
  dailyLimit: integer("daily_limit").default(40).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Contact Stages ───────────────────────────────────────────────────────────

export const contactStages = pgTable("contact_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  name: text("name").notNull(),
  order: integer("order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Contacts ─────────────────────────────────────────────────────────────────

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    company: text("company"),
    title: text("title"),
    customFields: jsonb("custom_fields").default({}).$type<Record<string, string>>(),
    contactStageId: uuid("contact_stage_id").references(() => contactStages.id),
    status: text("status").default("active").notNull(), // active | unsubscribed | bounced
    unsubscribedAt: timestamp("unsubscribed_at"),
    bouncedAt: timestamp("bounced_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("contacts_workspace_email_idx").on(
      table.workspaceId,
      table.email
    ),
  ]
);

// ─── Templates ────────────────────────────────────────────────────────────────

export const templates = pgTable("templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(),
  description: text("description"),
  sendingWindowStart: time("sending_window_start").default("08:00").notNull(),
  sendingWindowEnd: time("sending_window_end").default("18:00").notNull(),
  timezone: text("timezone").default("UTC").notNull(),
  skipWeekends: boolean("skip_weekends").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Template Steps ───────────────────────────────────────────────────────────

export const templateSteps = pgTable("template_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  templateId: uuid("template_id").notNull().references(() => templates.id, { onDelete: "cascade" }),
  stepNumber: integer("step_number").notNull(),
  subject: text("subject"),
  bodyTemplate: text("body_template"),
  delayDays: integer("delay_days").default(0).notNull(),
  isReplyThread: boolean("is_reply_thread").default(true).notNull(),
  ccRecipients: jsonb("cc_recipients").default([]).$type<string[]>(),
  bccRecipients: jsonb("bcc_recipients").default([]).$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Campaigns ────────────────────────────────────────────────────────────────

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").default("active").notNull(),
  /** "template" = reusable step blueprint; "custom" = one-off outreach batch (replaces experiments) */
  type: text("type").default("custom").notNull(),
  hypothesis: text("hypothesis"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Sequences ────────────────────────────────────────────────────────────────

export const sequences = pgTable("sequences", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  contactId: uuid("contact_id").notNull().references(() => contacts.id),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  templateId: uuid("template_id").references(() => templates.id, { onDelete: "set null" }),
  mailboxId: uuid("mailbox_id").references(() => mailboxes.id, { onDelete: "set null" }),
  status: text("status").default("active").notNull(),
  pausedReason: text("paused_reason"),
  pausedAt: timestamp("paused_at"),
  finishedReason: text("finished_reason"),
  finishedAt: timestamp("finished_at"),
  lastSentAt: timestamp("last_sent_at"),
  sendingWindowStart: time("sending_window_start").default("08:00").notNull(),
  sendingWindowEnd: time("sending_window_end").default("18:00").notNull(),
  timezone: text("timezone").default("UTC").notNull(),
  skipWeekends: boolean("skip_weekends").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Sequence Steps ───────────────────────────────────────────────────────────

export const sequenceSteps = pgTable("sequence_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  sequenceId: uuid("sequence_id").notNull().references(() => sequences.id, { onDelete: "cascade" }),
  stepNumber: integer("step_number").notNull(),
  subject: text("subject"),
  body: text("body"),
  delayDays: integer("delay_days").default(0).notNull(),
  isReplyThread: boolean("is_reply_thread").default(true).notNull(),
  ccRecipients: jsonb("cc_recipients").default([]).$type<string[]>(),
  bccRecipients: jsonb("bcc_recipients").default([]).$type<string[]>(),
  mailboxId: uuid("mailbox_id").references(() => mailboxes.id, { onDelete: "set null" }),
  scheduledAt: timestamp("scheduled_at"),
  status: text("status").default("pending").notNull(),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Emails Sent ──────────────────────────────────────────────────────────────

export const emailsSent = pgTable("emails_sent", {
  id: uuid("id").primaryKey().defaultRandom(),
  sequenceId: uuid("sequence_id").notNull().references(() => sequences.id),
  sequenceStepId: uuid("sequence_step_id").notNull().references(() => sequenceSteps.id),
  mailboxId: uuid("mailbox_id").notNull().references(() => mailboxes.id),
  gmailMessageId: text("gmail_message_id"),
  gmailThreadId: text("gmail_thread_id"),
  subject: text("subject"),
  body: text("body"),
  status: text("status").default("sent").notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});

// ─── Email Events ─────────────────────────────────────────────────────────────

export const emailEvents = pgTable("email_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  emailSentId: uuid("email_sent_id").references(() => emailsSent.id),
  sequenceId: uuid("sequence_id").notNull().references(() => sequences.id),
  eventType: text("event_type").notNull(),
  clickedUrl: text("clicked_url"),
  replyText: text("reply_text"),
  replyGmailMessageId: text("reply_gmail_message_id"),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
});

// ─── Webhook Configs ──────────────────────────────────────────────────────────

export const webhookConfigs = pgTable("webhook_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  url: text("url").notNull(),
  events: jsonb("events").default([]).$type<string[]>(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Workspace Settings ──────────────────────────────────────────────────

export const workspaceSettings = pgTable("workspace_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id)
    .unique(),
  trackingDomain: text("tracking_domain"),
  trackingDomainVerified: boolean("tracking_domain_verified").default(false).notNull(),
  openTrackingEnabled: boolean("open_tracking_enabled").default(true).notNull(),
  clickTrackingEnabled: boolean("click_tracking_enabled").default(true).notNull(),
  unsubscribeLinkEnabled: boolean("unsubscribe_link_enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── API Keys ─────────────────────────────────────────────────────────────────

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(), // SHA-256 hash of the API key
  keyPrefix: text("key_prefix").notNull(), // first 8 chars for display
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
