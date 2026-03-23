#!/usr/bin/env npx tsx
/**
 * Experiment: Compare 1-step vs 2-step LLM prompting
 *
 * Runs games via the server's AI bot (which now has 2-step built in)
 * and also via direct API calls for baseline comparison.
 *
 * Usage:
 *   npx tsx src/experiment-2step.ts [--games N] [--server URL]
 */

const SERVER_URL = process.env.NOLBUL_SERVER_URL ?? 'http://localhost:3001';
const NUM_GAMES = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--games') ?? '3', 10);
const ADMIN_KEY = process.env.ADMIN_KEY ?? 'test-admin';

interface GameResult {
  gameId: string;
  score: number;
  turns: number;
  strikes: number;
}

async function api(path: string, opts?: RequestInit & { apiKey?: string; adminKey?: string }) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts?.apiKey) headers['x-api-key'] = opts.apiKey;
  if (opts?.adminKey) headers['x-admin-key'] = opts.adminKey;
  const res = await fetch(`${SERVER_URL}${path}`, { ...opts, headers });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function runGame(numPlayers: number): Promise<GameResult> {
  // Create game with all AI players
  const { gameId, apiKey } = await api('/api/games', {
    method: 'POST',
    body: JSON.stringify({ options: { numPlayers }, creatorName: 'AI-gpt5nano-0' }),
  });

  // Add AI players for remaining slots
  for (let i = 1; i < numPlayers; i++) {
    await api(`/api/games/${gameId}/add-ai`, {
      method: 'POST',
      apiKey,
    });
  }

  // Mark player 0 (creator) as AI too via admin endpoint
  await api(`/api/admin/games/${gameId}/mark-ai`, {
    method: 'POST',
    adminKey: ADMIN_KEY,
    body: JSON.stringify({ playerIndex: 0 }),
  });

  // Start — all players are now AI, server handles everything
  await api(`/api/games/${gameId}/start`, { method: 'POST', apiKey });

  // Wait for game to finish
  let score = 0;
  let turns = 0;
  let strikes = 0;
  for (let i = 0; i < 300; i++) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const { view } = await api(`/api/games/${gameId}`, { apiKey });
      if (view.status === 'finished') {
        const fw = view.fireworks as Record<string, number>;
        score = Object.values(fw).reduce((a: number, b: number) => a + b, 0);
        turns = view.actionHistory?.length ?? 0;
        strikes = view.strikes?.current ?? 0;
        break;
      }
    } catch (err) {
      console.error(`  Poll error: ${(err as Error).message.slice(0, 80)}`);
      break;
    }
  }

  return { gameId, score, turns, strikes };
}

async function main() {
  console.log('=== 2-Step Prompting Experiment ===');
  console.log(`Server: ${SERVER_URL}`);
  console.log(`Games per config: ${NUM_GAMES}`);
  console.log(`AI players: 2 (server-side, uses 2-step prompting with gpt-5-nano)`);
  console.log('');

  // Check server health
  const health = await fetch(`${SERVER_URL}/health`).then(r => r.json());
  console.log(`Server health: ${health.status}`);

  // Check AI config
  try {
    const adminRes = await fetch(`${SERVER_URL}/api/admin/stats`, {
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    if (adminRes.ok) {
      const stats = await adminRes.json();
      console.log(`AI config: ${JSON.stringify(stats.ai ?? 'unknown')}`);
    }
  } catch { /* ignore */ }

  console.log('\n--- Running 2-player AI games ---\n');

  const results: GameResult[] = [];
  for (let i = 0; i < NUM_GAMES; i++) {
    console.log(`Game ${i + 1}/${NUM_GAMES}...`);
    try {
      const result = await runGame(2);
      results.push(result);
      console.log(`  Score: ${result.score}/25 | Turns: ${result.turns} | Strikes: ${result.strikes} | ID: ${result.gameId}`);
    } catch (err) {
      console.error(`  Failed: ${(err as Error).message}`);
    }
  }

  // Summary
  if (results.length > 0) {
    const scores = results.map(r => r.score);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    console.log(`\n=== Results (${results.length} games) ===`);
    console.log(`Average score: ${avg.toFixed(1)}/25`);
    console.log(`Min: ${min} | Max: ${max}`);
    console.log(`Scores: [${scores.join(', ')}]`);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
