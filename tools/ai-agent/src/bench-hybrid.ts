#!/usr/bin/env npx tsx
/**
 * Hybrid Bench: Rule engine for play/discard, LLM for hints.
 *
 * Key insight from diagnosis: LLM picks better hints than rule engine
 * because it reasons about WHAT the teammate needs to know, not just
 * which hint touches the most playable cards.
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  createInitialState, applyAction, validateAction,
  getPlayerView, getScore, getLegalActions, buildAIContext,
  COLORS, RANKS, RANK_COPIES,
} from '../../../packages/engine/dist/index.js';
import {
  buildPossibilities, applyNegativeClues, isDefinitelyPlayable, getUniqueIdentity,
  isProbablyPlayable, isDefinitelyUseless, dangerScore,
} from '../../../packages/engine/dist/card-tracker.js';
import type { GameState, GameAction, PlayerView } from '../../../packages/engine/dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NANO = JSON.parse(readFileSync(join(process.env.HOME!, 'keys/openai.azure.com/gpt-5-nano.json'), 'utf-8'))[0];
const GPT5 = JSON.parse(readFileSync(join(process.env.HOME!, 'keys/openai.azure.com/gpt-5.json'), 'utf-8'))[0];
const SYS = JSON.parse(readFileSync(join(__dirname, '../../../apps/server/src/config/ai-prompts.json'), 'utf-8')).system.default;

async function callLLM(ep: string, key: string, sys: string, user: string): Promise<string> {
  const r = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': key },
    body: JSON.stringify({ messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], max_completion_tokens: 16384 }) });
  if (!r.ok) throw new Error(`LLM ${r.status}`);
  return ((await r.json()) as any).choices[0]?.message?.content ?? '';
}

function parseAction(t: string, pi: number): GameAction | null {
  try {
    const s = t.indexOf('{'); if (s === -1) return null;
    let d = 0;
    for (let i = s; i < t.length; i++) { if (t[i] === '{') d++; else if (t[i] === '}') d--;
      if (d === 0) { const r = JSON.parse(t.slice(s, i + 1));
        return r.type === 'hint' ? { type:'hint',playerIndex:pi,targetIndex:r.targetIndex,hint:{type:r.hint.type,value:r.hint.value}} as GameAction
          : {type:r.type,playerIndex:pi,cardIndex:r.cardIndex??0} as GameAction; }}
  } catch {} return null;
}

const fw = (s: GameState) => s.fireworks as unknown as Record<string, number>;

function chopIdx(view: PlayerView): number {
  const hand = view.hands[view.myIndex];
  for (let i = hand.cards.length - 1; i >= 0; i--) if (hand.cards[i].clues.length === 0) return i;
  return hand.cards.length - 1;
}

/**
 * HYBRID STRATEGY:
 * - Play/discard: rule engine (CardTracker)
 * - Hints: LLM decides (with rule engine as fallback)
 */
async function hybridTurn(state: GameState, pi: number, llmEp: string, llmKey: string): Promise<{ action: GameAction; source: string }> {
  const view = getPlayerView(state, pi);
  const f = fw(state);
  const legal = getLegalActions(state);
  const poss = buildPossibilities(view);
  applyNegativeClues(poss, view);
  const tokens = state.clueTokens.current;

  // ═══ Rule engine: PLAY decisions ═══
  for (let i = 0; i < view.hands[pi].cards.length; i++) {
    if (isDefinitelyPlayable(poss[i], f)) return { action: { type: 'play', playerIndex: pi, cardIndex: i } as GameAction, source: 'rule-play' };
  }
  for (let i = 0; i < view.hands[pi].cards.length; i++) {
    const id = getUniqueIdentity(poss[i]);
    if (id && f[id.color] + 1 === id.rank) return { action: { type: 'play', playerIndex: pi, cardIndex: i } as GameAction, source: 'rule-play-deduced' };
  }

  // ═══ Rule engine: DISCARD useless ═══
  if (tokens < state.clueTokens.max) {
    for (let i = 0; i < view.hands[pi].cards.length; i++) {
      if (isDefinitelyUseless(poss[i], f)) return { action: { type: 'discard', playerIndex: pi, cardIndex: i } as GameAction, source: 'rule-discard-useless' };
    }
  }

  // ═══ MUST save 5s on chop (rule) ═══
  if (tokens > 0) {
    for (let t = 0; t < state.hands.length; t++) {
      if (t === pi) continue;
      const tView = getPlayerView(state, t);
      const ci = chopIdx(tView);
      const cc = state.hands[t].cards[ci];
      if (cc.rank === 5 && !tView.hands[t].cards[ci].clues.some((c: any) => c.type === 'rank' && c.value === 5))
        return { action: { type: 'hint', playerIndex: pi, targetIndex: t, hint: { type: 'rank', value: 5 } } as GameAction, source: 'rule-save-5' };
    }
  }

  // ═══ LLM: HINT decisions ═══
  if (tokens > 0) {
    try {
      const prompt = buildAIContext(view, { includeRules: state.turn < state.hands.length });
      const txt = await callLLM(llmEp, llmKey, SYS, prompt);
      const la = parseAction(txt, pi);
      if (la && !validateAction(state, la)) {
        // LLM chose a hint → use it
        if (la.type === 'hint') return { action: la, source: 'llm-hint' };
        // LLM chose play with clue info → trust it
        if (la.type === 'play') {
          const card = view.hands[pi].cards[la.cardIndex];
          if (card && card.clues.length > 0) return { action: la, source: 'llm-play' };
        }
        // LLM chose discard → use it
        if (la.type === 'discard') return { action: la, source: 'llm-discard' };
      }
    } catch {}
  }

  // ═══ Fallback: Rule discard ═══
  if (tokens < state.clueTokens.max) {
    let best = -1, low = Infinity;
    for (let i = 0; i < view.hands[pi].cards.length; i++) {
      if (view.hands[pi].cards[i].clues.length > 0) continue;
      const d = dangerScore(poss[i], view);
      if (d < low) { low = d; best = i; }
    }
    if (best >= 0) return { action: { type: 'discard', playerIndex: pi, cardIndex: best } as GameAction, source: 'rule-discard' };
  }

  return { action: legal[0] as GameAction, source: 'fallback' };
}

// ═══ Experiments ═══
interface Exp { name: string; ep: string; key: string }

const exps: Record<string, Exp> = {
  H_NANO: { name: 'Hybrid (nano)', ep: NANO.endpoint, key: NANO.key },
  H_GPT5: { name: 'Hybrid (GPT-5)', ep: GPT5.endpoint, key: GPT5.key },
};

async function runGame(exp: Exp, seed: number) {
  let state = createInitialState({ numPlayers: 2, seed });
  let turns = 0;
  const sources: Record<string, number> = {};

  while (state.status === 'playing' && turns < 80) {
    const pi = state.currentPlayer;
    const { action, source } = await hybridTurn(state, pi, exp.ep, exp.key);
    sources[source] = (sources[source] ?? 0) + 1;

    let finalAction = action;
    if (validateAction(state, finalAction)) finalAction = getLegalActions(state)[0];
    state = applyAction(state, finalAction);
    turns++;
  }
  return { score: getScore(state.fireworks), strikes: state.strikes.current, turns, sources };
}

// ═══ Main ═══
const args = process.argv.slice(2);
const expArg = args.find((_, i, a) => a[i - 1] === '--exp') ?? 'H_NANO,H_GPT5';
const games = parseInt(args.find((_, i, a) => a[i - 1] === '--games') ?? '3', 10);

console.log(`\n${'═'.repeat(55)}`);
console.log(`HYBRID BENCH | Rules(play/discard) + LLM(hints)`);
console.log(`${'═'.repeat(55)}\n`);

type R = { id: string; name: string; scores: number[]; strikes: number[] };
const results: R[] = [];

for (const id of expArg.split(',')) {
  const e = exps[id]; if (!e) continue;
  process.stdout.write(`${id.padEnd(10)} ${e.name.padEnd(20)} `);
  const scores: number[] = [], strikes: number[] = [];

  for (let i = 0; i < games; i++) {
    const seed = 1000 + i * 7;
    const r = await runGame(e, seed);
    scores.push(r.score); strikes.push(r.strikes);
    const srcStr = Object.entries(r.sources).map(([k, v]) => `${k}:${v}`).join(' ');
    process.stdout.write(`${r.score}/${r.strikes} `);
  }
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  console.log(`→ avg=${avg.toFixed(1)}`);
  results.push({ id, name: e.name, scores, strikes });
}

console.log(`\n${'═'.repeat(55)}\nRESULTS`);
results.sort((a, b) => b.scores.reduce((x, y) => x + y, 0) - a.scores.reduce((x, y) => x + y, 0));
for (const r of results) {
  const avg = r.scores.reduce((a, b) => a + b, 0) / r.scores.length;
  const avgS = r.strikes.reduce((a, b) => a + b, 0) / r.strikes.length;
  console.log(`  ${r.id.padEnd(10)} ${r.name.padEnd(20)} avg=${avg.toFixed(1)} s=${avgS.toFixed(1)} [${r.scores}]`);
}
