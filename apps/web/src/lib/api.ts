import type { GameAction, GameOptions, PlayerView } from '@nolbul/engine';

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

// AI Player APIs

export function addAIPlayer(gameId: string, apiKey: string) {
  return request<{ playerIndex: number; name: string }>(`/games/${gameId}/add-ai`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey },
  });
}

export function getAIStatus(gameId: string, apiKey: string) {
  return request<{ aiPlayers: number[]; configured: boolean }>(`/games/${gameId}/ai-status`, {
    headers: { 'x-api-key': apiKey },
  });
}

// Admin APIs

export function adminListGames(adminKey: string) {
  return request<{ games: AdminGameInfo[] }>('/admin/games', {
    headers: { 'x-admin-key': adminKey },
  });
}

export function adminGetStats(adminKey: string) {
  return request<AdminStats>('/admin/stats', {
    headers: { 'x-admin-key': adminKey },
  });
}

export function adminGetAIConfig(adminKey: string) {
  return request<{ provider: string; model: string; configured: boolean }>('/admin/ai-config', {
    headers: { 'x-admin-key': adminKey },
  });
}

export function adminSetAIConfig(adminKey: string, config: { provider: string; model: string }) {
  return request<{ provider: string; model: string; configured: boolean }>('/admin/ai-config', {
    method: 'POST',
    headers: { 'x-admin-key': adminKey },
    body: JSON.stringify(config),
  });
}

// Leaderboard

export function getLeaderboard(limit = 20) {
  return request<{ leaderboard: LeaderboardEntry[] }>(`/leaderboard?limit=${limit}`);
}

export function setGameName(gameId: string, apiKey: string, name: string) {
  return request<{ success: boolean; gameName: string }>(`/games/${gameId}/name`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey },
    body: JSON.stringify({ name }),
  });
}

export interface LeaderboardEntry {
  gameId: string;
  gameName: string | null;
  score: number;
  players: string[];
  numPlayers: number;
  finishedAt: string;
}

// Admin types

export interface AdminGameInfo {
  gameId: string;
  status: string;
  numPlayers: number;
  currentPlayers: number;
  players: string[];
  aiPlayers: number[];
  score: number | null;
  actionCount: number;
  createdAt: string;
}

export interface AdminStats {
  total: number;
  waiting: number;
  playing: number;
  finished: number;
  avgScore: number;
  aiGames: number;
  aiConfig: { provider: string; model: string; configured: boolean };
}
