CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "identity_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "full_name" text NOT NULL,
  "cpf" text NOT NULL,
  "pix_key" text NOT NULL,
  "pix_key_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "wallets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "available_balance_cents" bigint NOT NULL DEFAULT 0,
  "in_game_balance_cents" bigint NOT NULL DEFAULT 0,
  "blocked_balance_cents" bigint NOT NULL DEFAULT 0,
  "currency" text NOT NULL DEFAULT 'BRL',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "ledger_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "wallet_id" uuid REFERENCES "wallets"("id"),
  "entry_type" text NOT NULL,
  "direction" text NOT NULL,
  "amount_cents" bigint NOT NULL,
  "currency" text NOT NULL DEFAULT 'BRL',
  "reference_type" text,
  "reference_id" text,
  "external_reference" text,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "pix_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "tx_type" text NOT NULL,
  "status" text NOT NULL,
  "amount_cents" bigint NOT NULL,
  "currency" text NOT NULL DEFAULT 'BRL',
  "idempotency_key" text NOT NULL,
  "txid" text,
  "e2e_id" text,
  "provider" text,
  "external_reference" text,
  "payload" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz
);

CREATE TABLE "arenas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "region" text NOT NULL,
  "status" text NOT NULL DEFAULT 'offline',
  "host" text NOT NULL,
  "port" int NOT NULL,
  "capacity" int NOT NULL DEFAULT 0,
  "current_players" int NOT NULL DEFAULT 0,
  "last_heartbeat_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "arena_id" uuid REFERENCES "arenas"("id"),
  "stake_cents" bigint NOT NULL,
  "status" text NOT NULL,
  "multiplier" numeric(10,4) NOT NULL DEFAULT 0,
  "payout_cents" bigint NOT NULL DEFAULT 0,
  "house_fee_cents" bigint NOT NULL DEFAULT 0,
  "result_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "ended_at" timestamptz
);

CREATE TABLE "admin_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_account_id" uuid REFERENCES "accounts"("id"),
  "action" text NOT NULL,
  "target_type" text,
  "target_id" text,
  "before_data" jsonb,
  "after_data" jsonb,
  "metadata" jsonb,
  "request_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "fraud_flags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid REFERENCES "accounts"("id"),
  "flag_type" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'medium',
  "status" text NOT NULL DEFAULT 'open',
  "details" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "resolved_at" timestamptz
);

CREATE TABLE "stakes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "label" text NOT NULL,
  "amount_cents" bigint NOT NULL,
  "currency" text NOT NULL DEFAULT 'BRL',
  "is_active" boolean NOT NULL DEFAULT true,
  "sort_order" int NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "wallets"
  ADD CONSTRAINT "wallets_balance_non_negative"
  CHECK (
    "available_balance_cents" >= 0
    AND "in_game_balance_cents" >= 0
    AND "blocked_balance_cents" >= 0
  );

ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_amount_positive"
  CHECK ("amount_cents" > 0);

ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_direction_check"
  CHECK ("direction" IN ('CREDIT', 'DEBIT'));

ALTER TABLE "pix_transactions"
  ADD CONSTRAINT "pix_transactions_amount_positive"
  CHECK ("amount_cents" > 0);

ALTER TABLE "runs"
  ADD CONSTRAINT "runs_stake_positive"
  CHECK ("stake_cents" > 0);

ALTER TABLE "runs"
  ADD CONSTRAINT "runs_payout_non_negative"
  CHECK ("payout_cents" >= 0);

ALTER TABLE "runs"
  ADD CONSTRAINT "runs_house_fee_non_negative"
  CHECK ("house_fee_cents" >= 0);

CREATE UNIQUE INDEX "identity_profiles_account_id_key" ON "identity_profiles"("account_id");
CREATE UNIQUE INDEX "identity_profiles_cpf_key" ON "identity_profiles"("cpf");

CREATE UNIQUE INDEX "wallets_account_id_key" ON "wallets"("account_id");

CREATE INDEX "ledger_entries_account_id_created_at_idx" ON "ledger_entries"("account_id", "created_at");
CREATE INDEX "ledger_entries_entry_type_idx" ON "ledger_entries"("entry_type");
CREATE INDEX "ledger_entries_external_reference_idx" ON "ledger_entries"("external_reference");
CREATE INDEX "ledger_entries_reference_type_reference_id_idx" ON "ledger_entries"("reference_type", "reference_id");

CREATE INDEX "pix_transactions_account_id_idx" ON "pix_transactions"("account_id");
CREATE INDEX "pix_transactions_status_idx" ON "pix_transactions"("status");
CREATE INDEX "pix_transactions_created_at_idx" ON "pix_transactions"("created_at");
CREATE INDEX "pix_transactions_external_reference_idx" ON "pix_transactions"("external_reference");
CREATE UNIQUE INDEX "pix_transactions_idempotency_key_key" ON "pix_transactions"("idempotency_key");
CREATE UNIQUE INDEX "pix_transactions_txid_key" ON "pix_transactions"("txid");
CREATE UNIQUE INDEX "pix_transactions_e2e_id_key" ON "pix_transactions"("e2e_id");

CREATE UNIQUE INDEX "arenas_name_key" ON "arenas"("name");
CREATE INDEX "arenas_status_region_idx" ON "arenas"("status", "region");

CREATE INDEX "runs_account_id_idx" ON "runs"("account_id");
CREATE INDEX "runs_status_idx" ON "runs"("status");
CREATE INDEX "runs_created_at_idx" ON "runs"("created_at");

CREATE INDEX "admin_audit_logs_actor_account_id_idx" ON "admin_audit_logs"("actor_account_id");
CREATE INDEX "admin_audit_logs_created_at_idx" ON "admin_audit_logs"("created_at");
CREATE INDEX "admin_audit_logs_action_idx" ON "admin_audit_logs"("action");

CREATE INDEX "fraud_flags_account_id_idx" ON "fraud_flags"("account_id");
CREATE INDEX "fraud_flags_status_idx" ON "fraud_flags"("status");
CREATE INDEX "fraud_flags_created_at_idx" ON "fraud_flags"("created_at");

CREATE UNIQUE INDEX "stakes_amount_cents_key" ON "stakes"("amount_cents");
CREATE INDEX "stakes_is_active_sort_order_idx" ON "stakes"("is_active", "sort_order");
