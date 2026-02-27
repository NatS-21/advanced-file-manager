-- Table for storing color palettes extracted from images and videos
CREATE TABLE IF NOT EXISTS asset_colors (
  asset_id           BIGINT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
  vibrant_rgb        TEXT,      -- Main vibrant color (RGB: "255,128,64")
  muted_rgb          TEXT,      -- Muted color
  dark_vibrant_rgb   TEXT,      -- Dark vibrant color
  dark_muted_rgb     TEXT,      -- Dark muted color
  light_vibrant_rgb  TEXT,      -- Light vibrant color
  light_muted_rgb    TEXT,      -- Light muted color
  palette            JSONB      -- Full palette for advanced search
);

-- Index for color search using GIN on JSONB palette
CREATE INDEX IF NOT EXISTS idx_asset_colors_palette ON asset_colors USING GIN (palette);

-- Index for vibrant color search (most common use case)
CREATE INDEX IF NOT EXISTS idx_asset_colors_vibrant ON asset_colors (vibrant_rgb) WHERE vibrant_rgb IS NOT NULL;

