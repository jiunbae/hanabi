import { useRef, useEffect, useState } from 'react';
import type { GameAction } from '@hanabi/engine';
import { useT } from '../../lib/i18n.js';

interface ActionLogProps {
  actions: readonly GameAction[];
  myIndex: number;
}

export function ActionLog({ actions, myIndex }: ActionLogProps) {
  const t = useT();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [actions.length, isOpen]);

  const playerLabel = (idx: number) => idx === myIndex ? t('game.you') : t('game.player', { n: idx + 1 });

  const formatAction = (action: GameAction): string => {
    switch (action.type) {
      case 'play':
        return t('action.played', { player: playerLabel(action.playerIndex), n: action.cardIndex + 1 });
      case 'discard':
        return t('action.discarded', { player: playerLabel(action.playerIndex), n: action.cardIndex + 1 });
      case 'hint':
        return t('action.hinted', {
          player: playerLabel(action.playerIndex),
          target: playerLabel(action.targetIndex),
          value: String(action.hint.value),
        });
    }
  };

  if (actions.length === 0) return null;

  const lastAction = actions[actions.length - 1];

  return (
    <div className="action-log-container">
      {/* Toggle bar — always visible, shows last action */}
      <button
        className="action-log-toggle"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="action-log-toggle-icon">{isOpen ? '▾' : '▸'}</span>
        <span className="action-log-toggle-label">{t('game.actionLog')}</span>
        <span className="action-log-toggle-count">{actions.length}</span>
        {!isOpen && (
          <span className="action-log-preview">
            — {formatAction(lastAction)}
          </span>
        )}
      </button>

      {/* Expandable log body */}
      {isOpen && (
        <div
          ref={scrollRef}
          className="action-log-body"
        >
          {actions.map((action, i) => (
            <div
              key={i}
              className={`action-log-entry ${i === actions.length - 1 ? 'action-log-entry-latest' : ''}`}
            >
              <span className="action-log-turn">{t('action.turnN', { n: i + 1 })}</span>
              <span>{formatAction(action)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
