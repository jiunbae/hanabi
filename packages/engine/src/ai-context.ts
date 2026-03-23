/**
 * AI Context Builder
 *
 * Converts PlayerView into structured text that LLMs can reason about.
 * Provides game rules, current state, and legal actions in a format
 * optimized for LLM decision-making.
 */
import type { PlayerView, GameAction, Card, CardClue, Fireworks, Color } from './types.js';
import { COLORS, RANK_COPIES, MAX_CLUE_TOKENS, MAX_STRIKES, MAX_SCORE } from './constants.js';

// ─── Game Rules (static, comprehensive) ───

export const GAME_RULES = `# Nolbul — Rules

## GOAL
Build 5 firework displays (red, yellow, green, blue, white), each in order 1→2→3→4→5.
Score = sum of top card in each display (max 25).

## CORE RULE
You CANNOT see your own cards. You can see all teammates' cards.
You rely on hints from teammates to know what you hold.

## CARDS
- 5 colors × ranks 1-5 = 50 cards total
- Copies per rank: 1×3, 2×2, 3×2, 4×2, 5×1
- 5s have only 1 copy — losing one blocks that color.

## RESOURCES
- Clue tokens: ${MAX_CLUE_TOKENS} max. Spent to give hints, recovered by discarding.
- Strikes: ${MAX_STRIKES} max. Wrong plays cause strikes. ${MAX_STRIKES} strikes = game over.

## ACTIONS (pick exactly one per turn)

### 1. GIVE A HINT (cost: 1 clue token)
Tell a teammate about ALL their cards matching a color OR a rank.
- JSON: {"type":"hint","playerIndex":YOU,"targetIndex":TEAMMATE,"hint":{"type":"color","value":"red"}}
- JSON: {"type":"hint","playerIndex":YOU,"targetIndex":TEAMMATE,"hint":{"type":"rank","value":1}}

### 2. PLAY A CARD
Place a card on its color's display. Success only if rank = display top + 1.
- Success: card added. Playing a 5 recovers 1 clue token.
- Failure: strike + card lost.
- JSON: {"type":"play","playerIndex":YOU,"cardIndex":POSITION}

### 3. DISCARD A CARD (gain 1 clue token)
Remove a card. Only available when clue tokens < ${MAX_CLUE_TOKENS}.
- JSON: {"type":"discard","playerIndex":YOU,"cardIndex":POSITION}

## GAME ENDS
- All displays complete → score 25 (win)
- ${MAX_STRIKES} strikes → game over (lose)
- Deck empty → 1 final turn each

## STRATEGY
- Hint teammates about cards they can play NOW.
- Only play cards you KNOW from clues.
- Discard oldest un-clued card when tokens needed.
- Never play unknown cards — strikes are costly.
`;

// ─── Helpers ───

function formatCard(card: { color?: Color; rank?: number }): string {
  if (card.color && card.rank) return `${card.color} ${card.rank}`;
  return '??';
}

function formatClues(clues: readonly CardClue[]): string {
  if (clues.length === 0) return 'no clues';
  return clues
    .map((c) => (c.type === 'color' ? `known color=${c.value}` : `known rank=${c.value}`))
    .join(', ');
}

function formatFireworks(fw: Fireworks): string {
  return COLORS.map((c) => {
    const level = fw[c];
    const next = level + 1;
    return `  ${c}: ${level}/5${next <= 5 ? ` (needs ${c} ${next} next)` : ' ✅ COMPLETE'}`;
  }).join('\n');
}

function formatDiscardPile(pile: readonly Card[]): string {
  if (pile.length === 0) return '(empty)';
  const grouped = new Map<string, number>();
  for (const card of pile) {
    const key = formatCard(card);
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  return Array.from(grouped.entries())
    .map(([k, count]) => (count > 1 ? `${k} ×${count}` : k))
    .join(', ');
}

function formatAction(action: GameAction, playerNames?: string[]): string {
  const name = (i: number) => playerNames?.[i] ?? `Player ${i}`;
  switch (action.type) {
    case 'play':
      return `${name(action.playerIndex)} played card at index ${action.cardIndex}`;
    case 'discard':
      return `${name(action.playerIndex)} discarded card at index ${action.cardIndex}`;
    case 'hint':
      return `${name(action.playerIndex)} hinted ${name(action.targetIndex)}: ${action.hint.type}=${action.hint.value}`;
  }
}

// ─── Smart Analysis ───

function analyzeOwnHand(view: PlayerView): string {
  const hand = view.hands[view.myIndex];
  const lines: string[] = [];

  for (let idx = 0; idx < hand.cards.length; idx++) {
    const clues = hand.cards[idx].clues;
    const knownColor = clues.find(c => c.type === 'color')?.value as Color | undefined;
    const knownRank = clues.find(c => c.type === 'rank')?.value as number | undefined;

    if (knownColor && knownRank) {
      const needed = view.fireworks[knownColor] + 1;
      if (knownRank === needed) {
        lines.push(`  [${idx}] I know: ${knownColor} ${knownRank} → ✅ SAFE TO PLAY (firework needs this!)`);
      } else if (knownRank < needed) {
        lines.push(`  [${idx}] I know: ${knownColor} ${knownRank} → Already played, safe to DISCARD`);
      } else {
        lines.push(`  [${idx}] I know: ${knownColor} ${knownRank} → Keep for later (not needed yet)`);
      }
    } else if (knownRank) {
      lines.push(`  [${idx}] I know rank=${knownRank} but NOT color → DO NOT PLAY (risky)`);
    } else if (knownColor) {
      lines.push(`  [${idx}] I know color=${knownColor} but NOT rank → DO NOT PLAY (risky)`);
    } else {
      lines.push(`  [${idx}] No clues at all → DO NOT PLAY, safe to DISCARD`);
    }
  }
  return lines.join('\n');
}

function analyzeTeammates(view: PlayerView, playerNames?: string[]): string {
  const name = (i: number) => playerNames?.[i] ?? `Player ${i}`;
  const lines: string[] = [];

  for (let i = 0; i < view.hands.length; i++) {
    if (i === view.myIndex) continue;
    const hand = view.hands[i];

    for (let idx = 0; idx < hand.cards.length; idx++) {
      const card = hand.cards[idx];
      if (card.color && card.rank && view.fireworks[card.color] + 1 === card.rank) {
        const knowsColor = card.clues.some(c => c.type === 'color' && c.value === card.color);
        const knowsRank = card.clues.some(c => c.type === 'rank' && c.value === card.rank);
        if (!knowsRank) {
          lines.push(`  ${name(i)} has ${card.color} ${card.rank} at [${idx}] — PLAYABLE! Hint rank=${card.rank} to help them.`);
        } else if (!knowsColor) {
          lines.push(`  ${name(i)} has ${card.color} ${card.rank} at [${idx}] — PLAYABLE! Hint color=${card.color} to help them.`);
        } else {
          lines.push(`  ${name(i)} has ${card.color} ${card.rank} at [${idx}] — PLAYABLE and they know it (both clues given).`);
        }
      }
    }
  }

  if (lines.length === 0) lines.push('  No teammates have immediately playable cards right now.');
  return lines.join('\n');
}

function getRecommendation(view: PlayerView): string {
  const myHand = view.hands[view.myIndex];
  const pi = view.myIndex;

  // 1. Known playable card?
  for (let idx = 0; idx < myHand.cards.length; idx++) {
    const clues = myHand.cards[idx].clues;
    const knownColor = clues.find(c => c.type === 'color')?.value as Color | undefined;
    const knownRank = clues.find(c => c.type === 'rank')?.value as number | undefined;
    if (knownColor && knownRank && view.fireworks[knownColor] + 1 === knownRank) {
      return `Play card [${idx}] — you KNOW it's ${knownColor} ${knownRank} and the firework needs it.\nJSON: {"type":"play","playerIndex":${pi},"cardIndex":${idx}}`;
    }
  }

  // 2. Hint a teammate's playable card
  if (view.clueTokens.current > 0) {
    for (let i = 0; i < view.hands.length; i++) {
      if (i === pi) continue;
      for (const card of view.hands[i].cards) {
        if (card.color && card.rank && view.fireworks[card.color] + 1 === card.rank) {
          const knowsRank = card.clues.some(c => c.type === 'rank' && c.value === card.rank);
          if (!knowsRank) {
            return `Hint Player ${i} about rank=${card.rank} — they have a playable ${card.color} ${card.rank}.\nJSON: {"type":"hint","playerIndex":${pi},"targetIndex":${i},"hint":{"type":"rank","value":${card.rank}}}`;
          }
          const knowsColor = card.clues.some(c => c.type === 'color' && c.value === card.color);
          if (!knowsColor) {
            return `Hint Player ${i} about color=${card.color} — they have a playable ${card.color} ${card.rank}.\nJSON: {"type":"hint","playerIndex":${pi},"targetIndex":${i},"hint":{"type":"color","value":"${card.color}"}}`;
          }
        }
      }
    }
    // Give any useful hint
    const hints = view.legalActions.filter(a => a.type === 'hint');
    if (hints.length > 0) {
      const h = hints[0] as { type: 'hint'; playerIndex: number; targetIndex: number; hint: { type: string; value: unknown } };
      return `Give a useful hint to a teammate.\nJSON: ${JSON.stringify(h)}`;
    }
  }

  // 3. Discard safest card
  let bestIdx = myHand.cards.length - 1;
  for (let idx = myHand.cards.length - 1; idx >= 0; idx--) {
    if (myHand.cards[idx].clues.length === 0) { bestIdx = idx; break; }
  }
  return `Discard card [${bestIdx}] (no clues = safest to lose).\nJSON: {"type":"discard","playerIndex":${pi},"cardIndex":${bestIdx}}`;
}

// ─── Main Builder ───

export interface AIContextOptions {
  playerNames?: string[];
  includeRules?: boolean;
  recentActionsLimit?: number;
}

export function buildAIContext(view: PlayerView, options: AIContextOptions = {}): string {
  const { playerNames, includeRules = true, recentActionsLimit = 10 } = options;
  const name = (i: number) => playerNames?.[i] ?? `Player ${i}`;
  const sections: string[] = [];

  // 1. Rules + action definitions + examples
  if (includeRules) {
    sections.push(GAME_RULES);
  }

  // 2. Game state overview
  const score = Object.values(view.fireworks).reduce((a, b) => a + b, 0);
  sections.push(`# Current Game State
You are ${name(view.myIndex)} (playerIndex=${view.myIndex}).
It is YOUR turn. You must choose ONE action.

Score: ${score}/${MAX_SCORE} | Clue tokens: ${view.clueTokens.current}/${view.clueTokens.max} | Strikes: ${view.strikes.current}/${view.strikes.max} | Deck: ${view.deckSize} cards left${view.turnsLeft !== null ? ` | FINAL ROUND: ${view.turnsLeft} turns left!` : ''}`);

  // 3. Fireworks - what each pile needs
  sections.push(`## Firework Piles (goal: build each to 5)\n${formatFireworks(view.fireworks)}`);

  // 4. All hands
  const handLines: string[] = [];
  for (let i = 0; i < view.hands.length; i++) {
    const hand = view.hands[i];
    if (i === view.myIndex) {
      handLines.push(`\n### YOUR hand (you CANNOT see these — only clues shown):`);
      hand.cards.forEach((card, idx) => {
        handLines.push(`  [${idx}] ?? — ${formatClues(card.clues)}`);
      });
    } else {
      handLines.push(`\n### ${name(i)}'s hand (you CAN see these):`);
      hand.cards.forEach((card, idx) => {
        const playable = card.color && card.rank && view.fireworks[card.color] + 1 === card.rank;
        handLines.push(`  [${idx}] ${formatCard(card)}${playable ? ' ← PLAYABLE NOW!' : ''} — ${formatClues(card.clues)}`);
      });
    }
  }
  sections.push(`## Hands${handLines.join('\n')}`);

  // 5. Your hand analysis
  sections.push(`## What you know about YOUR cards (deduced from clues)\n${analyzeOwnHand(view)}`);

  // 6. Teammate playable analysis
  sections.push(`## Teammates' playable cards (you can see these!)\n${analyzeTeammates(view, playerNames)}`);

  // 7. Discard pile
  sections.push(`## Discard pile: ${formatDiscardPile(view.discardPile)}`);

  // 8. Recent history
  const recent = view.actionHistory.slice(-recentActionsLimit);
  if (recent.length > 0) {
    sections.push(`## Recent actions\n${recent.map(
      (a, i) => `  ${view.actionHistory.length - recent.length + i + 1}. ${formatAction(a, playerNames)}`
    ).join('\n')}`);
  }

  // 9. RECOMMENDED action with full JSON
  if (view.legalActions.length > 0) {
    sections.push(`## RECOMMENDED ACTION\n${getRecommendation(view)}`);
  }

  // 10. Available actions (filtered — no blind plays)
  if (view.legalActions.length > 0) {
    const myHand = view.hands[view.myIndex];
    const safePlays = view.legalActions.filter(a => {
      if (a.type !== 'play') return false;
      const clues = myHand.cards[a.cardIndex]?.clues ?? [];
      const knownColor = clues.find(c => c.type === 'color')?.value as Color | undefined;
      const knownRank = clues.find(c => c.type === 'rank')?.value as number | undefined;
      return !!(knownColor && knownRank && view.fireworks[knownColor] + 1 === knownRank);
    });
    const hints = view.legalActions.filter(a => a.type === 'hint');
    const discards = view.legalActions.filter(a => a.type === 'discard');
    const actions = [...safePlays, ...hints, ...discards];
    const finalActions = actions.length > 0 ? actions : view.legalActions;

    sections.push(`## Available actions (choose ONE — copy the JSON exactly)\n${finalActions.map((a, i) => `${i + 1}. ${JSON.stringify(a)}`).join('\n')}`);
  }

  sections.push(`Reply with ONLY one JSON object from the list above. No explanation needed.`);

  return sections.join('\n\n');
}

export function buildAIContextCompact(view: PlayerView, options: AIContextOptions = {}): string {
  return buildAIContext(view, { ...options, includeRules: false, recentActionsLimit: 5 });
}
