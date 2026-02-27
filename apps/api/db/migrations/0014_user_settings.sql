-- User settings: storing user preferences and configurations

CREATE TABLE IF NOT EXISTS user_settings (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Index for quick lookup by user
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id
  ON user_settings (user_id);

-- Index for querying settings by metadata filter fields
CREATE INDEX IF NOT EXISTS idx_user_settings_metadata_filters
  ON user_settings USING GIN ((settings->'metadataFilters'));

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_user_settings_updated_at();

