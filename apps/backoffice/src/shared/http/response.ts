import { ServerResponse } from 'http';
import { HttpError } from './http-error';
import { getRequestContext } from '@slithermoney/shared';

export function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

export function sendError(res: ServerResponse, error: HttpError): void {
  const { trace_id } = getRequestContext();

  sendJson(res, error.statusCode, {
    code: error.code,
    message: error.message,
    trace_id,
    details: error.details,
  });
}
