import { useState } from 'react';
import type { GameAction, PlayerView } from '@hanabi/engine';
import { COLORS, RANKS } from '@hanabi/engine';
import { COLOR_HEX } from '../../lib/colors.js';
import { useT } from '../../lib/i18n.js';

interface ActionPanelProps {
  view: PlayerView;
  selectedCard: number | null;
  onAction: (action: GameAction) => void;
}

export function ActionPanel({ view, selectedCard, onAction }: ActionPanelProps) {
  const [hintTarget, setHintTarget] = useState<number | null>(null);
  const t = useT();
  const isMyTurn = view.currentPlayer === view.myIndex;

  if (!isMyTurn || view.status !== 'playing') return null;

  const canDiscard = view.clueTokens.current < view.clueTokens.max;
  const canHint = view.clueTokens.current > 0;

  return (
    <div className="action-panel">
      <div className="turn-indicator" style={{ marginBottom: 8, fontSize: 15 }}>
        {t('game.yourTurn')}
      </div>

      {selectedCard !== null && (
        <div className="action-buttons" style={{ marginBottom: 8 }}>
          <button className="btn btn-success" onClick={() => onAction({ type: 'play', playerIndex: view.myIndex, cardIndex: selectedCard })}>
            {t('game.playCard', { n: selectedCard + 1 })}
          </button>
          {canDiscard && (
            <button className="btn btn-warning" onClick={() => onAction({ type: 'discard', playerIndex: view.myIndex, cardIndex: selectedCard })}>
              {t('game.discardCard', { n: selectedCard + 1 })}
            </button>
          )}
        </div>
      )}

      {canHint && (
        <div className="hint-section">
          <div style={{ fontSize: 13, color: '#888', marginBottom: 6 }}>{t('game.giveHintTo')}</div>
          <div className="hint-targets">
            {view.hands.map((_, i) => {
              if (i === view.myIndex) return null;
              return (
                <button
                  key={i}
                  className={`btn btn-sm ${hintTarget === i ? 'btn-primary' : 'btn-dark'}`}
                  onClick={() => setHintTarget(hintTarget === i ? null : i)}
                >
                  {t('game.player', { n: i + 1 })}
                </button>
              );
            })}
          </div>

          {hintTarget !== null && (
            <>
              <div className="hint-values">
                {COLORS.map((color) => {
                  const touches = view.hands[hintTarget].cards.some((c) => c.color === color);
                  if (!touches) return null;
                  return (
                    <button
                      key={color}
                      className="btn-color"
                      style={{ background: COLOR_HEX[color], color: color === 'yellow' || color === 'white' ? '#222' : '#fff' }}
                      onClick={() => {
                        onAction({ type: 'hint', playerIndex: view.myIndex, targetIndex: hintTarget, hint: { type: 'color', value: color } });
                        setHintTarget(null);
                      }}
                    >
                      {color}
                    </button>
                  );
                })}
              </div>
              <div className="hint-values">
                {RANKS.map((rank) => {
                  const touches = view.hands[hintTarget].cards.some((c) => c.rank === rank);
                  if (!touches) return null;
                  return (
                    <button
                      key={rank}
                      className="btn-color"
                      style={{ background: '#555' }}
                      onClick={() => {
                        onAction({ type: 'hint', playerIndex: view.myIndex, targetIndex: hintTarget, hint: { type: 'rank', value: rank } });
                        setHintTarget(null);
                      }}
                    >
                      {rank}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
