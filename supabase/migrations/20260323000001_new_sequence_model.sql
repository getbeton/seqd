-- Drop old tables
DROP TABLE IF EXISTS planned_sends CASCADE;
DROP TABLE IF EXISTS email_events CASCADE;
DROP TABLE IF EXISTS emails_sent CASCADE;
DROP TABLE IF EXISTS enrollments CASCADE;
DROP TABLE IF EXISTS steps CASCADE;
DROP TABLE IF EXISTS campaigns CASCADE;

-- Templates
CREATE TABLE "templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "name" text NOT NULL,
  "description" text,
  "sending_window_start" time DEFAULT '08:00' NOT NULL,
  "sending_window_end" time DEFAULT '18:00' NOT NULL,
  "timezone" text DEFAULT 'UTC' NOT NULL,
  "skip_weekends" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Template steps
CREATE TABLE "template_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "template_id" uuid NOT NULL REFERENCES "templates"("id") ON DELETE CASCADE,
  "step_number" integer NOT NULL,
  "subject" text,
  "body_template" text,
  "delay_days" integer DEFAULT 0 NOT NULL,
  "is_reply_thread" boolean DEFAULT true NOT NULL,
  "cc_recipients" jsonb DEFAULT '[]',
  "bcc_recipients" jsonb DEFAULT '[]',
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Campaigns (grouper only)
CREATE TABLE "campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "name" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Sequences (per-contact)
CREATE TABLE "sequences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id"),
  "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "template_id" uuid REFERENCES "templates"("id") ON DELETE SET NULL,
  "mailbox_id" uuid REFERENCES "mailboxes"("id") ON DELETE SET NULL,
  "experiment_id" uuid REFERENCES "experiments"("id") ON DELETE SET NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "paused_reason" text,
  "paused_at" timestamp,
  "finished_reason" text,
  "finished_at" timestamp,
  "last_sent_at" timestamp,
  "sending_window_start" time DEFAULT '08:00' NOT NULL,
  "sending_window_end" time DEFAULT '18:00' NOT NULL,
  "timezone" text DEFAULT 'UTC' NOT NULL,
  "skip_weekends" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Sequence steps
CREATE TABLE "sequence_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sequence_id" uuid NOT NULL REFERENCES "sequences"("id") ON DELETE CASCADE,
  "step_number" integer NOT NULL,
  "subject" text,
  "body" text,
  "delay_days" integer DEFAULT 0 NOT NULL,
  "is_reply_thread" boolean DEFAULT true NOT NULL,
  "cc_recipients" jsonb DEFAULT '[]',
  "bcc_recipients" jsonb DEFAULT '[]',
  "mailbox_id" uuid REFERENCES "mailboxes"("id") ON DELETE SET NULL,
  "scheduled_at" timestamp,
  "status" text DEFAULT 'pending' NOT NULL,
  "sent_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Emails sent
CREATE TABLE "emails_sent" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sequence_id" uuid NOT NULL REFERENCES "sequences"("id"),
  "sequence_step_id" uuid NOT NULL REFERENCES "sequence_steps"("id"),
  "mailbox_id" uuid NOT NULL REFERENCES "mailboxes"("id"),
  "gmail_message_id" text,
  "gmail_thread_id" text,
  "subject" text,
  "body" text,
  "status" text DEFAULT 'sent' NOT NULL,
  "sent_at" timestamp DEFAULT now() NOT NULL
);

-- Email events
CREATE TABLE "email_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email_sent_id" uuid REFERENCES "emails_sent"("id"),
  "sequence_id" uuid NOT NULL REFERENCES "sequences"("id"),
  "event_type" text NOT NULL,
  "clicked_url" text,
  "reply_text" text,
  "reply_gmail_message_id" text,
  "occurred_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX "sequences_workspace_idx" ON "sequences"("workspace_id");
CREATE INDEX "sequences_contact_idx" ON "sequences"("contact_id");
CREATE INDEX "sequence_steps_sequence_idx" ON "sequence_steps"("sequence_id", "step_number");
CREATE INDEX "sequence_steps_scheduled_idx" ON "sequence_steps"("scheduled_at", "status");
CREATE INDEX "email_events_sequence_idx" ON "email_events"("sequence_id");
