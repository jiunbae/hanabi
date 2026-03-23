import type { GameAction, PlayerView, GameOptions } from '@nolbul/engine';

// Client → Server messages
export interface JoinGameMessage {
  type: 'JOIN_GAME';
  gameId: string;
  playerName: string;
  apiKey?: string;
}

export interface GameActionMessage {
  type: 'GAME_ACTION';
  gameId: string;
  action: GameAction;
}

export interface ChatMessage {
  type: 'CHAT';
  gameId: string;
  text: string;
}

export interface PingMessage {
  type: 'PING';
}

export type ClientMessage = JoinGameMessage | GameActionMessage | ChatMessage | PingMessage;

// Server → Client messages
export interface GameStateMessage {
  type: 'GAME_STATE';
  gameId: string;
  view: PlayerView;
}

export interface ActionResultMessage {
  type: 'ACTION_RESULT';
  gameId: string;
  success: boolean;
  view: PlayerView;
  error?: string;
}

export interface ErrorMessage {
  type: 'ERROR';
  message: string;
  code?: string;
}

export interface GameEndedMessage {
  type: 'GAME_ENDED';
  gameId: string;
  score: number;
  view: PlayerView;
}

export interface PongMessage {
  type: 'PONG';
}

export interface ChatBroadcastMessage {
  type: 'CHAT_BROADCAST';
  gameId: string;
  playerName: string;
  text: string;
  timestamp: number;
}

export type ServerMessage =
  | GameStateMessage
  | ActionResultMessage
  | ErrorMessage
  | GameEndedMessage
  | PongMessage
  | ChatBroadcastMessage;
