-- Asset changes: track history of metadata changes

-- Enum for change types
DO $$ BEGIN
  CREATE TYPE change_type AS ENUM ('metadata', 'status', 'tags', 'folder');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Table to store change history
CREATE TABLE IF NOT EXISTS asset_changes (
  id          BIGSERIAL PRIMARY KEY,
  asset_id    BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  user_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  change_type change_type NOT NULL,
  field_name  TEXT NOT NULL,
  old_value   JSONB,
  new_value   JSONB
);

-- Index for listing changes by asset (most recent first)
CREATE INDEX IF NOT EXISTS idx_asset_changes_asset_changed
  ON asset_changes (asset_id, changed_at DESC);

-- Index for filtering by change type
CREATE INDEX IF NOT EXISTS idx_asset_changes_asset_type
  ON asset_changes (asset_id, change_type);

-- Index for user activity tracking (optional, for future analytics)
CREATE INDEX IF NOT EXISTS idx_asset_changes_user_changed
  ON asset_changes (user_id, changed_at DESC)
  WHERE user_id IS NOT NULL;

