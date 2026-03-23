import { useState, useCallback, useEffect, useRef } from 'react';
import type { GameAction, Color, Rank } from '@hanabi/engine';
import { getScore, COLORS } from '@hanabi/engine';
import { useGameStore } from '../../stores/game-store.js';
import { useWebSocket } from '../../hooks/useWebSocket.js';
import { useT } from '../../lib/i18n.js';
import * as api from '../../lib/api.js';
import { COLOR_HEX } from '../../lib/colors.js';
import { HandView, HINT_PANEL_HEIGHT, ACTION_POPUP_HEIGHT } from './HandView.js';
import { CARD_HEIGHT } from './CardView.js';
import { FireworksView } from './FireworksView.js';
import { DeckView } from './DeckView.js';
import { InfoPanel } from './InfoPanel.js';
import { DiscardPileView } from './DiscardPileView.js';
import { ActionLog } from './ActionLog.js';
import { WaitingRoom } from './WaitingRoom.js';

function StarRating({ score }: { score: number }) {
  const stars = score >= 25 ? 5 : score >= 20 ? 4 : score >= 15 ? 3 : score >= 10 ? 2 : 1;
  return (
    <div className="game-over-stars">
      {Array.from({ length: 5 }, (_, i) => (
        <svg
          key={i}
          width="28"
          height="28"
          viewBox="0 0 24 24"
          className={`game-over-star ${i < stars ? 'star-filled' : 'star-empty'}`}
          style={{ animationDelay: `${0.5 + i * 0.12}s` }}
        >
          <path
            d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
            fill={i < stars ? '#f1c40f' : '#333'}
            stroke={i < stars ? '#d4a017' : '#444'}
            strokeWidth="0.5"
          />
        </svg>
      ))}
    </div>
  );
}

function ConfettiEffect() {
  const particles = Array.from({ length: 30 }, (_, i) => {
    const colors = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db', '#ecf0f1', '#e67e22', '#9b59b6'];
    const color = colors[i % colors.length];
    const left = Math.random() * 100;
    const delay = Math.random() * 2;
    const duration = 2 + Math.random() * 2;
    const size = 4 + Math.random() * 6;
    return (
      <span
        key={i}
        className="confetti-particle"
        style={{
          left: `${left}%`,
          animationDelay: `${delay}s`,
          animationDuration: `${duration}s`,
          width: size,
          height: size * 0.6,
          background: color,
          borderRadius: Math.random() > 0.5 ? '50%' : '1px',
        }}
      />
    );
  });
  return <div className="confetti-container">{particles}</div>;
}

function ScoreBreakdown({ fireworks }: { fireworks: Record<Color, number> }) {
  return (
    <div className="score-breakdown">
      {COLORS.map((color, i) => (
        <div
          key={color}
          className="score-breakdown-item"
          style={{ animationDelay: `${0.8 + i * 0.1}s` }}
        >
          <span
            className="score-breakdown-dot"
            style={{ background: COLOR_HEX[color] }}
          />
          <span className="score-breakdown-value">{fireworks[color]}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Compute table layout positions for hands around a central area.
 * My hand is always at the bottom. Other players are arranged:
 * - 1 other: top center
 * - 2 others: top-left, top-right
 * - 3 others (4-player): compass layout — top, left, right
 * - 4+ others: evenly across top
 */
function getTableLayout(numPlayers: number, myIndex: number, svgWidth: number, svgHeight: number) {
  // Gather other player indices in clockwise order
  const others: number[] = [];
  for (let i = 1; i < numPlayers; i++) {
    others.push((myIndex + i) % numPlayers);
  }

  const positions: { x: number; y: number; playerIndex: number }[] = [];
  const otherCount = others.length;

  let centerY: number;

  if (otherCount === 3) {
    // 4-player compass layout: top, left, right + me at bottom
    centerY = svgHeight / 2 - 30;
    const topY = 10;
    const sideY = centerY - 20;

    // Top center: player across from me
    positions.push({ playerIndex: others[1], x: (svgWidth - 340) / 2, y: topY });
    // Left side
    positions.push({ playerIndex: others[0], x: 10, y: sideY });
    // Right side
    positions.push({ playerIndex: others[2], x: svgWidth - 290, y: sideY });
  } else {
    // The center table area
    centerY = 120;
    const topY = 10;

    if (otherCount === 1) {
      positions.push({ playerIndex: others[0], x: (svgWidth - 340) / 2, y: topY });
    } else if (otherCount === 2) {
      positions.push({ playerIndex: others[0], x: 24, y: topY });
      positions.push({ playerIndex: others[1], x: svgWidth - 370, y: topY });
    } else if (otherCount >= 4) {
      // Distribute evenly
      const spacing = (svgWidth - 360) / (otherCount - 1);
      for (let i = 0; i < otherCount; i++) {
        positions.push({ playerIndex: others[i], x: 24 + i * spacing, y: topY });
      }
    }
  }

  // My hand at the bottom
  const myY = svgHeight - CARD_HEIGHT - ACTION_POPUP_HEIGHT - 40;
  positions.push({ playerIndex: myIndex, x: (svgWidth - 340) / 2, y: myY });

  return { positions, centerY, myY };
}

export function GameBoard() {
  const { view, gameId, apiKey, playerIndex, setView, setError, reset, aiPlayers, setAIPlayers } = useGameStore();
  const { sendAction } = useWebSocket();
  const t = useT();
  const [hoveredHint, setHoveredHint] = useState<{ type: 'color'; value: Color } | { type: 'rank'; value: Rank } | null>(null);
  const [hintTargetPlayer, setHintTargetPlayer] = useState<number | null>(null);
  const [focusedHand, setFocusedHand] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<'success' | 'strike' | null>(null);
  const prevStrikesRef = useRef<number | null>(null);
  const prevScoreRef = useRef<number | null>(null);

  // Fetch AI player status
  useEffect(() => {
    if (!gameId || !apiKey) return;
    api.getAIStatus(gameId, apiKey).then((s) => setAIPlayers(s.aiPlayers)).catch(() => {});
  }, [gameId, apiKey, setAIPlayers]);

  // Detect play success/failure by comparing strikes and score changes
  const currentStrikes = view?.strikes.current ?? null;
  const currentScore = view ? getScore(view.fireworks) : null;

  useEffect(() => {
    if (currentStrikes === null || currentScore === null) return;

    if (prevStrikesRef.current !== null && currentStrikes > prevStrikesRef.current) {
      setFeedback('strike');
      setTimeout(() => setFeedback(null), 1200);
    } else if (prevScoreRef.current !== null && currentScore > prevScoreRef.current) {
      setFeedback('success');
      setTimeout(() => setFeedback(null), 1000);
    }

    prevStrikesRef.current = currentStrikes;
    prevScoreRef.current = currentScore;
  }, [currentStrikes, currentScore]);

  const handleAction = useCallback((action: GameAction) => {
    sendAction(action);
  }, [sendAction]);

  const handleStart = useCallback(async () => {
    if (!gameId || !apiKey) return;
    try {
      const result = await api.startGame(gameId, apiKey);
      setView(result.view);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start game');
    }
  }, [gameId, apiKey, setView, setError]);

  if (!view) {
    return <WaitingRoom gameId={gameId} apiKey={apiKey} isCreator={playerIndex === 0} onStart={handleStart} />;
  }

  const score = getScore(view.fireworks);
  const isMyTurn = view.currentPlayer === view.myIndex && view.status === 'playing';
  const canDiscard = view.clueTokens.current < view.clueTokens.max;
  const canHint = view.clueTokens.current > 0;

  const otherPlayers = view.hands.length - 1;
  const isCompassLayout = otherPlayers === 3;
  const svgWidth = isCompassLayout ? 960 : 820;
  // Calculate height based on layout
  const topSectionHeight = otherPlayers > 0 ? CARD_HEIGHT + HINT_PANEL_HEIGHT + 30 : 0;
  const centerHeight = 110;
  const bottomSectionHeight = CARD_HEIGHT + ACTION_POPUP_HEIGHT + 30;
  const baseHeight = topSectionHeight + centerHeight + bottomSectionHeight + 30;
  // Compass layout needs more vertical space for side players
  const svgHeight = isCompassLayout ? baseHeight + 140 : baseHeight;

  const { positions, centerY } = getTableLayout(view.hands.length, view.myIndex, svgWidth, svgHeight);

  const scoreRating = score >= 25 ? t('game.perfect')
    : score >= 20 ? t('game.great')
    : score >= 15 ? t('game.good')
    : t('game.tryAgain');

  return (
    <div className={`game-container ${feedback === 'strike' ? 'feedback-strike' : ''} ${feedback === 'success' ? 'feedback-success' : ''}`} style={{ padding: '16px 12px', maxWidth: isCompassLayout ? 1000 : 900, margin: '0 auto', animation: 'fadeIn 0.4s ease-out' }}>
      {/* Navigation — always accessible */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <button className="btn btn-dark btn-sm" onClick={reset} style={{ opacity: 0.7, fontSize: 12 }}>
          ← {t('game.backToLobby')}
        </button>
        <span style={{ fontSize: 11, color: '#445', fontFamily: 'monospace' }}>
          ID: {gameId}
        </span>
      </div>
      <InfoPanel
        clueTokens={view.clueTokens}
        strikes={view.strikes}
        deckSize={view.deckSize}
        turnsLeft={view.turnsLeft}
        score={score}
        currentPlayer={view.currentPlayer}
        myIndex={view.myIndex}
        status={view.status}
      />

      <svg
        className="game-svg"
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      >
        <defs>
          {/* Board background gradient */}
          <radialGradient id="board-bg" cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="#1e2a4a" />
            <stop offset="100%" stopColor="#0d1b2a" />
          </radialGradient>
          {/* Subtle felt texture pattern */}
          <pattern id="felt-pattern" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="0.3" fill="rgba(255,255,255,0.02)" />
            <circle cx="0" cy="0" r="0.3" fill="rgba(255,255,255,0.02)" />
            <circle cx="20" cy="0" r="0.3" fill="rgba(255,255,255,0.02)" />
            <circle cx="0" cy="20" r="0.3" fill="rgba(255,255,255,0.02)" />
            <circle cx="20" cy="20" r="0.3" fill="rgba(255,255,255,0.02)" />
          </pattern>
          {/* Decorative border gradient */}
          <linearGradient id="border-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(241,196,15,0.15)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.08)" />
            <stop offset="100%" stopColor="rgba(241,196,15,0.15)" />
          </linearGradient>
          {/* Center table area gradient */}
          <radialGradient id="table-center-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(46,73,120,0.25)" />
            <stop offset="100%" stopColor="rgba(22,33,62,0.1)" />
          </radialGradient>
        </defs>

        {/* Layered background */}
        <rect width={svgWidth} height={svgHeight} rx={12} fill="url(#board-bg)" />
        <rect width={svgWidth} height={svgHeight} rx={12} fill="url(#felt-pattern)" />

        {/* Decorative frame border */}
        <rect
          x={4}
          y={4}
          width={svgWidth - 8}
          height={svgHeight - 8}
          rx={10}
          fill="none"
          stroke="url(#border-grad)"
          strokeWidth={1}
        />

        {/* Center "table" area - oval shape suggesting a real table */}
        <ellipse
          cx={svgWidth / 2}
          cy={centerY + 50}
          rx={isCompassLayout ? 180 : svgWidth / 2 - 40}
          ry={isCompassLayout ? 65 : 55}
          fill="url(#table-center-bg)"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={1}
        />

        {/* Center area: Fireworks + Deck */}
        <FireworksView fireworks={view.fireworks} x={(svgWidth - 310) / 2} y={centerY + 10} />
        <DeckView deckSize={view.deckSize} x={svgWidth / 2 + 170} y={centerY + 20} />

        {/* Turn indicator in center */}
        {isMyTurn && (
          <text
            x={svgWidth / 2}
            y={centerY + 4}
            textAnchor="middle"
            fontSize={12}
            fontWeight="700"
            fill="#f1c40f"
            className="turn-indicator"
          >
            {t('game.yourTurn')}
          </text>
        )}

        {/* Render all hands at their table positions */}
        {positions.map(({ playerIndex: pIdx, x: px, y: py }) => {
          const hand = view.hands[pIdx];
          const isMe = pIdx === view.myIndex;
          const isAI = aiPlayers.includes(pIdx);
          return (
            <g key={pIdx}>
              <HandView
                cards={hand.cards}
                x={px}
                y={py}
                playerIndex={pIdx}
                isCurrentPlayer={pIdx === view.currentPlayer}
                isMyHand={isMe}
                isMyTurn={isMyTurn}
                myIndex={view.myIndex}
                canDiscard={canDiscard}
                canHint={canHint}
                onAction={handleAction}
                hoveredHint={hintTargetPlayer === pIdx ? hoveredHint : null}
                onHoverHint={(hint) => {
                  setHoveredHint(hint);
                  setHintTargetPlayer(hint ? pIdx : null);
                }}
                focusedHand={focusedHand}
                onHandFocus={(pIdx) => setFocusedHand(pIdx)}
              />
              {isAI && (
                <g transform={`translate(${px + 80}, ${py - 2})`}>
                  <rect x={0} y={0} width={28} height={14} rx={3} fill="rgba(52,152,219,0.3)" stroke="rgba(52,152,219,0.6)" strokeWidth={0.5} />
                  <text x={14} y={10.5} textAnchor="middle" fontSize={8} fontWeight="700" fill="#3498db">
                    {t('game.aiIndicator')}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      <DiscardPileView cards={view.discardPile} fireworks={view.fireworks} />

      <ActionLog actions={view.actionHistory} myIndex={view.myIndex} />

      {view.status === 'finished' && (
        <div className="game-over">
          {score >= 20 && <ConfettiEffect />}
          <div className="game-over-title">{t('game.gameOver')}</div>
          <div className="game-over-score">{t('game.finalScore', { score })}</div>
          <StarRating score={score} />
          <ScoreBreakdown fireworks={view.fireworks} />
          <div className="game-over-rating">{scoreRating}</div>
          <button className="btn btn-primary btn-lg" style={{ marginTop: 20 }} onClick={reset}>
            {t('game.backToLobby')}
          </button>
        </div>
      )}
    </div>
  );
}
