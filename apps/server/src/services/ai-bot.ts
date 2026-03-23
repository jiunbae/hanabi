/**
 * AI Bot Service
 *
 * Manages server-side AI players that use LLM APIs to play Hanabi.
 * Hooks into GameManager events to auto-play when it's an AI player's turn.
 */
import { buildAIContext, buildAIContextCompact, getPlayerView } from '@hanabi/engine';
import type { GameAction, PlayerView } from '@hanabi/engine';
import { gameManager } from './game-manager.js';

const AI_TURN_DELAY_MS = 1500;
const MAX_RETRIES = 3;

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
      max_tokens: 1024,
      system: 'You are an expert Hanabi player. Analyze the game state carefully and choose the optimal cooperative action. Respond with ONLY a valid JSON action object, no other text.',
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
      max_tokens: 1024,
      messages: [
        { role: 'system', content: 'You are an expert Hanabi player. Analyze the game state carefully and choose the optimal cooperative action. Respond with ONLY a valid JSON action object, no other text.' },
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

function parseActionFromLLM(text: string): GameAction {
  let cleaned = text.trim();
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) cleaned = codeBlockMatch[1].trim();

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON found in LLM response: ${text.slice(0, 200)}`);

  const action = JSON.parse(jsonMatch[0]);
  if (!action.type || !['play', 'discard', 'hint'].includes(action.type)) {
    throw new Error(`Invalid action type: ${action.type}`);
  }
  if (typeof action.playerIndex !== 'number') {
    throw new Error('Missing playerIndex');
  }
  return action as GameAction;
}

// ─── AI Bot Service ───

class AIBotService {
  /** gameId → Map<playerIndex, apiKey> */
  private aiPlayers = new Map<string, Map<number, string>>();
  private provider: LLMProvider | null = null;
  private providerName: string;
  private modelName: string;
  private turnInProgress = new Set<string>(); // gameId keys to prevent duplicate triggers

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
    gameManager.onGameStarted((gameId, state) => {
      // Check if the first player is AI
      this.maybePlayTurn(gameId, state.currentPlayer);
    });

    gameManager.onGameAction((gameId, state) => {
      if (state.status !== 'playing') {
        this.turnInProgress.delete(gameId);
        return;
      }
      // After any action, check if the next player is AI
      this.maybePlayTurn(gameId, state.currentPlayer);
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
    const { playerIndex, apiKey } = gameManager.joinGame(gameId, aiName);

    if (!this.aiPlayers.has(gameId)) {
      this.aiPlayers.set(gameId, new Map());
    }
    this.aiPlayers.get(gameId)!.set(playerIndex, apiKey);

    return { playerIndex, name: aiName };
  }

  removeGame(gameId: string): void {
    this.aiPlayers.delete(gameId);
    this.turnInProgress.delete(gameId);
  }

  private maybePlayTurn(gameId: string, playerIndex: number): void {
    if (!this.isAIPlayer(gameId, playerIndex)) return;
    if (this.turnInProgress.has(gameId)) return;

    this.turnInProgress.add(gameId);
    // Delay for natural pacing and to avoid blocking
    setTimeout(() => {
      this.playTurn(gameId, playerIndex).catch((err) => {
        console.error(`AI Bot turn failed [game=${gameId}, player=${playerIndex}]:`, err);
      }).finally(() => {
        this.turnInProgress.delete(gameId);
      });
    }, AI_TURN_DELAY_MS);
  }

  private async playTurn(gameId: string, playerIndex: number): Promise<void> {
    if (!this.provider) return;

    // Get the current view for this AI player
    let view: PlayerView;
    try {
      view = gameManager.getGameViewByIndex(gameId, playerIndex);
    } catch {
      return; // Game may have ended or been evicted
    }

    if (view.status !== 'playing' || view.currentPlayer !== playerIndex) return;
    if (view.legalActions.length === 0) return;

    const playerNames = gameManager.getPlayerNames(gameId);
    const isFirstTurn = view.actionHistory.length < view.hands.length; // First round
    const prompt = isFirstTurn
      ? buildAIContext(view, { playerNames })
      : buildAIContextCompact(view, { playerNames });

    // Try LLM with retries, fallback to first legal action
    let action: GameAction | null = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        action = await this.provider.generateAction(prompt);
        action = { ...action, playerIndex }; // Ensure correct playerIndex
        break;
      } catch (err) {
        console.error(`AI Bot attempt ${attempt}/${MAX_RETRIES} failed:`, (err as Error).message);
        if (attempt === MAX_RETRIES) {
          action = view.legalActions[0] as GameAction;
          console.log(`AI Bot fallback to first legal action: ${JSON.stringify(action)}`);
        }
      }
    }

    if (!action) return;

    try {
      gameManager.submitActionInternal(gameId, playerIndex, action);
      console.log(`AI Bot [game=${gameId}, player=${playerIndex}]: ${action.type}`);
    } catch (err) {
      // If the chosen action is invalid, try first legal action
      console.error(`AI Bot action rejected:`, (err as Error).message);
      const fallback = view.legalActions[0];
      if (fallback) {
        try {
          gameManager.submitActionInternal(gameId, playerIndex, fallback as GameAction);
        } catch (e2) {
          console.error(`AI Bot fallback also failed:`, (e2 as Error).message);
        }
      }
    }
  }
}

export const aiBotService = new AIBotService();
