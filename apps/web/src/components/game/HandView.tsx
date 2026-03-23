import { useState, useEffect } from 'react';
import type { PlayerViewCard, Color, Rank, GameAction } from '@nolbul/engine';
import { COLORS, RANKS } from '@nolbul/engine';
import { COLOR_HEX } from '../../lib/colors.js';
import { useT } from '../../lib/i18n.js';
import { CardView, CARD_WIDTH, CARD_HEIGHT } from './CardView.js';

interface HandViewProps {
  cards: readonly PlayerViewCard[];
  x: number;
  y: number;
  playerIndex: number;
  isCurrentPlayer: boolean;
  isMyHand: boolean;
  isMyTurn: boolean;
  myIndex: number;
  canDiscard: boolean;
  canHint: boolean;
  onAction?: (action: GameAction) => void;
  hoveredHint?: { type: 'color'; value: Color } | { type: 'rank'; value: Rank } | null;
  onHoverHint?: (hint: { type: 'color'; value: Color } | { type: 'rank'; value: Rank } | null) => void;
  /** Called when this hand is interacted with — passes playerIndex so other hands can deselect */
  onHandFocus?: (focusedPlayerIndex: number) => void;
  /** Which player's hand was last focused — this hand clears if it's not the focused one */
  focusedHand?: number | null;
}

const HAND_GAP = 8;
// Height reserved below cards for hint buttons
const HINT_PANEL_HEIGHT = 60;
// Height reserved below cards for play/discard popup
const ACTION_POPUP_HEIGHT = 36;

export function HandView({
  cards, x, y, playerIndex, isCurrentPlayer, isMyHand, isMyTurn,
  myIndex, canDiscard, canHint, onAction, hoveredHint, onHoverHint,
  onHandFocus, focusedHand,
}: HandViewProps) {
  const t = useT();
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const [showHintPanel, setShowHintPanel] = useState(false);

  // Clear selection when ANOTHER hand is focused (not this one)
  useEffect(() => {
    if (focusedHand !== null && focusedHand !== undefined && focusedHand !== playerIndex) {
      setSelectedCard(null);
      setShowHintPanel(false);
    }
  }, [focusedHand, playerIndex]);

  const label = isMyHand ? t('game.you') : t('game.player', { n: playerIndex + 1 });

  const handWidth = cards.length * (CARD_WIDTH + HAND_GAP) - HAND_GAP;

  // Check if a card matches the currently hovered hint
  const cardMatchesHint = (card: PlayerViewCard): boolean => {
    if (!hoveredHint) return false;
    if (hoveredHint.type === 'color') return card.color === hoveredHint.value;
    if (hoveredHint.type === 'rank') return card.rank === hoveredHint.value;
    return false;
  };

  const isHintActive = hoveredHint !== null && hoveredHint !== undefined;

  // Handle clicking on my own card
  const handleMyCardClick = (idx: number) => {
    if (!isMyTurn) return;
    onHandFocus?.(playerIndex); // tell other hands to deselect
    setSelectedCard(selectedCard === idx ? null : idx);
    setShowHintPanel(false);
  };

  // Handle clicking on another player's hand area
  const handleOtherHandClick = () => {
    if (!isMyTurn || !canHint || isMyHand) return;
    onHandFocus?.(playerIndex); // tell other hands (including my hand) to deselect
    setShowHintPanel(!showHintPanel);
    setSelectedCard(null);
  };

  // Dispatch play action
  const handlePlay = (cardIndex: number) => {
    onAction?.({ type: 'play', playerIndex: myIndex, cardIndex });
    setSelectedCard(null);
  };

  // Dispatch discard action
  const handleDiscard = (cardIndex: number) => {
    onAction?.({ type: 'discard', playerIndex: myIndex, cardIndex });
    setSelectedCard(null);
  };

  // Dispatch hint action
  const handleHint = (hint: { type: 'color'; value: Color } | { type: 'rank'; value: Rank }) => {
    onAction?.({ type: 'hint', playerIndex: myIndex, targetIndex: playerIndex, hint });
    setShowHintPanel(false);
    onHoverHint?.(null);
  };

  // Available colors/ranks for hints (only those that touch at least one card)
  const availableColors = COLORS.filter((c) => cards.some((card) => card.color === c));
  const availableRanks = RANKS.filter((r) => cards.some((card) => card.rank === r));

  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Player label */}
      <text
        x={0}
        y={-8}
        fontSize={13}
        fontWeight={isCurrentPlayer ? '700' : '400'}
        fill={isCurrentPlayer ? '#f1c40f' : '#778'}
        className={isCurrentPlayer ? 'turn-indicator' : ''}
      >
        {label} {isCurrentPlayer ? t('game.turn') : ''}
      </text>

      {/* Clickable background area for other players' hands (to trigger hint panel) */}
      {!isMyHand && isMyTurn && canHint && (
        <g onClick={handleOtherHandClick} style={{ cursor: 'pointer' }}>
          <rect
            x={-6}
            y={-4}
            width={handWidth + 12}
            height={CARD_HEIGHT + 8}
            rx={10}
            fill="transparent"
            stroke={showHintPanel ? 'rgba(241,196,15,0.4)' : 'rgba(255,255,255,0.08)'}
            strokeWidth={showHintPanel ? 1.5 : 1}
            strokeDasharray={showHintPanel ? 'none' : '4 4'}
            className="hand-hint-target"
          />
          {/* Visible hint affordance label */}
          {!showHintPanel && (
            <text
              x={handWidth / 2}
              y={CARD_HEIGHT + 16}
              textAnchor="middle"
              fontSize={11}
              fill="rgba(241, 196, 15, 0.5)"
              fontWeight="600"
              className="hint-affordance-label"
            >
              💡 {t('game.giveHintTo').replace(':', '')}
            </text>
          )}
        </g>
      )}

      {/* Slot numbers above cards */}
      {cards.map((_, i) => (
        <text
          key={`slot-${i}`}
          x={i * (CARD_WIDTH + HAND_GAP) + CARD_WIDTH / 2}
          y={-20}
          textAnchor="middle"
          fontSize={10}
          fontWeight="600"
          fill="#556"
          fontFamily="monospace"
        >
          {i + 1}
        </text>
      ))}

      {/* Cards */}
      {cards.map((card, i) => {
        const isSelected = isMyHand && selectedCard === i;
        const matchesHint = !isMyHand && isHintActive && cardMatchesHint(card);
        const isDimmed = !isMyHand && isHintActive && !cardMatchesHint(card);

        return (
          <CardView
            key={card.id}
            card={card}
            x={i * (CARD_WIDTH + HAND_GAP)}
            y={isSelected ? -8 : 0}
            highlighted={isSelected}
            selectable={isMyHand && isMyTurn}
            hintHighlight={matchesHint}
            dimmed={isDimmed}
            onClick={isMyHand ? () => handleMyCardClick(i) : () => handleOtherHandClick()}
          />
        );
      })}

      {/* Play/Discard popup for my selected card */}
      {isMyHand && isMyTurn && selectedCard !== null && (
        <g transform={`translate(${selectedCard * (CARD_WIDTH + HAND_GAP)}, ${CARD_HEIGHT + 6})`}>
          {/* Popup background */}
          <rect
            x={-4}
            y={0}
            width={canDiscard ? 120 : 58}
            height={ACTION_POPUP_HEIGHT}
            rx={8}
            fill="rgba(22, 33, 62, 0.95)"
            stroke="rgba(241,196,15,0.3)"
            strokeWidth={1}
            className="action-popup-bg"
          />
          {/* Arrow pointing up to the card */}
          <path
            d={`M${CARD_WIDTH / 2 - 6} 0 L${CARD_WIDTH / 2} -5 L${CARD_WIDTH / 2 + 6} 0`}
            fill="rgba(22, 33, 62, 0.95)"
            stroke="rgba(241,196,15,0.3)"
            strokeWidth={1}
          />
          <rect x={CARD_WIDTH / 2 - 6} y={0} width={12} height={3} fill="rgba(22, 33, 62, 0.95)" />

          {/* Play button */}
          <g
            className="popup-action-btn popup-play-btn"
            onClick={(e) => { e.stopPropagation(); handlePlay(selectedCard); }}
            style={{ cursor: 'pointer' }}
          >
            <rect x={2} y={5} width={52} height={26} rx={6} fill="#d4a017" className="popup-btn-rect" />
            <text x={28} y={23} textAnchor="middle" fontSize={11} fontWeight="700" fill="#fff">
              {t('game.play')} ?
            </text>
          </g>

          {/* Discard button */}
          {canDiscard && (
            <g
              className="popup-action-btn popup-discard-btn"
              onClick={(e) => { e.stopPropagation(); handleDiscard(selectedCard); }}
              style={{ cursor: 'pointer' }}
            >
              <rect x={60} y={5} width={52} height={26} rx={6} fill="#d35400" className="popup-btn-rect" />
              <text x={86} y={23} textAnchor="middle" fontSize={11} fontWeight="700" fill="#fff">
                {t('game.discard')}
              </text>
            </g>
          )}
        </g>
      )}

      {/* Hint panel overlay for other players */}
      {!isMyHand && showHintPanel && isMyTurn && canHint && (
        <g transform={`translate(0, ${CARD_HEIGHT + 8})`}>
          {/* Panel background */}
          <rect
            x={-6}
            y={-4}
            width={Math.max(handWidth + 12, availableColors.length * 38 + 8, availableRanks.length * 32 + 8)}
            height={HINT_PANEL_HEIGHT}
            rx={8}
            fill="rgba(22, 33, 62, 0.95)"
            stroke="rgba(241,196,15,0.25)"
            strokeWidth={1}
            className="hint-panel-bg"
          />

          {/* Color hint buttons */}
          {availableColors.map((color, i) => {
            const textFill = color === 'yellow' || color === 'white' ? '#222' : '#fff';
            return (
              <g
                key={color}
                className="popup-action-btn"
                onClick={(e) => { e.stopPropagation(); handleHint({ type: 'color', value: color }); }}
                onMouseEnter={() => onHoverHint?.({ type: 'color', value: color })}
                onMouseLeave={() => onHoverHint?.(null)}
                style={{ cursor: 'pointer' }}
              >
                <rect x={i * 36} y={0} width={32} height={22} rx={5} fill={COLOR_HEX[color]} className="popup-btn-rect" />
                <text x={i * 36 + 16} y={15} textAnchor="middle" fontSize={9} fontWeight="700" fill={textFill}>
                  {color.slice(0, 1).toUpperCase()}
                </text>
              </g>
            );
          })}

          {/* Rank hint buttons */}
          {availableRanks.map((rank, i) => (
            <g
              key={rank}
              className="popup-action-btn"
              onClick={(e) => { e.stopPropagation(); handleHint({ type: 'rank', value: rank }); }}
              onMouseEnter={() => onHoverHint?.({ type: 'rank', value: rank })}
              onMouseLeave={() => onHoverHint?.(null)}
              style={{ cursor: 'pointer' }}
            >
              <rect x={i * 30} y={26} width={26} height={22} rx={5} fill="#555" className="popup-btn-rect" />
              <text x={i * 30 + 13} y={41} textAnchor="middle" fontSize={11} fontWeight="700" fill="#eee">
                {rank}
              </text>
            </g>
          ))}
        </g>
      )}
    </g>
  );
}

export { HAND_GAP, HINT_PANEL_HEIGHT, ACTION_POPUP_HEIGHT };
