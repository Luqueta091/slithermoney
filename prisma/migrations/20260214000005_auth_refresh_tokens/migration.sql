CREATE TABLE IF NOT EXISTS "auth_refresh_tokens" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL UNIQUE,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "revoked_at" TIMESTAMPTZ,
  "replaced_by" UUID,
  "user_agent" TEXT,
  "ip_address" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "auth_refresh_tokens_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "auth_refresh_tokens_replaced_by_fkey"
    FOREIGN KEY ("replaced_by") REFERENCES "auth_refresh_tokens"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "auth_refresh_tokens_account_id_expires_at_idx"
  ON "auth_refresh_tokens" ("account_id", "expires_at");
CREATE INDEX IF NOT EXISTS "auth_refresh_tokens_account_id_revoked_at_idx"
  ON "auth_refresh_tokens" ("account_id", "revoked_at");
CREATE INDEX IF NOT EXISTS "auth_refresh_tokens_replaced_by_idx"
  ON "auth_refresh_tokens" ("replaced_by");
