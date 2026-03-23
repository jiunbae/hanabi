#!/usr/bin/env npx tsx
/**
 * AI Self-Play — Run a full Hanabi game with LLM agents.
 *
 * Usage:
 *   # Claude vs Claude (2 players)
 *   ANTHROPIC_API_KEY=sk-... npx tsx src/self-play.ts --provider claude --players 2
 *
 *   # GPT-4o vs GPT-4o (3 players)
 *   OPENAI_API_KEY=sk-... npx tsx src/self-play.ts --provider openai --players 3
 *
 *   # Gemini self-play
 *   GEMINI_API_KEY=... npx tsx src/self-play.ts --provider gemini --players 2
 *
 *   # Mixed: Claude + OpenAI
 *   ANTHROPIC_API_KEY=sk-... OPENAI_API_KEY=sk-... npx tsx src/self-play.ts --provider claude,openai
 *
 * Environment:
 *   HANABI_SERVER_URL  — Game server URL (default: http://localhost:3001)
 *   ANTHROPIC_API_KEY  — For Claude provider
 *   OPENAI_API_KEY     — For OpenAI provider
 *   GEMINI_API_KEY     — For Gemini provider
 */

import { HanabiClient, type GameCredentials } from './hanabi-client.js';
import { ClaudeProvider, OpenAIProvider, GeminiProvider, type LLMProvider } from './llm-providers.js';

// ─── Config ───

const SERVER_URL = process.env.HANABI_SERVER_URL ?? 'http://localhost:3001';
const MAX_RETRIES = 3;
const TURN_DELAY_MS = 1000; // Delay between turns for readability

function parseArgs() {
  const args = process.argv.slice(2);
  let providers = 'claude';
  let numPlayers = 2;
  let model: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--provider' || args[i] === '-p') providers = args[++i];
    else if (args[i] === '--players' || args[i] === '-n') numPlayers = parseInt(args[++i], 10);
    else if (args[i] === '--model' || args[i] === '-m') model = args[++i];
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Hanabi AI Self-Play

Usage: npx tsx src/self-play.ts [options]

Options:
  --provider, -p  LLM provider(s): claude, openai, gemini (comma-separated for mixed)
  --players,  -n  Number of players (2-5, default: 2)
  --model,    -m  Model override (applies to all agents)
  --help,     -h  Show this help

Environment Variables:
  HANABI_SERVER_URL   Game server URL (default: http://localhost:3001)
  ANTHROPIC_API_KEY   For Claude provider
  OPENAI_API_KEY      For OpenAI provider
  GEMINI_API_KEY      For Gemini provider
`);
      process.exit(0);
    }
  }

  return { providers: providers.split(','), numPlayers, model };
}

function createProvider(name: string, model?: string): LLMProvider {
  switch (name.toLowerCase()) {
    case 'claude': {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error('ANTHROPIC_API_KEY is required for Claude provider');
      return new ClaudeProvider(key, model);
    }
    case 'openai':
    case 'gpt': {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error('OPENAI_API_KEY is required for OpenAI provider');
      return new OpenAIProvider(key, model);
    }
    case 'gemini': {
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new Error('GEMINI_API_KEY is required for Gemini provider');
      return new GeminiProvider(key, model);
    }
    default:
      throw new Error(`Unknown provider: ${name}. Use claude, openai, or gemini.`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Main Game Loop ───

async function main() {
  const { providers, numPlayers, model } = parseArgs();

  // Create LLM providers for each player (cycle through provider list)
  const llmAgents: LLMProvider[] = [];
  for (let i = 0; i < numPlayers; i++) {
    const providerName = providers[i % providers.length];
    llmAgents.push(createProvider(providerName, model));
  }

  console.log('=== Hanabi AI Self-Play ===');
  console.log(`Server: ${SERVER_URL}`);
  console.log(`Players: ${numPlayers}`);
  console.log(`Agents: ${llmAgents.map((a, i) => `Player ${i} → ${a.name}`).join(', ')}`);
  console.log('');

  const client = new HanabiClient(SERVER_URL);

  // 1. Create game
  console.log('Creating game...');
  const creator = await client.createGame(numPlayers, `AI-${llmAgents[0].name}-0`);
  console.log(`Game created: ${creator.gameId}`);

  const credentials: GameCredentials[] = [creator];

  // 2. Join other players
  for (let i = 1; i < numPlayers; i++) {
    const joined = await client.joinGame(creator.gameId, `AI-${llmAgents[i].name}-${i}`);
    credentials.push(joined);
    console.log(`Player ${i} (${llmAgents[i].name}) joined`);
  }

  // 3. Start game
  await client.startGame(creator.gameId, creator.apiKey);
  console.log('Game started!\n');

  // 4. Game loop
  let turnCount = 0;
  let finished = false;
  let includeRules = true; // Only include rules on first prompt per agent
  const agentSawRules = new Set<number>();

  while (!finished) {
    // Get current state from Player 0's perspective to find current player
    const ctx = await client.getAIContext(
      creator.gameId,
      credentials[0].apiKey,
      false,
    );

    const currentPlayer = ctx.view.currentPlayer;
    const cred = credentials[currentPlayer];
    const agent = llmAgents[currentPlayer];

    // Get AI context for the current player
    const shouldIncludeRules = !agentSawRules.has(currentPlayer);
    const playerCtx = await client.getAIContext(
      creator.gameId,
      cred.apiKey,
      shouldIncludeRules,
    );
    agentSawRules.add(currentPlayer);

    if (playerCtx.view.status === 'finished') {
      finished = true;
      break;
    }

    turnCount++;
    console.log(`--- Turn ${turnCount} (Player ${currentPlayer}: ${agent.name}) ---`);

    // Try to get action from LLM with retries
    let action = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        action = await agent.generateAction(playerCtx.prompt);
        // Ensure playerIndex matches
        action.playerIndex = currentPlayer;
        console.log(`Action: ${JSON.stringify(action)}`);
        break;
      } catch (err) {
        console.error(`  Attempt ${attempt}/${MAX_RETRIES} failed: ${(err as Error).message}`);
        if (attempt === MAX_RETRIES) {
          // Fallback: pick first legal action
          const fallback = playerCtx.view.legalActions[0];
          if (fallback) {
            console.log(`  Falling back to first legal action: ${JSON.stringify(fallback)}`);
            action = fallback;
          } else {
            throw new Error('No legal actions available and LLM failed');
          }
        }
      }
    }

    // Submit action
    try {
      const result = await client.submitAction(creator.gameId, cred.apiKey, action!);
      finished = result.finished;
      if (finished) {
        const score = Object.values(result.view as Record<string, unknown>)
          .filter((v): v is { red: number; yellow: number; green: number; blue: number; white: number } =>
            typeof v === 'object' && v !== null && 'red' in v && 'yellow' in v,
          )[0];
        if (score) {
          const total = Object.values(score).reduce((a, b) => a + b, 0);
          console.log(`\n🎆 Game Over! Final Score: ${total}/25`);
        } else {
          console.log('\n🎆 Game Over!');
        }
      }
    } catch (err) {
      console.error(`  Action rejected: ${(err as Error).message}`);
      // Try fallback
      const fallback = playerCtx.view.legalActions[0];
      if (fallback) {
        console.log(`  Retrying with first legal action: ${JSON.stringify(fallback)}`);
        const result = await client.submitAction(creator.gameId, cred.apiKey, fallback);
        finished = result.finished;
      } else {
        throw err;
      }
    }

    await sleep(TURN_DELAY_MS);
  }

  // Final summary
  console.log('\n=== Game Complete ===');
  console.log(`Total turns: ${turnCount}`);
  console.log(`Game ID: ${creator.gameId}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
