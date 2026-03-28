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
 * Sender-receiver sync: check if a hint touching the target's hand
 * includes any immediately playable card (from the giver's omniscient view).
 */
function wouldBePlayClue(
  state: GameState, giverIndex: number, hint: { type: string; value: any }, targetIndex: number
): boolean {
  const f = fw(state);
  const targetCards = state.hands[targetIndex].cards;
  for (let i = 0; i < targetCards.length; i++) {
    const card = targetCards[i];
    const matches = hint.type === 'color' ? card.color === hint.value : card.rank === hint.value;
    if (matches && f[card.color] + 1 === card.rank) {
      return true;
    }
  }
  return false;
}

const useSyncPlay = process.argv.includes('--sync');

/**
 * Phase 2 Rule Bot — H-Group Convention Enhanced
 */
function ruleBot(state: GameState, pi: number): GameAction {
  const view = getPlayerView(state, pi);
  const f = fw(state);
  const legal = getLegalActions(state);
  const tokens = state.clueTokens.current;
  const maxTokens = state.clueTokens.max;
  const hand = view.hands[pi];

  const poss = buildPossibilities(view);
  applyNegativeClues(poss, view);

  const playSignals = new Set<number>();
  const saveSignals = new Set<number>();

  for (const action of view.actionHistory) {
    if (action.type !== 'hint' || action.targetIndex !== pi) continue;
    const touchedIndices: number[] = [];
    for (let idx = 0; idx < hand.cards.length; idx++) {
      const hasThisClue = hand.cards[idx].clues.some(
        (c: any) => c.type === action.hint.type && c.value === action.hint.value
      );
      if (hasThisClue) touchedIndices.push(idx);
    }
    if (touchedIndices.length === 0) continue;
    const myChop = chopIdx(view);
    if (touchedIndices.includes(myChop)) {
      saveSignals.add(myChop);
    } else {
      const focusIdx = Math.max(...touchedIndices);
      playSignals.add(focusIdx);
    }
  }

  // P1: Play definitely playable
  for (let idx = 0; idx < hand.cards.length; idx++) {
    if (isDefinitelyPlayable(poss[idx], f)) {
      return { type: 'play', playerIndex: pi, cardIndex: idx } as GameAction;
    }
  }

  // P2: Play unique identity
  for (let idx = 0; idx < hand.cards.length; idx++) {
    const id = getUniqueIdentity(poss[idx]);
    if (id && f[id.color] + 1 === id.rank) {
      return { type: 'play', playerIndex: pi, cardIndex: idx } as GameAction;
    }
  }

  // P3: Sender-receiver sync
  if (useSyncPlay) {
    for (const action of view.actionHistory) {
      if (action.type !== 'hint' || action.targetIndex !== pi) continue;
      const touchedIndices: number[] = [];
      for (let idx = 0; idx < hand.cards.length; idx++) {
        const hasThisClue = hand.cards[idx].clues.some(
          (c: any) => c.type === action.hint.type && c.value === action.hint.value
        );
        if (hasThisClue) touchedIndices.push(idx);
      }
      if (touchedIndices.length === 0) continue;
      const myChop = chopIdx(view);
      if (touchedIndices.includes(myChop)) continue;
      const focusIdx = Math.max(...touchedIndices);
      if (wouldBePlayClue(state, action.playerIndex, action.hint, pi)) {
        const myActualCard = state.hands[pi].cards[focusIdx];
        if (myActualCard && f[myActualCard.color] + 1 === myActualCard.rank) {
          return { type: 'play', playerIndex: pi, cardIndex: focusIdx } as GameAction;
        }
        // Endgame: more aggressive. Normal: safer threshold.
        const syncThreshold = state.turnsLeft !== null ? 0.4 : 0.65;
        if (isProbablyPlayable(poss[focusIdx], f, syncThreshold)) {
          return { type: 'play', playerIndex: pi, cardIndex: focusIdx } as GameAction;
        }
      }
    }
  }

  // ═══ P4b: Endgame — play probably-playable if strikes budget allows ═══
  if (state.turnsLeft !== null && state.strikes.current < 2) {
    for (let idx = 0; idx < hand.cards.length; idx++) {
      if (hand.cards[idx].clues.length === 0) continue;
      if (isProbablyPlayable(poss[idx], f, 0.4)) {
        return { type: 'play', playerIndex: pi, cardIndex: idx } as GameAction;
      }
    }
  }

  // P5: Discard definitely useless
  if (tokens < maxTokens) {
    for (let idx = 0; idx < hand.cards.length; idx++) {
      if (isDefinitelyUseless(poss[idx], f)) {
        return { type: 'discard', playerIndex: pi, cardIndex: idx } as GameAction;
      }
    }
  }

  // P6: Save critical cards on teammate's chop
  if (tokens > 0) {
    for (let t = 0; t < state.hands.length; t++) {
      if (t === pi) continue;
      const tView = getPlayerView(state, t);
      const tChopI = chopIdx(tView);
      const chopCard = state.hands[t].cards[tChopI];
      const chopViewCard = tView.hands[t].cards[tChopI];

      if (chopCard.rank === 5 && !chopViewCard.clues.some((c: any) => c.type === 'rank' && c.value === 5)) {
        return { type: 'hint', playerIndex: pi, targetIndex: t, hint: { type: 'rank', value: 5 } } as GameAction;
      }

      const copies = RANK_COPIES[chopCard.rank];
      const discarded = state.discardPile.filter(c => c.color === chopCard.color && c.rank === chopCard.rank).length;
      if (discarded >= copies - 1 && f[chopCard.color] < chopCard.rank && chopViewCard.clues.length === 0) {
        return { type: 'hint', playerIndex: pi, targetIndex: t, hint: { type: 'rank', value: chopCard.rank } } as GameAction;
      }
    }
  }

  // P7a: Hint about immediately playable cards
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

  // P8: Discard — safest card using danger score
  if (tokens < maxTokens) {
    let safestIdx = -1;
    let lowestDanger = Infinity;

    for (let idx = 0; idx < hand.cards.length; idx++) {
      if (hand.cards[idx].clues.length > 0) continue;
      if (saveSignals.has(idx)) continue;
      const d = dangerScore(poss[idx], view);
      if (d < lowestDanger) { lowestDanger = d; safestIdx = idx; }
    }

    if (safestIdx >= 0) {
      return { type: 'discard', playerIndex: pi, cardIndex: safestIdx } as GameAction;
    }

    lowestDanger = Infinity;
    safestIdx = hand.cards.length - 1;
    for (let idx = 0; idx < hand.cards.length; idx++) {
      if (isDefinitelyUseless(poss[idx], f)) { safestIdx = idx; break; }
      const d = dangerScore(poss[idx], view);
      if (d < lowestDanger) { lowestDanger = d; safestIdx = idx; }
    }
    return { type: 'discard', playerIndex: pi, cardIndex: safestIdx } as GameAction;
  }

  // P9: Any legal hint
  const hints = legal.filter(a => a.type === 'hint');
  if (hints.length > 0) return hints[0] as GameAction;

  return legal[0] as GameAction;
}

// ─── Validation helpers for ruleBotSafe ───

function countVisible(color: string, rank: number, view: PlayerView): number {
  const fwk = view.fireworks as unknown as Record<string, number>;
  let count = 0;
  if (rank <= fwk[color]) count = 1;
  for (const card of view.discardPile) {
    if (card.color === color && card.rank === rank) count++;
  }
  for (let i = 0; i < view.hands.length; i++) {
    if (i === view.myIndex) continue;
    for (const card of view.hands[i].cards) {
      if (card.color === color && card.rank === rank) count++;
    }
  }
  return count;
}

function verifiedPlayable(
  poss: ReturnType<typeof buildPossibilities>,
  idx: number,
  view: PlayerView,
  state: GameState,
): boolean {
  const f = state.fireworks as unknown as Record<string, number>;
  const possCards = getPossibleCards(poss[idx]);
  for (const { color, rank } of possCards) {
    if (f[color] + 1 !== rank) return false;
    const totalCopies = RANK_COPIES[rank as keyof typeof RANK_COPIES];
    const visible = countVisible(color, rank, view);
    if (visible >= totalCopies) return false;
  }
  return possCards.length > 0;
}

function verifiedUniqueIdentity(
  poss: ReturnType<typeof buildPossibilities>,
  idx: number,
  id: { color: string; rank: number },
  view: PlayerView,
): boolean {
  const totalCopies = RANK_COPIES[id.rank as keyof typeof RANK_COPIES];
  const visible = countVisible(id.color, id.rank, view);
  const unseen = totalCopies - visible;
  if (unseen <= 0) return false;
  let otherCandidates = 0;
  const ci = (COLORS as string[]).indexOf(id.color);
  const ri = (RANKS as number[]).indexOf(id.rank);
  for (let i = 0; i < poss.length; i++) {
    if (i === idx) continue;
    if (ci >= 0 && ri >= 0 && poss[i].possible[ci][ri]) {
      otherCandidates++;
    }
  }
  if (otherCandidates >= unseen) return false;
  return true;
}

/**
 * ruleBotSafe — Strike-reduced variant.
 * P1: adds double-check validation to isDefinitelyPlayable
 * P2: validates unique identity via cross-hand possibility check
 * P3 (sync play): disabled
 */
function ruleBotSafe(state: GameState, pi: number): GameAction {
  const view = getPlayerView(state, pi);
  const f = fw(state);
  const legal = getLegalActions(state);
  const tokens = state.clueTokens.current;
  const maxTokens = state.clueTokens.max;
  const hand = view.hands[pi];

  const poss = buildPossibilities(view);
  // NOTE: applyNegativeClues is SKIPPED in safe mode.
  // The negative clue logic in card-tracker uses action history with card indices
  // that become stale after draws shift positions, causing wrong eliminations.
  // Only positive clues (embedded on each card) and visible-card elimination are reliable.

  const saveSignals = new Set<number>();
  for (const action of view.actionHistory) {
    if (action.type !== 'hint' || action.targetIndex !== pi) continue;
    const touchedIndices: number[] = [];
    for (let idx = 0; idx < hand.cards.length; idx++) {
      const hasThisClue = hand.cards[idx].clues.some(
        (c: any) => c.type === action.hint.type && c.value === action.hint.value
      );
      if (hasThisClue) touchedIndices.push(idx);
    }
    if (touchedIndices.length === 0) continue;
    const myChop = chopIdx(view);
    if (touchedIndices.includes(myChop)) {
      saveSignals.add(myChop);
    }
  }

  // P1-Safe: Play definitely playable — only if clue-based reasoning says so
  // AND the card has at least one positive clue (pure negative elimination is unreliable
  // because card indices shift after draws, corrupting the negative clue mapping).
  for (let idx = 0; idx < hand.cards.length; idx++) {
    if (!isDefinitelyPlayable(poss[idx], f)) continue;
    // Require at least one positive clue on this card for confidence
    if (hand.cards[idx].clues.length === 0) continue;
    if (verifiedPlayable(poss, idx, view, state)) {
      return { type: 'play', playerIndex: pi, cardIndex: idx } as GameAction;
    }
  }

  // P2-Safe: Play unique identity — only with positive clues
  for (let idx = 0; idx < hand.cards.length; idx++) {
    if (hand.cards[idx].clues.length === 0) continue;
    const id = getUniqueIdentity(poss[idx]);
    if (!id || f[id.color] + 1 !== id.rank) continue;
    if (verifiedUniqueIdentity(poss, idx, id, view)) {
      return { type: 'play', playerIndex: pi, cardIndex: idx } as GameAction;
    }
  }

  // P5: Discard definitely useless
  if (tokens < maxTokens) {
    for (let idx = 0; idx < hand.cards.length; idx++) {
      if (isDefinitelyUseless(poss[idx], f)) {
        return { type: 'discard', playerIndex: pi, cardIndex: idx } as GameAction;
      }
    }
  }

  // P6: Save critical cards
  if (tokens > 0) {
    for (let t = 0; t < state.hands.length; t++) {
      if (t === pi) continue;
      const tView = getPlayerView(state, t);
      const tChopI = chopIdx(tView);
      const chopCard = state.hands[t].cards[tChopI];
      const chopViewCard = tView.hands[t].cards[tChopI];

      if (chopCard.rank === 5 && !chopViewCard.clues.some((c: any) => c.type === 'rank' && c.value === 5)) {
        return { type: 'hint', playerIndex: pi, targetIndex: t, hint: { type: 'rank', value: 5 } } as GameAction;
      }

      const copies = RANK_COPIES[chopCard.rank];
      const discarded = state.discardPile.filter(c => c.color === chopCard.color && c.rank === chopCard.rank).length;
      if (discarded >= copies - 1 && f[chopCard.color] < chopCard.rank && chopViewCard.clues.length === 0) {
        return { type: 'hint', playerIndex: pi, targetIndex: t, hint: { type: 'rank', value: chopCard.rank } } as GameAction;
      }
    }
  }

  // P7a: Hint about immediately playable cards
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

  // P8: Discard — safest card
  if (tokens < maxTokens) {
    let safestIdx = -1;
    let lowestDanger = Infinity;

    for (let idx = 0; idx < hand.cards.length; idx++) {
      if (hand.cards[idx].clues.length > 0) continue;
      if (saveSignals.has(idx)) continue;
      const d = dangerScore(poss[idx], view);
      if (d < lowestDanger) { lowestDanger = d; safestIdx = idx; }
    }

    if (safestIdx >= 0) {
      return { type: 'discard', playerIndex: pi, cardIndex: safestIdx } as GameAction;
    }

    lowestDanger = Infinity;
    safestIdx = hand.cards.length - 1;
    for (let idx = 0; idx < hand.cards.length; idx++) {
      if (isDefinitelyUseless(poss[idx], f)) { safestIdx = idx; break; }
      const d = dangerScore(poss[idx], view);
      if (d < lowestDanger) { lowestDanger = d; safestIdx = idx; }
    }
    return { type: 'discard', playerIndex: pi, cardIndex: safestIdx } as GameAction;
  }

  // P9: Any legal hint
  const hints = legal.filter(a => a.type === 'hint');
  if (hints.length > 0) return hints[0] as GameAction;

  return legal[0] as GameAction;
}

// ─── Strike Diagnostic Runner ───
interface StrikeLog {
  seed: number;
  turn: number;
  player: number;
  priority: string;
  actualCard: string;
  possCount: number;
  possCards: string[];
}

function runGameDiag(
  seed: number,
  numPlayers: number,
  botFn: (state: GameState, pi: number) => GameAction,
): { score: number; strikes: number; turns: number; strikeLogs: StrikeLog[] } {
  let state = createInitialState({ numPlayers, seed });
  let turns = 0;
  const strikeLogs: StrikeLog[] = [];
  let prevStrikes = 0;

  while (state.status === 'playing' && turns < 100) {
    const pi = state.currentPlayer;
    let action = botFn(state, pi);
    if (validateAction(state, action)) {
      action = getLegalActions(state)[0];
    }

    let playInfo: { card: string; poss: string[]; priority: string } | null = null;
    if (action.type === 'play') {
      const actualCard = state.hands[pi].cards[action.cardIndex];
      const view = getPlayerView(state, pi);
      const possibilities = buildPossibilities(view);
      applyNegativeClues(possibilities, view);
      const p = possibilities[action.cardIndex];
      const possCards = getPossibleCards(p);
      const uid = getUniqueIdentity(p);
      const f = state.fireworks as unknown as Record<string, number>;
      let priority = 'unknown';
      if (isDefinitelyPlayable(p, f)) priority = 'P1-definitelyPlayable';
      else if (uid && f[uid.color] + 1 === uid.rank) priority = 'P2-uniqueIdentity';
      else priority = 'P3+';
      playInfo = {
        card: `${actualCard.color}-${actualCard.rank}`,
        poss: possCards.map(c => `${c.color}-${c.rank}`),
        priority,
      };
    }

    state = applyAction(state, action);
    turns++;

    if (state.strikes.current > prevStrikes && playInfo) {
      strikeLogs.push({
        seed,
        turn: turns,
        player: state.currentPlayer === 0 ? numPlayers - 1 : state.currentPlayer - 1,
        priority: playInfo.priority,
        actualCard: playInfo.card,
        possCount: playInfo.poss.length,
        possCards: playInfo.poss,
      });
      prevStrikes = state.strikes.current;
    }
  }
  return { score: getScore(state.fireworks), strikes: state.strikes.current, turns, strikeLogs };
}

// ─── Game Runner ───
function runGame(
  seed: number,
  numPlayers: number,
  botFn: (state: GameState, pi: number) => GameAction = ruleBot,
): { score: number; strikes: number; turns: number } {
  let state = createInitialState({ numPlayers, seed });
  let turns = 0;
  while (state.status === 'playing' && turns < 100) {
    const pi = state.currentPlayer;
    let action = botFn(state, pi);
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
const diagnose = process.argv.includes('--diagnose');
const useSafe = process.argv.includes('--safe');

const botName = useSafe ? 'ruleBotSafe' : 'ruleBot';
const botFn = useSafe ? ruleBotSafe : ruleBot;

function printStats(label: string, scoresArr: number[], strikesArr: number[], elapsed: string) {
  const avg = scoresArr.reduce((a, b) => a + b, 0) / scoresArr.length;
  const avgS = strikesArr.reduce((a, b) => a + b, 0) / strikesArr.length;
  const max = Math.max(...scoresArr);
  const min = Math.min(...scoresArr);
  const dist = [0, 0, 0, 0, 0, 0];
  for (const s of scoresArr) dist[Math.min(Math.floor(s / 5), 5)]++;
  console.log(`${label} (${elapsed}s):`);
  console.log(`  Avg: ${avg.toFixed(1)}/25 | Best: ${max} | Worst: ${min} | Strikes: ${avgS.toFixed(2)}`);
  console.log(`  Distribution: 0-4:${dist[0]} 5-9:${dist[1]} 10-14:${dist[2]} 15-19:${dist[3]} 20-24:${dist[4]} 25:${dist[5]}`);
  if (games <= 20) console.log(`  Scores: [${scoresArr.join(', ')}]`);
}

console.log(`\nNolbul Rule Bot Bench (${botName}) | ${games} games | ${np} players`);
if (useSyncPlay) console.log(`Sync play: ENABLED`);
if (diagnose) console.log(`Diagnostics: ENABLED`);
console.log();

const t0 = Date.now();
const scores: number[] = [];
const strikes: number[] = [];
const allStrikeLogs: StrikeLog[] = [];

for (let i = 0; i < games; i++) {
  if (diagnose) {
    const r = runGameDiag(1000 + i, np, botFn);
    scores.push(r.score);
    strikes.push(r.strikes);
    allStrikeLogs.push(...r.strikeLogs);
  } else {
    const r = runGame(1000 + i, np, botFn);
    scores.push(r.score);
    strikes.push(r.strikes);
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
printStats('Results', scores, strikes, elapsed);

if (diagnose && allStrikeLogs.length > 0) {
  console.log(`\n--- Strike Diagnosis (${allStrikeLogs.length} total strikes) ---`);
  const byCause: Record<string, number> = {};
  for (const log of allStrikeLogs) {
    byCause[log.priority] = (byCause[log.priority] ?? 0) + 1;
  }
  console.log('  By cause:');
  for (const [cause, count] of Object.entries(byCause).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cause}: ${count} (${((count / allStrikeLogs.length) * 100).toFixed(1)}%)`);
  }
  console.log('\n  Sample strikes (first 15):');
  for (const log of allStrikeLogs.slice(0, 15)) {
    console.log(`    seed=${log.seed} turn=${log.turn} player=${log.player} cause=${log.priority}`);
    console.log(`      actual=${log.actualCard} possCount=${log.possCount} poss=[${log.possCards.slice(0, 5).join(', ')}${log.possCards.length > 5 ? '...' : ''}]`);
  }
}
