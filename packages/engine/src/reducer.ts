import type {
  GameState, GameAction, PlayerHand, CardClue,
  PlayAction, DiscardAction, HintAction,
} from './types.js';
import { MAX_CLUE_TOKENS } from './constants.js';
import { validateAction } from './validators.js';
import { drawCard } from './game-state.js';
import { isPerfectScore } from './scoring.js';

/**
 * Pure state transition function.
 * Returns a new GameState after applying the action, or throws on invalid action.
 */
export function applyAction(state: GameState, action: GameAction): GameState {
  const error = validateAction(state, action);
  if (error) {
    throw new Error(`Invalid action: ${error.message}`);
  }

  switch (action.type) {
    case 'play':
      return applyPlay(state, action);
    case 'discard':
      return applyDiscard(state, action);
    case 'hint':
      return applyHint(state, action);
    default: {
      const _exhaustive: never = action;
      throw new Error(`Unknown action type`);
    }
  }
}

function applyPlay(state: GameState, action: PlayAction): GameState {
  const hand = state.hands[action.playerIndex];
  const card = hand.cards[action.cardIndex];
  const expectedRank = state.fireworks[card.color] + 1;
  const success = card.rank === expectedRank;

  let fireworks = state.fireworks;
  let strikes = state.strikes;
  let clueTokens = state.clueTokens;

  if (success) {
    fireworks = { ...fireworks, [card.color]: card.rank };
    if (card.rank === 5 && clueTokens.current < MAX_CLUE_TOKENS) {
      clueTokens = { ...clueTokens, current: clueTokens.current + 1 };
    }
  } else {
    strikes = { ...strikes, current: strikes.current + 1 };
  }

  const discardPile = success ? state.discardPile : [...state.discardPile, { color: card.color, rank: card.rank }];
  const { hands, deckIndex, cardIdCounter, deckExhaustedThisTurn } = removeAndDraw(state, action.playerIndex, action.cardIndex);
  const turnsLeft = advanceTurnsLeft(state.turnsLeft, deckExhaustedThisTurn, state.hands.length);

  let status = state.status;
  if (strikes.current >= strikes.max) {
    status = 'finished';
  } else if (isPerfectScore(fireworks)) {
    status = 'finished';
  } else if (turnsLeft !== null && turnsLeft <= 0) {
    status = 'finished';
  }

  return {
    ...state,
    hands,
    fireworks,
    clueTokens,
    strikes,
    discardPile,
    deckIndex,
    cardIdCounter,
    currentPlayer: status === 'finished' ? state.currentPlayer : nextPlayer(state),
    turn: state.turn + 1,
    turnsLeft,
    actions: [...state.actions, action],
    status,
    lastAction: action,
  };
}

function applyDiscard(state: GameState, action: DiscardAction): GameState {
  const hand = state.hands[action.playerIndex];
  const card = hand.cards[action.cardIndex];

  const clueTokens = {
    ...state.clueTokens,
    current: Math.min(state.clueTokens.current + 1, MAX_CLUE_TOKENS),
  };

  const discardPile = [...state.discardPile, { color: card.color, rank: card.rank }];
  const { hands, deckIndex, cardIdCounter, deckExhaustedThisTurn } = removeAndDraw(state, action.playerIndex, action.cardIndex);
  const turnsLeft = advanceTurnsLeft(state.turnsLeft, deckExhaustedThisTurn, state.hands.length);

  let status = state.status;
  if (turnsLeft !== null && turnsLeft <= 0) {
    status = 'finished';
  }

  return {
    ...state,
    hands,
    clueTokens,
    discardPile,
    deckIndex,
    cardIdCounter,
    currentPlayer: status === 'finished' ? state.currentPlayer : nextPlayer(state),
    turn: state.turn + 1,
    turnsLeft,
    actions: [...state.actions, action],
    status,
    lastAction: action,
  };
}

function applyHint(state: GameState, action: HintAction): GameState {
  const clueTokens = {
    ...state.clueTokens,
    current: state.clueTokens.current - 1,
  };

  const targetHand = state.hands[action.targetIndex];
  const newClues = targetHand.cards.map((card, i) => {
    const matches =
      action.hint.type === 'color'
        ? card.color === action.hint.value
        : card.rank === action.hint.value;
    if (!matches) return targetHand.clues[i];
    const newClue: CardClue = {
      type: action.hint.type,
      value: action.hint.value,
      turnGiven: state.turn,
      giverIndex: action.playerIndex,
    };
    return [...targetHand.clues[i], newClue];
  });

  const newHand: PlayerHand = {
    cards: targetHand.cards,
    clues: newClues,
  };

  const hands = state.hands.map((h, i) => (i === action.targetIndex ? newHand : h));

  const turnsLeft = advanceTurnsLeft(state.turnsLeft, false, state.hands.length);

  let status = state.status;
  if (turnsLeft !== null && turnsLeft <= 0) {
    status = 'finished';
  }

  return {
    ...state,
    hands,
    clueTokens,
    currentPlayer: status === 'finished' ? state.currentPlayer : nextPlayer(state),
    turn: state.turn + 1,
    turnsLeft,
    actions: [...state.actions, action],
    status,
    lastAction: action,
  };
}

function removeAndDraw(
  state: GameState,
  playerIndex: number,
  cardIndex: number
): {
  hands: PlayerHand[];
  deckIndex: number;
  cardIdCounter: number;
  deckExhaustedThisTurn: boolean;
} {
  const hand = state.hands[playerIndex];
  const newCards = [...hand.cards];
  const newClues = [...hand.clues];
  newCards.splice(cardIndex, 1);
  newClues.splice(cardIndex, 1);

  let deckIndex = state.deckIndex;
  let cardIdCounter = state.cardIdCounter;
  let deckExhaustedThisTurn = false;

  const drawn = drawCard(state);
  if (drawn) {
    newCards.push(drawn.card);
    newClues.push([]);
    deckIndex = drawn.deckIndex;
    cardIdCounter = drawn.cardIdCounter;

    if (deckIndex >= state.deck.length && state.turnsLeft === null) {
      deckExhaustedThisTurn = true;
    }
  } else {
    if (state.turnsLeft === null) {
      deckExhaustedThisTurn = true;
    }
  }

  const newHand: PlayerHand = { cards: newCards, clues: newClues };
  const hands = state.hands.map((h, i) => (i === playerIndex ? newHand : h));

  return { hands, deckIndex, cardIdCounter, deckExhaustedThisTurn };
}

/**
 * Advance turnsLeft counter.
 * When the deck is exhausted, each player gets exactly one more turn.
 */
function advanceTurnsLeft(
  turnsLeft: number | null,
  deckExhaustedThisTurn: boolean,
  numPlayers: number
): number | null {
  if (deckExhaustedThisTurn) {
    // Deck just ran out: each player gets one more turn (including current)
    return numPlayers - 1;
  }
  if (turnsLeft !== null) {
    return turnsLeft - 1;
  }
  return null;
}

function nextPlayer(state: GameState): number {
  return (state.currentPlayer + 1) % state.hands.length;
}
