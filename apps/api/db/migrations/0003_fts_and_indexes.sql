-- FTS column and indexes for search + supporting btree/jsonb/trgm indexes

-- Use a plain column + trigger to avoid immutability constraints on generated columns
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS search_text tsvector;

-- Update function for search_text (unaccent + weighted fields)
CREATE OR REPLACE FUNCTION assets_search_text_update() RETURNS trigger AS $$
BEGIN
  NEW.search_text :=
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.title, ''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.description, ''))), 'B') ||
    setweight(to_tsvector('simple', unaccent(coalesce(array_to_string(NEW.keywords, ' '), ''))), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assets_search_text ON assets;
CREATE TRIGGER trg_assets_search_text
BEFORE INSERT OR UPDATE OF title, description, keywords ON assets
FOR EACH ROW EXECUTE FUNCTION assets_search_text_update();

-- GIN index for FTS
CREATE INDEX IF NOT EXISTS idx_assets_search ON assets USING GIN (search_text);

-- Common sort/filter btree indexes
CREATE INDEX IF NOT EXISTS idx_assets_created_at ON assets (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_captured_at ON assets (captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_rating ON assets (rating);
CREATE INDEX IF NOT EXISTS idx_assets_team_created ON assets (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_type_status ON assets (type, status);
CREATE INDEX IF NOT EXISTS idx_assets_owner ON assets (owner_id);

-- Media technical fields
CREATE INDEX IF NOT EXISTS idx_media_duration ON asset_media (duration_sec);
CREATE INDEX IF NOT EXISTS idx_media_width ON asset_media (width);
CREATE INDEX IF NOT EXISTS idx_media_height ON asset_media (height);

-- Tag relations
CREATE INDEX IF NOT EXISTS idx_asset_tags_tag_asset ON asset_tags (tag_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_tags_asset_tag ON asset_tags (asset_id, tag_id);

-- JSONB metadata (optional but useful for filters)
CREATE INDEX IF NOT EXISTS idx_exif_gin ON asset_exif_iptc_xmp USING GIN (exif jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_iptc_gin ON asset_exif_iptc_xmp USING GIN (iptc jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_xmp_gin ON asset_exif_iptc_xmp USING GIN (xmp jsonb_path_ops);

-- Trigram indexes for fuzzy search
CREATE INDEX IF NOT EXISTS idx_assets_title_trgm ON assets USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_business_brand_trgm ON asset_business USING GIN (brand gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_rights_copyright_trgm ON asset_rights USING GIN (copyright_holder gin_trgm_ops);




