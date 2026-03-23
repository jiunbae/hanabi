import type { GameOptions, PlayerView, GameAction } from '@hanabi/engine';

// REST API types

export interface CreateGameRequest {
  options: GameOptions;
  creatorName: string;
}

export interface CreateGameResponse {
  gameId: string;
  playerIndex: number;
  apiKey: string;
}

export interface JoinGameRequest {
  playerName: string;
}

export interface JoinGameResponse {
  playerIndex: number;
  apiKey: string;
}

export interface GameStateResponse {
  gameId: string;
  view: PlayerView;
}

export interface SubmitActionRequest {
  action: GameAction;
}

export interface SubmitActionResponse {
  success: boolean;
  view: PlayerView;
  finished: boolean;
  error?: string;
}

export interface StartGameResponse {
  success: boolean;
  view: PlayerView;
}

export interface ReplayResponse {
  gameId: string;
  options: GameOptions;
  actions: GameAction[];
  score: number;
}

export interface SimulateRequest {
  options: GameOptions;
  actions: GameAction[];
}

export interface SimulateResponse {
  finalView: PlayerView;
  score: number;
}

export interface GameListItem {
  gameId: string;
  numPlayers: number;
  currentPlayers: number;
  status: 'waiting' | 'playing' | 'finished';
  createdAt: string;
}

export interface GameListResponse {
  games: GameListItem[];
}
