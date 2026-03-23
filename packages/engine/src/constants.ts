import type { Color, Rank } from './types.js';

export const COLORS: readonly Color[] = ['red', 'yellow', 'green', 'blue', 'white'] as const;
export const RANKS: readonly Rank[] = [1, 2, 3, 4, 5] as const;

/** Number of copies per rank in the deck */
export const RANK_COPIES: Record<Rank, number> = {
  1: 3,
  2: 2,
  3: 2,
  4: 2,
  5: 1,
};

export const MAX_CLUE_TOKENS = 8;
export const MAX_STRIKES = 3;
export const MAX_SCORE = 25; // 5 colors × 5 ranks

/** Hand size depends on number of players */
export function getHandSize(numPlayers: number): number {
  if (numPlayers <= 3) return 5;
  return 4;
}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
