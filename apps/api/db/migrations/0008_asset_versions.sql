-- Asset versions: track file versions for assets

CREATE TABLE IF NOT EXISTS asset_versions (
  id             BIGSERIAL PRIMARY KEY,
  asset_id       BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  file_id        BIGINT NOT NULL REFERENCES asset_files(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  description    TEXT,
  created_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_current     BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT uq_asset_versions_asset_version UNIQUE (asset_id, version_number)
);

-- Index for finding current version quickly
CREATE INDEX IF NOT EXISTS idx_asset_versions_asset_current
  ON asset_versions (asset_id, is_current)
  WHERE is_current = TRUE;

-- Index for listing versions by asset
CREATE INDEX IF NOT EXISTS idx_asset_versions_asset_created
  ON asset_versions (asset_id, created_at DESC);

-- Function to automatically unset is_current on other versions
CREATE OR REPLACE FUNCTION unset_other_current_versions() RETURNS trigger AS $$
BEGIN
  -- Only process if is_current is being set to TRUE
  IF NEW.is_current = TRUE THEN
    -- Unset is_current for all other versions of the same asset
    UPDATE asset_versions
    SET is_current = FALSE
    WHERE asset_id = NEW.asset_id
      AND id != NEW.id
      AND is_current = TRUE;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- Trigger to automatically manage is_current flag
DROP TRIGGER IF EXISTS trg_asset_versions_unset_current ON asset_versions;
CREATE TRIGGER trg_asset_versions_unset_current
BEFORE INSERT OR UPDATE ON asset_versions
FOR EACH ROW
EXECUTE FUNCTION unset_other_current_versions();

