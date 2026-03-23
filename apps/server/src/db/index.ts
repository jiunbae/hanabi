import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';

const DB_PATH = process.env.DB_PATH || 'file:hanabi.db';

const client = createClient({ url: DB_PATH });
export const db = drizzle(client, { schema });

// Create tables
await client.executeMultiple(`
  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    options TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting',
    seed INTEGER NOT NULL,
    score INTEGER,
    created_at TEXT NOT NULL,
    finished_at TEXT
  );

  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL REFERENCES games(id),
    player_index INTEGER NOT NULL,
    name TEXT NOT NULL,
    api_key TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS action_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL REFERENCES games(id),
    turn_index INTEGER NOT NULL,
    action TEXT NOT NULL,
    timestamp TEXT NOT NULL
  );
`);

export { schema };
