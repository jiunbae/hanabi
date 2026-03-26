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

/**
 * Build possibility matrices for all cards in a player's own hand.
 */
export function buildPossibilities(view: PlayerView): CardPossibilities[] {
  const myHand = view.hands[view.myIndex];
  const fw = view.fireworks as unknown as Record<string, number>;

  // Count all visible cards (other hands + discard + fireworks)
  const seen = new Map<string, number>(); // "red-1" → count seen

  // Cards in fireworks (played successfully)
  for (const color of COLORS) {
    for (let r = 1; r <= fw[color]; r++) {
      const key = `${color}-${r}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }

  // Cards in discard pile
  for (const card of view.discardPile) {
    const key = `${card.color}-${card.rank}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }

  // Cards in other players' hands (visible to me)
  for (let i = 0; i < view.hands.length; i++) {
    if (i === view.myIndex) continue;
    for (const card of view.hands[i].cards) {
      if (card.color && card.rank) {
        const key = `${card.color}-${card.rank}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
  }

  // Build possibilities for each of my cards
  return myHand.cards.map((card) => {
    const possible: boolean[][] = Array.from({ length: 5 }, () => Array(5).fill(true));

    // Apply positive clues
    const knownColor = card.clues.find(c => c.type === 'color')?.value as string | undefined;
    const knownRank = card.clues.find(c => c.type === 'rank')?.value as number | undefined;

    if (knownColor) {
      // Eliminate all other colors
      for (const c of COLORS) {
        if (c !== knownColor) {
          for (let r = 0; r < 5; r++) possible[COLOR_IDX[c]][r] = false;
        }
      }
    }

    if (knownRank) {
      // Eliminate all other ranks
      for (let c = 0; c < 5; c++) {
        for (const r of RANKS) {
          if (r !== knownRank) possible[c][RANK_IDX[r]] = false;
        }
      }
    }

    // Eliminate based on visible cards (if all copies are seen, can't be this card)
    for (const color of COLORS) {
      for (const rank of RANKS) {
        const totalCopies = RANK_COPIES[rank];
        const key = `${color}-${rank}`;
        const seenCount = seen.get(key) ?? 0;
        if (seenCount >= totalCopies) {
          possible[COLOR_IDX[color]][RANK_IDX[rank]] = false;
        }
      }
    }

    // Count remaining possibilities
    let count = 0;
    for (let c = 0; c < 5; c++) {
      for (let r = 0; r < 5; r++) {
        if (possible[c][r]) count++;
      }
    }

    return { possible, count };
  });
}

/**
 * Apply negative information from action history.
 * When a color/rank hint is given to me and a card is NOT touched,
 * that card cannot be that color/rank.
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
      const wasTouched = card.clues.some(
        c => c.type === hintType && c.value === hintValue
      );

      if (!wasTouched) {
        // This card was NOT touched → it cannot be this color/rank
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
    }

    // Recount
    for (const p of possibilities) {
      p.count = 0;
      for (let c = 0; c < 5; c++) for (let r = 0; r < 5; r++) if (p.possible[c][r]) p.count++;
    }
  }
}

/**
 * Good Touch Elimination: clued cards can't be already-played cards.
 * A competent player never wastes a clue on a useless card, so any
 * clued card must still be needed.
 */
export function applyGoodTouchElimination(
  possibilities: CardPossibilities[],
  view: PlayerView,
): void {
  const fw = view.fireworks as unknown as Record<string, number>;

  for (let idx = 0; idx < possibilities.length; idx++) {
    const card = view.hands[view.myIndex].cards[idx];
    // Only apply to cards with at least one clue
    if (card.clues.length === 0) continue;

    for (let c = 0; c < 5; c++) {
      for (let r = 0; r < 5; r++) {
        if (!possibilities[idx].possible[c][r]) continue;
        // If this card identity is already played, eliminate it
        if (fw[COLORS[c]] >= RANKS[r]) {
          possibilities[idx].possible[c][r] = false;
        }
      }
    }

    // Recount
    possibilities[idx].count = 0;
    for (let c = 0; c < 5; c++) {
      for (let r = 0; r < 5; r++) {
        if (possibilities[idx].possible[c][r]) possibilities[idx].count++;
      }
    }
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

/**
 * Get all possible (color, rank) pairs for a card.
 */
export function getPossibleCards(p: CardPossibilities): { color: string; rank: number }[] {
  const result: { color: string; rank: number }[] = [];
  for (let c = 0; c < 5; c++) {
    for (let r = 0; r < 5; r++) {
      if (p.possible[c][r]) result.push({ color: COLORS[c], rank: RANKS[r] });
    }
  }
  return result;
}

/**
 * Check if a card is definitely playable (all possibilities are playable).
 */
export function isDefinitelyPlayable(p: CardPossibilities, fw: Record<string, number>): boolean {
  if (p.count === 0) return false;
  for (let c = 0; c < 5; c++) {
    for (let r = 0; r < 5; r++) {
      if (p.possible[c][r]) {
        if (fw[COLORS[c]] + 1 !== RANKS[r]) return false; // not playable
      }
    }
  }
  return true;
}

/**
 * Check if a card is probably playable (most possibilities are playable).
 */
export function isProbablyPlayable(p: CardPossibilities, fw: Record<string, number>, threshold = 0.7): boolean {
  if (p.count === 0) return false;
  let playableCount = 0;
  for (let c = 0; c < 5; c++) {
    for (let r = 0; r < 5; r++) {
      if (p.possible[c][r] && fw[COLORS[c]] + 1 === RANKS[r]) playableCount++;
    }
  }
  return playableCount / p.count >= threshold;
}

/**
 * Check if a card is definitely useless (all possibilities already played).
 */
export function isDefinitelyUseless(p: CardPossibilities, fw: Record<string, number>): boolean {
  if (p.count === 0) return true;
  for (let c = 0; c < 5; c++) {
    for (let r = 0; r < 5; r++) {
      if (p.possible[c][r]) {
        if (fw[COLORS[c]] < RANKS[r]) return false; // still needed
      }
    }
  }
  return true;
}

/**
 * Calculate "danger score" — how critical this card might be.
 * Higher = more dangerous to discard.
 */
export function dangerScore(p: CardPossibilities, view: PlayerView): number {
  const fw = view.fireworks as unknown as Record<string, number>;
  let maxDanger = 0;

  for (let c = 0; c < 5; c++) {
    for (let r = 0; r < 5; r++) {
      if (!p.possible[c][r]) continue;
      const color = COLORS[c];
      const rank = RANKS[r];

      if (fw[color] >= rank) continue; // already played, no danger

      // Check if this is the last copy
      const totalCopies = RANK_COPIES[rank];
      const discarded = view.discardPile.filter(
        card => card.color === color && card.rank === rank
      ).length;
      const remaining = totalCopies - discarded;

      if (remaining <= 1) maxDanger = Math.max(maxDanger, 10); // critical!
      if (rank === 5) maxDanger = Math.max(maxDanger, 10); // 5s are always critical
      if (fw[color] + 1 === rank) maxDanger = Math.max(maxDanger, 5); // immediately needed
    }
  }

  return maxDanger;
}
