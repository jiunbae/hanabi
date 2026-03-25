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
  buildPossibilities, applyNegativeClues, getUniqueIdentity,
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
 * Rule-based strategy using CardTracker possibility matrix.
 */
function ruleBot(state: GameState, pi: number): GameAction {
  const view = getPlayerView(state, pi);
  const f = fw(state);
  const legal = getLegalActions(state);
  const tokens = state.clueTokens.current;
  const maxTokens = state.clueTokens.max;
  const hand = view.hands[pi];

  // Build and refine possibility matrix
  const poss = buildPossibilities(view);
  applyNegativeClues(poss, view);

  // ═══ P1: Play definitely playable cards ═══
  for (let idx = 0; idx < hand.cards.length; idx++) {
    if (isDefinitelyPlayable(poss[idx], f)) {
      return { type: 'play', playerIndex: pi, cardIndex: idx } as GameAction;
    }
  }

  // ═══ P2: Play probably playable (≥80% chance) ═══
  for (let idx = 0; idx < hand.cards.length; idx++) {
    if (isProbablyPlayable(poss[idx], f, 0.8)) {
      return { type: 'play', playerIndex: pi, cardIndex: idx } as GameAction;
    }
  }

  // ═══ P3: Play cards with unique identity that's playable ═══
  for (let idx = 0; idx < hand.cards.length; idx++) {
    const id = getUniqueIdentity(poss[idx]);
    if (id && f[id.color] + 1 === id.rank) {
      return { type: 'play', playerIndex: pi, cardIndex: idx } as GameAction;
    }
  }

  // ═══ P4: Discard definitely useless cards (free token) ═══
  if (tokens < maxTokens) {
    for (let idx = 0; idx < hand.cards.length; idx++) {
      if (isDefinitelyUseless(poss[idx], f)) {
        return { type: 'discard', playerIndex: pi, cardIndex: idx } as GameAction;
      }
    }
  }

  // ═══ P5: Save critical cards on teammate's chop ═══
  if (tokens > 0) {
    for (let t = 0; t < state.hands.length; t++) {
      if (t === pi) continue;
      const tView = getPlayerView(state, t);
      const tChop = chopIdx(tView);
      const chopCard = state.hands[t].cards[tChop];

      // Save 5s
      if (chopCard.rank === 5 && !tView.hands[t].cards[tChop].clues.some((c: any) => c.type === 'rank' && c.value === 5)) {
        return { type: 'hint', playerIndex: pi, targetIndex: t, hint: { type: 'rank', value: 5 } } as GameAction;
      }
      // Save last copies
      const copies = RANK_COPIES[chopCard.rank];
      const discarded = state.discardPile.filter(c => c.color === chopCard.color && c.rank === chopCard.rank).length;
      if (discarded >= copies - 1 && f[chopCard.color] < chopCard.rank && tView.hands[t].cards[tChop].clues.length === 0) {
        return { type: 'hint', playerIndex: pi, targetIndex: t, hint: { type: 'rank', value: chopCard.rank } } as GameAction;
      }
    }
  }

  // ═══ P6: Smart hint — maximize playable card unlocks ═══
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
          unlocks += knowsRank ? 3 : 1; // completing info = 3x value
        }
        if (unlocks > bestUnlocks) {
          bestUnlocks = unlocks;
          bestHint = { type: 'hint', playerIndex: pi, targetIndex: t, hint: { type: 'color', value: color } } as GameAction;
        }
      }
      for (const rank of RANKS as number[]) {
        let unlocks = 0;
        for (let ci = 0; ci < tCards.length; ci++) {
          if (tCards[ci].rank !== rank) continue;
          if (f[tCards[ci].color] + 1 !== tCards[ci].rank) continue;
          const knowsColor = tView.hands[t].cards[ci].clues.some((c: any) => c.type === 'color' && c.value === tCards[ci].color);
          unlocks += knowsColor ? 3 : 1;
        }
        if (unlocks > bestUnlocks) {
          bestUnlocks = unlocks;
          bestHint = { type: 'hint', playerIndex: pi, targetIndex: t, hint: { type: 'rank', value: rank } } as GameAction;
        }
      }
    }
    if (bestHint) return bestHint;
  }

  // ═══ P7: Discard safest card (lowest danger score) ═══
  if (tokens < maxTokens) {
    let safestIdx = -1;
    let lowestDanger = Infinity;
    for (let idx = 0; idx < hand.cards.length; idx++) {
      if (hand.cards[idx].clues.length > 0) continue; // prefer unclued
      const d = dangerScore(poss[idx], view);
      if (d < lowestDanger) { lowestDanger = d; safestIdx = idx; }
    }
    if (safestIdx >= 0) {
      return { type: 'discard', playerIndex: pi, cardIndex: safestIdx } as GameAction;
    }
    // All cards clued — discard the one with lowest danger regardless
    lowestDanger = Infinity;
    safestIdx = hand.cards.length - 1;
    for (let idx = 0; idx < hand.cards.length; idx++) {
      const d = dangerScore(poss[idx], view);
      if (d < lowestDanger) { lowestDanger = d; safestIdx = idx; }
    }
    return { type: 'discard', playerIndex: pi, cardIndex: safestIdx } as GameAction;
  }

  // ═══ P8: Any legal hint ═══
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
