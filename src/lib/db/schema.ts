import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  time,
  date,
  uniqueIndex,
  index,
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

// ─── Experiments ─────────────────────────────────────────────────────────────

export const experiments = pgTable(
  "experiments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").default("active").notNull(), // active | paused | archived
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("experiments_workspace_idx").on(table.workspaceId)]
);

// ─── Campaigns ────────────────────────────────────────────────────────────────

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  name: text("name").notNull(),
  sendingWindowStart: time("sending_window_start").default("08:00").notNull(),
  sendingWindowEnd: time("sending_window_end").default("18:00").notNull(),
  timezone: text("timezone").default("UTC").notNull(),
  skipWeekends: boolean("skip_weekends").default(true).notNull(),
  status: text("status").default("draft").notNull(), // draft | active | paused | completed
  excludedContactStageIds: jsonb("excluded_contact_stage_ids")
    .default([])
    .$type<string[]>(),
  eventToStageMapping: jsonb("event_to_stage_mapping")
    .default({})
    .$type<Record<string, string>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Steps ────────────────────────────────────────────────────────────────────

export const steps = pgTable(
  "steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    stepNumber: integer("step_number").notNull(),
    stepType: text("step_type").default("email").notNull(), // email | manual_task
    subject: text("subject"),
    bodyTemplate: text("body_template"),
    delayDays: integer("delay_days").default(0).notNull(),
    isReplyThread: boolean("is_reply_thread").default(true).notNull(),
    ccRecipients: jsonb("cc_recipients").default([]).$type<string[]>(),
    bccRecipients: jsonb("bcc_recipients").default([]).$type<string[]>(),
    abVariants: jsonb("ab_variants").$type<
      Array<{ subject: string; bodyTemplate: string; weight: number }>
    >(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("steps_campaign_idx").on(table.campaignId, table.stepNumber),
  ]
);

// ─── Enrollments ──────────────────────────────────────────────────────────────

export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    status: text("status").default("not_sent").notNull(), // not_sent | active | paused | finished | bounced | failed
    currentStepNumber: integer("current_step_number").default(0).notNull(),
    pausedReason: text("paused_reason"), // manual | campaign_paused | ooo
    pausedAt: timestamp("paused_at"),
    autoUnpauseAt: date("auto_unpause_at"),
    finishedReason: text("finished_reason"), // completed | replied | manually_removed | unsubscribed
    finishedAt: timestamp("finished_at"),
    lastSentAt: timestamp("last_sent_at"),
    experimentId: uuid("experiment_id").references(() => experiments.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("enrollments_campaign_contact_idx").on(
      table.campaignId,
      table.contactId
    ),
    index("enrollments_status_idx").on(table.status),
    index("enrollments_experiment_idx").on(table.experimentId),
  ]
);

// ─── Planned Sends ────────────────────────────────────────────────────────────

export const plannedSends = pgTable(
  "planned_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    stepId: uuid("step_id")
      .notNull()
      .references(() => steps.id),
    mailboxId: uuid("mailbox_id")
      .notNull()
      .references(() => mailboxes.id),
    scheduledDate: date("scheduled_date").notNull(),
    scheduledAt: timestamp("scheduled_at").notNull(), // exact send time (within window + jitter)
    status: text("status").default("pending").notNull(), // pending | sent | failed | cancelled
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("planned_sends_scheduled_idx").on(table.scheduledAt, table.status),
    index("planned_sends_mailbox_date_idx").on(
      table.mailboxId,
      table.scheduledDate
    ),
  ]
);

// ─── Emails Sent ──────────────────────────────────────────────────────────────

export const emailsSent = pgTable("emails_sent", {
  id: uuid("id").primaryKey().defaultRandom(),
  enrollmentId: uuid("enrollment_id")
    .notNull()
    .references(() => enrollments.id),
  stepId: uuid("step_id")
    .notNull()
    .references(() => steps.id),
  plannedSendId: uuid("planned_send_id").references(() => plannedSends.id),
  mailboxId: uuid("mailbox_id")
    .notNull()
    .references(() => mailboxes.id),
  gmailMessageId: text("gmail_message_id"),
  gmailThreadId: text("gmail_thread_id"),
  renderedSubject: text("rendered_subject"),
  renderedBody: text("rendered_body"),
  status: text("status").default("sent").notNull(), // sent | bounced
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});

// ─── Email Events ─────────────────────────────────────────────────────────────

export const emailEvents = pgTable(
  "email_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emailSentId: uuid("email_sent_id").references(() => emailsSent.id),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => enrollments.id),
    eventType: text("event_type").notNull(), // reply | bounce | open | click
    clickedUrl: text("clicked_url"),
    replyText: text("reply_text"),
    replyGmailMessageId: text("reply_gmail_message_id"),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  },
  (table) => [
    index("email_events_enrollment_idx").on(table.enrollmentId),
    index("email_events_type_idx").on(table.eventType),
  ]
);

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
