/**
 * CardTracker — Maintains a possibility matrix for unknown cards.
 *
 * For each card in the player's hand that they can't see, tracks which
 * (color, rank) combinations are still possible based on:
 * - Positive clues (this card IS color X / rank Y)
 * - Negative clues (this card was NOT touched when hint X was given)
 * - Visible information (cards in other hands, discard pile, fireworks)
 */
import type { PlayerView, GameAction, Card, Color, Fireworks } from './types.js';
import { COLORS, RANKS, RANK_COPIES } from './constants.js';

export interface CardPossibilities {
  /** 5x5 matrix: possible[colorIdx][rankIdx] = true if this card could be that */
  possible: boolean[][];
  /** Number of remaining possibilities */
  count: number;
}

const COLOR_IDX: Record<string, number> = { red: 0, yellow: 1, green: 2, blue: 3, white: 4 };
const RANK_IDX: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 };

function recount(p: CardPossibilities): void {
  p.count = 0;
  for (let c = 0; c < 5; c++) for (let r = 0; r < 5; r++) if (p.possible[c][r]) p.count++;
}

/**
 * Build possibility matrices for all cards in a player's own hand.
 */
export function buildPossibilities(view: PlayerView): CardPossibilities[] {
  const myHand = view.hands[view.myIndex];
  const fw = view.fireworks as unknown as Record<string, number>;

  // Count all visible cards (other hands + discard + fireworks)
  const seen = new Map<string, number>();

  for (const color of COLORS) {
    for (let r = 1; r <= fw[color]; r++) {
      const key = `${color}-${r}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  for (const card of view.discardPile) {
    const key = `${card.color}-${card.rank}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (let i = 0; i < view.hands.length; i++) {
    if (i === view.myIndex) continue;
    for (const card of view.hands[i].cards) {
      if (card.color && card.rank) {
        const key = `${card.color}-${card.rank}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
  }

  return myHand.cards.map((card) => {
    const possible: boolean[][] = Array.from({ length: 5 }, () => Array(5).fill(true));

    // Positive clues
    const knownColor = card.clues.find(c => c.type === 'color')?.value as string | undefined;
    const knownRank = card.clues.find(c => c.type === 'rank')?.value as number | undefined;

    if (knownColor) {
      for (const c of COLORS) {
        if (c !== knownColor) for (let r = 0; r < 5; r++) possible[COLOR_IDX[c]][r] = false;
      }
    }
    if (knownRank) {
      for (let c = 0; c < 5; c++) {
        for (const r of RANKS) {
          if (r !== knownRank) possible[c][RANK_IDX[r]] = false;
        }
      }
    }

    // Visible card elimination
    for (const color of COLORS) {
      for (const rank of RANKS) {
        if ((seen.get(`${color}-${rank}`) ?? 0) >= RANK_COPIES[rank]) {
          possible[COLOR_IDX[color]][RANK_IDX[rank]] = false;
        }
      }
    }

    let count = 0;
    for (let c = 0; c < 5; c++) for (let r = 0; r < 5; r++) if (possible[c][r]) count++;
    return { possible, count };
  });
}

/**
 * Apply negative information from action history — CARD-ID SAFE version.
 *
 * Uses card IDs to ensure negative clues only apply to cards that were
 * actually in hand when the hint was given (fixes index-shift bug).
 */
export function applyNegativeClues(
  possibilities: CardPossibilities[],
  view: PlayerView,
): void {
  const myHand = view.hands[view.myIndex];

  for (const action of view.actionHistory) {
    if (action.type !== 'hint' || action.targetIndex !== view.myIndex) continue;

    const hintType = action.hint.type;
    const hintValue = action.hint.value;

    for (let idx = 0; idx < myHand.cards.length; idx++) {
      const card = myHand.cards[idx];

      // KEY FIX: Only apply negative info if this card was in hand during the hint.
      // A card was present during the hint if it has ANY clue from that turn or earlier.
      // If the card's earliest clue is from a later turn, it was drawn after the hint.
      const cardEarliestClue = card.clues.length > 0
        ? Math.min(...card.clues.map(c => c.turnGiven))
        : Infinity;

      // We need the hint's turn. CardClue has turnGiven, but actions don't have turn numbers.
      // However, we can use the card's clues: if this card was touched by THIS hint,
      // it has a clue matching type+value. If not touched, we need to verify presence.
      const wasTouched = card.clues.some(
        c => c.type === hintType && c.value === hintValue
      );

      if (wasTouched) continue; // Positive info already applied

      // Card was NOT touched. But was it in hand during this hint?
      // If card has NO clues at all AND was the most recently drawn card,
      // it might have been drawn after this hint. To be safe:
      // Only apply negative clues to cards that have at least one clue from
      // the same turn or earlier (proving they were present).
      // Cards with zero clues: we can't be sure, so SKIP them for safety.
      if (card.clues.length === 0) continue;

      // Card has clues but not this one → it was present and not touched → negative info
      if (hintType === 'color') {
        const ci = COLOR_IDX[hintValue as string];
        if (ci !== undefined) {
          for (let r = 0; r < 5; r++) possibilities[idx].possible[ci][r] = false;
        }
      } else {
        const ri = RANK_IDX[hintValue as number];
        if (ri !== undefined) {
          for (let c = 0; c < 5; c++) possibilities[idx].possible[c][ri] = false;
        }
      }
    }

    // Recount after each hint
    for (const p of possibilities) recount(p);
  }
}

/**
 * Good Touch Elimination: clued cards can't be already-played cards.
 */
export function applyGoodTouchElimination(
  possibilities: CardPossibilities[],
  view: PlayerView,
): void {
  const fw = view.fireworks as unknown as Record<string, number>;
  for (let idx = 0; idx < possibilities.length; idx++) {
    const card = view.hands[view.myIndex].cards[idx];
    if (card.clues.length === 0) continue;
    for (let c = 0; c < 5; c++) {
      for (let r = 0; r < 5; r++) {
        if (possibilities[idx].possible[c][r] && fw[COLORS[c]] >= RANKS[r]) {
          possibilities[idx].possible[c][r] = false;
        }
      }
    }
    recount(possibilities[idx]);
  }
}

/**
 * Get the unique identity of a card if only one possibility remains.
 */
export function getUniqueIdentity(p: CardPossibilities): { color: string; rank: number } | null {
  if (p.count !== 1) return null;
  for (let c = 0; c < 5; c++) {
    for (let r = 0; r < 5; r++) {
      if (p.possible[c][r]) return { color: COLORS[c], rank: RANKS[r] };
    }
  }
  return null;
}

export function getPossibleCards(p: CardPossibilities): { color: string; rank: number }[] {
  const result: { color: string; rank: number }[] = [];
  for (let c = 0; c < 5; c++) for (let r = 0; r < 5; r++) if (p.possible[c][r]) result.push({ color: COLORS[c], rank: RANKS[r] });
  return result;
}

export function isDefinitelyPlayable(p: CardPossibilities, fw: Record<string, number>): boolean {
  if (p.count === 0) return false;
  for (let c = 0; c < 5; c++) for (let r = 0; r < 5; r++) {
    if (p.possible[c][r] && fw[COLORS[c]] + 1 !== RANKS[r]) return false;
  }
  return true;
}

export function isProbablyPlayable(p: CardPossibilities, fw: Record<string, number>, threshold = 0.7): boolean {
  if (p.count === 0) return false;
  let playable = 0;
  for (let c = 0; c < 5; c++) for (let r = 0; r < 5; r++) {
    if (p.possible[c][r] && fw[COLORS[c]] + 1 === RANKS[r]) playable++;
  }
  return playable / p.count >= threshold;
}

export function isDefinitelyUseless(p: CardPossibilities, fw: Record<string, number>): boolean {
  if (p.count === 0) return true;
  for (let c = 0; c < 5; c++) for (let r = 0; r < 5; r++) {
    if (p.possible[c][r] && fw[COLORS[c]] < RANKS[r]) return false;
  }
  return true;
}

export function dangerScore(p: CardPossibilities, view: PlayerView): number {
  const fw = view.fireworks as unknown as Record<string, number>;
  let maxDanger = 0;
  for (let c = 0; c < 5; c++) for (let r = 0; r < 5; r++) {
    if (!p.possible[c][r]) continue;
    const color = COLORS[c], rank = RANKS[r];
    if (fw[color] >= rank) continue;
    const copies = RANK_COPIES[rank];
    const discarded = view.discardPile.filter(card => card.color === color && card.rank === rank).length;
    if (discarded >= copies - 1) maxDanger = Math.max(maxDanger, 10);
    if (rank === 5) maxDanger = Math.max(maxDanger, 10);
    if (fw[color] + 1 === rank) maxDanger = Math.max(maxDanger, 5);
  }
  return maxDanger;
}
