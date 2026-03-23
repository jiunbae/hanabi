import type { GameOptions, PlayerView, GameAction } from '@nolbul/engine';

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

// AI Context types

export interface AIContextRequest {
  /** Include full game rules (default: true) */
  includeRules?: boolean;
  /** Max recent actions to show (default: 10) */
  recentActionsLimit?: number;
}

export interface AIContextResponse {
  gameId: string;
  /** Structured text prompt for LLM consumption */
  prompt: string;
  /** Raw game view (for programmatic access) */
  view: PlayerView;
  /** Whether it's this player's turn */
  isMyTurn: boolean;
  /** Game status */
  status: 'waiting' | 'playing' | 'finished';
}

export interface GameRulesResponse {
  rules: string;
  actionFormats: {
    play: { type: 'play'; playerIndex: number; cardIndex: number };
    discard: { type: 'discard'; playerIndex: number; cardIndex: number };
    hint: { type: 'hint'; playerIndex: number; targetIndex: number; hint: { type: 'color' | 'rank'; value: string | number } };
  };
}
