/**
 * AI Bot Service
 *
 * Manages server-side AI players that use LLM APIs to play Nolbul.
 * Hooks into GameManager events to auto-play when it's an AI player's turn.
 */
import { buildAIContext, buildAIContextCompact, buildIntentInferencePrompt, buildAIContextWithInference, getPlayerView } from '@nolbul/engine';
import type { GameAction, PlayerView } from '@nolbul/engine';
import { gameManager } from './game-manager.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { llmCallsTotal, llmCallDurationSeconds, llmFallbacksTotal, aiTurnsTotal } from '../metrics.js';

const AI_TURN_DELAY_MS = 1500;
const MAX_RETRIES = 3;
const MAX_CONSECUTIVE_AI_TURNS = 50; // Circuit breaker for all-AI games

// ─── Load prompt config ───

interface AIPromptConfig {
  system: Record<string, string>;
  temperature: number;
  maxTokens: number;
}

function loadPromptConfig(): AIPromptConfig {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const configPath = join(__dirname, '..', 'config', 'ai-prompts.json');
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return {
      system: { default: 'You play Nolbul cooperatively. Follow the RECOMMENDED ACTION. Respond with ONLY a valid JSON action object.' },
      temperature: 0.2,
      maxTokens: 256,
    };
  }
}

const promptConfig = loadPromptConfig();

// ─── LLM Provider Interface ───

interface LLMProvider {
  name: string;
  generateAction(prompt: string): Promise<GameAction>;
  generateText(prompt: string, systemPrompt?: string): Promise<string>;
}

// ─── Provider Implementations (lazy-loaded) ───

class ClaudeProvider implements LLMProvider {
  name = 'Claude';
  private client: unknown = null;
  private model: string;
  private apiKey: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model ?? 'claude-sonnet-4-20250514';
  }

  private async getClient(): Promise<import('@anthropic-ai/sdk').default> {
    if (!this.client) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      this.client = new Anthropic({ apiKey: this.apiKey });
    }
    return this.client as import('@anthropic-ai/sdk').default;
  }

  async generateAction(prompt: string): Promise<GameAction> {
    const client = await this.getClient();
    const response = await client.messages.create({
      model: this.model,
      max_tokens: promptConfig.maxTokens,
      system: promptConfig.system.default,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    return parseActionFromLLM(text);
  }

  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    const client = await this.getClient();
    const response = await client.messages.create({
      model: this.model,
      max_tokens: 512,
      system: systemPrompt ?? 'You are an expert Nolbul (Hanabi) player analyzing game state.',
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0].type === 'text' ? response.content[0].text : '';
  }
}

class OpenAIProvider implements LLMProvider {
  name: string;
  private client: unknown = null;
  private model: string;
  private apiKey: string;
  private baseURL?: string;
  private isAzure: boolean;

  constructor(apiKey: string, model?: string, baseURL?: string) {
    this.apiKey = apiKey;
    this.model = model ?? 'gpt-4o';
    this.baseURL = baseURL;
    this.isAzure = !!baseURL?.includes('azure');
    this.name = `OpenAI (${this.model})`;
  }

  private async getClient(): Promise<import('openai').default> {
    if (!this.client) {
      if (this.isAzure) {
        const { AzureOpenAI } = await import('openai');
        this.client = new AzureOpenAI({
          apiKey: this.apiKey,
          endpoint: this.baseURL!.replace(/\/openai\/deployments\/.*/, ''),
          apiVersion: '2025-01-01-preview',
          deployment: this.model,
        });
      } else {
        const { default: OpenAI } = await import('openai');
        this.client = new OpenAI({
          apiKey: this.apiKey,
          ...(this.baseURL && { baseURL: this.baseURL }),
        });
      }
    }
    return this.client as import('openai').default;
  }

  async generateAction(prompt: string): Promise<GameAction> {
    const client = await this.getClient();
    const response = await client.chat.completions.create({
      model: this.model,
      max_completion_tokens: promptConfig.maxTokens,
      messages: [
        { role: 'system', content: promptConfig.system.default },
        { role: 'user', content: prompt },
      ],
    });
    const text = response.choices[0]?.message?.content ?? '';
    return parseActionFromLLM(text);
  }

  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    const client = await this.getClient();
    const response = await client.chat.completions.create({
      model: this.model,
      max_completion_tokens: 512,
      messages: [
        { role: 'system', content: systemPrompt ?? 'You are an expert Nolbul (Hanabi) player analyzing game state.' },
        { role: 'user', content: prompt },
      ],
    });
    return response.choices[0]?.message?.content ?? '';
  }
}

class GeminiProvider implements LLMProvider {
  name: string;
  private inner: OpenAIProvider;

  constructor(apiKey: string, model?: string) {
    this.inner = new OpenAIProvider(
      apiKey,
      model ?? 'gemini-2.5-flash',
      'https://generativelanguage.googleapis.com/v1beta/openai/',
    );
    this.name = `Gemini (${model ?? 'gemini-2.5-flash'})`;
  }

  async generateAction(prompt: string): Promise<GameAction> {
    return this.inner.generateAction(prompt);
  }

  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    return this.inner.generateText(prompt, systemPrompt);
  }
}

function extractJSON(text: string): string {
  // Find the first balanced { ... } block, supporting nested objects
  const start = text.indexOf('{');
  if (start === -1) throw new Error(`No JSON found in LLM response: ${text.slice(0, 200)}`);
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`Unbalanced JSON in LLM response: ${text.slice(0, 200)}`);
}

function parseActionFromLLM(text: string): GameAction {
  let cleaned = text.trim();
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) cleaned = codeBlockMatch[1].trim();

  const jsonStr = extractJSON(cleaned);
  const raw = JSON.parse(jsonStr);
  if (!raw.type || !['play', 'discard', 'hint'].includes(raw.type)) {
    throw new Error(`Invalid action type: ${raw.type}`);
  }
  if (typeof raw.playerIndex !== 'number') {
    throw new Error('Missing playerIndex');
  }

  // Sanitize: only pick known fields to prevent extra property injection
  const base = { type: raw.type as string, playerIndex: raw.playerIndex as number };
  if (base.type === 'play' || base.type === 'discard') {
    if (typeof raw.cardIndex !== 'number' || raw.cardIndex < 0) {
      throw new Error(`Invalid cardIndex: ${raw.cardIndex}`);
    }
    return { ...base, cardIndex: raw.cardIndex } as GameAction;
  }
  if (base.type === 'hint') {
    if (typeof raw.targetIndex !== 'number') throw new Error('Missing targetIndex');
    if (!raw.hint || !raw.hint.type || !raw.hint.value) throw new Error('Missing hint details');
    return {
      ...base,
      targetIndex: raw.targetIndex,
      hint: { type: raw.hint.type, value: raw.hint.value },
    } as GameAction;
  }
  return base as GameAction;
}

// ─── AI Bot Service ───

class AIBotService {
  /** gameId → Set of AI player indices */
  private aiPlayers = new Map<string, Set<number>>();
  private provider: LLMProvider | null = null;
  private providerName: string;
  private modelName: string;
  private activeTurns = new Set<string>(); // games with an AI turn currently executing
  private consecutiveTurns = new Map<string, number>(); // circuit breaker per game

  constructor() {
    this.providerName = process.env.AI_PROVIDER ?? 'claude';
    this.modelName = process.env.AI_MODEL ?? '';
    this.initProvider();
    this.registerHooks();
  }

  private initProvider(): void {
    const providerName = this.providerName.toLowerCase();
    try {
      if (providerName === 'claude' && process.env.ANTHROPIC_API_KEY) {
        this.provider = new ClaudeProvider(process.env.ANTHROPIC_API_KEY, this.modelName || undefined);
      } else if ((providerName === 'openai' || providerName === 'gpt') && process.env.OPENAI_API_KEY) {
        this.provider = new OpenAIProvider(process.env.OPENAI_API_KEY, this.modelName || undefined, process.env.OPENAI_BASE_URL);
      } else if (providerName === 'gemini' && process.env.GEMINI_API_KEY) {
        this.provider = new GeminiProvider(process.env.GEMINI_API_KEY, this.modelName || undefined);
      } else {
        // Try auto-detect from available keys
        if (process.env.ANTHROPIC_API_KEY) {
          this.provider = new ClaudeProvider(process.env.ANTHROPIC_API_KEY, this.modelName || undefined);
          this.providerName = 'claude';
        } else if (process.env.OPENAI_API_KEY) {
          this.provider = new OpenAIProvider(process.env.OPENAI_API_KEY, this.modelName || undefined);
          this.providerName = 'openai';
        } else if (process.env.GEMINI_API_KEY) {
          this.provider = new GeminiProvider(process.env.GEMINI_API_KEY, this.modelName || undefined);
          this.providerName = 'gemini';
        }
      }
    } catch (e) {
      console.error('Failed to initialize AI provider:', e);
    }

    if (this.provider) {
      console.log(`AI Bot: ${this.provider.name} ready`);
    } else {
      console.log('AI Bot: No LLM API key configured — AI players disabled');
    }
  }

  private registerHooks(): void {
    gameManager.onGameEvicted((gameId) => this.removeGame(gameId));

    gameManager.onGameStarted((gameId, state) => {
      this.consecutiveTurns.set(gameId, 0);
      this.scheduleAITurn(gameId, state.currentPlayer);
    });

    gameManager.onGameAction((gameId, state) => {
      if (state.status !== 'playing') {
        this.removeGame(gameId);
        return;
      }

      // If an AI turn chain is already running for this game, skip —
      // the chain handles its own scheduling in scheduleAITurn.
      if (this.activeTurns.has(gameId)) return;

      // Reset consecutive counter when a human plays
      if (!this.isAIPlayer(gameId, state.currentPlayer)) {
        this.consecutiveTurns.set(gameId, 0);
      }

      this.scheduleAITurn(gameId, state.currentPlayer);
    });
  }

  isConfigured(): boolean {
    return this.provider !== null;
  }

  getConfig(): { provider: string; model: string; configured: boolean } {
    return {
      provider: this.providerName,
      model: this.modelName || (this.provider?.name ?? 'none'),
      configured: this.isConfigured(),
    };
  }

  updateConfig(provider: string, model: string): void {
    this.providerName = provider;
    this.modelName = model;
    this.provider = null;
    this.initProvider();
  }

  isAIPlayer(gameId: string, playerIndex: number): boolean {
    return this.aiPlayers.get(gameId)?.has(playerIndex) ?? false;
  }

  getAIPlayers(gameId: string): number[] {
    const map = this.aiPlayers.get(gameId);
    return map ? Array.from(map.keys()) : [];
  }

  /** Add an AI player to a waiting game. Returns the joined player info. */
  addAIPlayer(gameId: string): { playerIndex: number; name: string } {
    if (!this.isConfigured()) {
      throw new Error('AI is not configured — set an LLM API key in server environment');
    }

    const aiName = `AI-${this.provider!.name}`;
    const { playerIndex } = gameManager.joinGame(gameId, aiName);

    if (!this.aiPlayers.has(gameId)) {
      this.aiPlayers.set(gameId, new Set());
    }
    this.aiPlayers.get(gameId)!.add(playerIndex);

    return { playerIndex, name: aiName };
  }

  /** Clean up AI state for a game. Called on eviction and game finish. */
  removeGame(gameId: string): void {
    this.aiPlayers.delete(gameId);
    this.activeTurns.delete(gameId);
    this.consecutiveTurns.delete(gameId);
  }

  /**
   * Schedule an AI turn. After completing, checks if the NEXT player is also AI
   * and chains directly — does NOT rely on onActionCallbacks for AI→AI chaining.
   */
  private scheduleAITurn(gameId: string, playerIndex: number): void {
    if (!this.isAIPlayer(gameId, playerIndex)) return;
    if (this.activeTurns.has(gameId)) return; // prevent double-scheduling

    const consecutive = (this.consecutiveTurns.get(gameId) ?? 0) + 1;
    if (consecutive > MAX_CONSECUTIVE_AI_TURNS) {
      console.warn(`AI Bot circuit breaker: ${consecutive} consecutive turns in game ${gameId}, stopping`);
      return;
    }
    this.consecutiveTurns.set(gameId, consecutive);

    this.activeTurns.add(gameId);
    setTimeout(async () => {
      try {
        if (!this.aiPlayers.has(gameId)) return; // game removed

        await this.playTurn(gameId, playerIndex);

        // After this AI played, check if the next current player is ALSO AI.
        // This drives the AI→AI chain without relying on callbacks.
        try {
          const state = gameManager.getRoomState(gameId);
          if (state && state.status === 'playing') {
            const nextPlayer = state.currentPlayer;
            if (this.isAIPlayer(gameId, nextPlayer)) {
              this.activeTurns.delete(gameId);
              this.scheduleAITurn(gameId, nextPlayer);
              return; // don't delete activeTurns below
            }
          }
        } catch {
          // game may have been evicted
        }
      } catch (err) {
        console.error(`AI Bot turn failed [game=${gameId}, player=${playerIndex}]:`, err);
      } finally {
        this.activeTurns.delete(gameId);
      }
    }, AI_TURN_DELAY_MS);
  }

  // ─── Advanced Strategy Engine (H-Group Convention Based) ───

  private fw(view: PlayerView): Record<string, number> {
    return view.fireworks as unknown as Record<string, number>;
  }

  /** Check if a card is playable on current fireworks */
  private isPlayable(fw: Record<string, number>, color: string, rank: number): boolean {
    return fw[color] + 1 === rank;
  }

  /** Check if a card is already played (useless) */
  private isUseless(fw: Record<string, number>, color: string, rank: number): boolean {
    return fw[color] >= rank;
  }

  /** Check if a card is critical (last copy remaining) */
  private isCritical(view: PlayerView, color: string, rank: number): boolean {
    if (rank === 5) return true; // 5s are always critical
    const copies = rank === 1 ? 3 : 2;
    const discarded = view.discardPile.filter(c => c.color === color && c.rank === rank).length;
    return discarded >= copies - 1; // last copy
  }

  /** Get the "chop" card index (oldest unclued card = rightmost with no clues) */
  private getChopIndex(hand: PlayerView['hands'][0]): number {
    for (let i = hand.cards.length - 1; i >= 0; i--) {
      if (hand.cards[i].clues.length === 0) return i;
    }
    return hand.cards.length - 1; // all clued — chop is rightmost
  }

  /** Determine what we know about our own card from clues */
  private getKnownInfo(card: PlayerView['hands'][0]['cards'][0]): { color?: string; rank?: number } {
    const color = card.clues.find(c => c.type === 'color')?.value as string | undefined;
    const rank = card.clues.find(c => c.type === 'rank')?.value as number | undefined;
    return { color, rank };
  }

  /** Check if rank-only clue makes a card very likely playable */
  private isRankOnlyPlayable(fw: Record<string, number>, rank: number): boolean {
    // If rank=1, it's always playable (all colors start at 0)
    if (rank === 1) {
      return Object.values(fw).some(v => v === 0);
    }
    // Count how many colors need this rank
    const colorsNeedingRank = Object.entries(fw).filter(([_, v]) => v + 1 === rank).length;
    const colorsTotal = Object.keys(fw).length;
    // If most colors need this rank, it's likely playable
    return colorsNeedingRank >= Math.ceil(colorsTotal / 2);
  }

  /** Compute strategic action using H-Group conventions */
  private getSmartAction(view: PlayerView, playerIndex: number): GameAction {
    const myHand = view.hands[playerIndex];
    const fw = this.fw(view);
    const clueTokens = view.clueTokens.current;

    // ════════════════════════════════════════════
    // PRIORITY 1: Play known-playable cards
    // ════════════════════════════════════════════
    // 1a. Fully known (color + rank)
    for (let idx = 0; idx < myHand.cards.length; idx++) {
      const { color, rank } = this.getKnownInfo(myHand.cards[idx]);
      if (color && rank && this.isPlayable(fw, color, rank)) {
        return { type: 'play', playerIndex, cardIndex: idx } as GameAction;
      }
    }

    // 1b. Rank-only clue: play if it's rank 1 and any color needs it,
    //     or if most colors need that rank (high probability play)
    for (let idx = 0; idx < myHand.cards.length; idx++) {
      const { color, rank } = this.getKnownInfo(myHand.cards[idx]);
      if (!color && rank && this.isRankOnlyPlayable(fw, rank)) {
        return { type: 'play', playerIndex, cardIndex: idx } as GameAction;
      }
    }

    // ════════════════════════════════════════════
    // PRIORITY 2: Save critical cards on teammates' chops
    // ════════════════════════════════════════════
    if (clueTokens > 0) {
      for (let i = 0; i < view.hands.length; i++) {
        if (i === playerIndex) continue;
        const hand = view.hands[i];
        const chopIdx = this.getChopIndex(hand);
        const chopCard = hand.cards[chopIdx];
        if (chopCard?.color && chopCard?.rank) {
          // Save 5s on chop (always critical)
          if (chopCard.rank === 5 && !chopCard.clues.some(c => c.type === 'rank' && c.value === 5)) {
            return { type: 'hint', playerIndex, targetIndex: i, hint: { type: 'rank', value: 5 } } as GameAction;
          }
          // Save other critical cards on chop
          if (this.isCritical(view, chopCard.color, chopCard.rank) &&
              !this.isUseless(fw, chopCard.color, chopCard.rank) &&
              chopCard.clues.length === 0) {
            return { type: 'hint', playerIndex, targetIndex: i, hint: { type: 'rank', value: chopCard.rank } } as GameAction;
          }
        }
      }
    }

    // ════════════════════════════════════════════
    // PRIORITY 3: Give play clues for teammates' playable cards
    // ════════════════════════════════════════════
    if (clueTokens > 0) {
      // 3a. Hint about immediately playable cards (prefer cards closer to chop)
      let bestHint: GameAction | null = null;
      let bestScore = -1;

      for (let i = 0; i < view.hands.length; i++) {
        if (i === playerIndex) continue;
        const hand = view.hands[i];

        for (let cardIdx = 0; cardIdx < hand.cards.length; cardIdx++) {
          const card = hand.cards[cardIdx];
          if (!card.color || !card.rank) continue;
          if (!this.isPlayable(fw, card.color, card.rank)) continue;

          const alreadyKnowsColor = card.clues.some(c => c.type === 'color' && c.value === card.color);
          const alreadyKnowsRank = card.clues.some(c => c.type === 'rank' && c.value === card.rank);
          if (alreadyKnowsColor && alreadyKnowsRank) continue; // already knows

          // Score: prefer lower ranks (1s first), prefer cards the player doesn't know about
          const score = (6 - card.rank) * 10 + (alreadyKnowsRank ? 0 : 5) + (alreadyKnowsColor ? 0 : 3);

          if (score > bestScore) {
            bestScore = score;
            // Prefer rank hints (more informative in general)
            if (!alreadyKnowsRank) {
              bestHint = { type: 'hint', playerIndex, targetIndex: i, hint: { type: 'rank', value: card.rank } } as GameAction;
            } else {
              bestHint = { type: 'hint', playerIndex, targetIndex: i, hint: { type: 'color', value: card.color } } as GameAction;
            }
          }
        }
      }

      if (bestHint) return bestHint;
    }

    // ════════════════════════════════════════════
    // PRIORITY 4: Discard useless known cards
    // ════════════════════════════════════════════
    for (let idx = 0; idx < myHand.cards.length; idx++) {
      const { color, rank } = this.getKnownInfo(myHand.cards[idx]);
      if (color && rank && this.isUseless(fw, color, rank)) {
        const discards = view.legalActions.filter(a => a.type === 'discard');
        if (discards.some(d => d.cardIndex === idx)) {
          return { type: 'discard', playerIndex, cardIndex: idx } as GameAction;
        }
      }
    }

    // ════════════════════════════════════════════
    // PRIORITY 5: Give future-useful hints (if tokens available)
    // ════════════════════════════════════════════
    if (clueTokens >= 2) {
      // Hint about cards that will be playable soon (next needed rank)
      for (let i = 0; i < view.hands.length; i++) {
        if (i === playerIndex) continue;
        for (const card of view.hands[i].cards) {
          if (!card.color || !card.rank) continue;
          const needed = fw[card.color] + 1;
          // Card is 1 step away from being playable
          if (card.rank === needed + 1 && card.clues.length === 0) {
            return { type: 'hint', playerIndex, targetIndex: i, hint: { type: 'rank', value: card.rank } } as GameAction;
          }
        }
      }
    }

    // ════════════════════════════════════════════
    // PRIORITY 6: Discard chop (oldest unclued card)
    // ════════════════════════════════════════════
    const discards = view.legalActions.filter(a => a.type === 'discard');
    if (discards.length > 0) {
      const chopIdx = this.getChopIndex(myHand);
      // Verify chop card is not critical before discarding
      // (We can't see our own cards, but avoid discarding clued cards)
      if (myHand.cards[chopIdx].clues.length === 0) {
        return { type: 'discard', playerIndex, cardIndex: chopIdx } as GameAction;
      }
      // Discard rightmost unclued
      for (let idx = myHand.cards.length - 1; idx >= 0; idx--) {
        if (myHand.cards[idx].clues.length === 0) {
          return { type: 'discard', playerIndex, cardIndex: idx } as GameAction;
        }
      }
      // All cards clued — discard the one least likely to be useful
      return { type: 'discard', playerIndex, cardIndex: myHand.cards.length - 1 } as GameAction;
    }

    // ════════════════════════════════════════════
    // PRIORITY 7: Give any legal hint (when no discard available = tokens full)
    // ════════════════════════════════════════════
    const hints = view.legalActions.filter(a => a.type === 'hint');
    if (hints.length > 0) return { ...hints[0] } as GameAction;

    // Absolute fallback
    return { ...view.legalActions[0] } as GameAction;
  }

  /** Validate that the LLM's action is safe */
  private isSafeAction(action: GameAction, view: PlayerView, playerIndex: number): boolean {
    if (action.type !== 'play') return true;

    const cardClues = view.hands[playerIndex].cards[action.cardIndex]?.clues ?? [];
    const knownColor = cardClues.find(c => c.type === 'color')?.value as string | undefined;
    const knownRank = cardClues.find(c => c.type === 'rank')?.value as number | undefined;
    const fw = this.fw(view);

    // Allow fully known playable cards
    if (knownColor && knownRank) return fw[knownColor] + 1 === knownRank;

    // Allow rank-only if highly likely playable (rank 1 or most colors need it)
    if (!knownColor && knownRank) return this.isRankOnlyPlayable(fw, knownRank);

    return false; // blind play
  }

  private async playTurn(gameId: string, playerIndex: number): Promise<void> {
    if (!this.provider) return;

    let view: PlayerView;
    try {
      view = gameManager.getGameViewByIndex(gameId, playerIndex);
    } catch {
      return;
    }

    if (view.status !== 'playing' || view.currentPlayer !== playerIndex) return;
    if (view.legalActions.length === 0) return;

    const playerNames = gameManager.getPlayerNames(gameId);
    const isFirstTurn = view.actionHistory.length < view.hands.length;

    // ─── Step 1: Intent Inference (if hints exist) ───
    let inferenceResult: string | null = null;
    const inferencePrompt = buildIntentInferencePrompt(view, { playerNames });
    if (inferencePrompt) {
      try {
        inferenceResult = await this.provider.generateText(inferencePrompt);
        console.log(`AI Bot [game=${gameId}, player=${playerIndex}]: inference done (${inferenceResult.length} chars)`);
      } catch (err) {
        console.log(`AI Bot: inference step failed (${(err as Error).message.slice(0, 60)}), skipping`);
      }
    }

    // ─── Step 2: Action Decision (with or without inference) ───
    const prompt = inferenceResult
      ? buildAIContextWithInference(view, inferenceResult, { playerNames, includeRules: isFirstTurn })
      : isFirstTurn
        ? buildAIContext(view, { playerNames })
        : buildAIContextCompact(view, { playerNames });

    // Compute smart default action (rule-based — always safe)
    const smartAction = this.getSmartAction(view, playerIndex);

    // Try LLM to potentially improve on the smart action
    const providerLabel = this.providerName;
    const modelLabel = this.modelName || this.provider.name;
    let action: GameAction = smartAction;
    const stopTimer = llmCallDurationSeconds.startTimer({ model: modelLabel, provider: providerLabel });
    try {
      const llmAction = await this.provider.generateAction(prompt);
      const sanitized = { ...llmAction, playerIndex };

      // Only accept LLM's choice if it's safe (no blind plays)
      if (this.isSafeAction(sanitized as GameAction, view, playerIndex)) {
        action = sanitized as GameAction;
        stopTimer();
        llmCallsTotal.inc({ model: modelLabel, provider: providerLabel, status: 'success' });
      } else {
        stopTimer();
        llmCallsTotal.inc({ model: modelLabel, provider: providerLabel, status: 'unsafe_rejected' });
        llmFallbacksTotal.inc({ provider: providerLabel, reason: 'unsafe' });
        console.log(`AI Bot: LLM suggested unsafe play, using smart action`);
      }
    } catch (err) {
      stopTimer();
      llmCallsTotal.inc({ model: modelLabel, provider: providerLabel, status: 'error' });
      llmFallbacksTotal.inc({ provider: providerLabel, reason: 'error' });
      console.log(`AI Bot: LLM failed (${(err as Error).message.slice(0, 80)}), using smart action`);
    }

    try {
      gameManager.submitActionInternal(gameId, playerIndex, action);
      aiTurnsTotal.inc({ action_type: action.type });
      console.log(`AI Bot [game=${gameId}, player=${playerIndex}]: ${action.type}`);
    } catch (err) {
      console.error(`AI Bot action rejected:`, (err as Error).message);
      try {
        gameManager.submitActionInternal(gameId, playerIndex, smartAction);
      } catch (e2) {
        console.error(`AI Bot smart action also failed:`, (e2 as Error).message);
      }
    }
  }
}

export const aiBotService = new AIBotService();
