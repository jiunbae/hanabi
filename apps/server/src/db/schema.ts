import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const games = sqliteTable('games', {
  id: text('id').primaryKey(),
  options: text('options').notNull(),
  status: text('status', { enum: ['waiting', 'playing', 'finished'] }).notNull().default('waiting'),
  seed: integer('seed').notNull(),
  score: integer('score'),
  gameName: text('game_name'),
  createdAt: text('created_at').notNull(),
  finishedAt: text('finished_at'),
});

export const players = sqliteTable('players', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  gameId: text('game_id').notNull().references(() => games.id),
  playerIndex: integer('player_index').notNull(),
  name: text('name').notNull(),
  apiKey: text('api_key').notNull(),
});

export const actionLogs = sqliteTable('action_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  gameId: text('game_id').notNull().references(() => games.id),
  turnIndex: integer('turn_index').notNull(),
  action: text('action').notNull(),
  timestamp: text('timestamp').notNull(),
});
