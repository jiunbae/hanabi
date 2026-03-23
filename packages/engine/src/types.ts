export type Color = 'red' | 'yellow' | 'green' | 'blue' | 'white';
export type Rank = 1 | 2 | 3 | 4 | 5;

export interface Card {
  readonly color: Color;
  readonly rank: Rank;
}

export interface HeldCard extends Card {
  /** Unique id within the game for tracking */
  readonly id: number;
}

export interface ClueTokens {
  readonly current: number;
  readonly max: number;
}

export interface StrikeInfo {
  readonly current: number;
  readonly max: number;
}

export interface Fireworks {
  readonly red: number;
  readonly yellow: number;
  readonly green: number;
  readonly blue: number;
  readonly white: number;
}

export type HintType = 'color' | 'rank';

export interface ColorHint {
  readonly type: 'color';
  readonly value: Color;
}

export interface RankHint {
  readonly type: 'rank';
  readonly value: Rank;
}

export type HintValue = ColorHint | RankHint;

export interface CardClue {
  readonly type: HintType;
  readonly value: Color | Rank;
  readonly turnGiven: number;
  readonly giverIndex: number;
}

export interface PlayerHand {
  readonly cards: readonly HeldCard[];
  readonly clues: readonly (readonly CardClue[])[];
}

export interface GameOptions {
  readonly numPlayers: number;
  readonly variant?: VariantName;
  readonly seed?: number;
}

export type VariantName = 'standard';

export interface GameState {
  readonly options: GameOptions;
  readonly deck: readonly Card[];
  readonly deckIndex: number;
  readonly hands: readonly PlayerHand[];
  readonly fireworks: Fireworks;
  readonly clueTokens: ClueTokens;
  readonly strikes: StrikeInfo;
  readonly currentPlayer: number;
  readonly turn: number;
  readonly turnsLeft: number | null; // null = deck not exhausted, number = countdown
  readonly discardPile: readonly Card[];
  readonly actions: readonly GameAction[];
  readonly status: GameStatus;
  readonly lastAction: GameAction | null;
  readonly cardIdCounter: number;
}

export type GameStatus = 'waiting' | 'playing' | 'finished';

// Actions
export interface PlayAction {
  readonly type: 'play';
  readonly playerIndex: number;
  readonly cardIndex: number;
}

export interface DiscardAction {
  readonly type: 'discard';
  readonly playerIndex: number;
  readonly cardIndex: number;
}

export interface HintAction {
  readonly type: 'hint';
  readonly playerIndex: number;
  readonly targetIndex: number;
  readonly hint: HintValue;
}

export type GameAction = PlayAction | DiscardAction | HintAction;

// Action results (for logging/replay)
export interface PlayResult {
  readonly type: 'play';
  readonly playerIndex: number;
  readonly cardIndex: number;
  readonly card: Card;
  readonly success: boolean;
  readonly bonusClue: boolean;
}

export interface DiscardResult {
  readonly type: 'discard';
  readonly playerIndex: number;
  readonly cardIndex: number;
  readonly card: Card;
}

export interface HintResult {
  readonly type: 'hint';
  readonly playerIndex: number;
  readonly targetIndex: number;
  readonly hint: HintValue;
  readonly touchedIndices: readonly number[];
}

export type ActionResult = PlayResult | DiscardResult | HintResult;

// Player view (information-restricted)
export interface PlayerViewCard {
  readonly id: number;
  readonly clues: readonly CardClue[];
  // color and rank are ONLY visible for other players' cards
  readonly color?: Color;
  readonly rank?: Rank;
}

export interface PlayerView {
  readonly options: GameOptions;
  readonly deckSize: number;
  readonly hands: readonly {
    readonly cards: readonly PlayerViewCard[];
  }[];
  readonly fireworks: Fireworks;
  readonly clueTokens: ClueTokens;
  readonly strikes: StrikeInfo;
  readonly currentPlayer: number;
  readonly turn: number;
  readonly turnsLeft: number | null;
  readonly status: GameStatus;
  readonly lastAction: GameAction | null;
  readonly actionHistory: readonly GameAction[];
  readonly myIndex: number;
  readonly legalActions: readonly GameAction[];
  readonly discardPile: readonly Card[];
}
