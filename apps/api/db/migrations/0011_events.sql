-- Events: audit log for user actions

-- Enum for event types
DO $$ BEGIN
  CREATE TYPE event_type AS ENUM (
    'upload',
    'view',
    'download',
    'edit',
    'delete',
    'status_change',
    'comment',
    'version_create'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Table to store events
CREATE TABLE IF NOT EXISTS events (
  id         BIGSERIAL PRIMARY KEY,
  team_id    BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  asset_id   BIGINT REFERENCES assets(id) ON DELETE SET NULL,
  event_type event_type NOT NULL,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for listing events by team (most recent first)
CREATE INDEX IF NOT EXISTS idx_events_team_created
  ON events (team_id, created_at DESC);

-- Index for events by user
CREATE INDEX IF NOT EXISTS idx_events_user_created
  ON events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Index for events by asset
CREATE INDEX IF NOT EXISTS idx_events_asset_created
  ON events (asset_id, created_at DESC)
  WHERE asset_id IS NOT NULL;

-- Index for filtering by event type
CREATE INDEX IF NOT EXISTS idx_events_type_created
  ON events (event_type, created_at DESC);

-- Composite index for analytics (team + type + time)
CREATE INDEX IF NOT EXISTS idx_events_team_type_created
  ON events (team_id, event_type, created_at DESC);

