# Realtime protocol

This document describes the realtime flow between client and game-server.

## Handshake

```mermaid
sequenceDiagram
  participant Client
  participant API
  participant GameServer

  Client->>API: POST /runs/start
  API-->>Client: run_id + join_token + arena_host
  Client->>GameServer: WS connect (arena_host)
  Client->>GameServer: HELLO { run_id, join_token, protocol_version }
  GameServer-->>Client: WELCOME { player_id, tick_rate, snapshot_rate }
```

## Join arena

```mermaid
sequenceDiagram
  participant Client
  participant GameServer

  Client->>GameServer: JOIN { run_id, desired_skin }
  GameServer-->>Client: JOINED { room_id, seed, spawn_position }
```

## Game loop

```mermaid
sequenceDiagram
  participant Client
  participant GameServer

  loop every input frame
    Client->>GameServer: INPUT { seq, client_time_ms, direction, boost }
    GameServer-->>Client: INPUT_ACK { last_processed_seq }
  end

  loop snapshot interval
    GameServer-->>Client: SNAPSHOT { tick, players, pellets, arenas }
  end
```

## Cash-out request

```mermaid
sequenceDiagram
  participant Client
  participant GameServer
  participant API

  Client->>GameServer: CASHOUT_REQUEST { run_id }
  GameServer-->>Client: CASHOUT_HOLD { hold_ms }
  GameServer-->>API: EVENT run-cashout { runId, multiplier, eventVersion }
  GameServer-->>Client: CASHOUT_RESULT { status, multiplier }
  API-->>Client: cashout result (via game-server or next snapshot)
```

## Elimination event

```mermaid
sequenceDiagram
  participant GameServer
  participant API

  GameServer-->>API: EVENT run-eliminated { runId, reason, sizeScore, multiplier, eventVersion }
  API-->>GameServer: 200 ok
```

## Message contract notes

- `protocol_version` is required in HELLO; incompatible versions should be rejected.
- Inputs must be rate-limited and validated server-side.
- Client receives snapshots and interpolates; server is authoritative for collisions.
- Snapshots include `size_score` and `multiplier` for HUD rendering.
