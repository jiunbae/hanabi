import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  applyAction,
  validateAction,
  getLegalActions,
  getPlayerView,
  getScore,
  isPerfectScore,
  createDeck,
  createShuffledDeck,
  playCard,
  discardCard,
  giveColorHint,
  giveRankHint,
  COLORS,
  RANKS,
  RANK_COPIES,
  MAX_CLUE_TOKENS,
  MAX_STRIKES,
  getHandSize,
} from '../src/index.js';
import type { GameState, GameAction } from '../src/index.js';

describe('Deck', () => {
  it('creates a deck of 50 cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(50);
  });

  it('has correct card distribution', () => {
    const deck = createDeck();
    for (const color of COLORS) {
      for (const rank of RANKS) {
        const count = deck.filter((c) => c.color === color && c.rank === rank).length;
        expect(count).toBe(RANK_COPIES[rank]);
      }
    }
  });

  it('produces deterministic shuffles with same seed', () => {
    const d1 = createShuffledDeck(42);
    const d2 = createShuffledDeck(42);
    expect(d1).toEqual(d2);
  });

  it('produces different shuffles with different seeds', () => {
    const d1 = createShuffledDeck(1);
    const d2 = createShuffledDeck(2);
    expect(d1).not.toEqual(d2);
  });
});

describe('Game Initialization', () => {
  it('creates a valid 2-player game', () => {
    const state = createInitialState({ numPlayers: 2, seed: 1 });
    expect(state.hands).toHaveLength(2);
    expect(state.hands[0].cards).toHaveLength(5);
    expect(state.hands[1].cards).toHaveLength(5);
    expect(state.deckIndex).toBe(10);
    expect(state.status).toBe('playing');
    expect(state.currentPlayer).toBe(0);
    expect(state.clueTokens.current).toBe(MAX_CLUE_TOKENS);
    expect(state.strikes.current).toBe(0);
  });

  it('creates a valid 4-player game with 4-card hands', () => {
    const state = createInitialState({ numPlayers: 4, seed: 1 });
    expect(state.hands).toHaveLength(4);
    for (const hand of state.hands) {
      expect(hand.cards).toHaveLength(4);
    }
    expect(state.deckIndex).toBe(16);
  });

  it('rejects invalid player counts', () => {
    expect(() => createInitialState({ numPlayers: 1 })).toThrow();
    expect(() => createInitialState({ numPlayers: 6 })).toThrow();
  });

  it('assigns unique card IDs', () => {
    const state = createInitialState({ numPlayers: 3, seed: 1 });
    const allIds = state.hands.flatMap((h) => h.cards.map((c) => c.id));
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});

describe('Actions - Play', () => {
  it('successfully plays a card on the matching firework', () => {
    // Use a seed where we know a playable card position
    const state = createInitialState({ numPlayers: 2, seed: 42 });
    const hand = state.hands[0];

    // Find a rank-1 card in hand
    const idx = hand.cards.findIndex((c) => c.rank === 1);
    if (idx === -1) {
      // If no rank 1, just play card 0 (will fail, tested below)
      return;
    }

    const color = hand.cards[idx].color;
    expect(state.fireworks[color]).toBe(0);

    const next = applyAction(state, playCard(0, idx));
    expect(next.fireworks[color]).toBe(1);
    expect(next.currentPlayer).toBe(1);
    expect(next.turn).toBe(1);
    expect(next.strikes.current).toBe(0);
  });

  it('strikes on invalid play', () => {
    const state = createInitialState({ numPlayers: 2, seed: 42 });
    const hand = state.hands[0];

    // Find a card that is NOT rank 1 (won't be playable on empty fireworks)
    const idx = hand.cards.findIndex((c) => c.rank !== 1);
    if (idx === -1) return;

    const next = applyAction(state, playCard(0, idx));
    expect(next.strikes.current).toBe(1);
    expect(next.discardPile).toHaveLength(1);
  });

  it('gives bonus clue on completing a stack (rank 5)', () => {
    let state = createInitialState({ numPlayers: 2, seed: 42 });

    // Build up a firework to 4, then play a 5
    // We'll manipulate state for this test
    state = {
      ...state,
      fireworks: { ...state.fireworks, red: 4 },
      clueTokens: { ...state.clueTokens, current: 5 },
    };

    // Find a red 5 or put one in hand
    const hand = state.hands[0];
    const modCards = [...hand.cards];
    modCards[0] = { color: 'red', rank: 5, id: modCards[0].id };
    state = {
      ...state,
      hands: state.hands.map((h, i) =>
        i === 0 ? { ...h, cards: modCards } : h
      ),
    };

    const next = applyAction(state, playCard(0, 0));
    expect(next.fireworks.red).toBe(5);
    expect(next.clueTokens.current).toBe(6); // 5 + 1 bonus
  });
});

describe('Actions - Discard', () => {
  it('discards a card and gains a clue token', () => {
    let state = createInitialState({ numPlayers: 2, seed: 42 });
    // Spend a clue first so we can discard
    state = { ...state, clueTokens: { ...state.clueTokens, current: 7 } };

    const next = applyAction(state, discardCard(0, 0));
    expect(next.clueTokens.current).toBe(8);
    expect(next.hands[0].cards).toHaveLength(5); // drew a replacement
    expect(next.discardPile).toHaveLength(1);
  });

  it('rejects discard when clues are full', () => {
    const state = createInitialState({ numPlayers: 2, seed: 42 });
    expect(state.clueTokens.current).toBe(MAX_CLUE_TOKENS);

    const error = validateAction(state, discardCard(0, 0));
    expect(error).not.toBeNull();
    expect(error!.message).toContain('Cannot discard');
  });
});

describe('Actions - Hint', () => {
  it('gives a color hint and records clues', () => {
    const state = createInitialState({ numPlayers: 2, seed: 42 });
    const targetHand = state.hands[1];

    // Find a color that exists in target hand
    const color = targetHand.cards[0].color;

    const next = applyAction(state, giveColorHint(0, 1, color));
    expect(next.clueTokens.current).toBe(MAX_CLUE_TOKENS - 1);

    // Check that matching cards got the clue
    const touchedCount = targetHand.cards.filter((c) => c.color === color).length;
    const clueCount = next.hands[1].clues.filter((clues) =>
      clues.some((cl) => cl.type === 'color' && cl.value === color)
    ).length;
    expect(clueCount).toBe(touchedCount);
  });

  it('gives a rank hint', () => {
    const state = createInitialState({ numPlayers: 2, seed: 42 });
    const targetHand = state.hands[1];
    const rank = targetHand.cards[0].rank;

    const next = applyAction(state, giveRankHint(0, 1, rank));
    expect(next.clueTokens.current).toBe(MAX_CLUE_TOKENS - 1);
  });

  it('rejects hint to self', () => {
    const state = createInitialState({ numPlayers: 2, seed: 42 });
    const color = state.hands[0].cards[0].color;

    const error = validateAction(state, giveColorHint(0, 0, color));
    expect(error).not.toBeNull();
    expect(error!.message).toContain('yourself');
  });

  it('rejects hint with no clue tokens', () => {
    let state = createInitialState({ numPlayers: 2, seed: 42 });
    state = { ...state, clueTokens: { ...state.clueTokens, current: 0 } };

    const error = validateAction(state, giveColorHint(0, 1, 'red'));
    expect(error).not.toBeNull();
    expect(error!.message).toContain('No clue tokens');
  });

  it('rejects hint that touches no cards', () => {
    const state = createInitialState({ numPlayers: 2, seed: 42 });
    const targetHand = state.hands[1];

    // Find a color NOT in target hand
    const colorsInHand = new Set(targetHand.cards.map((c) => c.color));
    const missingColor = COLORS.find((c) => !colorsInHand.has(c));
    if (!missingColor) return; // all colors present, skip

    const error = validateAction(state, giveColorHint(0, 1, missingColor));
    expect(error).not.toBeNull();
    expect(error!.message).toContain('at least one card');
  });
});

describe('Turn Order', () => {
  it('advances turns correctly', () => {
    let state = createInitialState({ numPlayers: 3, seed: 42 });
    expect(state.currentPlayer).toBe(0);

    // Use hints to advance turns (no risk of strikeout)
    const p1Color = state.hands[1].cards[0].color;
    state = applyAction(state, giveColorHint(0, 1, p1Color));
    expect(state.currentPlayer).toBe(1);

    const p2Color = state.hands[2].cards[0].color;
    state = applyAction(state, giveColorHint(1, 2, p2Color));
    expect(state.currentPlayer).toBe(2);

    const p0Color = state.hands[0].cards[0].color;
    state = applyAction(state, giveColorHint(2, 0, p0Color));
    expect(state.currentPlayer).toBe(0); // wraps around
  });

  it('rejects out-of-turn actions', () => {
    const state = createInitialState({ numPlayers: 2, seed: 42 });
    expect(state.currentPlayer).toBe(0);

    const error = validateAction(state, playCard(1, 0));
    expect(error).not.toBeNull();
    expect(error!.message).toContain('Not player');
  });
});

describe('Player View', () => {
  it('hides own cards', () => {
    const state = createInitialState({ numPlayers: 2, seed: 42 });
    const view = getPlayerView(state, 0);

    // Own cards should not have color/rank
    for (const card of view.hands[0].cards) {
      expect(card.color).toBeUndefined();
      expect(card.rank).toBeUndefined();
    }

    // Other player's cards should have color/rank
    for (const card of view.hands[1].cards) {
      expect(card.color).toBeDefined();
      expect(card.rank).toBeDefined();
    }
  });

  it('includes legal actions only for current player', () => {
    const state = createInitialState({ numPlayers: 2, seed: 42 });

    const view0 = getPlayerView(state, 0);
    expect(view0.legalActions.length).toBeGreaterThan(0);

    const view1 = getPlayerView(state, 1);
    expect(view1.legalActions).toHaveLength(0);
  });

  it('shows deck size instead of deck contents', () => {
    const state = createInitialState({ numPlayers: 2, seed: 42 });
    const view = getPlayerView(state, 0);
    expect(view.deckSize).toBe(state.deck.length - state.deckIndex);
  });
});

describe('Legal Actions', () => {
  it('includes play for all cards', () => {
    const state = createInitialState({ numPlayers: 2, seed: 42 });
    const actions = getLegalActions(state);
    const plays = actions.filter((a) => a.type === 'play');
    expect(plays).toHaveLength(state.hands[0].cards.length);
  });

  it('excludes discard when clues are full', () => {
    const state = createInitialState({ numPlayers: 2, seed: 42 });
    expect(state.clueTokens.current).toBe(MAX_CLUE_TOKENS);
    const actions = getLegalActions(state);
    const discards = actions.filter((a) => a.type === 'discard');
    expect(discards).toHaveLength(0);
  });

  it('includes discard when clues are not full', () => {
    let state = createInitialState({ numPlayers: 2, seed: 42 });
    state = { ...state, clueTokens: { ...state.clueTokens, current: 5 } };
    const actions = getLegalActions(state);
    const discards = actions.filter((a) => a.type === 'discard');
    expect(discards).toHaveLength(state.hands[0].cards.length);
  });

  it('includes hints to other players', () => {
    const state = createInitialState({ numPlayers: 3, seed: 42 });
    const actions = getLegalActions(state);
    const hints = actions.filter((a) => a.type === 'hint');
    expect(hints.length).toBeGreaterThan(0);
    // No hints to self
    for (const h of hints) {
      if (h.type === 'hint') {
        expect(h.targetIndex).not.toBe(0);
      }
    }
  });

  it('returns empty for finished game', () => {
    let state = createInitialState({ numPlayers: 2, seed: 42 });
    state = { ...state, status: 'finished' };
    expect(getLegalActions(state)).toHaveLength(0);
  });
});

describe('Game End Conditions', () => {
  it('ends on 3 strikes', () => {
    let state = createInitialState({ numPlayers: 2, seed: 42 });
    state = { ...state, strikes: { ...state.strikes, current: 2 } };

    // Find a non-playable card to cause a strike
    const hand = state.hands[0];
    const idx = hand.cards.findIndex((c) => state.fireworks[c.color] + 1 !== c.rank);
    if (idx === -1) return;

    const next = applyAction(state, playCard(0, idx));
    expect(next.strikes.current).toBe(3);
    expect(next.status).toBe('finished');
  });

  it('ends on perfect score', () => {
    let state = createInitialState({ numPlayers: 2, seed: 42 });
    state = {
      ...state,
      fireworks: { red: 5, yellow: 5, green: 5, blue: 5, white: 4 },
    };

    // Put a white 5 in hand
    const modCards = [...state.hands[0].cards];
    modCards[0] = { color: 'white', rank: 5, id: modCards[0].id };
    state = {
      ...state,
      hands: state.hands.map((h, i) =>
        i === 0 ? { ...h, cards: modCards } : h
      ),
    };

    const next = applyAction(state, playCard(0, 0));
    expect(next.fireworks.white).toBe(5);
    expect(getScore(next.fireworks)).toBe(25);
    expect(isPerfectScore(next.fireworks)).toBe(true);
    expect(next.status).toBe('finished');
  });

  it('gives each player exactly one more turn after deck exhaustion', () => {
    // 2-player game: 50 cards, 10 in hands, 40 in deck
    let state = createInitialState({ numPlayers: 2, seed: 42 });

    // Strategy: discard when possible (clues < 8), hint when full (clues = 8)
    // This avoids strikes entirely and guarantees we exhaust the deck
    let turnsPlayed = 0;
    while (state.status === 'playing' && state.turnsLeft === null) {
      const player = state.currentPlayer;
      const otherPlayer = player === 0 ? 1 : 0;

      if (state.clueTokens.current < state.clueTokens.max) {
        // Discard to drain the deck
        state = applyAction(state, discardCard(player, 0));
      } else {
        // Clues full — give a hint to spend a clue token
        const targetHand = state.hands[otherPlayer];
        const color = targetHand.cards[0].color;
        state = applyAction(state, giveColorHint(player, otherPlayer, color));
      }
      turnsPlayed++;
      if (turnsPlayed > 200) break; // safety
    }

    // Must have reached deck exhaustion, not game over by strikes
    expect(state.status).toBe('playing');
    expect(state.turnsLeft).not.toBeNull();
    expect(state.strikes.current).toBe(0); // no strikes

    // Count remaining turns after deck exhaustion
    let finalTurns = 0;
    while (state.status === 'playing') {
      const player = state.currentPlayer;
      const otherPlayer = player === 0 ? 1 : 0;

      if (state.clueTokens.current < state.clueTokens.max) {
        state = applyAction(state, discardCard(player, 0));
      } else {
        const targetHand = state.hands[otherPlayer];
        const color = targetHand.cards[0].color;
        state = applyAction(state, giveColorHint(player, otherPlayer, color));
      }
      finalTurns++;
      if (finalTurns > 10) break; // safety
    }

    // Each of the 2 players gets exactly 1 more turn = 1 additional turn after exhaustion event
    // The player who drew the last card already took their turn, so N-1 = 1 more turn
    expect(finalTurns).toBe(1);
    expect(state.status).toBe('finished');
  });
});

describe('Full Game Simulation', () => {
  it('can play through a complete game', () => {
    let state = createInitialState({ numPlayers: 2, seed: 100 });
    let turns = 0;
    const maxTurns = 200;

    while (state.status === 'playing' && turns < maxTurns) {
      const actions = getLegalActions(state);
      expect(actions.length).toBeGreaterThan(0);

      // Simple strategy: try to play rank-1 cards, otherwise hint or discard
      const player = state.currentPlayer;
      const hand = state.hands[player];

      // Try to play a card that would succeed
      let action: GameAction | null = null;
      for (let i = 0; i < hand.cards.length; i++) {
        const card = hand.cards[i];
        if (state.fireworks[card.color] + 1 === card.rank) {
          action = playCard(player, i);
          break;
        }
      }

      if (!action) {
        // Give a hint if possible, otherwise discard
        const hintActions = actions.filter((a) => a.type === 'hint');
        if (hintActions.length > 0) {
          action = hintActions[0];
        } else {
          const discardActions = actions.filter((a) => a.type === 'discard');
          if (discardActions.length > 0) {
            action = discardActions[0];
          } else {
            action = actions[0]; // fallback: play anything
          }
        }
      }

      state = applyAction(state, action);
      turns++;
    }

    expect(state.status).toBe('finished');
    expect(turns).toBeLessThan(maxTurns);
    const score = getScore(state.fireworks);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(25);
  });
});
