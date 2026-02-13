ALTER TABLE "accounts"
ADD COLUMN IF NOT EXISTS "display_name" TEXT;

UPDATE "accounts" AS a
SET "display_name" = p."full_name"
FROM "identity_profiles" AS p
WHERE a."id" = p."account_id"
  AND (a."display_name" IS NULL OR btrim(a."display_name") = '');
