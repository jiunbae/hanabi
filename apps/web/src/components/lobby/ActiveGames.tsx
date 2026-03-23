import { useT } from '../../lib/i18n.js';

interface Game {
  gameId: string;
  numPlayers: number;
  currentPlayers: number;
  status: string;
}

interface ActiveGamesProps {
  games: Game[];
  totalGames: number;
  onJoin: (gameId: string) => void;
}

export function ActiveGames({ games, totalGames, onJoin }: ActiveGamesProps) {
  const t = useT();
  const waitingGames = games.filter((g) => g.status === 'waiting');

  return (
    <div className="active-games-section">
      {/* Social proof badge */}
      {totalGames > 0 && (
        <div className="social-proof">
          <span className="social-proof-dot" />
          <span>{t('lobby.gamesActive', { n: totalGames })}</span>
        </div>
      )}

      {/* Open games list */}
      {waitingGames.length > 0 && (
        <div className="open-games">
          <h3 className="open-games-title">{t('lobby.openGames')}</h3>
          {waitingGames.map((g, idx) => (
            <div
              key={g.gameId}
              className="game-list-item"
              style={{ animationDelay: `${idx * 0.05}s` }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: 13 }}>
                {g.gameId} — {t('lobby.playersCount', { current: g.currentPlayers, max: g.numPlayers })}
              </span>
              <button className="btn btn-primary btn-sm" onClick={() => onJoin(g.gameId)}>
                {t('lobby.join')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
