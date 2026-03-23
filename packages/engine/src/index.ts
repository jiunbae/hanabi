// Types
export type {
  Color, Rank, Card, HeldCard,
  ClueTokens, StrikeInfo, Fireworks,
  HintType, ColorHint, RankHint, HintValue, CardClue,
  PlayerHand, GameOptions, VariantName, GameState, GameStatus,
  PlayAction, DiscardAction, HintAction, GameAction,
  PlayResult, DiscardResult, HintResult, ActionResult,
  PlayerViewCard, PlayerView,
} from './types.js';

// Constants
export { COLORS, RANKS, RANK_COPIES, MAX_CLUE_TOKENS, MAX_STRIKES, MAX_SCORE, getHandSize, MIN_PLAYERS, MAX_PLAYERS } from './constants.js';

// RNG
export { createRng, shuffle } from './rng.js';

// Deck
export { createDeck, createShuffledDeck } from './deck.js';

// Game State
export { createInitialState } from './game-state.js';

// Actions
export { playCard, discardCard, giveColorHint, giveRankHint } from './actions.js';

// Reducer
export { applyAction } from './reducer.js';

// Validators
export { validateAction } from './validators.js';
export type { ValidationError } from './validators.js';

// Selectors
export { getLegalActions, isPlayable, isAlreadyPlayed } from './selectors.js';

// Views
export { getPlayerView } from './views.js';

// Scoring
export { getScore, isPerfectScore, getGameScore } from './scoring.js';

// Variants
export { getVariant } from './variants.js';
export type { VariantConfig } from './variants.js';

// AI Context
export { buildAIContext, buildAIContextCompact, GAME_RULES } from './ai-context.js';
export type { AIContextOptions } from './ai-context.js';
