#!/usr/bin/env npx tsx
/**
 * Bench v3 — Guard variants × Strategy variants
 *
 * Guard modes:
 *   FULL  = current prod (reject unless both color+rank confirmed)
 *   ZERO  = reject only 0-clue blind plays (≥1 clue = trust LLM)
 *   NONE  = no guard (trust LLM 100%, validate legality only)
 *
 * Strategy variants:
 *   D = V2 baseline
 *   E = Smart hint selection
 *   F = Lookahead (1-step)
 *   G = GPT-5 full model
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  createInitialState, applyAction, validateAction,
  getPlayerView, getScore, getLegalActions, buildAIContext,
  COLORS, RANKS,
} from '../../../packages/engine/dist/index.js';
import type { GameState, GameAction } from '../../../packages/engine/dist/index.js';

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

function parseAction(t: string, pi: number): GameAction {
  const s = t.indexOf('{'); if (s === -1) throw new Error('No JSON');
  let d = 0;
  for (let i = s; i < t.length; i++) { if (t[i] === '{') d++; else if (t[i] === '}') d--;
    if (d === 0) { const r = JSON.parse(t.slice(s, i + 1));
      return r.type === 'hint' ? { type:'hint',playerIndex:pi,targetIndex:r.targetIndex,hint:{type:r.hint.type,value:r.hint.value}} as GameAction
        : {type:r.type,playerIndex:pi,cardIndex:r.cardIndex??0} as GameAction; }}
  throw new Error('Bad');
}

// ── Helpers ──
const fw = (s: GameState) => s.fireworks as unknown as Record<string, number>;
function ci(state: GameState, pi: number, idx: number) {
  const v = getPlayerView(state, pi).hands[pi].cards[idx];
  return { color: v.clues.find((x:any)=>x.type==='color')?.value as string|undefined,
    rank: v.clues.find((x:any)=>x.type==='rank')?.value as number|undefined,
    count: v.clues.length,
    recent: v.clues.some((x:any)=>x.type==='color'&&x.turnGiven>=state.turn-2) };
}
function chop(state: GameState, pi: number): number {
  const v = getPlayerView(state, pi);
  for (let i = v.hands[pi].cards.length-1; i >= 0; i--) if (v.hands[pi].cards[i].clues.length===0) return i;
  return state.hands[pi].cards.length-1;
}
function rkPlay(f: Record<string,number>, r: number, th: number) {
  if (r===1) return Object.values(f).some(v=>v===0);
  return Object.values(f).filter(v=>v+1===r).length >= th;
}

// ── Guard Modes ──
type Guard = (a: GameAction, state: GameState, pi: number) => boolean;

const guardFull: Guard = (a, state, pi) => {
  if (a.type !== 'play') return true;
  const {color,rank,recent} = ci(state, pi, a.cardIndex);
  const f = fw(state);
  if (color && rank) return f[color]+1===rank;
  if (!color && rank) return rkPlay(f, rank, 3);
  if (color && !rank) return recent && f[color]+1<=5;
  return false;
};

const guardZero: Guard = (a, state, pi) => {
  if (a.type !== 'play') return true;
  // Only reject if card has 0 clues (completely blind)
  return ci(state, pi, a.cardIndex).count > 0;
};

const guardNone: Guard = () => true;

// ── Strategies ──
type Strat = (state: GameState, pi: number) => GameAction;

const stratBase: Strat = (state, pi) => {
  const f = fw(state); const hand = state.hands[pi]; const legal = getLegalActions(state);
  const tok = state.clueTokens.current, maxT = state.clueTokens.max;
  for (let i=0;i<hand.cards.length;i++){const{color,rank}=ci(state,pi,i);if(color&&rank&&f[color]+1===rank)return{type:'play',playerIndex:pi,cardIndex:i}as GameAction;}
  for (let i=0;i<hand.cards.length;i++){const{color,rank,recent}=ci(state,pi,i);if(color&&!rank&&recent&&f[color]+1<=5)return{type:'play',playerIndex:pi,cardIndex:i}as GameAction;}
  for (let i=0;i<hand.cards.length;i++){const{color,rank}=ci(state,pi,i);if(!color&&rank&&rkPlay(f,rank,3))return{type:'play',playerIndex:pi,cardIndex:i}as GameAction;}
  if(tok<maxT){for(let i=0;i<hand.cards.length;i++){const{color,rank}=ci(state,pi,i);if(color&&rank&&f[color]>=rank)return{type:'discard',playerIndex:pi,cardIndex:i}as GameAction;}}
  if(tok>0){for(let t=0;t<state.hands.length;t++){if(t===pi)continue;const cx=chop(state,t);const cc=state.hands[t].cards[cx];const tv=getPlayerView(state,t);
    if(cc.rank===5&&!tv.hands[t].cards[cx].clues.some((c:any)=>c.type==='rank'&&c.value===5))return{type:'hint',playerIndex:pi,targetIndex:t,hint:{type:'rank',value:5}}as GameAction;
    const cp=cc.rank===1?3:2;if(state.discardPile.filter(c=>c.color===cc.color&&c.rank===cc.rank).length>=cp-1&&f[cc.color]<cc.rank&&tv.hands[t].cards[cx].clues.length===0)return{type:'hint',playerIndex:pi,targetIndex:t,hint:{type:'rank',value:cc.rank}}as GameAction;}}
  if(tok>0){let best:GameAction|null=null,bs=-1;for(let t=0;t<state.hands.length;t++){if(t===pi)continue;for(let j=0;j<state.hands[t].cards.length;j++){const c=state.hands[t].cards[j];if(f[c.color]+1!==c.rank)continue;const tv=getPlayerView(state,t).hands[t].cards[j];const kc=tv.clues.some((x:any)=>x.type==='color'&&x.value===c.color);const kr=tv.clues.some((x:any)=>x.type==='rank'&&x.value===c.rank);if(kc&&kr)continue;const sc=(6-c.rank)*10+(kr?0:5);if(sc>bs){bs=sc;best=!kr?{type:'hint',playerIndex:pi,targetIndex:t,hint:{type:'rank',value:c.rank}}as GameAction:{type:'hint',playerIndex:pi,targetIndex:t,hint:{type:'color',value:c.color}}as GameAction;}}}if(best)return best;}
  if(tok<=3&&tok<maxT){const cx=chop(state,pi);const v=getPlayerView(state,pi);if(v.hands[pi].cards[cx].clues.length===0)return{type:'discard',playerIndex:pi,cardIndex:cx}as GameAction;}
  if(legal.some(a=>a.type==='discard'))return{type:'discard',playerIndex:pi,cardIndex:chop(state,pi)}as GameAction;
  return legal[0]as GameAction;
};

const stratSmartHint: Strat = (state, pi) => {
  const f = fw(state); const tok = state.clueTokens.current;
  const base = stratBase(state, pi);
  if (base.type === 'play' || base.type === 'discard') return base;
  if (tok <= 0) return base;
  let bestH: GameAction|null=null, bestU=-1;
  for (let t=0;t<state.hands.length;t++){if(t===pi)continue;const tc=state.hands[t].cards;const tv=getPlayerView(state,t);
    for(const color of COLORS as string[]){let u=0;for(let j=0;j<tc.length;j++){if(tc[j].color!==color)continue;const vc=tv.hands[t].cards[j];const kr=vc.clues.some((c:any)=>c.type==='rank'&&c.value===tc[j].rank);if(kr&&f[tc[j].color]+1===tc[j].rank)u++;if(vc.clues.length===0&&f[tc[j].color]+1===tc[j].rank)u+=0.5;}if(u>bestU){bestU=u;bestH={type:'hint',playerIndex:pi,targetIndex:t,hint:{type:'color',value:color}}as GameAction;}}
    for(const rank of RANKS as number[]){let u=0;for(let j=0;j<tc.length;j++){if(tc[j].rank!==rank)continue;const vc=tv.hands[t].cards[j];const kc=vc.clues.some((c:any)=>c.type==='color'&&c.value===tc[j].color);if(kc&&f[tc[j].color]+1===tc[j].rank)u++;if(vc.clues.length===0&&f[tc[j].color]+1===tc[j].rank)u+=0.5;}if(u>bestU){bestU=u;bestH={type:'hint',playerIndex:pi,targetIndex:t,hint:{type:'rank',value:rank}}as GameAction;}}}
  return (bestH && bestU > 0) ? bestH : base;
};

const stratLookahead: Strat = (state, pi) => {
  const legal = getLegalActions(state);
  const base = stratBase(state, pi);
  let bestA = base, bestS = -999;
  const cands = [base, ...legal.filter(a=>a.type==='play'||a.type==='hint').slice(0,5)];
  for (const a of cands) {
    if (validateAction(state, a)) continue;
    if (a.type === 'play' && !guardFull(a, state, pi)) continue;
    try { const ns = applyAction(state, a); const sc = getScore(ns.fireworks) - ns.strikes.current*5 + Math.min(ns.clueTokens.current,4)*0.5;
      if (sc > bestS) { bestS = sc; bestA = a; }
    } catch {}
  }
  return bestA;
};

// ── Experiment Matrix ──
interface Exp { name: string; llmEp: string; llmKey: string; sys: string; strat: Strat; guard: Guard }

const matrix: Record<string, Exp> = {
  // Guard=NONE (no guard)
  'D0': { name:'Base+NoGuard(nano)', llmEp:NANO.endpoint, llmKey:NANO.key, sys:SYS, strat:stratBase, guard:guardNone },
  'E0': { name:'SmartHint+NoGuard(nano)', llmEp:NANO.endpoint, llmKey:NANO.key, sys:SYS, strat:stratSmartHint, guard:guardNone },
  'F0': { name:'Lookahead+NoGuard(nano)', llmEp:NANO.endpoint, llmKey:NANO.key, sys:SYS, strat:stratLookahead, guard:guardNone },
  'G0': { name:'Base+NoGuard(gpt5)', llmEp:GPT5.endpoint, llmKey:GPT5.key, sys:SYS, strat:stratBase, guard:guardNone },
  // Guard=ZERO (reject 0-clue only)
  'DZ': { name:'Base+ZeroGuard(nano)', llmEp:NANO.endpoint, llmKey:NANO.key, sys:SYS, strat:stratBase, guard:guardZero },
  'EZ': { name:'SmartHint+ZeroGuard(nano)', llmEp:NANO.endpoint, llmKey:NANO.key, sys:SYS, strat:stratSmartHint, guard:guardZero },
  'FZ': { name:'Lookahead+ZeroGuard(nano)', llmEp:NANO.endpoint, llmKey:NANO.key, sys:SYS, strat:stratLookahead, guard:guardZero },
  'GZ': { name:'Base+ZeroGuard(gpt5)', llmEp:GPT5.endpoint, llmKey:GPT5.key, sys:SYS, strat:stratBase, guard:guardZero },
  // Control
  'DF': { name:'Base+FullGuard(nano)', llmEp:NANO.endpoint, llmKey:NANO.key, sys:SYS, strat:stratBase, guard:guardFull },
};

// ── Runner ──
async function run(exp: Exp, np: number, seed: number) {
  let state = createInitialState({ numPlayers: np, seed });
  const at: Record<string,number> = {}; let turns = 0, llmU = 0;
  while (state.status === 'playing' && turns < 80) {
    const pi = state.currentPlayer;
    const view = getPlayerView(state, pi);
    let action = exp.strat(state, pi);
    try {
      const prompt = buildAIContext(view, { includeRules: turns < np });
      const txt = await callLLM(exp.llmEp, exp.llmKey, exp.sys, prompt);
      const la = parseAction(txt, pi);
      if (!validateAction(state, la) && exp.guard(la, state, pi)) { action = la; llmU++; }
    } catch {}
    if (validateAction(state, action)) action = getLegalActions(state)[0];
    state = applyAction(state, action);
    at[action.type] = (at[action.type]??0)+1; turns++;
  }
  return { score: getScore(state.fireworks), strikes: state.strikes.current, turns, at, llmU };
}

// ── Main ──
const args = process.argv.slice(2);
const expArg = args.find((_,i,a)=>a[i-1]==='--exp') ?? 'DF,D0,DZ,E0,EZ,F0,FZ,G0,GZ';
const games = parseInt(args.find((_,i,a)=>a[i-1]==='--games') ?? '3', 10);

console.log(`\n${'═'.repeat(65)}`);
console.log(`NOLBUL BENCH v3 | ${expArg.split(',').length} experiments × ${games} games`);
console.log(`${'═'.repeat(65)}\n`);

type R = { id: string; name: string; scores: number[]; strikes: number[]; llm: number };
const results: R[] = [];

for (const id of expArg.split(',')) {
  const e = matrix[id]; if (!e) continue;
  process.stdout.write(`${id.padEnd(3)} ${e.name.padEnd(30)} `);
  const scores: number[] = [], strikes: number[] = []; let tLLM = 0;
  for (let i = 0; i < games; i++) {
    const r = await run(e, 2, 1000 + i * 7);
    scores.push(r.score); strikes.push(r.strikes); tLLM += r.llmU;
    process.stdout.write(`${r.score}/${r.strikes} `);
  }
  const avg = scores.reduce((a,b)=>a+b,0)/scores.length;
  console.log(`→ avg=${avg.toFixed(1)}`);
  results.push({ id, name: e.name, scores, strikes, llm: tLLM });
}

console.log(`\n${'═'.repeat(65)}\nRANKING\n${'═'.repeat(65)}`);
results.sort((a,b) => b.scores.reduce((x,y)=>x+y,0) - a.scores.reduce((x,y)=>x+y,0));
for (const r of results) {
  const avg = r.scores.reduce((a,b)=>a+b,0)/r.scores.length;
  const avgS = r.strikes.reduce((a,b)=>a+b,0)/r.strikes.length;
  console.log(`  ${r.id.padEnd(3)} ${r.name.padEnd(32)} avg=${avg.toFixed(1)} s=${avgS.toFixed(1)} [${r.scores}]`);
}
