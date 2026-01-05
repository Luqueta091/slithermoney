CREATE TABLE "size_multipliers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "min_size" integer NOT NULL,
  "max_size" integer NOT NULL,
  "multiplier" numeric(10,4) NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp(3) NOT NULL DEFAULT now(),
  "updated_at" timestamp(3) NOT NULL DEFAULT now(),

  CONSTRAINT "size_multipliers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "size_multipliers_is_active_min_size_max_size_idx" ON "size_multipliers" ("is_active", "min_size", "max_size");

INSERT INTO "size_multipliers" ("id", "min_size", "max_size", "multiplier", "is_active")
VALUES
  (gen_random_uuid(), 0, 49, 1.0000, true),
  (gen_random_uuid(), 50, 99, 1.1000, true),
  (gen_random_uuid(), 100, 199, 1.2500, true),
  (gen_random_uuid(), 200, 399, 1.5000, true),
  (gen_random_uuid(), 400, 999999, 2.0000, true);
