-- Add distinct_colors column for palette of 6 maximally distinct colors
ALTER TABLE asset_colors ADD COLUMN IF NOT EXISTS distinct_colors JSONB;

-- distinct_colors stores array: [{"r":255,"g":128,"b":64}, ...]
CREATE INDEX IF NOT EXISTS idx_asset_colors_distinct ON asset_colors USING GIN (distinct_colors);

