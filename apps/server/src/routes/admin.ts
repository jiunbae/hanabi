import { Hono } from 'hono';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { gameManager } from '../services/game-manager.js';
import { aiBotService } from '../services/ai-bot.js';
import { HanabiError, ErrorCodes } from '@hanabi/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_PATH = join(__dirname, '..', 'config', 'ai-prompts.json');

const admin = new Hono();

// Auth middleware — check x-admin-key header
admin.use('*', async (c, next) => {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    throw new HanabiError('Admin panel not configured (set ADMIN_KEY env var)', ErrorCodes.UNAUTHORIZED, 403);
  }
  const provided = c.req.header('x-admin-key');
  if (provided !== adminKey) {
    throw new HanabiError('Invalid admin key', ErrorCodes.UNAUTHORIZED, 401);
  }
  await next();
});

// List all games with detailed info
admin.get('/games', (c) => {
  const games = gameManager.listGamesDetailed();
  const gamesWithAI = games.map((g) => ({
    ...g,
    aiPlayers: aiBotService.getAIPlayers(g.gameId),
  }));
  return c.json({ games: gamesWithAI });
});

// Get detailed info for a specific game
admin.get('/games/:id', (c) => {
  const gameId = c.req.param('id');
  try {
    const detail = gameManager.getGameDetail(gameId);
    return c.json({
      ...detail,
      aiPlayers: aiBotService.getAIPlayers(gameId),
    });
  } catch {
    throw new HanabiError('Game not found', ErrorCodes.GAME_NOT_FOUND, 404);
  }
});

// Aggregate stats
admin.get('/stats', (c) => {
  const games = gameManager.listGamesDetailed();
  const total = games.length;
  const waiting = games.filter((g) => g.status === 'waiting').length;
  const playing = games.filter((g) => g.status === 'playing').length;
  const finished = games.filter((g) => g.status === 'finished').length;
  const scores = games.filter((g) => g.score !== null).map((g) => g.score!);
  const avgScore = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
  const aiGames = games.filter((g) => aiBotService.getAIPlayers(g.gameId).length > 0).length;

  return c.json({
    total,
    waiting,
    playing,
    finished,
    avgScore,
    aiGames,
    aiConfig: aiBotService.getConfig(),
  });
});

// Get AI configuration
admin.get('/ai-config', (c) => {
  return c.json(aiBotService.getConfig());
});

// Update AI configuration
admin.post('/ai-config', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    throw new HanabiError('Invalid request body', ErrorCodes.INVALID_REQUEST);
  }
  const { provider, model } = body as { provider?: string; model?: string };
  if (provider && typeof provider === 'string') {
    aiBotService.updateConfig(provider, model ?? '');
  }
  return c.json(aiBotService.getConfig());
});

// Get AI prompts config
admin.get('/ai-prompts', (c) => {
  try {
    const config = JSON.parse(readFileSync(PROMPTS_PATH, 'utf-8'));
    return c.json(config);
  } catch {
    return c.json({ error: 'Config file not found' }, 404);
  }
});

// Update AI prompts config
admin.post('/ai-prompts', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    throw new HanabiError('Invalid request body', ErrorCodes.INVALID_REQUEST);
  }
  try {
    // Merge with existing config
    const existing = JSON.parse(readFileSync(PROMPTS_PATH, 'utf-8'));
    const updated = { ...existing, ...body };
    if (body.system) updated.system = { ...existing.system, ...body.system };
    writeFileSync(PROMPTS_PATH, JSON.stringify(updated, null, 2), 'utf-8');
    return c.json(updated);
  } catch (e) {
    throw new HanabiError(`Failed to update config: ${(e as Error).message}`, ErrorCodes.INVALID_REQUEST);
  }
});

export { admin };
