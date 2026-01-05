import { IncomingMessage } from 'http';
import { HttpError } from './http-error';

export async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();

  if (!raw) {
    throw new HttpError(400, 'invalid_body', 'Request body is required');
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must be valid JSON');
  }
}
