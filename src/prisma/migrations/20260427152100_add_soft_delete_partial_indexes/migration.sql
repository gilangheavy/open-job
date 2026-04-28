-- Partial indexes optimised for soft-delete-aware lookups.
-- These speed up queries that filter `deleted_at IS NULL` (the dominant pattern
-- enforced by the Prisma client extension) without bloating the indexes with
-- soft-deleted rows.

-- USERS
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_active_key"
  ON "users" ("email")
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "users_active_idx"
  ON "users" ("id")
  WHERE "deleted_at" IS NULL;

-- COMPANIES
CREATE INDEX IF NOT EXISTS "companies_active_idx"
  ON "companies" ("id")
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "companies_user_id_active_idx"
  ON "companies" ("user_id")
  WHERE "deleted_at" IS NULL;

-- CATEGORIES
CREATE UNIQUE INDEX IF NOT EXISTS "categories_name_active_key"
  ON "categories" ("name")
  WHERE "deleted_at" IS NULL;

-- JOBS
CREATE INDEX IF NOT EXISTS "jobs_active_idx"
  ON "jobs" ("id")
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "jobs_company_id_active_idx"
  ON "jobs" ("company_id")
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "jobs_category_id_active_idx"
  ON "jobs" ("category_id")
  WHERE "deleted_at" IS NULL;

-- APPLICATIONS
CREATE INDEX IF NOT EXISTS "applications_active_idx"
  ON "applications" ("id")
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "applications_user_id_active_idx"
  ON "applications" ("user_id")
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "applications_job_id_active_idx"
  ON "applications" ("job_id")
  WHERE "deleted_at" IS NULL;
