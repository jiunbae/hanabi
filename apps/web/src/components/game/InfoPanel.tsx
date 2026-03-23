import type { ClueTokens, StrikeInfo } from '@hanabi/engine';
import { useT } from '../../lib/i18n.js';

interface InfoPanelProps {
  clueTokens: ClueTokens;
  strikes: StrikeInfo;
  deckSize: number;
  turnsLeft: number | null;
  score: number;
  currentPlayer: number;
  myIndex: number;
  status: string;
}

export function InfoPanel({ clueTokens, strikes, deckSize, turnsLeft, score, currentPlayer, myIndex, status }: InfoPanelProps) {
  const t = useT();

  const isMyTurn = currentPlayer === myIndex && status === 'playing';
  const turnLabel = isMyTurn ? t('game.yourTurn') : status === 'playing'
    ? `${t('game.player', { n: currentPlayer + 1 })} ${t('game.turn')}`
    : '';

  return (
    <div className="info-panel">
      {/* Turn indicator — always visible */}
      {status === 'playing' && (
        <div className={`info-item ${isMyTurn ? 'info-my-turn' : 'info-other-turn'}`}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{turnLabel}</span>
        </div>
      )}
      {/* Clue tokens as visual dots */}
      <div className="info-item">
        <span className="info-label">{t('game.clues')}</span>
        <span className="info-visual-tokens">
          {Array.from({ length: clueTokens.max }, (_, i) => (
            <span
              key={i}
              className={`clue-dot ${i < clueTokens.current ? 'clue-dot-filled' : 'clue-dot-empty'}`}
              style={{ animationDelay: `${i * 0.04}s` }}
            />
          ))}
        </span>
        <span className="info-value" style={{ color: clueTokens.current === 0 ? '#e74c3c' : '#3498db', marginLeft: 4, fontSize: 13 }}>
          {clueTokens.current}
        </span>
      </div>

      {/* Strikes as X marks */}
      <div className="info-item">
        <span className="info-label">{t('game.strikes')}</span>
        <span className="info-visual-tokens">
          {Array.from({ length: strikes.max }, (_, i) => (
            <span
              key={i}
              className={`strike-mark ${i < strikes.current ? 'strike-mark-active' : 'strike-mark-inactive'}`}
            >
              {i < strikes.current ? (
                <svg width="14" height="14" viewBox="0 0 14 14">
                  <line x1="2" y1="2" x2="12" y2="12" stroke="#e74c3c" strokeWidth="2.5" strokeLinecap="round" />
                  <line x1="12" y1="2" x2="2" y2="12" stroke="#e74c3c" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14">
                  <rect x="2" y="2" width="10" height="10" rx="2" fill="none" stroke="#444" strokeWidth="1" />
                </svg>
              )}
            </span>
          ))}
        </span>
      </div>

      {/* Deck as mini card stack icon */}
      <div className="info-item">
        <span className="info-label">{t('game.deck')}</span>
        <span className="info-deck-icon">
          <svg width="22" height="22" viewBox="0 0 22 22">
            {deckSize > 5 && <rect x="4" y="2" width="14" height="18" rx="2" fill="#3a3a5a" stroke="#555" strokeWidth="0.5" />}
            {deckSize > 2 && <rect x="2" y="1" width="14" height="18" rx="2" fill="#4a4a6a" stroke="#666" strokeWidth="0.5" />}
            <rect x="0" y="0" width="14" height="18" rx="2" fill={deckSize > 0 ? '#5a5a7a' : '#2a2a3e'} stroke="#777" strokeWidth="0.5" />
            {deckSize > 0 && (
              <text x="7" y="13" textAnchor="middle" fontSize="9" fontWeight="700" fill="#ccc">
                {deckSize > 9 ? '+' : deckSize}
              </text>
            )}
          </svg>
        </span>
        <span className="info-value" style={{ fontSize: 15 }}>{deckSize}</span>
      </div>

      {/* Turns left (countdown) */}
      {turnsLeft !== null && (
        <div className="info-item info-turns-left">
          <span className="info-label">{t('game.turnsLeft')}</span>
          <span className="info-value info-turns-value">{turnsLeft}</span>
        </div>
      )}

      {/* Score with bar */}
      <div className="info-item info-score-item">
        <span className="info-label">{t('game.score')}</span>
        <span className="info-score-bar-wrap">
          <span className="info-score-bar" style={{ width: `${(score / 25) * 100}%` }} />
        </span>
        <span className="info-value score-value">{score}</span>
        <span style={{ fontSize: 10, color: '#556', marginLeft: 2 }}>/25</span>
      </div>
    </div>
  );
}
