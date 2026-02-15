-- Distributed rate limiting counters (shared across instances)
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS rate_limit_counters_expires_at_idx
  ON rate_limit_counters (expires_at);

-- Anti-replay nonce store for run events
CREATE TABLE IF NOT EXISTS run_event_nonces (
  nonce text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS run_event_nonces_expires_at_idx
  ON run_event_nonces (expires_at);
