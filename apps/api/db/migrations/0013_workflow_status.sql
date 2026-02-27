-- Workflow status: tracking status changes and history

-- Add status tracking fields to assets table
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_changed_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

-- Create table for status change history
CREATE TABLE IF NOT EXISTS asset_status_history (
  id          BIGSERIAL PRIMARY KEY,
  asset_id    BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  old_status  asset_status,
  new_status  asset_status NOT NULL,
  changed_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  comment     TEXT
);

-- Index for listing status history by asset (most recent first)
CREATE INDEX IF NOT EXISTS idx_asset_status_history_asset_changed
  ON asset_status_history (asset_id, changed_at DESC);

-- Index for finding assets by status change date
CREATE INDEX IF NOT EXISTS idx_asset_status_history_changed_at
  ON asset_status_history (changed_at DESC);

-- Index for finding status changes by user
CREATE INDEX IF NOT EXISTS idx_asset_status_history_changed_by
  ON asset_status_history (changed_by, changed_at DESC)
  WHERE changed_by IS NOT NULL;

