INSERT INTO "stakes" ("id", "label", "amount_cents", "currency", "is_active", "sort_order")
VALUES
  (gen_random_uuid(), 'R$5', 500, 'BRL', true, 1),
  (gen_random_uuid(), 'R$10', 1000, 'BRL', true, 2),
  (gen_random_uuid(), 'R$20', 2000, 'BRL', true, 3),
  (gen_random_uuid(), 'R$50', 5000, 'BRL', true, 4),
  (gen_random_uuid(), 'R$100', 10000, 'BRL', true, 5);
