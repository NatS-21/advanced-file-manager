-- Local file storage support

ALTER TABLE asset_files
  ADD COLUMN IF NOT EXISTS original_name TEXT;

ALTER TABLE asset_files
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_asset_files_asset_id
  ON asset_files (asset_id);


