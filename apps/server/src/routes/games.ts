import { Hono } from 'hono';
import { gameManager } from '../services/game-manager.js';
import { HanabiError, ErrorCodes } from '@hanabi/shared';
import type { GameOptions, GameAction } from '@hanabi/engine';
import { MIN_PLAYERS, MAX_PLAYERS, buildAIContext, GAME_RULES } from '@hanabi/engine';

const games = new Hono();

// List games
games.get('/', (c) => {
  const list = gameManager.listGames();
  return c.json({ games: list });
});

// Create game
games.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    throw new HanabiError('Invalid request body', ErrorCodes.INVALID_REQUEST);
  }
  const { options, creatorName } = body as { options?: GameOptions; creatorName?: string };
  if (!options || typeof options.numPlayers !== 'number') {
    throw new HanabiError('options.numPlayers is required', ErrorCodes.INVALID_REQUEST);
  }
  if (options.numPlayers < MIN_PLAYERS || options.numPlayers > MAX_PLAYERS) {
    throw new HanabiError(`numPlayers must be ${MIN_PLAYERS}-${MAX_PLAYERS}`, ErrorCodes.INVALID_REQUEST);
  }
  if (!creatorName || typeof creatorName !== 'string' || creatorName.trim().length === 0) {
    throw new HanabiError('creatorName is required', ErrorCodes.INVALID_REQUEST);
  }
  const result = gameManager.createGame(options, creatorName.trim().slice(0, 32));
  return c.json(result, 201);
});

// Get game state
games.get('/:id', (c) => {
  const gameId = c.req.param('id');
  const apiKey = c.req.header('x-api-key');
  if (!apiKey) {
    throw new HanabiError('Missing x-api-key header', ErrorCodes.UNAUTHORIZED, 401);
  }
  const view = gameManager.getGameView(gameId, apiKey);
  return c.json({ gameId, view });
});

// Get lobby info (waiting room)
games.get('/:id/lobby', (c) => {
  const gameId = c.req.param('id');
  const apiKey = c.req.header('x-api-key');
  if (!apiKey) {
    throw new HanabiError('Missing x-api-key header', ErrorCodes.UNAUTHORIZED, 401);
  }
  const info = gameManager.getLobbyInfo(gameId, apiKey);
  return c.json(info);
});

// Join game
games.post('/:id/join', async (c) => {
  const gameId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    throw new HanabiError('Invalid request body', ErrorCodes.INVALID_REQUEST);
  }
  const { playerName } = body as { playerName?: string };
  if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0) {
    throw new HanabiError('playerName is required', ErrorCodes.INVALID_REQUEST);
  }
  const result = gameManager.joinGame(gameId, playerName.trim().slice(0, 32));
  return c.json(result);
});

// Start game (creator only — playerIndex 0)
games.post('/:id/start', (c) => {
  const gameId = c.req.param('id');
  const apiKey = c.req.header('x-api-key');
  if (!apiKey) {
    throw new HanabiError('Missing x-api-key header', ErrorCodes.UNAUTHORIZED, 401);
  }
  const view = gameManager.startGame(gameId, apiKey);
  return c.json({ success: true, view });
});

// Submit action
games.post('/:id/actions', async (c) => {
  const gameId = c.req.param('id');
  const apiKey = c.req.header('x-api-key');
  if (!apiKey) {
    throw new HanabiError('Missing x-api-key header', ErrorCodes.UNAUTHORIZED, 401);
  }
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    throw new HanabiError('Invalid request body', ErrorCodes.INVALID_REQUEST);
  }
  const { action } = body as { action?: GameAction };
  if (!action || typeof action.type !== 'string') {
    throw new HanabiError('action is required with a valid type', ErrorCodes.INVALID_REQUEST);
  }
  if (!['play', 'discard', 'hint'].includes(action.type)) {
    throw new HanabiError('Invalid action type', ErrorCodes.INVALID_REQUEST);
  }
  if (typeof action.playerIndex !== 'number') {
    throw new HanabiError('action.playerIndex must be a number', ErrorCodes.INVALID_REQUEST);
  }
  if ((action.type === 'play' || action.type === 'discard') && typeof (action as { cardIndex?: unknown }).cardIndex !== 'number') {
    throw new HanabiError('action.cardIndex must be a number', ErrorCodes.INVALID_REQUEST);
  }
  const { view, finished } = gameManager.submitAction(gameId, apiKey, action);
  return c.json({ success: true, view, finished });
});

// Get AI context (LLM-optimized game state)
games.get('/:id/ai-context', async (c) => {
  const gameId = c.req.param('id');
  const apiKey = c.req.header('x-api-key');
  if (!apiKey) {
    throw new HanabiError('Missing x-api-key header', ErrorCodes.UNAUTHORIZED, 401);
  }
  const view = gameManager.getGameView(gameId, apiKey);
  const playerNames = gameManager.getPlayerNames(gameId);
  const includeRules = c.req.query('includeRules') !== 'false';
  const recentActionsLimit = parseInt(c.req.query('recentActionsLimit') ?? '10', 10);
  const prompt = buildAIContext(view, { playerNames, includeRules, recentActionsLimit });
  return c.json({
    gameId,
    prompt,
    view,
    isMyTurn: view.currentPlayer === view.myIndex,
    status: view.status,
  });
});

// Get replay (authenticated)
games.get('/:id/replay', (c) => {
  const gameId = c.req.param('id');
  const apiKey = c.req.header('x-api-key');
  if (!apiKey) {
    throw new HanabiError('Missing x-api-key header', ErrorCodes.UNAUTHORIZED, 401);
  }
  const replay = gameManager.getReplay(gameId, apiKey);
  return c.json({ gameId, ...replay });
});

export { games };
