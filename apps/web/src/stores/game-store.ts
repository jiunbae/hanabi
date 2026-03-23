import { create } from 'zustand';
import type { PlayerView } from '@nolbul/engine';

export type Screen = 'lobby' | 'game' | 'replay' | 'tutorial' | 'admin';

interface GameStore {
  screen: Screen;
  gameId: string | null;
  apiKey: string | null;
  playerIndex: number;
  playerName: string;
  view: PlayerView | null;
  error: string | null;
  aiPlayers: number[];
  adminKey: string | null;

  setScreen: (screen: Screen) => void;
  setGame: (gameId: string, apiKey: string, playerIndex: number) => void;
  setView: (view: PlayerView) => void;
  setPlayerName: (name: string) => void;
  setError: (error: string | null) => void;
  setAIPlayers: (players: number[]) => void;
  setAdminKey: (key: string | null) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  screen: 'lobby',
  gameId: null,
  apiKey: null,
  playerIndex: -1,
  playerName: '',
  view: null,
  error: null,
  aiPlayers: [],
  adminKey: null,

  setScreen: (screen) => {
    set({ screen });
    if (screen === 'lobby') history.pushState(null, '', '/');
    else if (screen === 'admin') history.pushState(null, '', '/admin');
    else if (screen === 'tutorial') history.pushState(null, '', '/tutorial');
  },
  setGame: (gameId, apiKey, playerIndex) => {
    set({ gameId, apiKey, playerIndex, screen: 'game' });
    history.pushState(null, '', `/game/${gameId}`);
  },
  setView: (view) => set({ view }),
  setPlayerName: (name) => set({ playerName: name }),
  setError: (error) => set({ error }),
  setAIPlayers: (aiPlayers) => set({ aiPlayers }),
  setAdminKey: (adminKey) => set({ adminKey }),
  reset: () => {
    set({ screen: 'lobby', gameId: null, apiKey: null, playerIndex: -1, view: null, error: null, aiPlayers: [] });
    history.pushState(null, '', '/');
  },
}));
