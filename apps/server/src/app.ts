import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from '@hono/node-server/serve-static';
import { games } from './routes/games.js';
import { HanabiError } from '@hanabi/shared';

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];

const app = new Hono();

app.use('*', logger());
app.use('/api/*', cors({
  origin: ALLOWED_ORIGINS,
  allowMethods: ['GET', 'POST'],
  allowHeaders: ['Content-Type', 'x-api-key'],
}));

app.get('/health', (c) => c.json({ status: 'ok' }));

app.route('/api/games', games);

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
