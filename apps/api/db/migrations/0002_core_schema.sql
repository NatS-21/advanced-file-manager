-- Core schema for DAM MVP (without FTS/indexes)

-- Enums
DO $$ BEGIN
  CREATE TYPE asset_type AS ENUM ('image','video','audio','doc');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE asset_status AS ENUM ('draft','review','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE asset_visibility AS ENUM ('private','team','public');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE orientation AS ENUM ('landscape','portrait','square');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tag_kind AS ENUM ('topic','brand','person','place','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Core entities
CREATE TABLE IF NOT EXISTS teams (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  email         CITEXT NOT NULL UNIQUE,
  display_name  TEXT
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role    TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id        BIGSERIAL PRIMARY KEY,
  team_id   BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  status    TEXT,
  region    TEXT,
  language  TEXT
);

CREATE TABLE IF NOT EXISTS assets (
  id           BIGSERIAL PRIMARY KEY,
  team_id      BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  owner_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  type         asset_type NOT NULL,
  title        TEXT,
  description  TEXT,
  language     TEXT,
  status       asset_status NOT NULL DEFAULT 'draft',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  captured_at  TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  visibility   asset_visibility NOT NULL DEFAULT 'private',
  keywords     TEXT[] DEFAULT '{}',
  rating       SMALLINT,
  CONSTRAINT rating_range CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5))
);

CREATE TABLE IF NOT EXISTS asset_files (
  id                BIGSERIAL PRIMARY KEY,
  asset_id          BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  storage_provider  TEXT NOT NULL,
  bucket            TEXT NOT NULL,
  object_key        TEXT NOT NULL,
  size_bytes        BIGINT NOT NULL,
  mime_type         TEXT NOT NULL,
  etag              TEXT,
  sha256            TEXT,
  checksum_verified BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS asset_media (
  asset_id     BIGINT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
  width        INT,
  height       INT,
  orientation  orientation,
  color_space  TEXT,
  duration_sec NUMERIC(10,3),
  fps          NUMERIC(7,3),
  video_codec  TEXT,
  audio_codec  TEXT,
  bitrate      INT,
  aspect_ratio TEXT,
  sample_rate  INT,
  channels     SMALLINT,
  loudness_lufs NUMERIC(6,2)
);

CREATE TABLE IF NOT EXISTS asset_exif_iptc_xmp (
  asset_id BIGINT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
  exif     JSONB,
  iptc     JSONB,
  xmp      JSONB
);

CREATE TABLE IF NOT EXISTS asset_rights (
  asset_id        BIGINT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
  license_type    TEXT,
  copyright_holder TEXT,
  editorial_only  BOOLEAN NOT NULL DEFAULT FALSE,
  embargo_until   TIMESTAMPTZ,
  usage_terms     TEXT
);

CREATE TABLE IF NOT EXISTS asset_business (
  asset_id   BIGINT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
  campaign_id BIGINT REFERENCES campaigns(id) ON DELETE SET NULL,
  channel    TEXT,
  brand      TEXT,
  region     TEXT,
  language   TEXT
);

CREATE TABLE IF NOT EXISTS tags (
  id      BIGSERIAL PRIMARY KEY,
  team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name    CITEXT NOT NULL,
  kind    tag_kind NOT NULL DEFAULT 'custom',
  CONSTRAINT uq_tags_team_name UNIQUE (team_id, name)
);

CREATE TABLE IF NOT EXISTS asset_tags (
  asset_id BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tag_id   BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (asset_id, tag_id)
);

CREATE TABLE IF NOT EXISTS collections (
  id      BIGSERIAL PRIMARY KEY,
  team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS asset_collections (
  asset_id      BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  collection_id BIGINT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  position      INT NOT NULL DEFAULT 0,
  PRIMARY KEY (asset_id, collection_id)
);

CREATE TABLE IF NOT EXISTS engagement (
  asset_id       BIGINT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
  views          INT NOT NULL DEFAULT 0,
  saves          INT NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  last_saved_at  TIMESTAMPTZ
);




