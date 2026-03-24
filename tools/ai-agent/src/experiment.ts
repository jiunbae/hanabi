#!/usr/bin/env npx tsx
/**
 * Prompt Experiment Runner
 *
 * Runs full AI-only Nolbul games via the local API using Azure OpenAI (GPT-5-nano),
 * testing different system prompts to find one that maximizes score.
 */
import { readFileSync } from 'fs';

// ─── Azure OpenAI Config ───
const modelArg = process.argv.find((_, i, a) => a[i - 1] === '--model') ?? 'gpt-5-nano';
const keyFile = JSON.parse(readFileSync(`${process.env.HOME}/keys/openai.azure.com/${modelArg}.json`, 'utf-8'));
const keyEntry = keyFile[0];
const apiKey = keyEntry.key;
// Build chat completions endpoint from deployment name
const AZURE_BASE = 'https://ai-azureai228776228205.cognitiveservices.azure.com';
const endpoint = `${AZURE_BASE}/openai/deployments/${keyEntry.deployment}/chat/completions?api-version=2025-01-01-preview`;
const SERVER = process.env.NOLBUL_SERVER ?? 'http://localhost:3001';

// ─── Prompt Variants ───

const SYSTEM_PROMPTS: Record<string, string> = {
  follow_recommendation: `You play Nolbul cooperatively. The game state includes a RECOMMENDED action — follow it. Pick one JSON action from the "Available Actions" list. JSON only.`,

  smart_picker: `Nolbul AI. Pick the BEST action from "Available Actions" list.
Priority: Play (if listed) > Hint about playable card > Discard.
Only actions in the list are valid. JSON only.`,

  DISABLED_hint_first: `You are an expert Nolbul player. COOPERATIVE game — maximize team score.

## ABSOLUTE RULE
You CANNOT see your own cards. Cards with "??" are UNKNOWN to you.
⚠️ PLAYING AN UNKNOWN CARD = VERY LIKELY STRIKE. Avoid this at all costs.

## DECISION ALGORITHM (follow this EXACTLY):

STEP 1: Check your own cards. Do any have BOTH a color clue AND a rank clue that match a firework's next needed card?
  → YES: Play that card. (e.g., you know it's red and rank 1, and red firework needs 1)
  → NO: Go to Step 2.

STEP 2: Do you have clue tokens available (≥1)?
  → YES: Look at teammates' visible cards. Find one that is IMMEDIATELY playable (its rank = that color's firework level + 1). Give a hint about that card's rank or color.
  → NO (0 clue tokens): Go to Step 3.

STEP 3: You must discard. Pick the card with the FEWEST clues (preferably 0 clues). Never discard a card that has received hints.

## KEY PRINCIPLES
- Giving hints is almost ALWAYS better than playing unknown cards
- A strike (wrong play) is devastating — it wastes a card AND costs a life
- Discarding is safe when you pick unhinted cards
- The game context shows you other players' actual cards — USE this information to give precise hints

Respond with ONLY the JSON action object.`,

  conservative: `Nolbul AI. Cooperative game. You CANNOT see your own cards ("??" = unknown).

STRICT RULES:
1. NEVER play a card that has 0 clues. This is a BLIND play and almost always fails.
2. NEVER play a card unless you have BOTH color AND rank clues confirming it's playable.
3. DEFAULT action: Give a HINT. Look at teammates' cards and hint about playable ones.
4. If 0 clue tokens: DISCARD your card with fewest/no clues (lowest index with no clues).
5. If you have a fully-identified playable card (color+rank match next needed): PLAY it.

This order is MANDATORY: Hint > Play (only if certain) > Discard (only if 0 tokens).
JSON only, no explanation.`,

  numbered_steps: `You play Nolbul cooperatively. You CANNOT see your own cards.

For each turn, follow these numbered steps IN ORDER and stop at the first match:

1. SCAN your hand for cards with clues. If any card has clue "rank=R" AND "color=C", check: does color C's firework need rank R? If yes → PLAY that card.

2. If you have ≥1 clue token: LOOK at each teammate's hand (you CAN see their cards). Find a card where card.rank == fireworks[card.color] + 1. If found → HINT that player about the card's rank (prefer rank hints as they're more specific).

3. If you have ≥1 clue token but no teammate has an immediately playable card: give a hint about any useful information (e.g., hint about 5s so they won't be discarded).

4. If 0 clue tokens: DISCARD. Choose the card in YOUR hand with index 0 if it has no clues, or the highest-index card with no clues.

5. If nothing else applies: DISCARD card at index 0.

IMPORTANT: Steps 1-3 should cover 95% of situations. NEVER skip to play without checking step 1 first.

JSON action only.`,

  minimal_strict: `Nolbul. Cooperative. You can't see your own cards.

RULE: If you don't KNOW what your card is from clues → DON'T play it.
DEFAULT: Give a hint about a teammate's playable card.
NO TOKENS: Discard card with fewest clues.
KNOW YOUR CARD (color+rank clues match next firework): Play it.

JSON only.`,

  hint_only: `You play Nolbul. COOPERATIVE. You CANNOT see your own cards.

YOUR STRATEGY IS SIMPLE:
- ALWAYS give a HINT if you have clue tokens (≥1). Look at your teammate's cards (which you CAN see) and hint about their LOWEST-RANKED playable card.
- A card is "playable" if: fireworks[card.color] + 1 == card.rank
- If NO playable cards in teammate's hand: hint about their lowest rank.
- If 0 clue tokens: DISCARD your card at the HIGHEST index (rightmost card).
- ONLY play a card if it has BOTH color AND rank clues AND they match the next needed card for that color's firework pile.

⚠️ NEVER choose "play" unless the card's clues PROVE it's playable. When in doubt, HINT.

JSON only.`,

  explicit_example: `Nolbul cooperative game. You can't see your own cards.

DECISION TREE:
Q1: Do I have a card with both color=X and rank=Y clues, where fireworks[X]+1 == Y?
  YES → {"type":"play","playerIndex":MY_INDEX,"cardIndex":THAT_CARD_INDEX}
  NO → Q2

Q2: Do I have clue tokens ≥ 1?
  YES → Look at teammate's cards. Find card where fireworks[card.color]+1 == card.rank.
    FOUND → {"type":"hint","playerIndex":MY_INDEX,"targetIndex":TEAMMATE,"hint":{"type":"rank","value":card.rank}}
    NOT FOUND → Give any useful hint: {"type":"hint","playerIndex":MY_INDEX,"targetIndex":TEAMMATE,"hint":{"type":"rank","value":1}}
  NO → Q3

Q3: Discard rightmost card → {"type":"discard","playerIndex":MY_INDEX,"cardIndex":LAST_INDEX}

IMPORTANT: In Q1, cards shown as "??" with "no clues" = you do NOT know them. Skip Q1 for these.

Reply with ONLY the JSON.`,
};

// ─── API Helpers ───

async function api(path: string, method = 'GET', data?: unknown, headers?: Record<string, string>) {
  const res = await fetch(`${SERVER}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: data ? JSON.stringify(data) : undefined,
  });
  if (!res.ok) throw new Error(`API ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function callLLM(systemPrompt: string, userPrompt: string, maxTokens = 16384): Promise<string> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_completion_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM error ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? '';
}

function extractJSON(text: string): string {
  const start = text.indexOf('{');
  if (start === -1) throw new Error('No JSON');
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  throw new Error('Unbalanced JSON');
}

function parseAction(text: string, playerIndex: number) {
  const jsonStr = extractJSON(text);
  const raw = JSON.parse(jsonStr);
  // Sanitize
  const base = { type: raw.type, playerIndex };
  if (base.type === 'play' || base.type === 'discard') {
    return { ...base, cardIndex: raw.cardIndex };
  }
  if (base.type === 'hint') {
    return { ...base, targetIndex: raw.targetIndex, hint: { type: raw.hint.type, value: raw.hint.value } };
  }
  return base;
}

// ─── 2-Step Intent Inference ───

const INFERENCE_SYSTEM = `You are an expert Nolbul (Hanabi) player analyzing hint intent.
In Nolbul, you CANNOT see your own cards. Teammates give hints to communicate.

Hint conventions:
- PLAY signal: hint about a card that is immediately playable on the fireworks
- SAVE signal: hint about a card on your "chop" (oldest unclued card) because it's critical
- FIX clue: a second hint to complete information (e.g., you knew rank, now they tell color)

Analyze each hint I received and conclude what action I should take.
End with: CONCLUSION: <play/hint/discard> card [index] because <reason>`;

function buildInferencePrompt(view: {
  myIndex: number;
  fireworks: Record<string, number>;
  hands: { cards: { clues: { type: string; value: unknown }[] }[] }[];
  actionHistory: { type: string; playerIndex: number; targetIndex?: number; hint?: { type: string; value: unknown } }[];
  discardPile: { color?: string; rank?: number }[];
}): string | null {
  // Extract hints directed at me
  const hints = view.actionHistory
    .map((a, i) => ({ ...a, turn: i + 1 }))
    .filter(a => a.type === 'hint' && a.targetIndex === view.myIndex);

  if (hints.length === 0) return null;

  const fw = view.fireworks;
  const fwStr = Object.entries(fw).map(([c, v]) => `  ${c}: ${v}/5${(v as number) + 1 <= 5 ? ` (needs ${(v as number) + 1})` : ' DONE'}`).join('\n');

  const myHand = view.hands[view.myIndex];
  const handStr = myHand.cards.map((c, i) => {
    const clues = c.clues.length === 0 ? 'no clues' : c.clues.map(cl => `${cl.type}=${cl.value}`).join(', ');
    return `  [${i}] ${clues}`;
  }).join('\n');

  const hintStr = hints.map(h =>
    `  Turn ${h.turn}: Player ${h.playerIndex} hinted me ${h.hint!.type}=${h.hint!.value}`
  ).join('\n');

  return `Fireworks:\n${fwStr}\n\nMy hand (I cannot see actual cards):\n${handStr}\n\nHints given to me:\n${hintStr}\n\nWhat do these hints mean? What should I do?`;
}

// ─── Run a Single Game (2-step) ───

async function runGame2Step(systemPrompt: string, numPlayers: number): Promise<{ score: number; turns: number; strikes: number; actions: string[] }> {
  const g = await api('/games', 'POST', { options: { numPlayers }, creatorName: 'AI-0' });
  const creds = [{ gameId: g.gameId, apiKey: g.apiKey, playerIndex: 0 }];

  for (let i = 1; i < numPlayers; i++) {
    const j = await api(`/games/${g.gameId}/join`, 'POST', { playerName: `AI-${i}` });
    creds.push({ gameId: g.gameId, apiKey: j.apiKey, playerIndex: j.playerIndex });
  }

  await api(`/games/${g.gameId}/start`, 'POST', undefined, { 'x-api-key': creds[0].apiKey });

  const actionLog: string[] = [];
  let finished = false;
  let turnCount = 0;
  const MAX_TURNS = 100;

  while (!finished && turnCount < MAX_TURNS) {
    const state = await api(`/games/${g.gameId}`, undefined, undefined, { 'x-api-key': creds[0].apiKey });
    const currentPlayer = state.view.currentPlayer;
    if (state.view.status === 'finished') break;

    const cred = creds[currentPlayer];
    const ctx = await api(
      `/games/${g.gameId}/ai-context?includeRules=${turnCount < numPlayers ? 'true' : 'false'}`,
      undefined, undefined, { 'x-api-key': cred.apiKey }
    );

    // Step 1: Intent inference (if hints exist)
    let inferenceResult = '';
    const inferencePrompt = buildInferencePrompt(ctx.view);
    if (inferencePrompt) {
      try {
        inferenceResult = await callLLM(INFERENCE_SYSTEM, inferencePrompt);
      } catch { /* skip inference on error */ }
    }

    // Step 2: Action decision with inference injected
    let finalPrompt = ctx.prompt;
    if (inferenceResult) {
      // Inject before "## RECOMMENDED ACTION" or at the end
      const marker = '## RECOMMENDED ACTION';
      const idx = finalPrompt.indexOf(marker);
      const injection = `## Hint Intent Analysis (reasoning step)\n${inferenceResult}\n\nUse the above analysis to decide your action.\n\n`;
      finalPrompt = idx >= 0
        ? finalPrompt.slice(0, idx) + injection + finalPrompt.slice(idx)
        : finalPrompt + '\n\n' + injection;
    }

    let action;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await callLLM(systemPrompt, finalPrompt);
        action = parseAction(response, currentPlayer);
        break;
      } catch (e) {
        if (attempt === 2) action = ctx.view.legalActions[0];
      }
    }

    if (!action) break;

    try {
      const result = await api(`/games/${g.gameId}/actions`, 'POST', { action }, { 'x-api-key': cred.apiKey });
      actionLog.push(`T${turnCount + 1} P${currentPlayer}: ${action.type}${inferenceResult ? ' (2step)' : ''}`);
      finished = result.finished;
    } catch (e) {
      const fallback = ctx.view.legalActions[0];
      if (fallback) {
        const result = await api(`/games/${g.gameId}/actions`, 'POST', { action: fallback }, { 'x-api-key': cred.apiKey });
        actionLog.push(`T${turnCount + 1} P${currentPlayer}: ${fallback.type} (fallback)`);
        finished = result.finished;
      } else break;
    }

    turnCount++;
  }

  const final = await api(`/games/${g.gameId}`, undefined, undefined, { 'x-api-key': creds[0].apiKey });
  const fw = final.view.fireworks;
  const score = (fw.red ?? 0) + (fw.yellow ?? 0) + (fw.green ?? 0) + (fw.blue ?? 0) + (fw.white ?? 0);
  return { score, turns: turnCount, strikes: final.view.strikes.current, actions: actionLog };
}

// ─── Run a Single Game (1-step baseline) ───

async function runGame(systemPrompt: string, numPlayers: number): Promise<{ score: number; turns: number; strikes: number; actions: string[] }> {
  // Create game + players
  const g = await api('/games', 'POST', { options: { numPlayers }, creatorName: 'AI-0' });
  const creds = [{ gameId: g.gameId, apiKey: g.apiKey, playerIndex: 0 }];

  for (let i = 1; i < numPlayers; i++) {
    const j = await api(`/games/${g.gameId}/join`, 'POST', { playerName: `AI-${i}` });
    creds.push({ gameId: g.gameId, apiKey: j.apiKey, playerIndex: j.playerIndex });
  }

  await api(`/games/${g.gameId}/start`, 'POST', undefined, { 'x-api-key': creds[0].apiKey });

  const actionLog: string[] = [];
  let finished = false;
  let turnCount = 0;
  const MAX_TURNS = 100;

  while (!finished && turnCount < MAX_TURNS) {
    // Get current state
    const state = await api(`/games/${g.gameId}`, undefined, undefined, { 'x-api-key': creds[0].apiKey });
    const currentPlayer = state.view.currentPlayer;

    if (state.view.status === 'finished') break;

    // Get AI context for current player
    const cred = creds[currentPlayer];
    const ctx = await api(
      `/games/${g.gameId}/ai-context?includeRules=${turnCount < numPlayers ? 'true' : 'false'}`,
      undefined, undefined, { 'x-api-key': cred.apiKey }
    );

    // Call LLM
    let action;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await callLLM(systemPrompt, ctx.prompt);
        action = parseAction(response, currentPlayer);
        break;
      } catch (e) {
        if (attempt === 2) {
          // Fallback to first legal action
          action = ctx.view.legalActions[0];
        }
      }
    }

    if (!action) break;

    // Submit action
    try {
      const result = await api(`/games/${g.gameId}/actions`, 'POST', { action }, { 'x-api-key': cred.apiKey });
      actionLog.push(`T${turnCount + 1} P${currentPlayer}: ${action.type}`);
      finished = result.finished;
    } catch (e) {
      // Try fallback
      const fallback = ctx.view.legalActions[0];
      if (fallback) {
        const result = await api(`/games/${g.gameId}/actions`, 'POST', { action: fallback }, { 'x-api-key': cred.apiKey });
        actionLog.push(`T${turnCount + 1} P${currentPlayer}: ${fallback.type} (fallback)`);
        finished = result.finished;
      } else break;
    }

    turnCount++;
  }

  // Get final state
  const final = await api(`/games/${g.gameId}`, undefined, undefined, { 'x-api-key': creds[0].apiKey });
  const fw = final.view.fireworks;
  const score = (fw.red ?? 0) + (fw.yellow ?? 0) + (fw.green ?? 0) + (fw.blue ?? 0) + (fw.white ?? 0);

  return { score, turns: turnCount, strikes: final.view.strikes.current, actions: actionLog };
}

// ─── Main Experiment ───

async function main() {
  const NUM_PLAYERS = 2;
  const GAMES_PER_PROMPT = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--games') ?? '5', 10);
  const mode = process.argv.includes('--2step-only') ? '2step' : process.argv.includes('--1step-only') ? '1step' : 'both';

  console.log(`\n${'='.repeat(60)}`);
  console.log(`NOLBUL AI PROMPT EXPERIMENT`);
  console.log(`Players: ${NUM_PLAYERS}, Games per prompt: ${GAMES_PER_PROMPT}, Mode: ${mode}`);
  console.log(`LLM: ${modelArg} (Azure OpenAI)`);
  console.log(`${'='.repeat(60)}\n`);

  type Result = { name: string; scores: number[]; avg: number; strikes: number[] };
  const results: Result[] = [];

  async function bench(name: string, prompt: string, runner: (p: string, n: number) => Promise<{ score: number; turns: number; strikes: number; actions: string[] }>) {
    console.log(`\n--- Testing: ${name} (${GAMES_PER_PROMPT} games in parallel) ---`);

    const gameResults = await Promise.all(
      Array.from({ length: GAMES_PER_PROMPT }, (_, i) =>
        runner(prompt, NUM_PLAYERS)
          .then(r => { console.log(`  Game ${i + 1}: Score ${r.score}/25, Strikes ${r.strikes}, Turns ${r.turns}`); return r; })
          .catch(e => { console.error(`  Game ${i + 1}: FAILED — ${(e as Error).message}`); return { score: 0, turns: 0, strikes: 3, actions: [] }; })
      )
    );

    const scores = gameResults.map(r => r.score);
    const strikes = gameResults.map(r => r.strikes);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const avgStrikes = strikes.reduce((a, b) => a + b, 0) / strikes.length;
    results.push({ name, scores, avg, strikes });
    console.log(`  → Average: ${avg.toFixed(1)}/25, Avg strikes: ${avgStrikes.toFixed(1)}`);
  }

  // Select which prompts to test
  const promptArg = process.argv.find((_, i, a) => a[i - 1] === '--prompts');
  const selectedPrompts = promptArg
    ? promptArg.split(',')
    : Object.keys(SYSTEM_PROMPTS).filter(k => !k.startsWith('DISABLED'));

  // 1-step baselines
  if (mode !== '2step') {
    for (const name of selectedPrompts) {
      if (SYSTEM_PROMPTS[name]) {
        await bench(name, SYSTEM_PROMPTS[name], runGame);
      }
    }
  }

  // 2-step variants
  if (mode !== '1step') {
    for (const name of selectedPrompts) {
      if (SYSTEM_PROMPTS[name]) {
        await bench(`2step_${name}`, SYSTEM_PROMPTS[name], runGame2Step);
      }
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`RESULTS SUMMARY`);
  console.log(`${'='.repeat(60)}`);
  results.sort((a, b) => b.avg - a.avg);
  for (const r of results) {
    console.log(`  ${r.name.padEnd(25)} avg=${r.avg.toFixed(1)}/25  scores=[${r.scores.join(',')}]  strikes=[${r.strikes.join(',')}]`);
  }
  console.log(`\nBest: ${results[0]?.name} (avg ${results[0]?.avg.toFixed(1)})`);
}

main().catch(console.error);
