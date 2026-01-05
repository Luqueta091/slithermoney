# ADR-004 - Observability basics

Date: 2025-12-31
Status: accepted

## Context

The system handles money flows and realtime gameplay. We need consistent tracing and minimal metrics to troubleshoot issues quickly.

## Decision

- Structured logs in JSON.
- Required log fields: `service_name`, `request_id`, `trace_id`, `user_id` (when available).
- Health endpoints for `api` and `game-server`.
- Minimal metrics per service (latency, error rate, throughput, queue backlog).

## Consequences

- Logs can be indexed and queried.
- Correlation across services is possible.
