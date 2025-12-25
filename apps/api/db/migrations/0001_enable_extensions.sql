-- Enable required PostgreSQL extensions for search and case-insensitive types
-- Run with a superuser or a role with CREATE privilege on the database

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gin;




