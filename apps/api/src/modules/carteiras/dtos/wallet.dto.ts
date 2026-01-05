export type WalletResponse = {
  id: string;
  account_id: string;
  available_balance_cents: string;
  in_game_balance_cents: string;
  blocked_balance_cents: string;
  currency: string;
  created_at: Date;
  updated_at: Date;
};
