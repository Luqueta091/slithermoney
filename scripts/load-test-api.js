#!/usr/bin/env node

const { randomUUID } = require('crypto');

const baseUrl = process.env.LOAD_API_URL ?? 'http://localhost:3000';
const mode = (process.env.LOAD_MODE ?? 'health').toLowerCase();
const iterations = parseInt(process.env.LOAD_ITERATIONS ?? '50', 10);
const concurrency = parseInt(process.env.LOAD_CONCURRENCY ?? '5', 10);
const accountId = process.env.LOAD_ACCOUNT_ID ?? randomUUID();
const amountCents = parseInt(process.env.LOAD_AMOUNT_CENTS ?? '100', 10);
const stakeCents = parseInt(process.env.LOAD_STAKE_CENTS ?? '100', 10);
const confirmDeposits = (process.env.LOAD_CONFIRM ?? 'true').toLowerCase() !== 'false';

const headers = {
  'content-type': 'application/json',
  'x-user-id': accountId,
};

if (!Number.isInteger(iterations) || iterations <= 0) {
  throw new Error('LOAD_ITERATIONS must be a positive integer');
}
if (!Number.isInteger(concurrency) || concurrency <= 0) {
  throw new Error('LOAD_CONCURRENCY must be a positive integer');
}

async function request(method, path, body, extraHeaders = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...headers, ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}: ${text}`);
    error.status = response.status;
    error.payload = parsed;
    throw error;
  }

  return parsed;
}

async function ensureIdentity() {
  const fullName = process.env.LOAD_FULL_NAME;
  const cpf = process.env.LOAD_CPF;
  const pixKey = process.env.LOAD_PIX_KEY;
  const pixKeyType = process.env.LOAD_PIX_KEY_TYPE ?? 'email';

  if (!fullName || !cpf || !pixKey) {
    throw new Error('LOAD_FULL_NAME, LOAD_CPF, and LOAD_PIX_KEY are required for withdrawal mode');
  }

  await request('POST', '/identity', {
    fullName,
    cpf,
    pixKey,
    pixKeyType,
  });
}

async function scenario() {
  switch (mode) {
    case 'health':
      await request('GET', '/health');
      return;
    case 'stakes':
      await request('GET', '/stakes');
      return;
    case 'deposit': {
      const deposit = await request('POST', '/pix/deposits', { amountCents });
      if (confirmDeposits && deposit?.txid) {
        await request('POST', '/pix/webhook', {
          txid: deposit.txid,
          amountCents,
          currency: deposit.currency,
        });
      }
      return;
    }
    case 'run':
      await request('POST', '/runs/start', { stakeCents });
      return;
    case 'withdrawal':
      await request('POST', '/pix/withdrawals', { amountCents });
      return;
    default:
      throw new Error(`Unknown LOAD_MODE: ${mode}`);
  }
}

async function main() {
  if (mode === 'withdrawal') {
    await ensureIdentity();
  }

  let success = 0;
  let failed = 0;
  const durations = [];

  let index = 0;
  const worker = async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= iterations) {
        return;
      }

      const start = process.hrtime.bigint();
      try {
        await scenario();
        success += 1;
      } catch (error) {
        failed += 1;
      } finally {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        durations.push(durationMs);
      }
    }
  };

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  durations.sort((a, b) => a - b);

  const summary = {
    mode,
    baseUrl,
    accountId,
    iterations,
    concurrency,
    success,
    failed,
    minMs: durations[0] ?? 0,
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    maxMs: durations[durations.length - 1] ?? 0,
  };

  console.log(JSON.stringify(summary, null, 2));
}

function percentile(values, p) {
  if (!values.length) {
    return 0;
  }

  const idx = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * p) - 1));
  return values[idx];
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
