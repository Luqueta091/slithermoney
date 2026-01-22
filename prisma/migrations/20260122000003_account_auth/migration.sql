ALTER TABLE "accounts"
ADD COLUMN IF NOT EXISTS "email" TEXT,
ADD COLUMN IF NOT EXISTS "password_hash" TEXT,
ADD COLUMN IF NOT EXISTS "password_salt" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "accounts_email_key" ON "accounts"("email");
