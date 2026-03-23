/**
 * Nolbul Game API Client
 *
 * Simple HTTP client for the Nolbul server REST API.
 */

export interface GameCredentials {
  gameId: string;
  playerIndex: number;
  apiKey: string;
}

export interface AIContextResponse {
  gameId: string;
  prompt: string;
  view: {
    currentPlayer: number;
    myIndex: number;
    status: 'waiting' | 'playing' | 'finished';
    legalActions: GameAction[];
    [key: string]: unknown;
  };
  isMyTurn: boolean;
  status: string;
}

export interface GameAction {
  type: 'play' | 'discard' | 'hint';
  playerIndex: number;
  cardIndex?: number;
  targetIndex?: number;
  hint?: { type: 'color' | 'rank'; value: string | number };
}

export interface ActionResponse {
  success: boolean;
  view: AIContextResponse['view'];
  finished: boolean;
  error?: string;
}

export class NolbulClient {
  constructor(private baseUrl: string) {}

  async createGame(numPlayers: number, creatorName: string): Promise<GameCredentials> {
    const res = await fetch(`${this.baseUrl}/api/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ options: { numPlayers }, creatorName }),
    });
    if (!res.ok) throw new Error(`Create game failed: ${await res.text()}`);
    return res.json();
  }

  async joinGame(gameId: string, playerName: string): Promise<GameCredentials> {
    const res = await fetch(`${this.baseUrl}/api/games/${gameId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName }),
    });
    if (!res.ok) throw new Error(`Join game failed: ${await res.text()}`);
    const data = await res.json();
    return { gameId, ...data };
  }

  async startGame(gameId: string, apiKey: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/games/${gameId}/start`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
    });
    if (!res.ok) throw new Error(`Start game failed: ${await res.text()}`);
  }

  async getAIContext(gameId: string, apiKey: string, includeRules = true): Promise<AIContextResponse> {
    const params = new URLSearchParams();
    if (!includeRules) params.set('includeRules', 'false');
    const url = `${this.baseUrl}/api/games/${gameId}/ai-context?${params}`;
    const res = await fetch(url, {
      headers: { 'x-api-key': apiKey },
    });
    if (!res.ok) throw new Error(`Get AI context failed: ${await res.text()}`);
    return res.json();
  }

  async submitAction(gameId: string, apiKey: string, action: GameAction): Promise<ActionResponse> {
    const res = await fetch(`${this.baseUrl}/api/games/${gameId}/actions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) throw new Error(`Submit action failed: ${await res.text()}`);
    return res.json();
  }
}
