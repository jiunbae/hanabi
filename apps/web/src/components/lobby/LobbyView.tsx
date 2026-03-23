import { useState, useEffect } from 'react';
import { useGameStore } from '../../stores/game-store.js';
import { useT } from '../../lib/i18n.js';
import * as api from '../../lib/api.js';

export function LobbyView() {
  const { playerName, setPlayerName, setGame, setError, setScreen } = useGameStore();
  const t = useT();
  const [games, setGames] = useState<{ gameId: string; numPlayers: number; currentPlayers: number; status: string }[]>([]);
  const [numPlayers, setNumPlayers] = useState(2);
  const [joinId, setJoinId] = useState('');
  const [name, setName] = useState(playerName || '');

  useEffect(() => {
    api.listGames().then((r) => setGames(r.games)).catch(() => {});
    const interval = setInterval(() => {
      api.listGames().then((r) => setGames(r.games)).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

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
    <div className="lobby">
      <h1 className="lobby-title">{t('app.title')}</h1>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <button
          className="btn btn-dark btn-sm"
          onClick={() => setScreen('tutorial')}
          style={{ fontSize: 13 }}
        >
          📖 {t('lobby.tutorial')}
        </button>
      </div>

      <div className="lobby-section">
        <label className="lobby-label">
          {t('lobby.yourName')} <span style={{ color: '#e74c3c' }}>{t('lobby.required')}</span>
        </label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('lobby.enterName')}
        />
      </div>

      <div className="lobby-section" style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label className="lobby-label">{t('lobby.players')}</label>
          <select className="input" value={numPlayers} onChange={(e) => setNumPlayers(Number(e.target.value))}>
            {[2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{t('lobby.nPlayers', { n })}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" onClick={handleCreate} style={{ alignSelf: 'flex-end' }}>
          {t('lobby.createGame')}
        </button>
      </div>

      <div className="lobby-section">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            placeholder={t('lobby.gameId')}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={() => handleJoin(joinId)}>
            {t('lobby.join')}
          </button>
        </div>
      </div>

      {games.filter((g) => g.status === 'waiting').length > 0 && (
        <div className="lobby-section">
          <h3 style={{ color: '#aaa', marginBottom: 8, fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {t('lobby.openGames')}
          </h3>
          {games
            .filter((g) => g.status === 'waiting')
            .map((g, idx) => (
              <div key={g.gameId} className="game-list-item" style={{ animationDelay: `${idx * 0.05}s` }}>
                <span style={{ fontFamily: 'monospace', fontSize: 13 }}>
                  {g.gameId} — {t('lobby.playersCount', { current: g.currentPlayers, max: g.numPlayers })}
                </span>
                <button className="btn btn-primary btn-sm" onClick={() => handleJoin(g.gameId)}>
                  {t('lobby.join')}
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
