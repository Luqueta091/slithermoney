import WebSocket from 'ws';
import { ClientMessage, ServerMessage } from './types';

export function parseMessage(data: WebSocket.RawData): ClientMessage | null {
  const raw = typeof data === 'string' ? data : data.toString('utf8');

  try {
    const parsed = JSON.parse(raw) as ClientMessage;
    if (!parsed || typeof parsed.type !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function sendMessage<T>(socket: WebSocket, message: ServerMessage<T>): void {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(message));
}

export function sendError(socket: WebSocket, code: string, message: string): void {
  sendMessage(socket, {
    type: 'ERROR',
    payload: {
      code,
      message,
    },
  });
}
