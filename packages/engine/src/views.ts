import type { GameState, PlayerView, PlayerViewCard, GameAction } from './types.js';
import { getLegalActions } from './selectors.js';

/**
 * Create a player-specific view of the game state.
 * Hides the viewing player's own card identities.
 */
export function getPlayerView(state: GameState, playerIndex: number): PlayerView {
  if (playerIndex < 0 || playerIndex >= state.hands.length) {
    throw new Error(`Invalid playerIndex: ${playerIndex}`);
  }

  const hands = state.hands.map((hand, i) => ({
    cards: hand.cards.map((card, cardIdx): PlayerViewCard => {
      if (i === playerIndex) {
        // Own cards: hide color and rank
        return {
          id: card.id,
          clues: hand.clues[cardIdx],
        };
      }
      // Other players' cards: show everything
      return {
        id: card.id,
        color: card.color,
        rank: card.rank,
        clues: hand.clues[cardIdx],
      };
    }),
  }));

  const legalActions =
    state.currentPlayer === playerIndex ? getLegalActions(state) : [];

  // Strip seed from options to prevent deck reconstruction
  const { seed: _seed, ...safeOptions } = state.options;

  return {
    options: safeOptions as typeof state.options,
    deckSize: state.deck.length - state.deckIndex,
    hands,
    fireworks: state.fireworks,
    clueTokens: state.clueTokens,
    strikes: state.strikes,
    currentPlayer: state.currentPlayer,
    turn: state.turn,
    turnsLeft: state.turnsLeft,
    status: state.status,
    lastAction: state.lastAction,
    actionHistory: state.actions,
    myIndex: playerIndex,
    legalActions,
    discardPile: state.discardPile,
  };
}
