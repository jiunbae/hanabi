import type { GameState, GameOptions, PlayerHand, Fireworks, HeldCard, Card } from './types.js';
import { MAX_CLUE_TOKENS, MAX_STRIKES, getHandSize, MIN_PLAYERS, MAX_PLAYERS } from './constants.js';
import { createShuffledDeck } from './deck.js';

export function createInitialState(options: GameOptions): GameState {
  const { numPlayers, seed = Date.now() } = options;

  if (numPlayers < MIN_PLAYERS || numPlayers > MAX_PLAYERS) {
    throw new Error(`Invalid number of players: ${numPlayers}. Must be ${MIN_PLAYERS}-${MAX_PLAYERS}.`);
  }

  const deck = createShuffledDeck(seed);
  const handSize = getHandSize(numPlayers);
  let deckIndex = 0;
  let cardIdCounter = 0;

  const hands: PlayerHand[] = [];
  for (let p = 0; p < numPlayers; p++) {
    const cards: HeldCard[] = [];
    const clues: (readonly never[])[] = [];
    for (let c = 0; c < handSize; c++) {
      cards.push({ ...deck[deckIndex], id: cardIdCounter++ });
      clues.push([]);
      deckIndex++;
    }
    hands.push({ cards, clues });
  }

  const fireworks: Fireworks = {
    red: 0,
    yellow: 0,
    green: 0,
    blue: 0,
    white: 0,
  };

  return {
    options: { ...options, seed },
    deck,
    deckIndex,
    hands,
    fireworks,
    clueTokens: { current: MAX_CLUE_TOKENS, max: MAX_CLUE_TOKENS },
    strikes: { current: 0, max: MAX_STRIKES },
    currentPlayer: 0,
    turn: 0,
    turnsLeft: null,
    discardPile: [],
    actions: [],
    status: 'playing',
    lastAction: null,
    cardIdCounter,
  };
}

/** Draw a card from the deck, returns [card, newDeckIndex] or null if deck empty */
export function drawCard(state: GameState): { card: HeldCard; deckIndex: number; cardIdCounter: number } | null {
  if (state.deckIndex >= state.deck.length) return null;
  const deckCard = state.deck[state.deckIndex];
  return {
    card: { ...deckCard, id: state.cardIdCounter },
    deckIndex: state.deckIndex + 1,
    cardIdCounter: state.cardIdCounter + 1,
  };
}
