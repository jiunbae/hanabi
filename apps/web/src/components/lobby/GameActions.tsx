import { useState } from 'react';
import { useT } from '../../lib/i18n.js';

interface GameActionsProps {
  name: string;
  onNameChange: (name: string) => void;
  numPlayers: number;
  onNumPlayersChange: (n: number) => void;
  onCreate: () => void;
  joinId: string;
  onJoinIdChange: (id: string) => void;
  onJoin: (id: string) => void;
  onTutorial: () => void;
}

export function GameActions({
  name,
  onNameChange,
  numPlayers,
  onNumPlayersChange,
  onCreate,
  joinId,
  onJoinIdChange,
  onJoin,
  onTutorial,
}: GameActionsProps) {
  const t = useT();
  const [showJoin, setShowJoin] = useState(false);

  return (
    <div className="game-actions">
      <div className="game-actions-card">
        {/* Name input */}
        <div className="action-name-row">
          <div className="action-name-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#889" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <input
            className="action-name-input"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={t('lobby.enterName')}
          />
        </div>

        {/* Create game row */}
        <div className="action-create-row">
          <div className="action-players-select">
            <select
              className="input action-select"
              value={numPlayers}
              onChange={(e) => onNumPlayersChange(Number(e.target.value))}
            >
              {[2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{t('lobby.nPlayers', { n })}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary action-create-btn" onClick={onCreate}>
            {t('lobby.createGame')}
          </button>
        </div>

        {/* Divider */}
        <div className="action-divider">
          <span className="action-divider-line" />
          <span className="action-divider-text">{t('lobby.or')}</span>
          <span className="action-divider-line" />
        </div>

        {/* Join by ID (collapsible) */}
        {!showJoin ? (
          <button className="action-join-toggle" onClick={() => setShowJoin(true)}>
            {t('lobby.joinById')}
          </button>
        ) : (
          <div className="action-join-row">
            <input
              className="input action-join-input"
              value={joinId}
              onChange={(e) => onJoinIdChange(e.target.value)}
              placeholder={t('lobby.gameId')}
              autoFocus
            />
            <button className="btn btn-primary btn-sm" onClick={() => onJoin(joinId)}>
              {t('lobby.join')}
            </button>
          </div>
        )}
      </div>

      {/* Tutorial link */}
      <button className="action-tutorial-link" onClick={onTutorial}>
        {t('lobby.tutorial')}
      </button>
    </div>
  );
}
