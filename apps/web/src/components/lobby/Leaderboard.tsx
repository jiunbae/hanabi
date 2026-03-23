import { useState, useEffect } from 'react';
import { useT } from '../../lib/i18n.js';
import * as api from '../../lib/api.js';
import type { LeaderboardEntry } from '../../lib/api.js';

export function Leaderboard() {
  const t = useT();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    api.getLeaderboard(10).then((r) => setEntries(r.leaderboard)).catch(() => {});
  }, []);

  if (entries.length === 0) return null;

  const medal = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;

  return (
    <section className="leaderboard-section">
      <h3 className="leaderboard-title">{t('leaderboard.title')}</h3>
      <div className="leaderboard-list">
        {entries.map((e, i) => (
          <div key={e.gameId} className={`leaderboard-row ${i < 3 ? 'leaderboard-top' : ''}`}>
            <span className="leaderboard-rank">{medal(i)}</span>
            <span className="leaderboard-name">{e.gameName || e.players.join(', ')}</span>
            <span className="leaderboard-score">{e.score}/25</span>
            <span className="leaderboard-players">{e.numPlayers}P</span>
          </div>
        ))}
      </div>
    </section>
  );
}
