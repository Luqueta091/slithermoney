# ADR-003 - Error handling

Date: 2025-12-31
Status: accepted

## Context

We need consistent error responses across HTTP and internal services, including traceability for support and audit.

## Decision

Adopt a structured error shape:

- `code` (stable machine-readable identifier)
- `message` (human readable summary)
- `trace_id` (correlation id)
- `details` (optional structured data)

Guidelines:

- Domain errors map to 4xx; infra errors map to 5xx.
- Never leak secrets or PII in `message` or `details`.
- All errors are logged with `trace_id` and `request_id` when available.

## Consequences

- Support can correlate errors with logs.
- API clients get stable error codes.
