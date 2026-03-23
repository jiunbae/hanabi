import { create } from 'zustand';
import type { PlayerView } from '@hanabi/engine';

export type Screen = 'lobby' | 'game' | 'replay' | 'tutorial';

interface GameStore {
  screen: Screen;
  gameId: string | null;
  apiKey: string | null;
  playerIndex: number;
  playerName: string;
  view: PlayerView | null;
  error: string | null;

  setScreen: (screen: Screen) => void;
  setGame: (gameId: string, apiKey: string, playerIndex: number) => void;
  setView: (view: PlayerView) => void;
  setPlayerName: (name: string) => void;
  setError: (error: string | null) => void;
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

  setScreen: (screen) => set({ screen }),
  setGame: (gameId, apiKey, playerIndex) => set({ gameId, apiKey, playerIndex, screen: 'game' }),
  setView: (view) => set({ view }),
  setPlayerName: (name) => set({ playerName: name }),
  setError: (error) => set({ error }),
  reset: () => set({ screen: 'lobby', gameId: null, apiKey: null, playerIndex: -1, view: null, error: null }),
}));
