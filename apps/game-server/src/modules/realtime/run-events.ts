import { RunCashoutEventPayload, RunEliminatedEventPayload, RUN_EVENT_VERSION } from '@slithermoney/contracts';
import { config } from '../../shared/config';
import { logger } from '../../shared/observability/logger';

type RunEliminatedEventInput = Omit<RunEliminatedEventPayload, 'eventVersion'>;
type RunCashoutEventInput = Omit<RunCashoutEventPayload, 'eventVersion'>;

export async function notifyRunEliminated(event: RunEliminatedEventInput): Promise<void> {
  const url = `${config.API_BASE_URL}/runs/events/eliminated`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (config.GAME_SERVER_WEBHOOK_KEY) {
    headers['x-game-server-key'] = config.GAME_SERVER_WEBHOOK_KEY;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.API_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        eventVersion: RUN_EVENT_VERSION,
        ...event,
      }),
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
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (config.GAME_SERVER_WEBHOOK_KEY) {
    headers['x-game-server-key'] = config.GAME_SERVER_WEBHOOK_KEY;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.API_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        eventVersion: RUN_EVENT_VERSION,
        ...event,
      }),
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
