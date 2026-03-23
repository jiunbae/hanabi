import { useState, useEffect } from 'react';
import { useT } from '../../lib/i18n.js';
import { useGameStore } from '../../stores/game-store.js';
import { COLORS } from '@nolbul/engine';
import { COLOR_HEX } from '../../lib/colors.js';
import { COLOR_SYMBOL } from '../../lib/symbols.js';
import * as api from '../../lib/api.js';

interface WaitingRoomProps {
  gameId: string | null;
  apiKey: string | null;
  isCreator: boolean;
  onStart: () => void;
}

/** Decorative floating card for the background */
function FloatingCard({ color, rank, delay, x }: { color: string; rank: number; delay: number; x: number }) {
  return (
    <div
      className="waiting-floating-card"
      style={{
        left: `${x}%`,
        animationDelay: `${delay}s`,
        background: color,
        color: color === '#f1c40f' || color === '#ecf0f1' ? '#222' : '#fff',
      }}
    >
      {rank}
    </div>
  );
}

/** Animated nolbul logo with card symbols */
function NolbulLogo() {
  return (
    <div className="waiting-logo">
      <div className="waiting-logo-symbols">
        {COLORS.map((color, i) => {
          const sym = COLOR_SYMBOL[color];
          return (
            <svg
              key={color}
              width="28"
              height="28"
              viewBox={sym.viewBox}
              className="waiting-logo-symbol"
              style={{ animationDelay: `${i * 0.15}s` }}
            >
              <path d={sym.path} fill={COLOR_HEX[color]} />
            </svg>
          );
        })}
      </div>
    </div>
  );
}

export function WaitingRoom({ gameId, apiKey, isCreator, onStart }: WaitingRoomProps) {
  const t = useT();
  const { reset, setAIPlayers } = useGameStore();
  const [players, setPlayers] = useState<string[]>([]);
  const [numPlayers, setNumPlayers] = useState(2);
  const [copied, setCopied] = useState(false);
  const [aiPlayerIndices, setAiPlayerIndices] = useState<number[]>([]);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [addingAI, setAddingAI] = useState(false);

  useEffect(() => {
    if (!gameId || !apiKey) return;
    const poll = () => {
      api.getLobbyInfo(gameId, apiKey).then((info) => {
        setPlayers(info.players);
        setNumPlayers(info.numPlayers);
      }).catch(() => {});
      api.getAIStatus(gameId, apiKey).then((status) => {
        setAiPlayerIndices(status.aiPlayers);
        setAIPlayers(status.aiPlayers);
        setAiConfigured(status.configured);
      }).catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [gameId, apiKey, setAIPlayers]);

  const isFull = players.length >= numPlayers;

  const handleAddAI = async () => {
    if (!gameId || !apiKey || addingAI) return;
    setAddingAI(true);
    try {
      await api.addAIPlayer(gameId, apiKey);
      // Re-poll to update
      const info = await api.getLobbyInfo(gameId, apiKey);
      setPlayers(info.players);
      const status = await api.getAIStatus(gameId, apiKey);
      setAiPlayerIndices(status.aiPlayers);
      setAIPlayers(status.aiPlayers);
    } catch (e) {
      console.error('Failed to add AI player:', e);
    } finally {
      setAddingAI(false);
    }
  };

  const handleCopyId = () => {
    if (gameId) {
      navigator.clipboard.writeText(gameId).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {});
    }
  };

  // Decorative background cards
  const bgCards = COLORS.flatMap((color, ci) =>
    [1, 2, 3, 4, 5].map((rank, ri) => ({
      color: COLOR_HEX[color],
      rank,
      delay: (ci * 5 + ri) * 0.7,
      x: ((ci * 5 + ri) * 17) % 100,
    }))
  ).slice(0, 12);

  return (
    <div className="waiting-room">
      {/* Decorative floating cards in background */}
      <div className="waiting-bg">
        {bgCards.map((card, i) => (
          <FloatingCard key={i} {...card} />
        ))}
      </div>

      {/* Back button */}
      <button
        className="btn btn-dark btn-sm"
        onClick={reset}
        style={{ position: 'absolute', top: 16, left: 16, opacity: 0.6, fontSize: 12 }}
      >
        ← {t('game.backToLobby')}
      </button>

      {/* Logo */}
      <NolbulLogo />

      <h2 className="waiting-title">{t('waiting.title')}</h2>

      {/* Game ID with copy */}
      <div className="waiting-id-section">
        <div className="waiting-id-label">{t('waiting.gameId')}</div>
        <div className="waiting-room-id" onClick={handleCopyId} title="Click to copy">
          {gameId}
          <span className="waiting-copy-icon">{copied ? '✓' : '📋'}</span>
        </div>
        <div className="waiting-share-text">{t('waiting.shareId')}</div>
      </div>

      {/* Player list */}
      <div className="waiting-players">
        <div className="waiting-players-label">
          {t('waiting.players')}
          <span className="waiting-players-count">{players.length}/{numPlayers}</span>
        </div>

        <div className="waiting-player-slots">
          {Array.from({ length: numPlayers }).map((_, i) => {
            const joined = !!players[i];
            return (
              <div
                key={i}
                className={`waiting-player-slot ${joined ? 'slot-filled' : 'slot-empty'}`}
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div className={`slot-indicator ${joined ? 'slot-indicator-on' : ''}`} />
                <span className="slot-name">
                  {players[i] ?? t('waiting.emptySlot')}
                </span>
                {i === 0 && joined && (
                  <span className="slot-host-badge">{t('waiting.host')}</span>
                )}
                {joined && aiPlayerIndices.includes(i) && (
                  <span className="slot-ai-badge">{t('waiting.aiPlayer')}</span>
                )}
                {joined && i > 0 && !aiPlayerIndices.includes(i) && (
                  <span className="slot-ready-badge">{t('waiting.ready')}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action area */}
      <div className="waiting-action">
        {isCreator ? (
          <>
            {!isFull && aiConfigured && (
              <button
                className="btn btn-dark"
                onClick={handleAddAI}
                disabled={addingAI}
                style={{ marginBottom: 12, opacity: addingAI ? 0.5 : 0.85 }}
              >
                🤖 {t('waiting.addAI')}
              </button>
            )}
            <button
              className={`btn btn-lg ${isFull ? 'btn-success' : 'btn-dark'}`}
              onClick={onStart}
              disabled={!isFull}
              style={{
                animation: isFull ? 'pulse 2s infinite' : undefined,
                opacity: isFull ? 1 : 0.4,
                cursor: isFull ? 'pointer' : 'not-allowed',
              }}
            >
              {isFull ? `🎆 ${t('waiting.startGame')}` : t('waiting.waitingForPlayers')}
            </button>
          </>
        ) : (
          <div className="waiting-host-msg">
            {t('waiting.waitingForHost')}
            <span className="waiting-dots">
              <span>.</span><span>.</span><span>.</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
