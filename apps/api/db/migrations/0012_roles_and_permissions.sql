-- Roles and permissions: extended role system with flexible permissions

-- Create enum for user roles
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM (
    'viewer',
    'uploader',
    'editor',
    'moderator',
    'admin',
    'analyst',
    'owner'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Migrate existing roles in team_members
-- First, update 'member' to 'viewer' (owner stays as is)
UPDATE team_members SET role = 'viewer' WHERE role = 'member';

-- Change role column from TEXT to enum
-- We need to do this in steps:
-- 1. Add new column with enum type
ALTER TABLE team_members ADD COLUMN role_new user_role;

-- 2. Migrate data
UPDATE team_members SET role_new = CASE
  WHEN role = 'owner' THEN 'owner'::user_role
  WHEN role = 'viewer' THEN 'viewer'::user_role
  ELSE 'viewer'::user_role
END;

-- 3. Make it NOT NULL
ALTER TABLE team_members ALTER COLUMN role_new SET NOT NULL;

-- 4. Drop old column
ALTER TABLE team_members DROP COLUMN role;

-- 5. Rename new column
ALTER TABLE team_members RENAME COLUMN role_new TO role;

-- Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
  id       BIGSERIAL PRIMARY KEY,
  role     user_role NOT NULL,
  resource TEXT NOT NULL,
  action   TEXT NOT NULL,
  allowed  BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_permissions_role_resource_action UNIQUE (role, resource, action)
);

-- Index for fast permission lookups
CREATE INDEX IF NOT EXISTS idx_permissions_role_resource
  ON permissions (role, resource);

CREATE INDEX IF NOT EXISTS idx_permissions_role_action
  ON permissions (role, action);

-- Insert base permissions for each role
-- Viewer: only view
INSERT INTO permissions (role, resource, action, allowed) VALUES
  ('viewer', 'asset', 'view', TRUE),
  ('viewer', 'file', 'view', TRUE),
  ('viewer', 'file', 'download', TRUE),
  ('viewer', 'comment', 'view', TRUE),
  ('viewer', 'comment', 'create', TRUE),
  ('viewer', 'collection', 'view', TRUE),
  ('viewer', 'folder', 'view', TRUE)
ON CONFLICT (role, resource, action) DO NOTHING;

-- Uploader: view + upload
INSERT INTO permissions (role, resource, action, allowed) VALUES
  ('uploader', 'asset', 'view', TRUE),
  ('uploader', 'file', 'view', TRUE),
  ('uploader', 'file', 'download', TRUE),
  ('uploader', 'file', 'upload', TRUE),
  ('uploader', 'comment', 'view', TRUE),
  ('uploader', 'comment', 'create', TRUE),
  ('uploader', 'collection', 'view', TRUE),
  ('uploader', 'collection', 'create', TRUE),
  ('uploader', 'folder', 'view', TRUE),
  ('uploader', 'folder', 'create', TRUE)
ON CONFLICT (role, resource, action) DO NOTHING;

-- Editor: uploader + edit metadata
INSERT INTO permissions (role, resource, action, allowed) VALUES
  ('editor', 'asset', 'view', TRUE),
  ('editor', 'asset', 'update', TRUE),
  ('editor', 'file', 'view', TRUE),
  ('editor', 'file', 'download', TRUE),
  ('editor', 'file', 'upload', TRUE),
  ('editor', 'file', 'version_create', TRUE),
  ('editor', 'comment', 'view', TRUE),
  ('editor', 'comment', 'create', TRUE),
  ('editor', 'comment', 'update', TRUE),
  ('editor', 'collection', 'view', TRUE),
  ('editor', 'collection', 'create', TRUE),
  ('editor', 'collection', 'update', TRUE),
  ('editor', 'folder', 'view', TRUE),
  ('editor', 'folder', 'create', TRUE),
  ('editor', 'folder', 'update', TRUE)
ON CONFLICT (role, resource, action) DO NOTHING;

-- Moderator: editor + delete + moderate
INSERT INTO permissions (role, resource, action, allowed) VALUES
  ('moderator', 'asset', 'view', TRUE),
  ('moderator', 'asset', 'update', TRUE),
  ('moderator', 'asset', 'delete', TRUE),
  ('moderator', 'asset', 'moderate', TRUE),
  ('moderator', 'file', 'view', TRUE),
  ('moderator', 'file', 'download', TRUE),
  ('moderator', 'file', 'upload', TRUE),
  ('moderator', 'file', 'version_create', TRUE),
  ('moderator', 'comment', 'view', TRUE),
  ('moderator', 'comment', 'create', TRUE),
  ('moderator', 'comment', 'update', TRUE),
  ('moderator', 'comment', 'delete', TRUE),
  ('moderator', 'collection', 'view', TRUE),
  ('moderator', 'collection', 'create', TRUE),
  ('moderator', 'collection', 'update', TRUE),
  ('moderator', 'collection', 'delete', TRUE),
  ('moderator', 'folder', 'view', TRUE),
  ('moderator', 'folder', 'create', TRUE),
  ('moderator', 'folder', 'update', TRUE),
  ('moderator', 'folder', 'delete', TRUE)
ON CONFLICT (role, resource, action) DO NOTHING;

-- Admin: moderator + manage users + analytics
INSERT INTO permissions (role, resource, action, allowed) VALUES
  ('admin', 'asset', 'view', TRUE),
  ('admin', 'asset', 'update', TRUE),
  ('admin', 'asset', 'delete', TRUE),
  ('admin', 'asset', 'moderate', TRUE),
  ('admin', 'file', 'view', TRUE),
  ('admin', 'file', 'download', TRUE),
  ('admin', 'file', 'upload', TRUE),
  ('admin', 'file', 'version_create', TRUE),
  ('admin', 'comment', 'view', TRUE),
  ('admin', 'comment', 'create', TRUE),
  ('admin', 'comment', 'update', TRUE),
  ('admin', 'comment', 'delete', TRUE),
  ('admin', 'collection', 'view', TRUE),
  ('admin', 'collection', 'create', TRUE),
  ('admin', 'collection', 'update', TRUE),
  ('admin', 'collection', 'delete', TRUE),
  ('admin', 'folder', 'view', TRUE),
  ('admin', 'folder', 'create', TRUE),
  ('admin', 'folder', 'update', TRUE),
  ('admin', 'folder', 'delete', TRUE),
  ('admin', 'team', 'manage', TRUE),
  ('admin', 'analytics', 'view', TRUE),
  ('admin', 'events', 'view', TRUE)
ON CONFLICT (role, resource, action) DO NOTHING;

-- Analyst: view + analytics
INSERT INTO permissions (role, resource, action, allowed) VALUES
  ('analyst', 'asset', 'view', TRUE),
  ('analyst', 'file', 'view', TRUE),
  ('analyst', 'file', 'download', TRUE),
  ('analyst', 'comment', 'view', TRUE),
  ('analyst', 'collection', 'view', TRUE),
  ('analyst', 'folder', 'view', TRUE),
  ('analyst', 'analytics', 'view', TRUE),
  ('analyst', 'events', 'view', TRUE)
ON CONFLICT (role, resource, action) DO NOTHING;

-- Owner: all permissions (same as admin but with owner flag)
INSERT INTO permissions (role, resource, action, allowed) VALUES
  ('owner', 'asset', 'view', TRUE),
  ('owner', 'asset', 'update', TRUE),
  ('owner', 'asset', 'delete', TRUE),
  ('owner', 'asset', 'moderate', TRUE),
  ('owner', 'file', 'view', TRUE),
  ('owner', 'file', 'download', TRUE),
  ('owner', 'file', 'upload', TRUE),
  ('owner', 'file', 'version_create', TRUE),
  ('owner', 'comment', 'view', TRUE),
  ('owner', 'comment', 'create', TRUE),
  ('owner', 'comment', 'update', TRUE),
  ('owner', 'comment', 'delete', TRUE),
  ('owner', 'collection', 'view', TRUE),
  ('owner', 'collection', 'create', TRUE),
  ('owner', 'collection', 'update', TRUE),
  ('owner', 'collection', 'delete', TRUE),
  ('owner', 'folder', 'view', TRUE),
  ('owner', 'folder', 'create', TRUE),
  ('owner', 'folder', 'update', TRUE),
  ('owner', 'folder', 'delete', TRUE),
  ('owner', 'team', 'manage', TRUE),
  ('owner', 'analytics', 'view', TRUE),
  ('owner', 'events', 'view', TRUE)
ON CONFLICT (role, resource, action) DO NOTHING;

