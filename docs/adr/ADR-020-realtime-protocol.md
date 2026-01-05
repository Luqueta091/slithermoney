# ADR-020 - Realtime protocol

Date: 2026-01-01
Status: accepted

## Context

The game requires low-latency, bi-directional communication between mobile clients and the game server. We need a protocol that works on mobile networks, supports server-authoritative state, and allows us to evolve message contracts without breaking old clients.

## Decision

- Transport: WebSocket (TLS) for realtime communication.
- Server-authoritative: the server owns the game state; clients send input intents only.
- Tick rate: 20 ticks per second (50ms). Snapshots at 10-20 Hz depending on room load.
- Message format: JSON with `type` and `payload` (simple to debug early; can migrate to binary later).
- Ordering: client inputs include `seq` and `client_time_ms`. Server echoes `last_processed_seq`.
- Heartbeat: ping/pong every 10s, disconnect after 30s without ack.
- Auth: client receives a short-lived token from `/runs/start` and uses it to join a room.

## Consequences

- WebSocket keeps implementation simple and compatible with browsers and mobile.
- JSON payloads are larger but acceptable for MVP; we can add binary protocol later if needed.
- Server-authoritative flow reduces cheating but increases server CPU; tick rate can be tuned.
- Contract versioning is required to avoid breaking old clients (e.g. `protocol_version` in handshake).
