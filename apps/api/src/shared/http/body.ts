import { IncomingMessage } from 'http';
import { HttpError } from './http-error';
import { config } from '../config';

export async function readJson<T>(req: IncomingMessage): Promise<T> {
  const { parsed } = await readJsonWithRaw<T>(req);
  return parsed;
}

export async function readJsonWithRaw<T>(
  req: IncomingMessage,
): Promise<{ parsed: T; raw: string }> {
  const contentLength = req.headers['content-length'];
  if (typeof contentLength === 'string') {
    const parsedLength = Number.parseInt(contentLength, 10);
    if (Number.isFinite(parsedLength) && parsedLength > config.JSON_BODY_LIMIT_BYTES) {
      throw new HttpError(413, 'payload_too_large', 'Payload excede tamanho maximo');
    }
  }

  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > config.JSON_BODY_LIMIT_BYTES) {
      throw new HttpError(413, 'payload_too_large', 'Payload excede tamanho maximo');
    }
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();

  if (!raw) {
    throw new HttpError(400, 'invalid_body', 'Request body is required');
  }

  try {
    return {
      parsed: JSON.parse(raw) as T,
      raw,
    };
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must be valid JSON');
  }
}
