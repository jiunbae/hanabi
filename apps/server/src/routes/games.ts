import { Hono } from 'hono';
import { gameManager } from '../services/game-manager.js';
import { aiBotService } from '../services/ai-bot.js';
import { NolbulError, ErrorCodes } from '@nolbul/shared';
import type { GameOptions, GameAction } from '@nolbul/engine';
import { MIN_PLAYERS, MAX_PLAYERS, buildAIContext, GAME_RULES } from '@nolbul/engine';

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
    throw new NolbulError('Invalid request body', ErrorCodes.INVALID_REQUEST);
  }
  const { options, creatorName } = body as { options?: GameOptions; creatorName?: string };
  if (!options || typeof options.numPlayers !== 'number') {
    throw new NolbulError('options.numPlayers is required', ErrorCodes.INVALID_REQUEST);
  }
  if (options.numPlayers < MIN_PLAYERS || options.numPlayers > MAX_PLAYERS) {
    throw new NolbulError(`numPlayers must be ${MIN_PLAYERS}-${MAX_PLAYERS}`, ErrorCodes.INVALID_REQUEST);
  }
  if (!creatorName || typeof creatorName !== 'string' || creatorName.trim().length === 0) {
    throw new NolbulError('creatorName is required', ErrorCodes.INVALID_REQUEST);
  }
  const result = gameManager.createGame(options, creatorName.trim().slice(0, 32));
  return c.json(result, 201);
});

// Get game state
games.get('/:id', (c) => {
  const gameId = c.req.param('id');
  const apiKey = c.req.header('x-api-key');
  if (!apiKey) {
    throw new NolbulError('Missing x-api-key header', ErrorCodes.UNAUTHORIZED, 401);
  }
  const view = gameManager.getGameView(gameId, apiKey);
  return c.json({ gameId, view });
});

// Get lobby info (waiting room)
games.get('/:id/lobby', (c) => {
  const gameId = c.req.param('id');
  const apiKey = c.req.header('x-api-key');
  if (!apiKey) {
    throw new NolbulError('Missing x-api-key header', ErrorCodes.UNAUTHORIZED, 401);
  }
  const info = gameManager.getLobbyInfo(gameId, apiKey);
  return c.json(info);
});

// Join game
games.post('/:id/join', async (c) => {
  const gameId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    throw new NolbulError('Invalid request body', ErrorCodes.INVALID_REQUEST);
  }
  const { playerName } = body as { playerName?: string };
  if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0) {
    throw new NolbulError('playerName is required', ErrorCodes.INVALID_REQUEST);
  }
  const result = gameManager.joinGame(gameId, playerName.trim().slice(0, 32));
  return c.json(result);
});

// Start game (creator only — playerIndex 0)
games.post('/:id/start', (c) => {
  const gameId = c.req.param('id');
  const apiKey = c.req.header('x-api-key');
  if (!apiKey) {
    throw new NolbulError('Missing x-api-key header', ErrorCodes.UNAUTHORIZED, 401);
  }
  const view = gameManager.startGame(gameId, apiKey);
  return c.json({ success: true, view });
});

// Submit action
games.post('/:id/actions', async (c) => {
  const gameId = c.req.param('id');
  const apiKey = c.req.header('x-api-key');
  if (!apiKey) {
    throw new NolbulError('Missing x-api-key header', ErrorCodes.UNAUTHORIZED, 401);
  }
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    throw new NolbulError('Invalid request body', ErrorCodes.INVALID_REQUEST);
  }
  const { action } = body as { action?: GameAction };
  if (!action || typeof action.type !== 'string') {
    throw new NolbulError('action is required with a valid type', ErrorCodes.INVALID_REQUEST);
  }
  if (!['play', 'discard', 'hint'].includes(action.type)) {
    throw new NolbulError('Invalid action type', ErrorCodes.INVALID_REQUEST);
  }
  if (typeof action.playerIndex !== 'number') {
    throw new NolbulError('action.playerIndex must be a number', ErrorCodes.INVALID_REQUEST);
  }
  if ((action.type === 'play' || action.type === 'discard') && typeof (action as { cardIndex?: unknown }).cardIndex !== 'number') {
    throw new NolbulError('action.cardIndex must be a number', ErrorCodes.INVALID_REQUEST);
  }
  const { view, finished } = gameManager.submitAction(gameId, apiKey, action);
  return c.json({ success: true, view, finished });
});

// Add AI player to a waiting game (creator only)
games.post('/:id/add-ai', (c) => {
  const gameId = c.req.param('id');
  const apiKey = c.req.header('x-api-key');
  if (!apiKey) {
    throw new NolbulError('Missing x-api-key header', ErrorCodes.UNAUTHORIZED, 401);
  }
  // Only creator can add AI players
  const playerIndex = gameManager.getPlayerIndexByApiKey(gameId, apiKey);
  if (playerIndex !== 0) {
    throw new NolbulError('Only the game creator can add AI players', ErrorCodes.UNAUTHORIZED, 403);
  }
  try {
    const result = aiBotService.addAIPlayer(gameId);
    return c.json(result);
  } catch (e) {
    throw new NolbulError((e as Error).message, ErrorCodes.INVALID_REQUEST);
  }
});

// Get AI player status for a game
games.get('/:id/ai-status', (c) => {
  const gameId = c.req.param('id');
  const apiKey = c.req.header('x-api-key');
  if (!apiKey) {
    throw new NolbulError('Missing x-api-key header', ErrorCodes.UNAUTHORIZED, 401);
  }
  gameManager.getPlayerIndexByApiKey(gameId, apiKey); // validates access
  return c.json({
    aiPlayers: aiBotService.getAIPlayers(gameId),
    configured: aiBotService.isConfigured(),
  });
});

// Get AI context (LLM-optimized game state)
games.get('/:id/ai-context', async (c) => {
  const gameId = c.req.param('id');
  const apiKey = c.req.header('x-api-key');
  if (!apiKey) {
    throw new NolbulError('Missing x-api-key header', ErrorCodes.UNAUTHORIZED, 401);
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

// Set game name (after game finishes, for leaderboard)
games.post('/:id/name', async (c) => {
  const gameId = c.req.param('id');
  const apiKey = c.req.header('x-api-key');
  if (!apiKey) {
    throw new NolbulError('Missing x-api-key header', ErrorCodes.UNAUTHORIZED, 401);
  }
  gameManager.getPlayerIndexByApiKey(gameId, apiKey); // validates access
  const body = await c.req.json().catch(() => null);
  if (!body || typeof (body as { name?: unknown }).name !== 'string') {
    throw new NolbulError('name is required', ErrorCodes.INVALID_REQUEST);
  }
  const gameName = ((body as { name: string }).name).trim().slice(0, 32);
  if (!gameName) throw new NolbulError('name cannot be empty', ErrorCodes.INVALID_REQUEST);
  gameManager.setGameName(gameId, gameName);
  return c.json({ success: true, gameName });
});

// Get replay (authenticated)
games.get('/:id/replay', (c) => {
  const gameId = c.req.param('id');
  const apiKey = c.req.header('x-api-key');
  if (!apiKey) {
    throw new NolbulError('Missing x-api-key header', ErrorCodes.UNAUTHORIZED, 401);
  }
  const replay = gameManager.getReplay(gameId, apiKey);
  return c.json({ gameId, ...replay });
});

export { games };
