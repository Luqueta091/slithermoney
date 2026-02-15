import { timingSafeEqual } from 'crypto';
import { IncomingMessage } from 'http';
import { Prisma } from '@prisma/client';
import { signRunEventPayload } from '@slithermoney/shared';
import { config } from '../../../shared/config';
import { prisma } from '../../../shared/database/prisma';
import { HttpError } from '../../../shared/http/http-error';
import { logger } from '../../../shared/observability/logger';

const NONCE_MIN_LENGTH = 16;
const NONCE_MAX_LENGTH = 128;
const NONCE_ALLOWED_PATTERN = /^[A-Za-z0-9._:-]+$/;

export async function enforceRunEventsAuth(req: IncomingMessage, rawBody: string): Promise<void> {
  enforceGameServerKey(req);

  if (!config.RUN_EVENTS_SIGNATURE_REQUIRED || !config.GAME_SERVER_WEBHOOK_KEY) {
    return;
  }

  const timestamp = readTimestamp(req.headers['x-run-event-timestamp']);
  const nonce = readNonce(req.headers['x-run-event-nonce']);
  const signature = readSignature(req.headers['x-run-event-signature']);

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > config.RUN_EVENTS_SIGNATURE_MAX_AGE_SECONDS) {
    throw new HttpError(401, 'unauthorized', 'Assinatura expirada');
  }

  const expectedSignature = signRunEventPayload(
    config.GAME_SERVER_WEBHOOK_KEY,
    timestamp,
    nonce,
    rawBody,
  );

  if (!timingSafeHexEqual(signature, expectedSignature)) {
    throw new HttpError(401, 'unauthorized', 'Assinatura invalida');
  }

  await consumeNonce(nonce, timestamp, nowSeconds);
  maybePruneExpiredNonces();
}

function enforceGameServerKey(req: IncomingMessage): void {
  if (!config.GAME_SERVER_WEBHOOK_KEY) {
    return;
  }

  const headerValue = req.headers['x-game-server-key'];
  if (!headerValue || Array.isArray(headerValue) || headerValue !== config.GAME_SERVER_WEBHOOK_KEY) {
    throw new HttpError(401, 'unauthorized', 'Chave invalida');
  }
}

function readTimestamp(value: string | string[] | undefined): number {
  if (!value || Array.isArray(value)) {
    throw new HttpError(401, 'unauthorized', 'Timestamp ausente');
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new HttpError(401, 'unauthorized', 'Timestamp invalido');
  }

  return parsed;
}

function readNonce(value: string | string[] | undefined): string {
  if (!value || Array.isArray(value)) {
    throw new HttpError(401, 'unauthorized', 'Nonce ausente');
  }

  const nonce = value.trim();
  if (
    nonce.length < NONCE_MIN_LENGTH ||
    nonce.length > NONCE_MAX_LENGTH ||
    !NONCE_ALLOWED_PATTERN.test(nonce)
  ) {
    throw new HttpError(401, 'unauthorized', 'Nonce invalido');
  }

  return nonce;
}

function readSignature(value: string | string[] | undefined): string {
  if (!value || Array.isArray(value)) {
    throw new HttpError(401, 'unauthorized', 'Assinatura ausente');
  }

  const signature = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(signature)) {
    throw new HttpError(401, 'unauthorized', 'Assinatura invalida');
  }

  return signature;
}

function timingSafeHexEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

async function consumeNonce(nonce: string, timestamp: number, nowSeconds: number): Promise<void> {
  const expiresAt = new Date(
    Math.max(timestamp, nowSeconds) * 1000 + config.RUN_EVENTS_SIGNATURE_MAX_AGE_SECONDS * 1000,
  );

  try {
    await prisma.runEventNonce.create({
      data: {
        nonce,
        expiresAt,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new HttpError(409, 'replay_detected', 'Evento duplicado');
    }
    throw error;
  }
}

function maybePruneExpiredNonces(): void {
  if (Math.random() > 0.02) {
    return;
  }

  void prisma.runEventNonce
    .deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    })
    .catch((error) => {
      logger.warn('run_event_nonce_prune_failed', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
    });
}
