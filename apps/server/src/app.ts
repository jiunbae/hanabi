import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from '@hono/node-server/serve-static';
import { games } from './routes/games.js';
import { admin } from './routes/admin.js';
import { HanabiError } from '@hanabi/shared';
import { GAME_RULES } from '@hanabi/engine';
import { gameManager } from './services/game-manager.js';

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];

const app = new Hono();

app.use('*', logger());
app.use('/api/*', cors({
  origin: ALLOWED_ORIGINS,
  allowMethods: ['GET', 'POST'],
  allowHeaders: ['Content-Type', 'x-api-key', 'x-admin-key'],
}));

app.get('/health', (c) => c.json({ status: 'ok' }));

app.route('/api/games', games);
app.route('/api/admin', admin);

// Public leaderboard (no auth required)
app.get('/api/leaderboard', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100);
  const entries = await gameManager.getLeaderboard(limit);
  return c.json({ leaderboard: entries });
});

// Static game rules + action format reference for AI agents
app.get('/api/rules', (c) => c.json({
  rules: GAME_RULES,
  actionFormats: {
    play: { type: 'play', playerIndex: '<your player index>', cardIndex: '<0-based index in your hand>' },
    discard: { type: 'discard', playerIndex: '<your player index>', cardIndex: '<0-based index in your hand>' },
    hint: { type: 'hint', playerIndex: '<your player index>', targetIndex: '<other player index>', hint: { type: '<"color" or "rank">', value: '<color name or rank number>' } },
  },
}));

// Serve static files from web build (production only)
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: 'apps/web/dist' }));
  app.get('*', serveStatic({ root: 'apps/web/dist', path: 'index.html' }));
}

// Error handler
app.onError((err, c) => {
  if (err instanceof HanabiError) {
    return c.json({ error: err.message, code: err.code }, err.statusCode as 400);
  }
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

export { app };
