import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { gameManager } from '../services/game-manager.js';
import { getPlayerView, getScore } from '@hanabi/engine';
import type { GameState } from '@hanabi/engine';
import type { ClientMessage, ServerMessage } from '@hanabi/shared';

const MAX_MESSAGE_SIZE = 4096; // 4KB per message
const MAX_CONNECTIONS = 200;

interface ConnectedClient {
  ws: WebSocket;
  gameId: string | null;
  playerIndex: number;
  playerName: string;
  apiKey: string;
}

const clients = new Map<WebSocket, ConnectedClient>();
const gameClients = new Map<string, Set<WebSocket>>();

export function setupWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({
    server,
    maxPayload: MAX_MESSAGE_SIZE,
  });

  // When a game is started via REST, broadcast to all WS-connected players
  gameManager.onGameStarted((gameId, state) => {
    broadcastToGame(gameId, null, state);
  });

  wss.on('connection', (ws: WebSocket) => {
    if (clients.size >= MAX_CONNECTIONS) {
      ws.close(1013, 'Server too busy');
      return;
    }

    const client: ConnectedClient = {
      ws,
      gameId: null,
      playerIndex: -1,
      playerName: '',
      apiKey: '',
    };
    clients.set(ws, client);

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as ClientMessage;
        handleMessage(client, msg);
      } catch {
        sendMessage(ws, { type: 'ERROR', message: 'Invalid message format' });
      }
    });

    ws.on('close', () => {
      if (client.gameId) {
        const gameSet = gameClients.get(client.gameId);
        gameSet?.delete(ws);
        if (gameSet?.size === 0) gameClients.delete(client.gameId);
      }
      clients.delete(ws);
    });
  });

  return wss;
}

function handleMessage(client: ConnectedClient, msg: ClientMessage): void {
  switch (msg.type) {
    case 'JOIN_GAME': {
      client.apiKey = msg.apiKey ?? '';

      try {
        // Authenticate BEFORE adding to game room
        const playerIndex = gameManager.getPlayerIndexByApiKey(msg.gameId, client.apiKey);
        client.gameId = msg.gameId;
        client.playerName = (msg.playerName || '').slice(0, 32);
        client.playerIndex = playerIndex;

        if (!gameClients.has(msg.gameId)) {
          gameClients.set(msg.gameId, new Set());
        }
        gameClients.get(msg.gameId)!.add(client.ws);

        const state = gameManager.getRoomState(msg.gameId);
        if (state) {
          const view = getPlayerView(state, playerIndex);
          sendMessage(client.ws, { type: 'GAME_STATE', gameId: msg.gameId, view });
        }
      } catch (e) {
        sendMessage(client.ws, {
          type: 'ERROR',
          message: 'Authentication failed',
        });
      }
      break;
    }

    case 'GAME_ACTION': {
      if (!client.gameId || client.gameId !== msg.gameId) {
        sendMessage(client.ws, { type: 'ERROR', message: 'Not in this game' });
        return;
      }
      try {
        const { view, finished } = gameManager.submitAction(msg.gameId, client.apiKey, msg.action);

        sendMessage(client.ws, {
          type: 'ACTION_RESULT',
          gameId: msg.gameId,
          success: true,
          view,
        });

        const state = gameManager.getRoomState(msg.gameId);
        if (state) {
          broadcastToGame(msg.gameId, client.ws, state);
        }

        if (finished && state) {
          const score = getScore(state.fireworks);
          broadcastToAll(msg.gameId, (_ws, playerIdx) => ({
            type: 'GAME_ENDED',
            gameId: msg.gameId,
            score,
            view: getPlayerView(state, playerIdx),
          }));
        }
      } catch (e) {
        sendMessage(client.ws, {
          type: 'ERROR',
          message: e instanceof Error ? e.message : 'Action failed',
        });
      }
      break;
    }

    case 'CHAT': {
      if (!client.gameId) return;
      // Sanitize chat text: strip HTML, limit length
      const sanitized = escapeHtml(msg.text).slice(0, 200);
      if (sanitized.length === 0) return;
      broadcastToAll(client.gameId, () => ({
        type: 'CHAT_BROADCAST',
        gameId: client.gameId!,
        playerName: client.playerName,
        text: sanitized,
        timestamp: Date.now(),
      }));
      break;
    }

    case 'PING': {
      sendMessage(client.ws, { type: 'PONG' });
      break;
    }
  }
}

function escapeHtml(str: string): string {
  return str.replace(/[<>&"']/g, (ch) => {
    const map: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
    return map[ch] ?? ch;
  });
}

function sendMessage(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastToGame(gameId: string, excludeWs: WebSocket | null, state: GameState): void {
  const gameSet = gameClients.get(gameId);
  if (!gameSet) return;

  for (const ws of gameSet) {
    if (excludeWs && ws === excludeWs) continue;
    const client = clients.get(ws);
    if (!client || client.playerIndex < 0) continue;
    const view = getPlayerView(state, client.playerIndex);
    sendMessage(ws, { type: 'GAME_STATE', gameId, view });
  }
}

function broadcastToAll(gameId: string, msgFn: (ws: WebSocket, playerIndex: number) => ServerMessage): void {
  const gameSet = gameClients.get(gameId);
  if (!gameSet) return;

  for (const ws of gameSet) {
    const client = clients.get(ws);
    if (!client) continue;
    sendMessage(ws, msgFn(ws, client.playerIndex));
  }
}
