-- Add global kill switch for sending per workspace
ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS sending_enabled BOOLEAN NOT NULL DEFAULT true;
