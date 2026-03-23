#!/usr/bin/env npx tsx
/**
 * AI Player — Join an existing Nolbul game and play as an AI agent.
 *
 * Usage:
 *   # Join an existing game as AI player
 *   ANTHROPIC_API_KEY=sk-... npx tsx src/play.ts --game <gameId> --provider claude
 *
 *   # Create a new game and wait for human to join via web UI
 *   ANTHROPIC_API_KEY=sk-... npx tsx src/play.ts --create --players 2 --provider claude
 *
 * Environment:
 *   NOLBUL_SERVER_URL  — Game server URL (default: http://localhost:3001)
 *   ANTHROPIC_API_KEY  — For Claude provider
 *   OPENAI_API_KEY     — For OpenAI provider
 *   GEMINI_API_KEY     — For Gemini provider
 */

import { NolbulClient, type GameCredentials } from './nolbul-client.js';
import { ClaudeProvider, OpenAIProvider, GeminiProvider, type LLMProvider } from './llm-providers.js';

const SERVER_URL = process.env.NOLBUL_SERVER_URL ?? 'http://localhost:3001';
const POLL_INTERVAL_MS = 2000;
const MAX_RETRIES = 3;
const TURN_DELAY_MS = 500;

function parseArgs() {
  const args = process.argv.slice(2);
  let gameId: string | undefined;
  let create = false;
  let numPlayers = 2;
  let provider = 'claude';
  let model: string | undefined;
  let name = 'AI-Agent';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--game' || args[i] === '-g') gameId = args[++i];
    else if (args[i] === '--create' || args[i] === '-c') create = true;
    else if (args[i] === '--players' || args[i] === '-n') numPlayers = parseInt(args[++i], 10);
    else if (args[i] === '--provider' || args[i] === '-p') provider = args[++i];
    else if (args[i] === '--model' || args[i] === '-m') model = args[++i];
    else if (args[i] === '--name') name = args[++i];
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Nolbul AI Player — Join or create a game

Usage: npx tsx src/play.ts [options]

Options:
  --game,     -g  Game ID to join
  --create,   -c  Create a new game instead of joining
  --players,  -n  Number of players (for --create, default: 2)
  --provider, -p  LLM provider: claude, openai, gemini (default: claude)
  --model,    -m  Model override
  --name          Agent display name (default: AI-Agent)
  --help,     -h  Show this help

Environment Variables:
  NOLBUL_SERVER_URL   Game server URL (default: http://localhost:3001)
  ANTHROPIC_API_KEY   For Claude provider
  OPENAI_API_KEY      For OpenAI provider
  GEMINI_API_KEY      For Gemini provider
`);
      process.exit(0);
    }
  }

  if (!gameId && !create) {
    console.error('Error: Specify --game <id> to join or --create to create a new game');
    process.exit(1);
  }

  return { gameId, create, numPlayers, provider, model, name };
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
      throw new Error(`Unknown provider: ${name}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const config = parseArgs();
  const client = new NolbulClient(SERVER_URL);
  const agent = createProvider(config.provider, config.model);

  console.log(`=== Nolbul AI Player (${agent.name}) ===`);
  console.log(`Server: ${SERVER_URL}`);

  let cred: GameCredentials;

  if (config.create) {
    // Create game and wait for others
    cred = await client.createGame(config.numPlayers, config.name);
    console.log(`\nGame created: ${cred.gameId}`);
    console.log(`Share this ID with other players to join!`);
    console.log(`Web UI: ${SERVER_URL} → Join Game → ${cred.gameId}`);
    console.log(`\nWaiting for ${config.numPlayers - 1} more player(s)...`);

    // Poll until game is started
    while (true) {
      const ctx = await client.getAIContext(cred.gameId, cred.apiKey, false).catch(() => null);
      if (ctx && ctx.status === 'playing') break;
      if (ctx && ctx.status === 'finished') {
        console.log('Game already finished.');
        process.exit(0);
      }
      await sleep(POLL_INTERVAL_MS);
    }
    console.log('Game started!');
  } else {
    // Join existing game
    cred = await client.joinGame(config.gameId!, config.name);
    console.log(`Joined game ${cred.gameId} as Player ${cred.playerIndex}`);
    console.log('Waiting for game to start...');

    while (true) {
      const ctx = await client.getAIContext(cred.gameId, cred.apiKey, false).catch(() => null);
      if (ctx && ctx.status === 'playing') break;
      if (ctx && ctx.status === 'finished') {
        console.log('Game already finished.');
        process.exit(0);
      }
      await sleep(POLL_INTERVAL_MS);
    }
    console.log('Game started!');
  }

  // Game loop — poll and act on our turn
  let sawRules = false;
  let turnCount = 0;

  while (true) {
    const ctx = await client.getAIContext(cred.gameId, cred.apiKey, !sawRules);

    if (ctx.status === 'finished') {
      console.log('\nGame Over!');
      break;
    }

    if (!ctx.isMyTurn) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    sawRules = true;
    turnCount++;

    console.log(`\n--- My Turn (turn ${turnCount}) ---`);

    let action = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        action = await agent.generateAction(ctx.prompt);
        action.playerIndex = cred.playerIndex;
        console.log(`Action: ${JSON.stringify(action)}`);
        break;
      } catch (err) {
        console.error(`  Attempt ${attempt}/${MAX_RETRIES} failed: ${(err as Error).message}`);
        if (attempt === MAX_RETRIES) {
          action = ctx.view.legalActions[0];
          console.log(`  Fallback: ${JSON.stringify(action)}`);
        }
      }
    }

    try {
      const result = await client.submitAction(cred.gameId, cred.apiKey, action!);
      if (result.finished) {
        console.log('\nGame Over!');
        break;
      }
    } catch (err) {
      console.error(`Action rejected: ${(err as Error).message}`);
      const fallback = ctx.view.legalActions[0];
      if (fallback) {
        await client.submitAction(cred.gameId, cred.apiKey, fallback);
      }
    }

    await sleep(TURN_DELAY_MS);
  }

  console.log(`\n=== Done (${turnCount} turns played) ===`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
