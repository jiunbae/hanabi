import {
  createInitialState,
  applyAction,
  validateAction,
  getPlayerView,
  getScore,
} from '@nolbul/engine';
import type { GameState, GameAction, GameOptions, PlayerView } from '@nolbul/engine';
import { NolbulError, ErrorCodes } from '@nolbul/shared';
import { db, schema } from '../db/index.js';
import { eq, and, lt, inArray, desc, isNotNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';

interface GameRoom {
  id: string;
  state: GameState | null;
  options: GameOptions;
  players: { name: string; apiKey: string }[];
  createdAt: string;
}

const FINISHED_GAME_TTL_MS = 30 * 60 * 1000; // 30 minutes
const WAITING_GAME_TTL_MS = 60 * 60 * 1000; // 1 hour for unstarted games
const EVICTION_INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes
const DB_CLEANUP_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — purge old DB records

/** In-memory game manager. DB writes are fire-and-forget for persistence/replay. */
type GameEventCallback = (gameId: string, state: GameState) => void;

class GameManager {
  private rooms = new Map<string, GameRoom>();
  private finishedAt = new Map<string, number>();
  private onStartCallbacks: GameEventCallback[] = [];
  private onActionCallbacks: GameEventCallback[] = [];
  private onEvictCallbacks: ((gameId: string) => void)[] = [];

  onGameStarted(cb: GameEventCallback): void { this.onStartCallbacks.push(cb); }
  onGameAction(cb: GameEventCallback): void { this.onActionCallbacks.push(cb); }
  onGameEvicted(cb: (gameId: string) => void): void { this.onEvictCallbacks.push(cb); }

  constructor() {
    setInterval(() => this.evictStaleGames(), EVICTION_INTERVAL_MS);
  }

  private evictStaleGames(): void {
    const now = Date.now();
    // Evict finished games after TTL
    for (const [gameId, finishedTime] of this.finishedAt) {
      if (now - finishedTime > FINISHED_GAME_TTL_MS) {
        this.rooms.delete(gameId);
        this.finishedAt.delete(gameId);
        for (const cb of this.onEvictCallbacks) cb(gameId);
      }
    }
    // Evict waiting (unstarted) games after longer TTL
    for (const [gameId, room] of this.rooms) {
      if (!room.state && now - new Date(room.createdAt).getTime() > WAITING_GAME_TTL_MS) {
        this.rooms.delete(gameId);
        for (const cb of this.onEvictCallbacks) cb(gameId);
      }
    }
    // Purge old finished games from DB (24h+)
    this.purgeOldDbRecords().catch((e) => console.error('DB cleanup failed:', e));
  }

  private async purgeOldDbRecords(): Promise<void> {
    const cutoff = new Date(Date.now() - DB_CLEANUP_TTL_MS).toISOString();
    // Find old finished games
    const oldGames = await db.select({ id: schema.games.id })
      .from(schema.games)
      .where(and(eq(schema.games.status, 'finished'), lt(schema.games.finishedAt, cutoff)));
    if (oldGames.length === 0) return;

    const ids = oldGames.map((g) => g.id);
    // Delete related records first, then games
    await db.delete(schema.actionLogs).where(inArray(schema.actionLogs.gameId, ids));
    await db.delete(schema.players).where(inArray(schema.players.gameId, ids));
    await db.delete(schema.games).where(inArray(schema.games.id, ids));
    console.log(`DB cleanup: purged ${ids.length} finished games older than 24h`);
  }

  createGame(options: GameOptions, creatorName: string): { gameId: string; playerIndex: number; apiKey: string } {
    const gameId = nanoid(12);
    const apiKey = nanoid(24);
    // Always generate server-side seed — never trust client-supplied seed
    const seed = Math.floor(Math.random() * 2147483647);
    const resolvedOptions = { ...options, seed };

    const createdAt = new Date().toISOString();
    const room: GameRoom = {
      id: gameId,
      state: null,
      options: resolvedOptions,
      players: [{ name: creatorName, apiKey }],
      createdAt,
    };
    this.rooms.set(gameId, room);

    // Persist (async, log errors)
    db.insert(schema.games).values({
      id: gameId,
      options: JSON.stringify(resolvedOptions),
      status: 'waiting',
      seed,
      createdAt,
    }).catch((e) => console.error('DB insert games failed:', e));
    db.insert(schema.players).values({
      gameId,
      playerIndex: 0,
      name: creatorName,
      apiKey,
    }).catch((e) => console.error('DB insert players failed:', e));

    return { gameId, playerIndex: 0, apiKey };
  }

  joinGame(gameId: string, playerName: string): { playerIndex: number; apiKey: string } {
    const room = this.getRoom(gameId);
    if (room.state) throw new NolbulError('Game already started', ErrorCodes.GAME_ALREADY_STARTED);
    if (room.players.length >= room.options.numPlayers) throw new NolbulError('Game is full', ErrorCodes.GAME_FULL);

    const apiKey = nanoid(24);
    const playerIndex = room.players.length;
    room.players.push({ name: playerName, apiKey });

    db.insert(schema.players).values({ gameId, playerIndex, name: playerName, apiKey })
      .catch((e) => console.error('DB insert players failed:', e));

    return { playerIndex, apiKey };
  }

  startGame(gameId: string, apiKey: string): PlayerView {
    const room = this.getRoom(gameId);
    const playerIndex = this.authenticatePlayer(room, apiKey);
    if (playerIndex !== 0) throw new NolbulError('Only the game creator can start the game', ErrorCodes.UNAUTHORIZED, 403);
    if (room.state) throw new NolbulError('Game already started', ErrorCodes.GAME_ALREADY_STARTED);
    if (room.players.length < 2) throw new NolbulError('Need at least 2 players', ErrorCodes.INVALID_REQUEST);

    room.state = createInitialState({ ...room.options, numPlayers: room.players.length });

    db.update(schema.games).set({ status: 'playing' }).where(eq(schema.games.id, gameId))
      .catch((e) => console.error('DB update game status failed:', e));

    // Notify WS handler to broadcast to all connected players
    for (const cb of this.onStartCallbacks) cb(gameId, room.state);

    return getPlayerView(room.state, this.getPlayerIndex(room, apiKey));
  }

  submitAction(gameId: string, apiKey: string, action: GameAction): { view: PlayerView; finished: boolean } {
    const room = this.getRoom(gameId);
    const playerIndex = this.authenticatePlayer(room, apiKey);

    // Enforce authenticated playerIndex — prevent impersonation
    if (action.playerIndex !== playerIndex) {
      throw new NolbulError('Action playerIndex does not match authenticated player', ErrorCodes.UNAUTHORIZED, 403);
    }

    const result = this.executeAction(room, gameId, playerIndex, action);

    // Fire callbacks so AI bot can trigger next turn
    for (const cb of this.onActionCallbacks) cb(gameId, room.state!);

    return result;
  }

  getLobbyInfo(gameId: string, apiKey: string): { players: string[]; numPlayers: number; status: string } {
    const room = this.getRoom(gameId);
    this.authenticatePlayer(room, apiKey);
    return {
      players: room.players.map((p) => p.name),
      numPlayers: room.options.numPlayers,
      status: room.state?.status ?? 'waiting',
    };
  }

  getGameView(gameId: string, apiKey: string): PlayerView {
    const room = this.getRoom(gameId);
    const playerIndex = this.authenticatePlayer(room, apiKey);
    if (!room.state) throw new NolbulError('Game not started', ErrorCodes.GAME_NOT_STARTED);
    return getPlayerView(room.state, playerIndex);
  }

  getGameViewByIndex(gameId: string, playerIndex: number): PlayerView {
    const room = this.getRoom(gameId);
    if (!room.state) throw new NolbulError('Game not started', ErrorCodes.GAME_NOT_STARTED);
    return getPlayerView(room.state, playerIndex);
  }

  setGameName(gameId: string, gameName: string): void {
    const room = this.getRoom(gameId);
    if (!room.state || room.state.status !== 'finished') {
      throw new NolbulError('Can only name finished games', ErrorCodes.INVALID_REQUEST);
    }
    db.update(schema.games).set({ gameName }).where(eq(schema.games.id, gameId))
      .catch((e) => console.error('DB update gameName failed:', e));
  }

  async getLeaderboard(limit: number): Promise<{ gameId: string; gameName: string | null; score: number; players: string[]; numPlayers: number; finishedAt: string }[]> {
    const rows = await db.select({
      id: schema.games.id,
      gameName: schema.games.gameName,
      score: schema.games.score,
      numPlayers: schema.games.options,
      finishedAt: schema.games.finishedAt,
    }).from(schema.games)
      .where(and(eq(schema.games.status, 'finished'), isNotNull(schema.games.score)))
      .orderBy(desc(schema.games.score))
      .limit(limit);

    // Fetch player names for each game
    const results = [];
    for (const row of rows) {
      const playerRows = await db.select({ name: schema.players.name })
        .from(schema.players)
        .where(eq(schema.players.gameId, row.id));
      const opts = JSON.parse(row.numPlayers || '{}');
      results.push({
        gameId: row.id,
        gameName: row.gameName,
        score: row.score ?? 0,
        players: playerRows.map(p => p.name),
        numPlayers: opts.numPlayers ?? playerRows.length,
        finishedAt: row.finishedAt ?? '',
      });
    }
    return results;
  }

  getReplay(gameId: string, apiKey: string): { options: Omit<GameOptions, 'seed'>; actions: GameAction[]; score: number } {
    const room = this.getRoom(gameId);
    this.authenticatePlayer(room, apiKey);
    if (!room.state || room.state.status !== 'finished') {
      throw new NolbulError('Game not finished', ErrorCodes.INVALID_REQUEST);
    }
    const { seed: _seed, ...safeOptions } = room.options;
    return { options: safeOptions, actions: [...room.state.actions], score: getScore(room.state.fireworks) };
  }

  private getRoom(gameId: string): GameRoom {
    const room = this.rooms.get(gameId);
    if (!room) throw new NolbulError('Game not found', ErrorCodes.GAME_NOT_FOUND, 404);
    return room;
  }

  getRoomState(gameId: string): GameState | null {
    return this.getRoom(gameId).state;
  }

  getPlayerIndexByApiKey(gameId: string, apiKey: string): number {
    const room = this.getRoom(gameId);
    return this.getPlayerIndex(room, apiKey);
  }

  getPlayerNames(gameId: string): string[] {
    const room = this.getRoom(gameId);
    return room.players.map((p) => p.name);
  }

  /** Internal action submission — bypasses apiKey auth. For server-side AI bot use only. */
  submitActionInternal(gameId: string, playerIndex: number, action: GameAction): { view: PlayerView; finished: boolean } {
    const room = this.getRoom(gameId);
    if (action.playerIndex !== playerIndex) {
      throw new NolbulError('Action playerIndex mismatch', ErrorCodes.INVALID_ACTION);
    }
    const result = this.executeAction(room, gameId, playerIndex, action);

    // Fire callbacks so WebSocket broadcasts reach human players
    for (const cb of this.onActionCallbacks) cb(gameId, room.state!);

    return result;
  }

  /** Shared core: validate, apply, persist action. */
  private executeAction(room: GameRoom, gameId: string, playerIndex: number, action: GameAction): { view: PlayerView; finished: boolean } {
    if (!room.state) throw new NolbulError('Game not started', ErrorCodes.GAME_NOT_STARTED);
    if (room.state.status !== 'playing') throw new NolbulError('Game is finished', ErrorCodes.INVALID_ACTION);

    const error = validateAction(room.state, action);
    if (error) throw new NolbulError(error.message, ErrorCodes.INVALID_ACTION);

    room.state = applyAction(room.state, action);

    db.insert(schema.actionLogs).values({
      gameId,
      turnIndex: room.state.turn - 1,
      action: JSON.stringify(action),
      timestamp: new Date().toISOString(),
    }).catch((e) => console.error('DB insert action failed:', e));

    const finished = room.state.status === 'finished';
    if (finished) {
      this.finishedAt.set(gameId, Date.now());
      db.update(schema.games)
        .set({ status: 'finished', score: getScore(room.state.fireworks), finishedAt: new Date().toISOString() })
        .where(eq(schema.games.id, gameId))
        .catch((e) => console.error('DB update game finished failed:', e));
    }

    return { view: getPlayerView(room.state, playerIndex), finished };
  }

  /** Detailed game info for admin panel */
  getGameDetail(gameId: string) {
    const room = this.getRoom(gameId);
    return {
      gameId: room.id,
      status: room.state?.status ?? 'waiting' as const,
      numPlayers: room.options.numPlayers,
      currentPlayers: room.players.length,
      players: room.players.map((p) => p.name),
      score: room.state ? getScore(room.state.fireworks) : null,
      turn: room.state?.turn ?? 0,
      actionCount: room.state?.actions.length ?? 0,
      createdAt: room.createdAt,
    };
  }

  /** List all games with admin-level detail */
  listGamesDetailed() {
    return Array.from(this.rooms.values()).map((room) => ({
      gameId: room.id,
      status: room.state?.status ?? 'waiting' as const,
      numPlayers: room.options.numPlayers,
      currentPlayers: room.players.length,
      players: room.players.map((p) => p.name),
      score: room.state ? getScore(room.state.fireworks) : null,
      actionCount: room.state?.actions.length ?? 0,
      createdAt: room.createdAt,
    }));
  }

  listGames() {
    return Array.from(this.rooms.values())
      .filter((room) => {
        const status = room.state?.status ?? 'waiting';
        return status !== 'finished';
      })
      .map((room) => ({
        gameId: room.id,
        numPlayers: room.options.numPlayers,
        currentPlayers: room.players.length,
        status: room.state?.status ?? 'waiting',
        createdAt: room.createdAt,
      }));
  }

  private authenticatePlayer(room: GameRoom, apiKey: string): number {
    const idx = this.getPlayerIndex(room, apiKey);
    if (idx === -1) throw new NolbulError('Unauthorized', ErrorCodes.UNAUTHORIZED, 401);
    return idx;
  }

  private getPlayerIndex(room: GameRoom, apiKey: string): number {
    return room.players.findIndex((p) => p.apiKey === apiKey);
  }
}

export const gameManager = new GameManager();
