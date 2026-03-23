/**
 * AI Bot Service
 *
 * Manages server-side AI players that use LLM APIs to play Hanabi.
 * Hooks into GameManager events to auto-play when it's an AI player's turn.
 */
import { buildAIContext, buildAIContextCompact, getPlayerView } from '@hanabi/engine';
import type { GameAction, PlayerView } from '@hanabi/engine';
import { gameManager } from './game-manager.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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
      system: { default: 'You play Hanabi cooperatively. Follow the RECOMMENDED ACTION. Respond with ONLY a valid JSON action object.' },
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

  async generateAction(prompt: string): Promise<GameAction> {
    if (!this.client) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      this.client = new Anthropic({ apiKey: this.apiKey });
    }
    const client = this.client as import('@anthropic-ai/sdk').default;
    const response = await client.messages.create({
      model: this.model,
      max_tokens: promptConfig.maxTokens,
      system: promptConfig.system.default,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    return parseActionFromLLM(text);
  }
}

class OpenAIProvider implements LLMProvider {
  name: string;
  private client: unknown = null;
  private model: string;
  private apiKey: string;
  private baseURL?: string;

  constructor(apiKey: string, model?: string, baseURL?: string) {
    this.apiKey = apiKey;
    this.model = model ?? 'gpt-4o';
    this.baseURL = baseURL;
    this.name = `OpenAI (${this.model})`;
  }

  async generateAction(prompt: string): Promise<GameAction> {
    if (!this.client) {
      const { default: OpenAI } = await import('openai');
      this.client = new OpenAI({
        apiKey: this.apiKey,
        ...(this.baseURL && { baseURL: this.baseURL }),
      });
    }
    const client = this.client as import('openai').default;
    const response = await client.chat.completions.create({
      model: this.model,
      max_tokens: promptConfig.maxTokens,
      messages: [
        { role: 'system', content: promptConfig.system.default },
        { role: 'user', content: prompt },
      ],
    });
    const text = response.choices[0]?.message?.content ?? '';
    return parseActionFromLLM(text);
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
        this.provider = new OpenAIProvider(process.env.OPENAI_API_KEY, this.modelName || undefined);
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

  /** Compute a smart default action without LLM — used as fallback */
  private getSmartAction(view: PlayerView, playerIndex: number): GameAction {
    const myHand = view.hands[playerIndex];

    // 1. Play any card that we KNOW is playable (both color + rank clues)
    for (let idx = 0; idx < myHand.cards.length; idx++) {
      const clues = myHand.cards[idx].clues;
      const knownColor = clues.find(c => c.type === 'color')?.value as string | undefined;
      const knownRank = clues.find(c => c.type === 'rank')?.value as number | undefined;
      if (knownColor && knownRank) {
        const fw = view.fireworks as unknown as Record<string, number>;
        if (fw[knownColor] + 1 === knownRank) {
          return { type: 'play', playerIndex, cardIndex: idx } as GameAction;
        }
      }
    }

    // 2. Give hint about a teammate's playable card
    if (view.clueTokens.current > 0) {
      for (let i = 0; i < view.hands.length; i++) {
        if (i === playerIndex) continue;
        for (const card of view.hands[i].cards) {
          if (card.color && card.rank) {
            const fw = view.fireworks as unknown as Record<string, number>;
            if (fw[card.color] + 1 === card.rank) {
              const knowsRank = card.clues.some(c => c.type === 'rank' && c.value === card.rank);
              if (!knowsRank) {
                return { type: 'hint', playerIndex, targetIndex: i, hint: { type: 'rank', value: card.rank } } as GameAction;
              }
              const knowsColor = card.clues.some(c => c.type === 'color' && c.value === card.color);
              if (!knowsColor) {
                return { type: 'hint', playerIndex, targetIndex: i, hint: { type: 'color', value: card.color } } as GameAction;
              }
            }
          }
        }
      }
      // No playable cards found — give any hint (pick first available)
      const hints = view.legalActions.filter(a => a.type === 'hint');
      if (hints.length > 0) return { ...hints[0] } as GameAction;
    }

    // 3. Discard card with fewest clues
    const discards = view.legalActions.filter(a => a.type === 'discard');
    if (discards.length > 0) {
      // Find card with fewest clues
      let bestIdx = 0;
      let minClues = Infinity;
      for (let idx = 0; idx < myHand.cards.length; idx++) {
        if (myHand.cards[idx].clues.length < minClues) {
          minClues = myHand.cards[idx].clues.length;
          bestIdx = idx;
        }
      }
      return { type: 'discard', playerIndex, cardIndex: bestIdx } as GameAction;
    }

    // 4. Absolute fallback
    return { ...view.legalActions[0] } as GameAction;
  }

  /** Validate that the LLM's action is safe (not a blind play) */
  private isSafeAction(action: GameAction, view: PlayerView, playerIndex: number): boolean {
    if (action.type !== 'play') return true; // hints and discards are always "safe"

    const cardClues = view.hands[playerIndex].cards[action.cardIndex]?.clues ?? [];
    const knownColor = cardClues.find(c => c.type === 'color')?.value as string | undefined;
    const knownRank = cardClues.find(c => c.type === 'rank')?.value as number | undefined;

    if (!knownColor || !knownRank) return false; // blind play
    const fw = view.fireworks as unknown as Record<string, number>;
    return fw[knownColor] + 1 === knownRank;
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
    const prompt = isFirstTurn
      ? buildAIContext(view, { playerNames })
      : buildAIContextCompact(view, { playerNames });

    // Compute smart default action (rule-based — always safe)
    const smartAction = this.getSmartAction(view, playerIndex);

    // Try LLM to potentially improve on the smart action
    let action: GameAction = smartAction;
    try {
      const llmAction = await this.provider.generateAction(prompt);
      const sanitized = { ...llmAction, playerIndex };

      // Only accept LLM's choice if it's safe (no blind plays)
      if (this.isSafeAction(sanitized as GameAction, view, playerIndex)) {
        action = sanitized as GameAction;
      } else {
        console.log(`AI Bot: LLM suggested unsafe play, using smart action`);
      }
    } catch (err) {
      console.log(`AI Bot: LLM failed (${(err as Error).message.slice(0, 80)}), using smart action`);
    }

    try {
      gameManager.submitActionInternal(gameId, playerIndex, action);
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
