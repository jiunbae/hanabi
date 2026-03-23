import type { GameAction, PlayAction, DiscardAction, HintAction, HintValue, Color, Rank } from './types.js';

export function playCard(playerIndex: number, cardIndex: number): PlayAction {
  return { type: 'play', playerIndex, cardIndex };
}

export function discardCard(playerIndex: number, cardIndex: number): DiscardAction {
  return { type: 'discard', playerIndex, cardIndex };
}

export function giveColorHint(playerIndex: number, targetIndex: number, color: Color): HintAction {
  return {
    type: 'hint',
    playerIndex,
    targetIndex,
    hint: { type: 'color', value: color },
  };
}

export function giveRankHint(playerIndex: number, targetIndex: number, rank: Rank): HintAction {
  return {
    type: 'hint',
    playerIndex,
    targetIndex,
    hint: { type: 'rank', value: rank },
  };
}
