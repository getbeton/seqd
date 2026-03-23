CREATE TABLE "experiments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "name" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "experiments_workspace_idx" ON "experiments" USING btree ("workspace_id");
