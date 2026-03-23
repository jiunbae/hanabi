/**
 * AI Context Builder
 *
 * Converts PlayerView into structured text that LLMs can reason about.
 * Provides game rules, current state, and legal actions in a format
 * optimized for LLM decision-making.
 */
import type { PlayerView, GameAction, Card, CardClue, Fireworks, Color } from './types.js';
import { COLORS, RANK_COPIES, MAX_CLUE_TOKENS, MAX_STRIKES, MAX_SCORE } from './constants.js';

// ─── Game Rules (static) ───

export const GAME_RULES = `# Hanabi — Game Rules

Hanabi is a **cooperative** card game where players work together to build fireworks.
Players can see everyone else's cards but NOT their own.

## Cards
- 5 colors: red, yellow, green, blue, white
- Ranks 1–5 per color (50 cards total)
- Copies per rank: 1→3, 2→2, 3→2, 4→2, 5→1

## Goal
Build 5 firework piles (one per color), each from rank 1 to 5 in order.
Perfect score = 25 (all five colors completed to rank 5).

## Resources
- Clue tokens: start at ${MAX_CLUE_TOKENS} (max ${MAX_CLUE_TOKENS})
- Strikes: 0 (max ${MAX_STRIKES} — game over at ${MAX_STRIKES})

## Actions (one per turn)
1. **Play a card** — Place a card from your hand onto a firework pile.
   - Success: card rank is exactly (current pile level + 1) for that color.
   - Completing rank 5 grants a bonus clue token (if below max).
   - Failure: strike! The card is discarded. ${MAX_STRIKES} strikes = game over.
2. **Discard a card** — Remove a card from your hand. Gain 1 clue token (if below max).
   - Cannot discard when clue tokens are at maximum (${MAX_CLUE_TOKENS}).
3. **Give a hint** — Costs 1 clue token. Tell another player about ALL cards in their hand matching a specific color or rank.
   - Must have at least 1 clue token.
   - Cannot hint yourself.
   - The hint must touch at least 1 card.

## End Conditions
- **Win**: All 5 fireworks reach rank 5 (score 25).
- **Loss**: 3 strikes accumulated.
- **Deck exhausted**: Each player gets one more turn, then the game ends.
  Final score = sum of highest rank in each firework pile.

## Key Constraint
You CANNOT see your own cards. You must rely on hints from other players
and logical deduction based on game history to decide what to play or discard.
`;

// ─── State Formatting ───

function formatCard(card: { color?: Color; rank?: number }): string {
  if (card.color && card.rank) return `${card.color[0].toUpperCase()}${card.rank}`;
  return '??';
}

function formatClues(clues: readonly CardClue[]): string {
  if (clues.length === 0) return 'no clues';
  return clues
    .map((c) => (c.type === 'color' ? `color=${c.value}` : `rank=${c.value}`))
    .join(', ');
}

function formatFireworks(fw: Fireworks): string {
  return COLORS.map((c) => `${c}: ${fw[c]}/5`).join(', ');
}

function formatDiscardPile(pile: readonly Card[]): string {
  if (pile.length === 0) return 'empty';
  const grouped = new Map<string, number>();
  for (const card of pile) {
    const key = formatCard(card);
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  return Array.from(grouped.entries())
    .map(([k, count]) => (count > 1 ? `${k}×${count}` : k))
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

function formatLegalAction(action: GameAction): string {
  switch (action.type) {
    case 'play':
      return `Play card at index ${action.cardIndex}`;
    case 'discard':
      return `Discard card at index ${action.cardIndex}`;
    case 'hint':
      return `Hint Player ${action.targetIndex} about ${action.hint.type}=${action.hint.value}`;
  }
}

// ─── Remaining Cards Tracker ───

function getRemainingCards(view: PlayerView): Map<string, number> {
  // Start with full deck counts
  const remaining = new Map<string, number>();
  for (const color of COLORS) {
    for (const [rankStr, count] of Object.entries(RANK_COPIES)) {
      remaining.set(`${color[0].toUpperCase()}${rankStr}`, count);
    }
  }
  // Subtract fireworks (played cards)
  for (const color of COLORS) {
    for (let r = 1; r <= view.fireworks[color]; r++) {
      const key = `${color[0].toUpperCase()}${r}`;
      remaining.set(key, (remaining.get(key) ?? 1) - 1);
    }
  }
  // Subtract discard pile
  for (const card of view.discardPile) {
    const key = formatCard(card);
    remaining.set(key, (remaining.get(key) ?? 1) - 1);
  }
  // Remove zero entries
  for (const [k, v] of remaining) {
    if (v <= 0) remaining.delete(k);
  }
  return remaining;
}

function formatCriticalCards(view: PlayerView): string {
  const remaining = getRemainingCards(view);
  const critical: string[] = [];
  for (const color of COLORS) {
    const nextRank = view.fireworks[color] + 1;
    if (nextRank > 5) continue;
    const key = `${color[0].toUpperCase()}${nextRank}`;
    const count = remaining.get(key) ?? 0;
    if (count === 1) critical.push(`${key} (last copy!)`);
    else if (count === 0) critical.push(`${key} (impossible — all discarded)`);
  }
  if (critical.length === 0) return 'None currently critical.';
  return critical.join(', ');
}

// ─── Main Builder ───

export interface AIContextOptions {
  /** Player names for readability */
  playerNames?: string[];
  /** Include full game rules (default: true on first call) */
  includeRules?: boolean;
  /** Max recent actions to show (default: 10) */
  recentActionsLimit?: number;
}

/**
 * Build a complete AI context string from a PlayerView.
 * This is the primary function LLM agents should consume.
 */
export function buildAIContext(view: PlayerView, options: AIContextOptions = {}): string {
  const {
    playerNames,
    includeRules = true,
    recentActionsLimit = 10,
  } = options;

  const name = (i: number) => playerNames?.[i] ?? `Player ${i}`;
  const sections: string[] = [];

  // 1. Rules (optional)
  if (includeRules) {
    sections.push(GAME_RULES);
  }

  // 2. Game overview
  sections.push(`# Current Game State

You are **${name(view.myIndex)}** (Player ${view.myIndex}).
Turn: ${view.turn} | Current player: ${name(view.currentPlayer)} (Player ${view.currentPlayer})
Status: ${view.status}${view.turnsLeft !== null ? ` | Final countdown: ${view.turnsLeft} turns remaining` : ''}
Score: ${Object.values(view.fireworks).reduce((a, b) => a + b, 0)}/${MAX_SCORE}
Clue tokens: ${view.clueTokens.current}/${view.clueTokens.max}
Strikes: ${view.strikes.current}/${view.strikes.max}
Deck: ${view.deckSize} cards remaining`);

  // 3. Fireworks
  sections.push(`## Fireworks (Current Piles)
${formatFireworks(view.fireworks)}
Next needed: ${COLORS.map((c) => {
    const next = view.fireworks[c] + 1;
    return next <= 5 ? `${c}→${next}` : `${c}→done`;
  }).join(', ')}`);

  // 4. Hands
  const handLines: string[] = ['## Hands'];
  for (let i = 0; i < view.hands.length; i++) {
    const hand = view.hands[i];
    if (i === view.myIndex) {
      handLines.push(`\n### ${name(i)} (YOU) — You cannot see your own cards`);
      hand.cards.forEach((card, idx) => {
        handLines.push(`  [${idx}] ?? (${formatClues(card.clues)})`);
      });
    } else {
      handLines.push(`\n### ${name(i)}`);
      hand.cards.forEach((card, idx) => {
        handLines.push(`  [${idx}] ${formatCard(card)} (${formatClues(card.clues)})`);
      });
    }
  }
  sections.push(handLines.join('\n'));

  // 5. Discard pile
  sections.push(`## Discard Pile
${formatDiscardPile(view.discardPile)}`);

  // 6. Critical cards
  sections.push(`## Critical Cards (only 1 copy left or blocked)
${formatCriticalCards(view)}`);

  // 7. Recent action history
  const recent = view.actionHistory.slice(-recentActionsLimit);
  if (recent.length > 0) {
    const historyLines = recent.map(
      (a, i) => `  ${view.actionHistory.length - recent.length + i + 1}. ${formatAction(a, playerNames)}`,
    );
    sections.push(`## Recent Actions (last ${recent.length})
${historyLines.join('\n')}`);
  } else {
    sections.push('## Recent Actions\nNo actions yet (game just started).');
  }

  // 8. Legal actions
  if (view.legalActions.length > 0) {
    sections.push(`## Your Legal Actions
You MUST choose exactly one action. Respond with the JSON object.

${view.legalActions.map((a, i) => `${i + 1}. ${formatLegalAction(a)}
   → ${JSON.stringify(a)}`).join('\n')}`);
  } else if (view.status === 'playing') {
    sections.push("## Not your turn\nWait for your turn to act.");
  }

  // 9. Response format
  if (view.legalActions.length > 0) {
    sections.push(`## Response Format
Reply with ONLY a JSON object matching one of the legal actions above. Example:
\`\`\`json
{"type":"play","playerIndex":${view.myIndex},"cardIndex":0}
\`\`\`

Think step by step about:
1. What do I know about my cards from clues and game history?
2. What cards do other players have? Are any critical or playable?
3. Should I play (if confident), hint (to help a teammate), or discard (to gain clues)?
4. Which specific action maximizes our cooperative score?`);
  }

  return sections.join('\n\n');
}

/**
 * Compact version for subsequent turns (no rules, fewer actions).
 */
export function buildAIContextCompact(view: PlayerView, options: AIContextOptions = {}): string {
  return buildAIContext(view, { ...options, includeRules: false, recentActionsLimit: 5 });
}
