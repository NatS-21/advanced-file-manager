-- Asset comments: threaded comments for assets

CREATE TABLE IF NOT EXISTS asset_comments (
  id         BIGSERIAL PRIMARY KEY,
  asset_id   BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  parent_id  BIGINT REFERENCES asset_comments(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Index for listing comments by asset (oldest first for threading)
CREATE INDEX IF NOT EXISTS idx_asset_comments_asset_created
  ON asset_comments (asset_id, created_at ASC)
  WHERE deleted_at IS NULL;

-- Index for getting replies to a comment
CREATE INDEX IF NOT EXISTS idx_asset_comments_parent
  ON asset_comments (parent_id)
  WHERE deleted_at IS NULL;

-- Index for getting top-level comments only
CREATE INDEX IF NOT EXISTS idx_asset_comments_asset_top_level
  ON asset_comments (asset_id, created_at ASC)
  WHERE parent_id IS NULL AND deleted_at IS NULL;

-- Trigger for automatically updating updated_at
DROP TRIGGER IF EXISTS trg_asset_comments_updated_at ON asset_comments;
CREATE TRIGGER trg_asset_comments_updated_at
BEFORE UPDATE ON asset_comments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

