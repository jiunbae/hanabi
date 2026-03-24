import type { GameState, GameAction, Color, Rank, HintValue } from './types.js';
import { COLORS, RANKS, MAX_CLUE_TOKENS } from './constants.js';

export interface ValidationError {
  readonly message: string;
}

export function validateAction(state: GameState, action: GameAction): ValidationError | null {
  if (state.status !== 'playing') {
    return { message: 'Game is not in progress' };
  }

  if (action.playerIndex !== state.currentPlayer) {
    return { message: `Not player ${action.playerIndex}'s turn (current: ${state.currentPlayer})` };
  }

  switch (action.type) {
    case 'play':
      return validatePlay(state, action.playerIndex, action.cardIndex);
    case 'discard':
      return validateDiscard(state, action.playerIndex, action.cardIndex);
    case 'hint':
      return validateHint(state, action.playerIndex, action.targetIndex, action.hint);
    default:
      return { message: `Unknown action type: ${(action as { type: string }).type}` };
  }
}

function validatePlay(state: GameState, playerIndex: number, cardIndex: number): ValidationError | null {
  const hand = state.hands[playerIndex];
  if (!hand) return { message: `Invalid player index: ${playerIndex}` };
  if (cardIndex < 0 || cardIndex >= hand.cards.length) {
    return { message: `Invalid card index: ${cardIndex}` };
  }
  return null;
}

function validateDiscard(state: GameState, playerIndex: number, cardIndex: number): ValidationError | null {
  const hand = state.hands[playerIndex];
  if (!hand) return { message: `Invalid player index: ${playerIndex}` };
  if (cardIndex < 0 || cardIndex >= hand.cards.length) {
    return { message: `Invalid card index: ${cardIndex}` };
  }
  if (state.clueTokens.current >= MAX_CLUE_TOKENS) {
    return { message: 'Cannot discard when clue tokens are full' };
  }
  return null;
}

function validateHint(
  state: GameState,
  playerIndex: number,
  targetIndex: number,
  hint: HintValue
): ValidationError | null {
  if (state.clueTokens.current <= 0) {
    return { message: 'No clue tokens available' };
  }
  if (targetIndex === playerIndex) {
    return { message: 'Cannot give a hint to yourself' };
  }
  if (targetIndex < 0 || targetIndex >= state.hands.length) {
    return { message: `Invalid target player index: ${targetIndex}` };
  }

  if (hint.type === 'color' && !COLORS.includes(hint.value as Color)) {
    return { message: `Invalid color: ${hint.value}` };
  }
  if (hint.type === 'rank' && !RANKS.includes(hint.value as Rank)) {
    return { message: `Invalid rank: ${hint.value}` };
  }

  // Empty hints (touching no cards) are allowed — they convey information
  // by telling a player what they DON'T have.
  return null;
}
