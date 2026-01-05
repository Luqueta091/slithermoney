import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import { logger } from '../../shared/observability/logger';
import { Room, type EliminationEvent } from './room';
import { InputPayload, SnapshotPayload } from './types';

export type ArenaManagerConfig = {
  roomCapacity: number;
  tickRate: number;
  snapshotRate: number;
  npcOnly: boolean;
  botCount: number;
  worldRadius: number;
  pelletTarget: number;
  maxPellets: number;
  maxSendPoints: number;
  boostDropSpacing: number;
  deathPelletTarget: number;
};

export class ArenaManager {
  private readonly rooms = new Map<string, Room>();
  private readonly playerRoom = new Map<string, Room>();

  constructor(private readonly config: ArenaManagerConfig) {}

  join(
    playerId: string,
    socket: WebSocket,
    runId?: string,
    desiredSkin?: string,
  ): { roomId: string; seed: string; spawn: { x: number; y: number }; snapshot: SnapshotPayload } {
    const room = this.findOrCreateRoom();
    const spawn = room.addPlayer(playerId, socket, runId, desiredSkin);
    const snapshot = room.buildFullSnapshot();

    this.playerRoom.set(playerId, room);

    logger.info('player_joined_room', {
      player_id: playerId,
      room_id: room.id,
      room_size: room.size,
    });

    return {
      roomId: room.id,
      seed: spawn.seed,
      spawn: { x: spawn.x, y: spawn.y },
      snapshot,
    };
  }

  removePlayer(playerId: string): void {
    const room = this.playerRoom.get(playerId);
    if (!room) {
      return;
    }

    room.removePlayer(playerId);
    this.playerRoom.delete(playerId);

    logger.info('player_left_room', {
      player_id: playerId,
      room_id: room.id,
      room_size: room.size,
    });

    if (room.size === 0) {
      this.rooms.delete(room.id);
      logger.info('room_closed', { room_id: room.id });
    }
  }

  handleInput(playerId: string, payload: InputPayload): number | null {
    const room = this.playerRoom.get(playerId);
    if (!room) {
      return null;
    }

    return room.handleInput(playerId, payload);
  }

  getPlayerStats(playerId: string): { sizeScore: number; multiplier: number } | null {
    const room = this.playerRoom.get(playerId);
    if (!room) {
      return null;
    }

    return room.getPlayerStats(playerId);
  }

  tick(): EliminationEvent[] {
    const eliminations: EliminationEvent[] = [];
    for (const room of this.rooms.values()) {
      const roomEliminations = room.tick();
      if (roomEliminations.length > 0) {
        eliminations.push(...roomEliminations);
      }
    }

    for (const eliminated of eliminations) {
      this.playerRoom.delete(eliminated.playerId);
    }

    return eliminations;
  }

  getMetrics(): { playersOnline: number; roomsActive: number; tickLagMs: number } {
    let playersOnline = 0;
    let roomsActive = 0;
    let tickLagMs = 0;

    for (const room of this.rooms.values()) {
      const roomSize = room.size;
      if (roomSize > 0) {
        roomsActive += 1;
        playersOnline += roomSize;
        tickLagMs = Math.max(tickLagMs, room.tickLagMs);
      }
    }

    return {
      playersOnline,
      roomsActive,
      tickLagMs,
    };
  }

  private findOrCreateRoom(): Room {
    if (!this.config.npcOnly) {
      for (const room of this.rooms.values()) {
        if (room.hasCapacity()) {
          return room;
        }
      }
    }

    const id = randomUUID();
    const room = new Room(
      id,
      this.config.roomCapacity,
      this.config.tickRate,
      this.config.snapshotRate,
      this.config.botCount,
      {
        worldRadius: this.config.worldRadius,
        pelletTarget: this.config.pelletTarget,
        maxPellets: this.config.maxPellets,
        maxSendPoints: this.config.maxSendPoints,
        boostDropSpacing: this.config.boostDropSpacing,
        deathPelletTarget: this.config.deathPelletTarget,
      },
    );
    this.rooms.set(id, room);

    logger.info('room_created', { room_id: id });

    return room;
  }
}
