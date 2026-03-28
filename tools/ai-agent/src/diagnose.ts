#!/usr/bin/env npx tsx
/**
 * Diagnose: what does the LLM see, and what does it decide?
 * Compare rule engine vs LLM output turn-by-turn.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {
  createInitialState, applyAction, validateAction, getPlayerView, getScore, getLegalActions,
  buildAIContext, COLORS, RANKS,
} from '../../../packages/engine/dist/index.js';
import {
  buildPossibilities, applyNegativeClues, isDefinitelyPlayable, getUniqueIdentity, isProbablyPlayable, dangerScore,
} from '../../../packages/engine/dist/card-tracker.js';
import type { GameState, GameAction } from '../../../packages/engine/dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NANO = JSON.parse(readFileSync(join(process.env.HOME!, 'keys/openai.azure.com/gpt-5-nano.json'), 'utf-8'))[0];
const GPT5 = JSON.parse(readFileSync(join(process.env.HOME!, 'keys/openai.azure.com/gpt-5.json'), 'utf-8'))[0];
const SYS = JSON.parse(readFileSync(join(__dirname, '../../../apps/server/src/config/ai-prompts.json'), 'utf-8')).system.default;

const useGPT5 = process.argv.includes('--gpt5');
const LLM = useGPT5 ? GPT5 : NANO;
console.log(`Using: ${useGPT5 ? 'GPT-5' : 'GPT-5-nano'}\n`);

async function callLLM(sys: string, user: string): Promise<string> {
  const r = await fetch(LLM.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': LLM.key },
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
  } catch {}
  return null;
}

const fw = (s: GameState) => s.fireworks as unknown as Record<string, number>;

// Simple rule bot for comparison
function ruleAction(state: GameState, pi: number): GameAction {
  const view = getPlayerView(state, pi);
  const f = fw(state);
  const poss = buildPossibilities(view);
  applyNegativeClues(poss, view);
  const legal = getLegalActions(state);

  for (let i = 0; i < view.hands[pi].cards.length; i++) {
    if (isDefinitelyPlayable(poss[i], f)) return { type: 'play', playerIndex: pi, cardIndex: i } as GameAction;
    const id = getUniqueIdentity(poss[i]);
    if (id && f[id.color] + 1 === id.rank) return { type: 'play', playerIndex: pi, cardIndex: i } as GameAction;
  }
  // Hint or discard (simplified)
  if (state.clueTokens.current > 0) {
    const hints = legal.filter(a => a.type === 'hint');
    if (hints.length > 0) return hints[0] as GameAction;
  }
  if (legal.some(a => a.type === 'discard')) return { type: 'discard', playerIndex: pi, cardIndex: view.hands[pi].cards.length - 1 } as GameAction;
  return legal[0] as GameAction;
}

// Run game with detailed logging
const seed = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--seed') ?? '1007', 10);
const maxTurns = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--turns') ?? '20', 10);

let state = createInitialState({ numPlayers: 2, seed });
console.log(`Seed: ${seed}, logging ${maxTurns} turns\n`);

for (let turn = 0; turn < maxTurns && state.status === 'playing'; turn++) {
  const pi = state.currentPlayer;
  const view = getPlayerView(state, pi);
  const f = fw(state);

  // Rule action
  const rule = ruleAction(state, pi);

  // LLM action
  const prompt = buildAIContext(view, { includeRules: turn < 2 });
  let llmAction: GameAction | null = null;
  let llmReasoning = '';
  try {
    const txt = await callLLM(SYS, prompt);
    llmAction = parseAction(txt, pi);
    // Extract any reasoning before the JSON
    const jsonStart = txt.indexOf('{');
    if (jsonStart > 10) llmReasoning = txt.slice(0, jsonStart).trim().slice(0, 200);
  } catch (e) { llmReasoning = `ERROR: ${(e as Error).message.slice(0, 80)}`; }

  // Log
  console.log(`── Turn ${turn + 1} (P${pi}) ── Score:${getScore(f)} Tokens:${state.clueTokens.current} Strikes:${state.strikes.current}`);
  console.log(`  FW: ${COLORS.map(c => `${c[0]}:${f[c]}`).join(' ')}`);

  // Show what this player knows about their own cards
  const poss = buildPossibilities(view);
  applyNegativeClues(poss, view);
  for (let i = 0; i < view.hands[pi].cards.length; i++) {
    const card = view.hands[pi].cards[i];
    const clueStr = card.clues.length === 0 ? 'none' : card.clues.map((c: any) => `${c.type}=${c.value}`).join(',');
    const defPlay = isDefinitelyPlayable(poss[i], f) ? ' ✅PLAY' : '';
    const uid = getUniqueIdentity(poss[i]);
    const uidStr = uid ? ` [=${uid.color} ${uid.rank}]` : '';
    const probPlay = isProbablyPlayable(poss[i], f, 0.5) ? ' ~50%play' : '';
    console.log(`  [${i}] clues:${clueStr}${uidStr}${defPlay}${probPlay} (${poss[i].count} poss)`);
  }

  // Show other player's hand
  for (let t = 0; t < state.hands.length; t++) {
    if (t === pi) continue;
    const cards = view.hands[t].cards.map((c, i) => {
      const playable = c.color && c.rank && f[c.color] + 1 === c.rank ? '←PLAY' : '';
      return `[${i}]${c.color?.[0]}${c.rank}${playable}`;
    }).join(' ');
    console.log(`  P${t}: ${cards}`);
  }

  console.log(`  Rule: ${JSON.stringify(rule)}`);
  console.log(`  LLM:  ${llmAction ? JSON.stringify(llmAction) : 'FAILED'}`);
  if (llmReasoning) console.log(`  Why:  ${llmReasoning}`);

  const agreed = llmAction && llmAction.type === rule.type &&
    (llmAction.type !== 'play' || llmAction.cardIndex === rule.cardIndex) &&
    (llmAction.type !== 'hint' || (JSON.stringify(llmAction) === JSON.stringify(rule)));
  console.log(`  Match: ${agreed ? 'YES' : 'NO'}`);
  console.log();

  // Apply rule action (use rule bot for game progression)
  state = applyAction(state, rule);
}

console.log(`\nFinal: Score ${getScore(state.fireworks)}/25, Strikes ${state.strikes.current}`);
