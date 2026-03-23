/**
 * LLM Provider Abstraction
 *
 * Supports Claude (Anthropic), GPT/Codex (OpenAI-compatible), and Gemini (Google).
 * Each provider takes a game context prompt and returns a JSON action.
 */

import type { GameAction } from './hanabi-client.js';

export interface LLMProvider {
  name: string;
  generateAction(prompt: string): Promise<GameAction>;
}

// ─── Claude (Anthropic) ───

export class ClaudeProvider implements LLMProvider {
  name = 'Claude';
  private client: import('@anthropic-ai/sdk').default | null = null;
  private model: string;

  constructor(private apiKey: string, model?: string) {
    this.model = model ?? 'claude-sonnet-4-20250514';
  }

  private async getClient() {
    if (!this.client) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      this.client = new Anthropic({ apiKey: this.apiKey });
    }
    return this.client;
  }

  async generateAction(prompt: string): Promise<GameAction> {
    const client = await this.getClient();
    const response = await client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: 'You are an expert Hanabi player. Analyze the game state carefully and choose the optimal action. Respond with ONLY a valid JSON action object, no other text.',
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    return parseActionFromLLM(text);
  }
}

// ─── OpenAI-compatible (GPT, Codex, local models) ───

export class OpenAIProvider implements LLMProvider {
  name: string;
  private client: import('openai').default | null = null;
  private model: string;
  private baseURL?: string;

  constructor(private apiKey: string, model?: string, baseURL?: string) {
    this.model = model ?? 'gpt-4o';
    this.baseURL = baseURL;
    this.name = baseURL ? `OpenAI-compatible (${model ?? 'gpt-4o'})` : `OpenAI (${model ?? 'gpt-4o'})`;
  }

  private async getClient() {
    if (!this.client) {
      const { default: OpenAI } = await import('openai');
      this.client = new OpenAI({
        apiKey: this.apiKey,
        ...(this.baseURL && { baseURL: this.baseURL }),
      });
    }
    return this.client;
  }

  async generateAction(prompt: string): Promise<GameAction> {
    const client = await this.getClient();
    const response = await client.chat.completions.create({
      model: this.model,
      max_tokens: 1024,
      messages: [
        {
          role: 'system',
          content: 'You are an expert Hanabi player. Analyze the game state carefully and choose the optimal action. Respond with ONLY a valid JSON action object, no other text.',
        },
        { role: 'user', content: prompt },
      ],
    });
    const text = response.choices[0]?.message?.content ?? '';
    return parseActionFromLLM(text);
  }
}

// ─── Gemini (via OpenAI-compatible endpoint) ───

export class GeminiProvider implements LLMProvider {
  name = 'Gemini';
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

// ─── JSON Parsing Utility ───

function parseActionFromLLM(text: string): GameAction {
  // Strip markdown code blocks if present
  let cleaned = text.trim();
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  // Try to find JSON object in the response
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not find JSON in LLM response: ${text}`);
  }

  const action = JSON.parse(jsonMatch[0]);

  // Validate basic structure
  if (!action.type || !['play', 'discard', 'hint'].includes(action.type)) {
    throw new Error(`Invalid action type: ${action.type}`);
  }
  if (typeof action.playerIndex !== 'number') {
    throw new Error(`Missing playerIndex in action`);
  }

  return action as GameAction;
}
