-- Drive folders + soft delete for assets

CREATE TABLE IF NOT EXISTS folders (
  id         BIGSERIAL PRIMARY KEY,
  team_id    BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  owner_id   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  parent_id  BIGINT REFERENCES folders(id) ON DELETE CASCADE,
  name       CITEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- updated_at trigger (function is created in 0004_auth.sql)
DROP TRIGGER IF EXISTS trg_folders_updated_at ON folders;
CREATE TRIGGER trg_folders_updated_at
BEFORE UPDATE ON folders
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Uniqueness inside folder (ignoring deleted)
CREATE UNIQUE INDEX IF NOT EXISTS uq_folders_team_parent_name_active
  ON folders (team_id, parent_id, name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_folders_team_parent
  ON folders (team_id, parent_id)
  WHERE deleted_at IS NULL;

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS folder_id BIGINT REFERENCES folders(id) ON DELETE SET NULL;

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_assets_team_folder_active
  ON assets (team_id, folder_id, created_at DESC)
  WHERE deleted_at IS NULL;


