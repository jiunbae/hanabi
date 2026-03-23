import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../../stores/game-store.js';
import { useT } from '../../lib/i18n.js';
import * as api from '../../lib/api.js';
import { HeroSection } from './HeroSection.js';
import { FeatureHighlights } from './FeatureHighlights.js';
import { GameActions } from './GameActions.js';
import { ActiveGames } from './ActiveGames.js';
import { LobbyFooter } from './LobbyFooter.js';
import { Leaderboard } from './Leaderboard.js';
import { AdSlot } from '../AdSlot.js';

export function LobbyView() {
  const { playerName, setPlayerName, setGame, setError, setScreen } = useGameStore();
  const t = useT();
  const [games, setGames] = useState<{ gameId: string; numPlayers: number; currentPlayers: number; status: string }[]>([]);
  const [numPlayers, setNumPlayers] = useState(2);
  const [joinId, setJoinId] = useState('');
  const [name, setName] = useState(playerName || '');
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.listGames().then((r) => setGames(r.games)).catch(() => {});
    const interval = setInterval(() => {
      api.listGames().then((r) => setGames(r.games)).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const scrollToActions = () => {
    actionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Focus the name input after scroll
    setTimeout(() => {
      const nameInput = actionsRef.current?.querySelector<HTMLInputElement>('.action-name-input');
      if (nameInput) nameInput.focus();
    }, 400);
  };

  const handleCreate = async () => {
    if (!name.trim()) { setError(t('lobby.nameRequired')); return; }
    setPlayerName(name);
    try {
      const result = await api.createGame({ numPlayers }, name);
      setGame(result.gameId, result.apiKey, result.playerIndex);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create game');
    }
  };

  const handleJoin = async (gameId: string) => {
    if (!name.trim()) { setError(t('lobby.nameRequired')); return; }
    setPlayerName(name);
    try {
      const result = await api.joinGame(gameId, name);
      setGame(gameId, result.apiKey, result.playerIndex);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to join game');
    }
  };

  return (
    <div className="lobby-landing">
      <HeroSection onCreateClick={scrollToActions} />
      <FeatureHighlights />

      <div ref={actionsRef}>
        <GameActions
          name={name}
          onNameChange={setName}
          numPlayers={numPlayers}
          onNumPlayersChange={setNumPlayers}
          onCreate={handleCreate}
          joinId={joinId}
          onJoinIdChange={setJoinId}
          onJoin={handleJoin}
          onTutorial={() => setScreen('tutorial')}
        />
      </div>

      <ActiveGames
        games={games}
        totalGames={games.length}
        onJoin={handleJoin}
      />

      <Leaderboard />

      <AdSlot slot="7610792747" />

      <LobbyFooter />
    </div>
  );
}
