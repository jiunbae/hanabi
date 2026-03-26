#!/usr/bin/env npx tsx
/**
 * Persona-based AI Benchmark
 *
 * Each AI player has:
 * 1. Persona: its own strategy rules (what hints mean, play priorities)
 * 2. Teammate Model: accumulated predictions of each teammate's behavior
 * 3. Conflict Resolution: when persona strategy vs teammate prediction disagree
 *
 * Uses GPT-5-nano for reasoning, CardTracker for base logic.
 * Tests whether LLM can infer teammate behavior and adapt.
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
  buildPossibilities, applyNegativeClues,
  isDefinitelyPlayable, getUniqueIdentity, isDefinitelyUseless, dangerScore,
} from '../../../packages/engine/dist/card-tracker.js';
import type { GameState, GameAction, PlayerView } from '../../../packages/engine/dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NANO = JSON.parse(readFileSync(join(process.env.HOME!, 'keys/openai.azure.com/gpt-5-nano.json'), 'utf-8'))[0];
const GPT5 = JSON.parse(readFileSync(join(process.env.HOME!, 'keys/openai.azure.com/gpt-5.json'), 'utf-8'))[0];

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
  throw new Error('Bad JSON');
}

const fw = (s: GameState) => s.fireworks as unknown as Record<string, number>;

// ─── Persona Definitions ───

const PERSONAS: Record<string, string> = {
  cautious: `You are a CAUTIOUS Nolbul player.
YOUR RULES:
- NEVER play a card unless you are ≥95% sure it's correct
- Always prefer giving hints over playing uncertain cards
- When you hint, you ALWAYS hint about immediately playable cards (play clue)
- You expect teammates to play a card ONLY when they have both color and rank info
- If you receive a hint about rank only, DON'T play — wait for color confirmation
- If you receive both color AND rank, play immediately
- Discard only when tokens are 0 or card is confirmed useless`,

  aggressive: `You are an AGGRESSIVE Nolbul player.
YOUR RULES:
- Play any card that has received a recent hint (within last 2 turns) — trust your teammate
- When hinting, prioritize rank hints (more specific, enables faster plays)
- If a teammate hints you about a rank, assume it's a play signal
- If a teammate hints you about a color, assume the newest card of that color is playable
- Discard boldly: unclued cards older than 3 positions are probably useless
- Tempo > Safety: it's better to strike occasionally than to waste turns hinting`,

  analytical: `You are an ANALYTICAL Nolbul player.
YOUR RULES:
- Before each action, reason about what each card in your hand could be
- Use elimination: if you can see all copies of a card elsewhere, yours can't be that
- When receiving a hint, consider WHY the teammate chose this specific hint
- If they hinted rank when color would also work — they're signaling something specific
- Track the discard pile carefully — avoid discarding last copies
- Prefer color hints (touches fewer cards, more precise information)
- Play only when elimination narrows to a single playable card`,
};

// ─── Teammate Model (accumulated context) ───

interface TeammateModel {
  /** Observed tendencies */
  hintsGiven: { turn: number; type: string; value: unknown; touchedPlayable: boolean }[];
  playsAttempted: { turn: number; hadBothClues: boolean; success: boolean }[];
  discardsObserved: { turn: number; hadClues: boolean; wasCritical: boolean }[];
  /** LLM-inferred summary (updated periodically) */
  inferredStyle: string;
  /** Prediction confidence */
  confidence: number;
}

function createTeammateModel(): TeammateModel {
  return { hintsGiven: [], playsAttempted: [], discardsObserved: [], inferredStyle: 'unknown', confidence: 0 };
}

function updateTeammateModel(model: TeammateModel, action: GameAction, state: GameState, pi: number): void {
  const f = fw(state);
  if (action.type === 'hint') {
    // Check if the hint touches a playable card
    const target = state.hands[action.targetIndex];
    const touchedPlayable = target.cards.some(c =>
      (action.hint.type === 'color' ? c.color === action.hint.value : c.rank === action.hint.value) &&
      f[c.color] + 1 === c.rank
    );
    model.hintsGiven.push({ turn: state.turn, type: action.hint.type, value: action.hint.value, touchedPlayable });
  } else if (action.type === 'play') {
    const card = state.hands[action.playerIndex].cards[action.cardIndex];
    const view = getPlayerView(state, action.playerIndex);
    const vc = view.hands[action.playerIndex].cards[action.cardIndex];
    const kc = vc.clues.some((c: any) => c.type === 'color');
    const kr = vc.clues.some((c: any) => c.type === 'rank');
    const success = f[card.color] + 1 === card.rank;
    model.playsAttempted.push({ turn: state.turn, hadBothClues: kc && kr, success });
  } else if (action.type === 'discard') {
    const view = getPlayerView(state, action.playerIndex);
    const vc = view.hands[action.playerIndex].cards[action.cardIndex];
    const card = state.hands[action.playerIndex].cards[action.cardIndex];
    const wasCritical = card.rank === 5 || state.discardPile.filter(c => c.color === card.color && c.rank === card.rank).length >= (card.rank === 1 ? 2 : 1);
    model.discardsObserved.push({ turn: state.turn, hadClues: vc.clues.length > 0, wasCritical });
  }
}

function summarizeTeammateModel(model: TeammateModel): string {
  const totalHints = model.hintsGiven.length;
  const playableHints = model.hintsGiven.filter(h => h.touchedPlayable).length;
  const totalPlays = model.playsAttempted.length;
  const riskyPlays = model.playsAttempted.filter(p => !p.hadBothClues).length;
  const successRate = totalPlays > 0 ? model.playsAttempted.filter(p => p.success).length / totalPlays : 1;
  const totalDiscards = model.discardsObserved.length;
  const criticalDiscards = model.discardsObserved.filter(d => d.wasCritical).length;

  const lines = [];
  if (totalHints > 0) lines.push(`Hints: ${totalHints} given, ${playableHints} touched playable cards (${(playableHints/totalHints*100).toFixed(0)}%)`);
  if (totalPlays > 0) lines.push(`Plays: ${totalPlays} attempted, ${riskyPlays} without both clues, ${(successRate*100).toFixed(0)}% success`);
  if (totalDiscards > 0) lines.push(`Discards: ${totalDiscards}, ${criticalDiscards} were critical cards`);

  if (totalHints === 0 && totalPlays === 0) return 'No observations yet.';

  // Infer style
  let style = '';
  if (riskyPlays > totalPlays * 0.3) style = 'AGGRESSIVE — plays without full info';
  else if (playableHints > totalHints * 0.7) style = 'HELPFUL — mostly hints about playable cards';
  else if (criticalDiscards > 0) style = 'CARELESS — has discarded critical cards';
  else style = 'CAUTIOUS — plays safe, gives precise hints';

  return `${lines.join('. ')}.\nInferred style: ${style}`;
}

// ─── Rule-based fallback (Phase 1 CardTracker) ───

function chopIdx(view: PlayerView): number {
  const hand = view.hands[view.myIndex];
  for (let i = hand.cards.length - 1; i >= 0; i--) if (hand.cards[i].clues.length === 0) return i;
  return hand.cards.length - 1;
}

function ruleFallback(state: GameState, pi: number): GameAction {
  const view = getPlayerView(state, pi);
  const f = fw(state);
  const legal = getLegalActions(state);
  const poss = buildPossibilities(view);
  applyNegativeClues(poss, view);
  const tokens = state.clueTokens.current;

  for (let i = 0; i < view.hands[pi].cards.length; i++) {
    if (isDefinitelyPlayable(poss[i], f)) return { type: 'play', playerIndex: pi, cardIndex: i } as GameAction;
  }
  for (let i = 0; i < view.hands[pi].cards.length; i++) {
    const id = getUniqueIdentity(poss[i]);
    if (id && f[id.color] + 1 === id.rank) return { type: 'play', playerIndex: pi, cardIndex: i } as GameAction;
  }
  if (tokens < state.clueTokens.max) {
    for (let i = 0; i < view.hands[pi].cards.length; i++) {
      if (isDefinitelyUseless(poss[i], f)) return { type: 'discard', playerIndex: pi, cardIndex: i } as GameAction;
    }
  }
  // Hint or discard
  // Save critical chop cards
  if (tokens > 0) {
    for (let t = 0; t < state.hands.length; t++) {
      if (t === pi) continue;
      const tView = getPlayerView(state, t);
      const ci = chopIdx(tView);
      const cc = state.hands[t].cards[ci];
      if (cc.rank === 5 && !tView.hands[t].cards[ci].clues.some((c: any) => c.type === 'rank' && c.value === 5))
        return { type: 'hint', playerIndex: pi, targetIndex: t, hint: { type: 'rank', value: 5 } } as GameAction;
      const copies = RANK_COPIES[cc.rank]; const disc = state.discardPile.filter(c => c.color === cc.color && c.rank === cc.rank).length;
      if (disc >= copies - 1 && f[cc.color] < cc.rank && tView.hands[t].cards[ci].clues.length === 0)
        return { type: 'hint', playerIndex: pi, targetIndex: t, hint: { type: 'rank', value: cc.rank } } as GameAction;
    }
  }
  // Hint about playable cards
  if (tokens > 0) {
    let bestH: GameAction | null = null, bestU = 0;
    for (let t = 0; t < state.hands.length; t++) {
      if (t === pi) continue;
      const tc = state.hands[t].cards; const tv = getPlayerView(state, t);
      for (const color of COLORS as string[]) {
        let u = 0;
        for (let ci = 0; ci < tc.length; ci++) { if (tc[ci].color !== color || f[tc[ci].color]+1 !== tc[ci].rank) continue;
          u += tv.hands[t].cards[ci].clues.some((c:any) => c.type==='rank'&&c.value===tc[ci].rank) ? 3 : 1; }
        if (u > bestU) { bestU = u; bestH = {type:'hint',playerIndex:pi,targetIndex:t,hint:{type:'color',value:color}} as GameAction; }
      }
      for (const rank of RANKS as number[]) {
        let u = 0;
        for (let ci = 0; ci < tc.length; ci++) { if (tc[ci].rank !== rank || f[tc[ci].color]+1 !== tc[ci].rank) continue;
          u += tv.hands[t].cards[ci].clues.some((c:any) => c.type==='color'&&c.value===tc[ci].color) ? 3 : 1; }
        if (u > bestU) { bestU = u; bestH = {type:'hint',playerIndex:pi,targetIndex:t,hint:{type:'rank',value:rank}} as GameAction; }
      }
    }
    if (bestH) return bestH;
  }
  // Discard safest
  if (tokens < state.clueTokens.max) {
    let best = -1, low = Infinity;
    for (let i = 0; i < view.hands[pi].cards.length; i++) {
      if (view.hands[pi].cards[i].clues.length > 0) continue;
      const d = dangerScore(poss[i], view);
      if (d < low) { low = d; best = i; }
    }
    if (best >= 0) return { type: 'discard', playerIndex: pi, cardIndex: best } as GameAction;
  }
  if (legal.some(a => a.type === 'discard')) return { type: 'discard', playerIndex: pi, cardIndex: chopIdx(view) } as GameAction;
  const hints = legal.filter(a => a.type === 'hint');
  if (hints.length > 0) return hints[0] as GameAction;
  return legal[0] as GameAction;
}

// ─── Persona + Teammate Model → LLM Prompt ───

function buildPersonaPrompt(
  state: GameState, pi: number, persona: string,
  teammateModels: Map<number, TeammateModel>,
): string {
  const view = getPlayerView(state, pi);
  const f = fw(state);

  // Base game context (compact)
  const score = getScore(state.fireworks);
  const fwStr = COLORS.map(c => `${c}:${f[c]}`).join(' ');

  const myHand = view.hands[pi].cards.map((c, i) => {
    const clues = c.clues.length === 0 ? 'none' : c.clues.map((cl: any) => `${cl.type}=${cl.value}`).join(',');
    return `[${i}] clues: ${clues}`;
  }).join('\n');

  const others = [];
  for (let t = 0; t < state.hands.length; t++) {
    if (t === pi) continue;
    const h = view.hands[t].cards.map((c, i) => {
      const playable = c.color && c.rank && f[c.color] + 1 === c.rank ? ' ←PLAY' : '';
      return `[${i}] ${c.color} ${c.rank}${playable}`;
    }).join(', ');

    const model = teammateModels.get(t);
    const modelStr = model ? summarizeTeammateModel(model) : 'No data yet';

    others.push(`Player ${t}: ${h}\n  Behavior: ${modelStr}`);
  }

  // Actions list (compact)
  const poss = buildPossibilities(view);
  applyNegativeClues(poss, view);
  const safeActions: string[] = [];
  for (let i = 0; i < view.hands[pi].cards.length; i++) {
    if (isDefinitelyPlayable(poss[i], f)) safeActions.push(`SAFE PLAY [${i}]`);
    const id = getUniqueIdentity(poss[i]);
    if (id && f[id.color] + 1 === id.rank) safeActions.push(`DEDUCED PLAY [${i}] = ${id.color} ${id.rank}`);
  }

  const legal = getLegalActions(state);
  const hintActions = legal.filter(a => a.type === 'hint').slice(0, 10);
  const discardActions = legal.filter(a => a.type === 'discard');

  return `${persona}

GAME STATE:
Score: ${score}/25 | Tokens: ${state.clueTokens.current}/${state.clueTokens.max} | Strikes: ${state.strikes.current}/3 | Deck: ${view.deckSize}
Fireworks: ${fwStr}

YOUR HAND (you can't see these):
${myHand}

TEAMMATES:
${others.join('\n\n')}

${safeActions.length > 0 ? 'SAFE PLAYS (from card analysis): ' + safeActions.join(', ') : 'No confirmed safe plays.'}

AVAILABLE ACTIONS (pick ONE):
${hintActions.map(a => JSON.stringify(a)).join('\n')}
${discardActions.map(a => JSON.stringify(a)).join('\n')}

Based on YOUR PERSONA rules and your TEAMMATE OBSERVATIONS, choose the best action.
Consider: What would your teammate expect you to do? What are they likely to do next?
Reply with ONLY the JSON action.`;
}

// ─── Game Runner ───

interface ExpConfig {
  name: string;
  desc: string;
  persona: string;
  llmEp: string;
  llmKey: string;
  useTeammateModel: boolean;
  useRuleFallback: boolean;
}

async function runGame(config: ExpConfig, seed: number, numPlayers: number) {
  let state = createInitialState({ numPlayers, seed });
  const at: Record<string, number> = {};
  let turns = 0, llmUsed = 0;

  // Each AI player has its own teammate models
  const allModels = new Map<number, Map<number, TeammateModel>>();
  for (let p = 0; p < numPlayers; p++) {
    const models = new Map<number, TeammateModel>();
    for (let t = 0; t < numPlayers; t++) {
      if (t !== p) models.set(t, createTeammateModel());
    }
    allModels.set(p, models);
  }

  while (state.status === 'playing' && turns < 80) {
    const pi = state.currentPlayer;
    const models = allModels.get(pi)!;
    let action: GameAction;

    if (config.useRuleFallback) {
      // Start with rule-based action
      action = ruleFallback(state, pi);

      // Use LLM to potentially override
      if (config.llmEp) {
        try {
          const prompt = buildPersonaPrompt(state, pi, config.persona, config.useTeammateModel ? models : new Map());
          const txt = await callLLM(config.llmEp, config.llmKey, 'You play Nolbul. Follow your persona rules. JSON only.', prompt);
          const la = parseAction(txt, pi);
          if (!validateAction(state, la)) {
            // Accept LLM if it's not a blind play
            const view = getPlayerView(state, pi);
            const card = la.type === 'play' ? view.hands[pi].cards[la.cardIndex] : null;
            if (la.type !== 'play' || (card && card.clues.length > 0)) {
              action = la;
              llmUsed++;
            }
          }
        } catch {}
      }
    } else {
      // Pure LLM (no rule fallback)
      action = ruleFallback(state, pi); // still need a fallback
      try {
        const prompt = buildPersonaPrompt(state, pi, config.persona, config.useTeammateModel ? models : new Map());
        const txt = await callLLM(config.llmEp, config.llmKey, 'You play Nolbul. Follow your persona rules. JSON only.', prompt);
        const la = parseAction(txt, pi);
        if (!validateAction(state, la)) { action = la; llmUsed++; }
      } catch {}
    }

    if (validateAction(state, action)) action = getLegalActions(state)[0];

    // Update ALL players' teammate models
    for (let p = 0; p < numPlayers; p++) {
      if (p === pi) continue;
      const pModels = allModels.get(p)!;
      const model = pModels.get(pi)!;
      updateTeammateModel(model, action, state, pi);
    }

    state = applyAction(state, action);
    at[action.type] = (at[action.type] ?? 0) + 1;
    turns++;
  }

  return { score: getScore(state.fireworks), strikes: state.strikes.current, turns, at, llmUsed };
}

// ─── Experiments ───

const experiments: Record<string, ExpConfig> = {
  // Control: rule-only (no LLM, no persona)
  R: { name: 'Rule-only baseline', desc: 'Phase 1 CardTracker, no LLM', persona: '', llmEp: '', llmKey: '', useTeammateModel: false, useRuleFallback: true },

  // Persona without teammate model
  P1: { name: 'Cautious persona (no model)', desc: 'Cautious persona + rules, ignores teammate behavior',
    persona: PERSONAS.cautious, llmEp: NANO.endpoint, llmKey: NANO.key, useTeammateModel: false, useRuleFallback: true },

  P2: { name: 'Aggressive persona (no model)', desc: 'Aggressive persona + rules',
    persona: PERSONAS.aggressive, llmEp: NANO.endpoint, llmKey: NANO.key, useTeammateModel: false, useRuleFallback: true },

  P3: { name: 'Analytical persona (no model)', desc: 'Analytical persona + rules',
    persona: PERSONAS.analytical, llmEp: NANO.endpoint, llmKey: NANO.key, useTeammateModel: false, useRuleFallback: true },

  // Persona WITH teammate model
  M1: { name: 'Cautious + teammate model', desc: 'Cautious persona adapts to teammate behavior',
    persona: PERSONAS.cautious, llmEp: NANO.endpoint, llmKey: NANO.key, useTeammateModel: true, useRuleFallback: true },

  M2: { name: 'Analytical + teammate model', desc: 'Analytical persona adapts to teammate behavior',
    persona: PERSONAS.analytical, llmEp: NANO.endpoint, llmKey: NANO.key, useTeammateModel: true, useRuleFallback: true },

  // GPT-5 with teammate model
  G1: { name: 'Analytical + model (GPT-5)', desc: 'Same as M2 but with GPT-5',
    persona: PERSONAS.analytical, llmEp: GPT5.endpoint, llmKey: GPT5.key, useTeammateModel: true, useRuleFallback: true },
};

// ─── Main ───
const args = process.argv.slice(2);
const expArg = args.find((_, i, a) => a[i - 1] === '--exp') ?? 'R,P1,P3,M1,M2';
const games = parseInt(args.find((_, i, a) => a[i - 1] === '--games') ?? '3', 10);

console.log(`\n${'═'.repeat(60)}`);
console.log(`PERSONA BENCH | ${expArg.split(',').length} exps × ${games} games`);
console.log(`${'═'.repeat(60)}\n`);

type R = { id: string; name: string; scores: number[]; strikes: number[]; llm: number };
const results: R[] = [];

for (const id of expArg.split(',')) {
  const e = experiments[id];
  if (!e) continue;
  process.stdout.write(`${id.padEnd(3)} ${e.name.padEnd(35)} `);
  const scores: number[] = [], strikes: number[] = [];
  let tLLM = 0;

  for (let i = 0; i < games; i++) {
    const seed = 1000 + i * 7;
    const r = await (async () => {
      if (!e.llmEp) {
        // Pure rule bot — no LLM
        let st = createInitialState({ numPlayers: 2, seed });
        let t = 0;
        while (st.status === 'playing' && t < 80) {
          let act = ruleFallback(st, st.currentPlayer);
          if (validateAction(st, act)) act = getLegalActions(st)[0];
          st = applyAction(st, act);
          t++;
        }
        return { score: getScore(st.fireworks), strikes: st.strikes.current, turns: t, at: {}, llmUsed: 0 };
      }
      return runGame(e, seed, 2);
    })();
    scores.push(r.score); strikes.push(r.strikes); tLLM += r.llmUsed;
    process.stdout.write(`${r.score}/${r.strikes} `);
  }
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  console.log(`→ avg=${avg.toFixed(1)}`);
  results.push({ id, name: e.name, scores, strikes, llm: tLLM });
}

console.log(`\n${'═'.repeat(60)}\nRANKING\n${'═'.repeat(60)}`);
results.sort((a, b) => b.scores.reduce((x, y) => x + y, 0) - a.scores.reduce((x, y) => x + y, 0));
for (const r of results) {
  const avg = r.scores.reduce((a, b) => a + b, 0) / r.scores.length;
  const avgS = r.strikes.reduce((a, b) => a + b, 0) / r.strikes.length;
  console.log(`  ${r.id.padEnd(3)} ${r.name.padEnd(35)} avg=${avg.toFixed(1)} s=${avgS.toFixed(1)} llm=${r.llm} [${r.scores}]`);
}
