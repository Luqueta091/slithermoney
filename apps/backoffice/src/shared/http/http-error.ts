export type ErrorDetails = Record<string, unknown>;

export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: ErrorDetails;

  constructor(statusCode: number, code: string, message: string, details?: ErrorDetails) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}
