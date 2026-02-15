import { randomUUID } from 'crypto';
import { RunCashoutEventPayload, RunEliminatedEventPayload, RUN_EVENT_VERSION } from '@slithermoney/contracts';
import { config } from '../../shared/config';
import { logger } from '../../shared/observability/logger';
import { signRunEventPayload } from '@slithermoney/shared';

type RunEliminatedEventInput = Omit<RunEliminatedEventPayload, 'eventVersion'>;
type RunCashoutEventInput = Omit<RunCashoutEventPayload, 'eventVersion'>;

export async function notifyRunEliminated(event: RunEliminatedEventInput): Promise<void> {
  const url = `${config.API_BASE_URL}/runs/events/eliminated`;
  const body = JSON.stringify({
    eventVersion: RUN_EVENT_VERSION,
    ...event,
  });
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (config.GAME_SERVER_WEBHOOK_KEY) {
    headers['x-game-server-key'] = config.GAME_SERVER_WEBHOOK_KEY;
    applySignedEventHeaders(headers, body);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.API_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn('run_eliminated_failed', {
        status: response.status,
        run_id: event.runId,
      });
    }
  } catch (error) {
    logger.error('run_eliminated_error', {
      error: error instanceof Error ? error.message : 'unknown_error',
      run_id: event.runId,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function notifyRunCashout(event: RunCashoutEventInput): Promise<void> {
  const url = `${config.API_BASE_URL}/runs/events/cashout`;
  const body = JSON.stringify({
    eventVersion: RUN_EVENT_VERSION,
    ...event,
  });
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (config.GAME_SERVER_WEBHOOK_KEY) {
    headers['x-game-server-key'] = config.GAME_SERVER_WEBHOOK_KEY;
    applySignedEventHeaders(headers, body);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.API_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn('run_cashout_failed', {
        status: response.status,
        run_id: event.runId,
      });
    }
  } catch (error) {
    logger.error('run_cashout_error', {
      error: error instanceof Error ? error.message : 'unknown_error',
      run_id: event.runId,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function applySignedEventHeaders(headers: Record<string, string>, rawBody: string): void {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = randomUUID();
  const signature = signRunEventPayload(config.GAME_SERVER_WEBHOOK_KEY, timestamp, nonce, rawBody);

  headers['x-run-event-timestamp'] = String(timestamp);
  headers['x-run-event-nonce'] = nonce;
  headers['x-run-event-signature'] = signature;
}
