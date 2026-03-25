#!/usr/bin/env npx tsx
/**
 * Bench v2 — Advanced experiments for Nolbul AI.
 *
 * E: Smart hint selection (pick hint that unlocks most playable cards)
 * F: Multi-turn lookahead (simulate next turn to evaluate actions)
 * G: GPT-5 full model (bigger model, same engine)
 * H: LLM-only (no smart guard — pure LLM decision, validated only)
 * D: V2 baseline (control)
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  createInitialState, applyAction, validateAction,
  getPlayerView, getScore, getLegalActions, buildAIContext,
  COLORS, RANKS,
} from '../../../packages/engine/dist/index.js';
import type { GameState, GameAction, PlayerView } from '../../../packages/engine/dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NANO_KEY = JSON.parse(readFileSync(join(process.env.HOME!, 'keys/openai.azure.com/gpt-5-nano.json'), 'utf-8'))[0];
const GPT5_KEY = JSON.parse(readFileSync(join(process.env.HOME!, 'keys/openai.azure.com/gpt-5.json'), 'utf-8'))[0];
const PROMPT_CFG = JSON.parse(readFileSync(join(__dirname, '../../../apps/server/src/config/ai-prompts.json'), 'utf-8'));

console.log('Bench v2 starting...');

// ─── LLM ───
async function llm(endpoint: string, key: string, sys: string, user: string): Promise<string> {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': key },
    body: JSON.stringify({ messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], max_completion_tokens: 16384 }),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}`);
  return ((await r.json()) as any).choices[0]?.message?.content ?? '';
}
const nanoLLM = (sys: string, user: string) => llm(NANO_KEY.endpoint, NANO_KEY.key, sys, user);
const gpt5LLM = (sys: string, user: string) => llm(GPT5_KEY.endpoint, GPT5_KEY.key, sys, user);

function parseAction(text: string, pi: number): GameAction {
  const s = text.indexOf('{');
  if (s === -1) throw new Error('No JSON');
  let d = 0;
  for (let i = s; i < text.length; i++) { if (text[i] === '{') d++; else if (text[i] === '}') d--; if (d === 0) { const r = JSON.parse(text.slice(s, i + 1)); return r.type === 'hint' ? { type: 'hint', playerIndex: pi, targetIndex: r.targetIndex, hint: { type: r.hint.type, value: r.hint.value } } as GameAction : { type: r.type, playerIndex: pi, cardIndex: r.cardIndex ?? 0 } as GameAction; } }
  throw new Error('Bad JSON');
}

// ─── Helpers ───
const fwMap = (s: GameState) => s.fireworks as unknown as Record<string, number>;

function clueInfo(state: GameState, pi: number, idx: number) {
  const v = getPlayerView(state, pi);
  const c = v.hands[pi].cards[idx];
  return {
    color: c.clues.find((x: any) => x.type === 'color')?.value as string | undefined,
    rank: c.clues.find((x: any) => x.type === 'rank')?.value as number | undefined,
    count: c.clues.length,
    recentColor: c.clues.some((x: any) => x.type === 'color' && x.turnGiven >= state.turn - 2),
  };
}

function chopIdx(state: GameState, pi: number): number {
  const v = getPlayerView(state, pi);
  for (let i = v.hands[pi].cards.length - 1; i >= 0; i--) if (v.hands[pi].cards[i].clues.length === 0) return i;
  return state.hands[pi].cards.length - 1;
}

function rankPlayable(f: Record<string, number>, rank: number, th: number): boolean {
  if (rank === 1) return Object.values(f).some(v => v === 0);
  return Object.values(f).filter(v => v + 1 === rank).length >= th;
}

// ─── V2 Base Strategy ───
function baseStrategy(state: GameState, pi: number): GameAction {
  const f = fwMap(state);
  const hand = state.hands[pi];
  const legal = getLegalActions(state);
  const tokens = state.clueTokens.current;
  const maxT = state.clueTokens.max;

  // P1: Known playable
  for (let i = 0; i < hand.cards.length; i++) {
    const { color, rank } = clueInfo(state, pi, i);
    if (color && rank && f[color] + 1 === rank) return { type: 'play', playerIndex: pi, cardIndex: i } as GameAction;
  }
  for (let i = 0; i < hand.cards.length; i++) {
    const { color, rank, recentColor } = clueInfo(state, pi, i);
    if (color && !rank && recentColor && f[color] + 1 <= 5) return { type: 'play', playerIndex: pi, cardIndex: i } as GameAction;
  }
  for (let i = 0; i < hand.cards.length; i++) {
    const { color, rank } = clueInfo(state, pi, i);
    if (!color && rank && rankPlayable(f, rank, 3)) return { type: 'play', playerIndex: pi, cardIndex: i } as GameAction;
  }
  // P2: Discard useless
  if (tokens < maxT) {
    for (let i = 0; i < hand.cards.length; i++) {
      const { color, rank } = clueInfo(state, pi, i);
      if (color && rank && f[color] >= rank) return { type: 'discard', playerIndex: pi, cardIndex: i } as GameAction;
    }
  }
  // P3: Save critical
  if (tokens > 0) {
    for (let t = 0; t < state.hands.length; t++) {
      if (t === pi) continue;
      const ci = chopIdx(state, t);
      const cc = state.hands[t].cards[ci];
      const tv = getPlayerView(state, t);
      if (cc.rank === 5 && !tv.hands[t].cards[ci].clues.some((c: any) => c.type === 'rank' && c.value === 5))
        return { type: 'hint', playerIndex: pi, targetIndex: t, hint: { type: 'rank', value: 5 } } as GameAction;
      const copies = cc.rank === 1 ? 3 : 2;
      if (state.discardPile.filter(c => c.color === cc.color && c.rank === cc.rank).length >= copies - 1 && f[cc.color] < cc.rank && tv.hands[t].cards[ci].clues.length === 0)
        return { type: 'hint', playerIndex: pi, targetIndex: t, hint: { type: 'rank', value: cc.rank } } as GameAction;
    }
  }
  // P4: Hint playable
  if (tokens > 0) {
    let best: GameAction | null = null, bs = -1;
    for (let t = 0; t < state.hands.length; t++) {
      if (t === pi) continue;
      for (let ci = 0; ci < state.hands[t].cards.length; ci++) {
        const c = state.hands[t].cards[ci];
        if (f[c.color] + 1 !== c.rank) continue;
        const tv = getPlayerView(state, t).hands[t].cards[ci];
        const kc = tv.clues.some((x: any) => x.type === 'color' && x.value === c.color);
        const kr = tv.clues.some((x: any) => x.type === 'rank' && x.value === c.rank);
        if (kc && kr) continue;
        const sc = (6 - c.rank) * 10 + (kr ? 0 : 5);
        if (sc > bs) { bs = sc; best = !kr ? { type: 'hint', playerIndex: pi, targetIndex: t, hint: { type: 'rank', value: c.rank } } as GameAction : { type: 'hint', playerIndex: pi, targetIndex: t, hint: { type: 'color', value: c.color } } as GameAction; }
      }
    }
    if (best) return best;
  }
  // P5: Discard
  if (tokens <= 3 && tokens < maxT) {
    const ci = chopIdx(state, pi);
    const v = getPlayerView(state, pi);
    if (v.hands[pi].cards[ci].clues.length === 0) return { type: 'discard', playerIndex: pi, cardIndex: ci } as GameAction;
  }
  // P6-8
  if (legal.some(a => a.type === 'discard')) return { type: 'discard', playerIndex: pi, cardIndex: chopIdx(state, pi) } as GameAction;
  return legal[0] as GameAction;
}

function baseSafe(a: GameAction, state: GameState, pi: number): boolean {
  if (a.type !== 'play') return true;
  const { color, rank, recentColor } = clueInfo(state, pi, a.cardIndex);
  const f = fwMap(state);
  if (color && rank) return f[color] + 1 === rank;
  if (!color && rank) return rankPlayable(f, rank, 3);
  if (color && !rank) return recentColor && f[color] + 1 <= 5;
  return false;
}

// ─── Exp E: Smart Hint Selection ───
function smartHintStrategy(state: GameState, pi: number): GameAction {
  const f = fwMap(state);
  const tokens = state.clueTokens.current;

  // Same play/discard logic as base
  const base = baseStrategy(state, pi);
  if (base.type === 'play' || (base.type === 'discard' && tokens >= state.clueTokens.max)) return base;

  // Enhanced hint: score by how many NEW playable cards the hint unlocks
  if (tokens > 0) {
    let bestHint: GameAction | null = null, bestUnlocks = -1;

    for (let t = 0; t < state.hands.length; t++) {
      if (t === pi) continue;
      const tCards = state.hands[t].cards;
      const tv = getPlayerView(state, t);

      // Try each possible hint
      for (const color of COLORS as string[]) {
        let unlocks = 0;
        for (let ci = 0; ci < tCards.length; ci++) {
          if (tCards[ci].color !== color) continue;
          const vc = tv.hands[t].cards[ci];
          const kr = vc.clues.some((c: any) => c.type === 'rank' && c.value === tCards[ci].rank);
          // This hint would give them color info; if they already know rank, they can play
          if (kr && f[tCards[ci].color] + 1 === tCards[ci].rank) unlocks++;
          // This hint would be first clue on a playable card
          if (vc.clues.length === 0 && f[tCards[ci].color] + 1 === tCards[ci].rank) unlocks += 0.5;
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
          const vc = tv.hands[t].cards[ci];
          const kc = vc.clues.some((c: any) => c.type === 'color' && c.value === tCards[ci].color);
          if (kc && f[tCards[ci].color] + 1 === tCards[ci].rank) unlocks++;
          if (vc.clues.length === 0 && f[tCards[ci].color] + 1 === tCards[ci].rank) unlocks += 0.5;
        }
        if (unlocks > bestUnlocks) {
          bestUnlocks = unlocks;
          bestHint = { type: 'hint', playerIndex: pi, targetIndex: t, hint: { type: 'rank', value: rank } } as GameAction;
        }
      }
    }
    if (bestHint && bestUnlocks > 0) return bestHint;
  }

  return base; // fallback to base
}

// ─── Exp F: Lookahead ───
function lookaheadStrategy(state: GameState, pi: number): GameAction {
  const legal = getLegalActions(state);
  const f = fwMap(state);

  // Score each legal action by simulating 1 step
  let bestAction = baseStrategy(state, pi);
  let bestScore = -999;

  // Only evaluate top candidates to keep it fast
  const candidates = [bestAction, ...legal.filter(a => a.type === 'play' || a.type === 'hint').slice(0, 5)];

  for (const action of candidates) {
    if (validateAction(state, action)) continue;
    if (action.type === 'play' && !baseSafe(action, state, pi)) continue;

    try {
      const nextState = applyAction(state, action);
      const nextScore = getScore(nextState.fireworks);
      const strikePenalty = nextState.strikes.current * 5;
      // Bonus for keeping tokens balanced
      const tokenBonus = Math.min(nextState.clueTokens.current, 4) * 0.5;
      const totalScore = nextScore - strikePenalty + tokenBonus;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestAction = action;
      }
    } catch {}
  }

  return bestAction;
}

// ─── Experiments ───
interface Exp {
  name: string;
  desc: string;
  sys: string;
  callLLM: (s: string, u: string) => Promise<string>;
  strat: (state: GameState, pi: number) => GameAction;
  safe: (a: GameAction, state: GameState, pi: number) => boolean;
}

const SYS = PROMPT_CFG.system.default;

const exps: Record<string, Exp> = {
  D: { name: 'V2 baseline (nano)', desc: 'Control — current prod',
    sys: SYS, callLLM: nanoLLM, strat: baseStrategy, safe: baseSafe },
  E: { name: 'Smart hint select', desc: 'Pick hint that unlocks most playable cards',
    sys: SYS, callLLM: nanoLLM, strat: smartHintStrategy, safe: baseSafe },
  F: { name: 'Lookahead (1-step)', desc: 'Simulate each action 1 turn ahead, pick best score',
    sys: SYS, callLLM: nanoLLM, strat: lookaheadStrategy, safe: baseSafe },
  G: { name: 'GPT-5 full model', desc: 'Same engine, bigger LLM',
    sys: SYS, callLLM: gpt5LLM, strat: baseStrategy, safe: baseSafe },
  H: { name: 'LLM-only (no guard)', desc: 'Pure LLM decisions — only validate legality, no safe check',
    sys: SYS + '\n\nIMPORTANT: You must make your OWN decision. Do NOT just follow the recommendation blindly. Analyze the game state and choose the best action.',
    callLLM: nanoLLM,
    strat: baseStrategy, // fallback only if LLM fails
    safe: (_a, _s, _p) => true }, // accept everything from LLM
};

// ─── Runner ───
async function run(exp: Exp, np: number, seed: number) {
  let state = createInitialState({ numPlayers: np, seed });
  const at: Record<string, number> = {};
  let turns = 0, llmUsed = 0, smartUsed = 0;

  while (state.status === 'playing' && turns < 80) {
    const pi = state.currentPlayer;
    const view = getPlayerView(state, pi);
    const smartAction = exp.strat(state, pi);
    let action = smartAction;

    try {
      const prompt = buildAIContext(view, { includeRules: turns < np });
      const txt = await exp.callLLM(exp.sys, prompt);
      const la = parseAction(txt, pi);
      if (!validateAction(state, la) && exp.safe(la, state, pi)) {
        action = la;
        llmUsed++;
      } else {
        smartUsed++;
      }
    } catch { smartUsed++; }

    if (validateAction(state, action)) action = getLegalActions(state)[0];
    state = applyAction(state, action);
    at[action.type] = (at[action.type] ?? 0) + 1;
    turns++;
  }
  return { score: getScore(state.fireworks), strikes: state.strikes.current, turns, at, llmUsed, smartUsed };
}

// ─── Main ───
const args = process.argv.slice(2);
const expArg = args.find((_, i, a) => a[i - 1] === '--exp') ?? 'D,E,F,G,H';
const games = parseInt(args.find((_, i, a) => a[i - 1] === '--games') ?? '3', 10);

console.log(`\n${'═'.repeat(60)}`);
console.log(`NOLBUL BENCH v2 | Exps: ${expArg} | Games: ${games}`);
console.log(`${'═'.repeat(60)}\n`);

type Result = { n: string; scores: number[]; strikes: number[]; llm: number; smart: number };
const results: Result[] = [];

for (const id of expArg.split(',')) {
  const e = exps[id];
  if (!e) continue;
  console.log(`── ${id}: ${e.name} ──  ${e.desc}`);
  const scores: number[] = [], strikes: number[] = [];
  let totalLLM = 0, totalSmart = 0;

  for (let i = 0; i < games; i++) {
    const seed = 1000 + i * 7;
    const r = await run(e, 2, seed);
    scores.push(r.score); strikes.push(r.strikes);
    totalLLM += r.llmUsed; totalSmart += r.smartUsed;
    process.stdout.write(`  g${i + 1}:${r.score}/25(s${r.strikes},llm${r.llmUsed}) `);
  }
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  console.log(`→ avg=${avg.toFixed(1)} [${scores}]\n`);
  results.push({ n: `${id}:${e.name}`, scores, strikes, llm: totalLLM, smart: totalSmart });
}

console.log(`${'═'.repeat(60)}\nSUMMARY\n${'═'.repeat(60)}`);
results.sort((a, b) => b.scores.reduce((x, y) => x + y, 0) - a.scores.reduce((x, y) => x + y, 0));
for (const r of results) {
  const avg = r.scores.reduce((a, b) => a + b, 0) / r.scores.length;
  const avgS = r.strikes.reduce((a, b) => a + b, 0) / r.strikes.length;
  console.log(`  ${r.n.padEnd(30)} avg=${avg.toFixed(1)} s=${avgS.toFixed(1)} llm=${r.llm}/${r.llm + r.smart} [${r.scores}]`);
}
