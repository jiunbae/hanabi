import type { Fireworks, GameState } from './types.js';
import { COLORS, MAX_SCORE } from './constants.js';

export function getScore(fireworks: Fireworks): number {
  let total = 0;
  for (const color of COLORS) {
    total += fireworks[color];
  }
  return total;
}

export function isPerfectScore(fireworks: Fireworks): boolean {
  return getScore(fireworks) === MAX_SCORE;
}

export function getGameScore(state: GameState): number {
  return getScore(state.fireworks);
}
