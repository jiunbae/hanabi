import type { GameAction, GameOptions, PlayerView } from '@hanabi/engine';

const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || res.statusText);
  }
  return res.json() as Promise<T>;
}

export function createGame(options: GameOptions, creatorName: string) {
  return request<{ gameId: string; playerIndex: number; apiKey: string }>('/games', {
    method: 'POST',
    body: JSON.stringify({ options, creatorName }),
  });
}

export function joinGame(gameId: string, playerName: string) {
  return request<{ playerIndex: number; apiKey: string }>(`/games/${gameId}/join`, {
    method: 'POST',
    body: JSON.stringify({ playerName }),
  });
}

export function startGame(gameId: string, apiKey: string) {
  return request<{ success: boolean; view: PlayerView }>(`/games/${gameId}/start`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey },
  });
}

export function getGameState(gameId: string, apiKey: string) {
  return request<{ gameId: string; view: PlayerView }>(`/games/${gameId}`, {
    headers: { 'x-api-key': apiKey },
  });
}

export function submitAction(gameId: string, apiKey: string, action: GameAction) {
  return request<{ success: boolean; view: PlayerView; finished: boolean }>(`/games/${gameId}/actions`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey },
    body: JSON.stringify({ action }),
  });
}

export function listGames() {
  return request<{ games: { gameId: string; numPlayers: number; currentPlayers: number; status: string }[] }>('/games');
}

export function getLobbyInfo(gameId: string, apiKey: string) {
  return request<{ players: string[]; numPlayers: number; status: string }>(`/games/${gameId}/lobby`, {
    headers: { 'x-api-key': apiKey },
  });
}
