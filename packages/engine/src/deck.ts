import type { Card } from './types.js';
import { COLORS, RANKS, RANK_COPIES } from './constants.js';
import { createRng, shuffle } from './rng.js';

/** Create an unshuffled deck of 50 cards */
export function createDeck(): Card[] {
  const cards: Card[] = [];
  for (const color of COLORS) {
    for (const rank of RANKS) {
      const copies = RANK_COPIES[rank];
      for (let i = 0; i < copies; i++) {
        cards.push({ color, rank });
      }
    }
  }
  return cards;
}

/** Create a shuffled deck using a seed */
export function createShuffledDeck(seed: number): Card[] {
  const rng = createRng(seed);
  return shuffle(createDeck(), rng);
}
