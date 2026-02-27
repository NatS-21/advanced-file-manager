-- Add extended metadata fields to asset_media table
ALTER TABLE asset_media ADD COLUMN IF NOT EXISTS dpi INT;
ALTER TABLE asset_media ADD COLUMN IF NOT EXISTS bit_depth SMALLINT;
ALTER TABLE asset_media ADD COLUMN IF NOT EXISTS compression TEXT;
ALTER TABLE asset_media ADD COLUMN IF NOT EXISTS has_transparency BOOLEAN;
ALTER TABLE asset_media ADD COLUMN IF NOT EXISTS frame_count BIGINT;
ALTER TABLE asset_media ADD COLUMN IF NOT EXISTS audio_channels_layout TEXT;

