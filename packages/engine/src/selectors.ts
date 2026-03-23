import type { GameState, GameAction, Card } from './types.js';
import { COLORS, RANKS } from './constants.js';

/** Get all legal actions for the current player */
export function getLegalActions(state: GameState): GameAction[] {
  if (state.status !== 'playing') return [];

  const actions: GameAction[] = [];
  const player = state.currentPlayer;
  const hand = state.hands[player];

  // Play actions - can always play any card
  for (let i = 0; i < hand.cards.length; i++) {
    actions.push({ type: 'play', playerIndex: player, cardIndex: i });
  }

  // Discard actions - only if clue tokens not full
  if (state.clueTokens.current < state.clueTokens.max) {
    for (let i = 0; i < hand.cards.length; i++) {
      actions.push({ type: 'discard', playerIndex: player, cardIndex: i });
    }
  }

  // Hint actions - only if clue tokens available
  if (state.clueTokens.current > 0) {
    for (let target = 0; target < state.hands.length; target++) {
      if (target === player) continue;
      const targetHand = state.hands[target];

      // Color hints
      for (const color of COLORS) {
        if (targetHand.cards.some((c) => c.color === color)) {
          actions.push({
            type: 'hint',
            playerIndex: player,
            targetIndex: target,
            hint: { type: 'color', value: color },
          });
        }
      }

      // Rank hints
      for (const rank of RANKS) {
        if (targetHand.cards.some((c) => c.rank === rank)) {
          actions.push({
            type: 'hint',
            playerIndex: player,
            targetIndex: target,
            hint: { type: 'rank', value: rank },
          });
        }
      }
    }
  }

  return actions;
}

/** Check if a card is playable on the current fireworks */
export function isPlayable(state: GameState, card: Card): boolean {
  return state.fireworks[card.color] + 1 === card.rank;
}

/** Check if a card is already played (useless) */
export function isAlreadyPlayed(state: GameState, card: Card): boolean {
  return state.fireworks[card.color] >= card.rank;
}
