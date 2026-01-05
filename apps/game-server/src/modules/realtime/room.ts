import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import { InputPayload, SnapshotPayload } from './types';
import { sendMessage } from './message';
import { resolveMultiplier } from './multiplier';
import { SlitherEngine, type SlitherPelletEvent, type SlitherSnapshotPlayer } from './slither/engine';

type RoomConfig = {
  worldRadius: number;
  pelletTarget: number;
  maxPellets: number;
  maxSendPoints: number;
  boostDropSpacing: number;
  deathPelletTarget: number;
};

export type EliminationEvent = {
  playerId: string;
  runId?: string;
  reason: string;
  sizeScore: number;
  multiplier: number;
};

type PlayerSession = {
  runId?: string;
  lastSeq: number;
};

type SnapshotOptions = {
  includePellets: boolean;
  includeWorld: boolean;
  flushPelletEvents: boolean;
};

export class Room {
  readonly id: string;
  private readonly engine: SlitherEngine;
  private readonly connections = new Map<string, WebSocket>();
  private readonly sessions = new Map<string, PlayerSession>();
  private readonly tickIntervalMs: number;
  private readonly snapshotEvery: number;
  private readonly botCount: number;
  private tickCount = 0;
  private lastTickDurationMs = 0;

  constructor(
    id: string,
    private readonly capacity: number,
    tickRate: number,
    snapshotRate: number,
    botCount: number,
    roomConfig: RoomConfig,
  ) {
    this.id = id;
    this.tickIntervalMs = 1000 / tickRate;
    this.snapshotEvery = Math.max(1, Math.round(tickRate / snapshotRate));
    this.botCount = Math.max(0, botCount);
    const pelletTarget = Math.max(50, Math.floor(roomConfig.pelletTarget));
    const maxPellets = Math.max(
      Math.floor(roomConfig.maxPellets),
      pelletTarget + Math.floor(roomConfig.deathPelletTarget) + 120,
    );
    this.engine = new SlitherEngine({
      worldRadius: roomConfig.worldRadius,
      tickRate,
      pelletTarget,
      maxPellets,
      maxSendPoints: roomConfig.maxSendPoints,
      boostDropSpacing: roomConfig.boostDropSpacing,
      deathPelletTarget: roomConfig.deathPelletTarget,
    });
    this.engine.ensureBots(this.botCount);
  }

  get size(): number {
    return this.sessions.size;
  }

  get tickLagMs(): number {
    return Math.max(0, this.lastTickDurationMs - this.tickIntervalMs);
  }

  hasCapacity(): boolean {
    return this.sessions.size < this.capacity;
  }

  addPlayer(
    playerId: string,
    socket: WebSocket,
    runId?: string,
    desiredSkin?: string,
  ): { x: number; y: number; seed: string } {
    if (!this.hasCapacity()) {
      throw new Error('room_full');
    }

    const spawn = this.engine.addPlayer(playerId, desiredSkin);
    this.sessions.set(playerId, { runId, lastSeq: 0 });
    this.connections.set(playerId, socket);

    return {
      x: spawn.x,
      y: spawn.y,
      seed: randomUUID(),
    };
  }

  removePlayer(playerId: string): void {
    this.engine.removePlayer(playerId);
    this.sessions.delete(playerId);
    this.connections.delete(playerId);
  }

  handleInput(playerId: string, payload: InputPayload): number | null {
    const session = this.sessions.get(playerId);
    if (!session) {
      return null;
    }

    if (!Number.isInteger(payload.seq) || payload.seq <= session.lastSeq) {
      return null;
    }

    session.lastSeq = payload.seq;
    this.engine.handleInput(playerId, payload.direction, payload.boost);

    return session.lastSeq;
  }

  tick(): EliminationEvent[] {
    const start = Date.now();
    const dt = this.tickIntervalMs / 1000;
    const { eliminations } = this.engine.update(dt);

    const events: EliminationEvent[] = [];
    for (const elimination of eliminations) {
      const session = this.sessions.get(elimination.playerId);
      const sizeScore = Math.floor(elimination.mass);
      events.push({
        playerId: elimination.playerId,
        runId: session?.runId,
        reason: elimination.reason,
        sizeScore,
        multiplier: resolveMultiplier(sizeScore),
      });

      this.engine.removePlayer(elimination.playerId);
      this.sessions.delete(elimination.playerId);
      this.connections.delete(elimination.playerId);
    }

    this.tickCount += 1;
    if (this.tickCount % this.snapshotEvery === 0) {
      this.broadcastSnapshot();
    }

    this.lastTickDurationMs = Date.now() - start;
    return events;
  }

  getPlayerStats(playerId: string): { sizeScore: number; multiplier: number } | null {
    const mass = this.engine.getPlayerMass(playerId);
    if (mass === null) {
      return null;
    }
    const sizeScore = Math.floor(mass);
    return { sizeScore, multiplier: resolveMultiplier(sizeScore) };
  }

  buildFullSnapshot(): SnapshotPayload {
    return this.createSnapshot({
      includePellets: true,
      includeWorld: true,
      flushPelletEvents: false,
    });
  }

  private broadcastSnapshot(): void {
    const snapshot = this.createSnapshot({
      includePellets: false,
      includeWorld: true,
      flushPelletEvents: true,
    });

    for (const socket of this.connections.values()) {
      sendMessage(socket, { type: 'SNAPSHOT', payload: snapshot });
    }
  }

  private createSnapshot(options: SnapshotOptions): SnapshotPayload {
    const players = this.engine.getSnapshotPlayers().map((player) => mapPlayer(player));
    const pelletEvents = options.flushPelletEvents ? mapPelletEvents(this.engine.flushPelletEvents()) : [];

    const snapshot: SnapshotPayload = {
      tick: this.tickCount,
      room_id: this.id,
      players,
      pellet_events: pelletEvents,
    };

    if (options.includePellets) {
      snapshot.pellets = this.engine.getActivePellets().map((pellet) => ({
        id: pellet.id.toString(),
        x: pellet.x,
        y: pellet.y,
        value: pellet.value,
        radius: pellet.radius,
        hue: pellet.hue,
      }));
    }

    if (options.includeWorld) {
      snapshot.world_radius = this.engine.worldRadius;
    }

    return snapshot;
  }
}

function mapPlayer(player: SlitherSnapshotPlayer): SnapshotPayload['players'][number] {
  const sizeScore = Math.floor(player.mass);
  return {
    id: player.id,
    name: player.name,
    x: player.x,
    y: player.y,
    boost: player.boost,
    size_score: sizeScore,
    multiplier: resolveMultiplier(sizeScore),
    color: `hsl(${player.hue}, 90%, 58%)`,
    segments: player.segments,
    angle: player.angle,
    radius: player.radius,
    hue: player.hue,
  };
}

function mapPelletEvents(events: SlitherPelletEvent[]): SnapshotPayload['pellet_events'] {
  return events.map((event) => {
    if (event.type === 'delete') {
      return { type: 'delete', id: event.id.toString() };
    }
    return {
      type: 'spawn',
      pellet: {
        id: event.pellet.id.toString(),
        x: event.pellet.x,
        y: event.pellet.y,
        value: event.pellet.value,
        radius: event.pellet.radius,
        hue: event.pellet.hue,
      },
    };
  });
}
