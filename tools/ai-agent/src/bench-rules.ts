#!/usr/bin/env npx tsx
/**
 * Pure Rule-Based Benchmark — No LLM, runs 100+ games in seconds.
 * Uses CardTracker for informed decisions.
 */
import {
  createInitialState, applyAction, validateAction,
  getPlayerView, getScore, getLegalActions,
  COLORS, RANKS, RANK_COPIES,
} from '../../../packages/engine/dist/index.js';
import {
  buildPossibilities, applyNegativeClues, applyGoodTouchElimination, getUniqueIdentity,
  isDefinitelyPlayable, isProbablyPlayable, isDefinitelyUseless, dangerScore,
  getPossibleCards,
} from '../../../packages/engine/dist/card-tracker.js';
import type { GameState, GameAction, PlayerView } from '../../../packages/engine/dist/index.js';

const fw = (s: GameState) => s.fireworks as unknown as Record<string, number>;

function chopIdx(view: PlayerView): number {
  const hand = view.hands[view.myIndex];
  for (let i = hand.cards.length - 1; i >= 0; i--) {
    if (hand.cards[i].clues.length === 0) return i;
  }
  return hand.cards.length - 1;
}

/**
 * Phase 2 Rule Bot — H-Group Convention Enhanced
 *
 * Conventions:
 * - Good Touch: clued cards are useful, never discard them
 * - Focus: chop touched = save, newest touched = play signal
 * - Prompt: re-cluing = "play now"
 * - Possibility matrix for informed plays and safe discards
 */
function ruleBot(state: GameState, pi: number): GameAction {
  const view = getPlayerView(state, pi);
  const f = fw(state);
  const legal = getLegalActions(state);
  const tokens = state.clueTokens.current;
  const maxTokens = state.clueTokens.max;
  const hand = view.hands[pi];

  // Build possibility matrix with negative clue reasoning
  const poss = buildPossibilities(view);
  applyNegativeClues(poss, view);

  // ═══ Convention 1: Focus-based signal interpretation ═══
  // Scan action history for hints targeting me, determine play/save signals
  const playSignals = new Set<number>(); // card indices marked as "play"
  const saveSignals = new Set<number>(); // card indices marked as "save"

  for (const action of view.actionHistory) {
    if (action.type !== 'hint' || action.targetIndex !== pi) continue;

    // Find which cards were newly touched by this hint
    const touchedIndices: number[] = [];
    for (let idx = 0; idx < hand.cards.length; idx++) {
      const hasThisClue = hand.cards[idx].clues.some(
        (c: any) => c.type === action.hint.type && c.value === action.hint.value
      );
      if (hasThisClue) touchedIndices.push(idx);
    }

    if (touchedIndices.length === 0) continue; // empty hint

    // Focus: if chop (oldest unclued) was touched → save, else → play newest touched
    const myChop = chopIdx(view);
    if (touchedIndices.includes(myChop)) {
      saveSignals.add(myChop);
    } else {
      // Play signal on the newest touched card (highest index = newest draw)
      const focusIdx = Math.max(...touchedIndices);
      playSignals.add(focusIdx);
    }
  }

  // ═══ Convention: detect "newly clued" cards (play signals) ═══
  // A card that just received its FIRST clue on the previous turn is a play signal
  const recentlyClued: number[] = [];
  for (let idx = 0; idx < hand.cards.length; idx++) {
    const clues = hand.cards[idx].clues;
    if (clues.length > 0) {
      const newest = Math.max(...clues.map((c: any) => c.turnGiven));
      // Clued in the last round (within numPlayers turns)
      if (newest >= state.turn - state.hands.length) {
        recentlyClued.push(idx);
      }
    }
  }

  // ═══ P1: Play definitely playable (all possibilities playable) ═══
  for (let idx = 0; idx < hand.cards.length; idx++) {
    if (isDefinitelyPlayable(poss[idx], f)) {
      return { type: 'play', playerIndex: pi, cardIndex: idx } as GameAction;
    }
  }

  // ═══ P2: Play unique identity (deduced to exactly one card) ═══
  for (let idx = 0; idx < hand.cards.length; idx++) {
    const id = getUniqueIdentity(poss[idx]);
    if (id && f[id.color] + 1 === id.rank) {
      return { type: 'play', playerIndex: pi, cardIndex: idx } as GameAction;
    }
  }

  // ═══ P3: (Convention 1 play signals — disabled, net negative effect) ═══

  // ═══ P4: (Disabled — isProbablyPlayable causes too many strikes with Good Touch) ═══

  // ═══ P5: Discard definitely useless (Good Touch: only if no clues or deduced useless) ═══
  if (tokens < maxTokens) {
    for (let idx = 0; idx < hand.cards.length; idx++) {
      if (isDefinitelyUseless(poss[idx], f)) {
        return { type: 'discard', playerIndex: pi, cardIndex: idx } as GameAction;
      }
    }
  }

  // ═══ P6: Save critical cards on teammate's chop ═══
  if (tokens > 0) {
    for (let t = 0; t < state.hands.length; t++) {
      if (t === pi) continue;
      const tView = getPlayerView(state, t);
      const tChopI = chopIdx(tView);
      const chopCard = state.hands[t].cards[tChopI];
      const chopViewCard = tView.hands[t].cards[tChopI];

      // Save 5s on chop
      if (chopCard.rank === 5 && !chopViewCard.clues.some((c: any) => c.type === 'rank' && c.value === 5)) {
        return { type: 'hint', playerIndex: pi, targetIndex: t, hint: { type: 'rank', value: 5 } } as GameAction;
      }

      // Save critical cards (last copy, still needed)
      const copies = RANK_COPIES[chopCard.rank];
      const discarded = state.discardPile.filter(c => c.color === chopCard.color && c.rank === chopCard.rank).length;
      if (discarded >= copies - 1 && f[chopCard.color] < chopCard.rank && chopViewCard.clues.length === 0) {
        // Prefer rank hint for saves (H-Group convention)
        return { type: 'hint', playerIndex: pi, targetIndex: t, hint: { type: 'rank', value: chopCard.rank } } as GameAction;
      }
    }
  }

  // ═══ P7a: Hint about immediately playable cards (proven) ═══
  if (tokens > 0) {
    let bestHint: GameAction | null = null;
    let bestUnlocks = 0;

    for (let t = 0; t < state.hands.length; t++) {
      if (t === pi) continue;
      const tCards = state.hands[t].cards;
      const tView = getPlayerView(state, t);

      for (const color of COLORS as string[]) {
        let unlocks = 0;
        for (let ci = 0; ci < tCards.length; ci++) {
          if (tCards[ci].color !== color) continue;
          if (f[tCards[ci].color] + 1 !== tCards[ci].rank) continue;
          const knowsRank = tView.hands[t].cards[ci].clues.some((c: any) => c.type === 'rank' && c.value === tCards[ci].rank);
          unlocks += knowsRank ? 3 : 1;
        }
        if (unlocks > bestUnlocks) { bestUnlocks = unlocks; bestHint = { type: 'hint', playerIndex: pi, targetIndex: t, hint: { type: 'color', value: color } } as GameAction; }
      }
      for (const rank of RANKS as number[]) {
        let unlocks = 0;
        for (let ci = 0; ci < tCards.length; ci++) {
          if (tCards[ci].rank !== rank) continue;
          if (f[tCards[ci].color] + 1 !== tCards[ci].rank) continue;
          const knowsColor = tView.hands[t].cards[ci].clues.some((c: any) => c.type === 'color' && c.value === tCards[ci].color);
          unlocks += knowsColor ? 3 : 1;
        }
        if (unlocks > bestUnlocks) { bestUnlocks = unlocks; bestHint = { type: 'hint', playerIndex: pi, targetIndex: t, hint: { type: 'rank', value: rank } } as GameAction; }
      }
    }
    if (bestHint) return bestHint;
  }

  // P7b removed — future hints cause more harm than good without coordinated play signals

  // ═══ P8: Discard — safest card using danger score ═══
  // Good Touch: NEVER discard clued cards (they were clued for a reason)
  if (tokens < maxTokens) {
    let safestIdx = -1;
    let lowestDanger = Infinity;

    // First: only consider unclued cards
    for (let idx = 0; idx < hand.cards.length; idx++) {
      if (hand.cards[idx].clues.length > 0) continue; // Good Touch: keep clued cards
      if (saveSignals.has(idx)) continue; // Convention 1: keep saved cards
      const d = dangerScore(poss[idx], view);
      if (d < lowestDanger) { lowestDanger = d; safestIdx = idx; }
    }

    if (safestIdx >= 0) {
      return { type: 'discard', playerIndex: pi, cardIndex: safestIdx } as GameAction;
    }

    // All cards clued — forced to discard one. Pick definitely useless or lowest danger.
    lowestDanger = Infinity;
    safestIdx = hand.cards.length - 1;
    for (let idx = 0; idx < hand.cards.length; idx++) {
      if (isDefinitelyUseless(poss[idx], f)) { safestIdx = idx; break; }
      const d = dangerScore(poss[idx], view);
      if (d < lowestDanger) { lowestDanger = d; safestIdx = idx; }
    }
    return { type: 'discard', playerIndex: pi, cardIndex: safestIdx } as GameAction;
  }

  // ═══ P9: Any legal hint (tokens full, can't discard) ═══
  const hints = legal.filter(a => a.type === 'hint');
  if (hints.length > 0) return hints[0] as GameAction;

  return legal[0] as GameAction;
}

// ─── Game Runner ───
function runGame(seed: number, numPlayers: number): { score: number; strikes: number; turns: number } {
  let state = createInitialState({ numPlayers, seed });
  let turns = 0;
  while (state.status === 'playing' && turns < 100) {
    const pi = state.currentPlayer;
    let action = ruleBot(state, pi);
    if (validateAction(state, action)) {
      action = getLegalActions(state)[0];
    }
    state = applyAction(state, action);
    turns++;
  }
  return { score: getScore(state.fireworks), strikes: state.strikes.current, turns };
}

// ─── Main ───
const games = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--games') ?? '100', 10);
const np = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--players') ?? '2', 10);

console.log(`\nNolbul Rule Bot Bench | ${games} games | ${np} players\n`);

const t0 = Date.now();
const scores: number[] = [];
const strikes: number[] = [];

for (let i = 0; i < games; i++) {
  const r = runGame(1000 + i, np);
  scores.push(r.score);
  strikes.push(r.strikes);
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
const avgS = strikes.reduce((a, b) => a + b, 0) / strikes.length;
const max = Math.max(...scores);
const min = Math.min(...scores);
const dist = [0, 0, 0, 0, 0, 0]; // 0-4, 5-9, 10-14, 15-19, 20-24, 25
for (const s of scores) dist[Math.min(Math.floor(s / 5), 5)]++;

console.log(`Results (${elapsed}s):`);
console.log(`  Avg: ${avg.toFixed(1)}/25 | Best: ${max} | Worst: ${min} | Strikes: ${avgS.toFixed(2)}`);
console.log(`  Distribution: 0-4:${dist[0]} 5-9:${dist[1]} 10-14:${dist[2]} 15-19:${dist[3]} 20-24:${dist[4]} 25:${dist[5]}`);
if (games <= 20) console.log(`  Scores: [${scores.join(', ')}]`);
