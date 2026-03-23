import { serve } from '@hono/node-server';
import { app } from './app.js';
import { setupWebSocket } from './ws/handler.js';
import type { Server } from 'http';

const PORT = Number(process.env.PORT) || 3001;

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`Nolbul server running at http://localhost:${info.port}`);
});

const wss = setupWebSocket(server as unknown as Server);

// Graceful shutdown
function shutdown() {
  console.log('Shutting down...');
  wss.clients.forEach((ws) => ws.close(1001, 'Server shutting down'));
  wss.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  // Force exit after 5s
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
