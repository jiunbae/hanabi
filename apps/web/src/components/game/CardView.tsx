import type { PlayerViewCard, Color, Rank } from '@nolbul/engine';
import { COLOR_HEX, COLOR_HEX_LIGHT, COLOR_HEX_DARK } from '../../lib/colors.js';
import { COLOR_SYMBOL } from '../../lib/symbols.js';

const CARD_WIDTH = 60;
const CARD_HEIGHT = 90;

interface CardViewProps {
  card: PlayerViewCard;
  x: number;
  y: number;
  onClick?: () => void;
  highlighted?: boolean;
  selectable?: boolean;
  hintHighlight?: boolean;
  dimmed?: boolean;
}

function SymbolIcon({ color, size, x, y, opacity }: { color: Color; size: number; x: number; y: number; opacity?: number }) {
  const sym = COLOR_SYMBOL[color];
  const fill = color === 'yellow' || color === 'white' ? '#222' : '#fff';
  return (
    <svg x={x} y={y} width={size} height={size} viewBox={sym.viewBox} opacity={opacity ?? 1}>
      <path d={sym.path} fill={fill} />
    </svg>
  );
}

export function CardView({ card, x, y, onClick, highlighted, selectable, hintHighlight, dimmed }: CardViewProps) {
  const isHidden = !card.color;
  const textColor = card.color === 'yellow' || card.color === 'white' ? '#222' : '#fff';

  const knownColors = card.clues.filter((c) => c.type === 'color').map((c) => c.value as Color);
  const knownRanks = card.clues.filter((c) => c.type === 'rank').map((c) => c.value as Rank);

  // Stable unique IDs for SVG defs
  const uid = `card-${card.id}`;
  const gradId = `${uid}-grad`;
  const backGradId = `${uid}-back`;
  const shadowId = `${uid}-shadow`;
  const insetId = `${uid}-inset`;

  const strokeColor = hintHighlight ? '#f1c40f' : highlighted ? '#f1c40f' : 'rgba(255,255,255,0.18)';
  const strokeW = hintHighlight ? 3 : highlighted ? 2.5 : 1;

  return (
    <g
      className={`card-group ${selectable ? 'card-selectable' : ''} ${highlighted ? 'card-highlighted' : ''} ${hintHighlight ? 'card-hint-highlight' : ''} ${dimmed ? 'card-dimmed' : ''}`}
      transform={`translate(${x}, ${y})`}
      onClick={onClick}
    >
      <defs>
        {/* Drop shadow filter */}
        <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="1" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.45" />
        </filter>
        {/* Card gradient for visible cards */}
        {card.color && (
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLOR_HEX_LIGHT[card.color]} />
            <stop offset="100%" stopColor={COLOR_HEX_DARK[card.color]} />
          </linearGradient>
        )}
        {/* Card back gradient */}
        {isHidden && (
          <linearGradient id={backGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4a4a6a" />
            <stop offset="100%" stopColor="#2a2a3e" />
          </linearGradient>
        )}
        {/* Inset highlight for depth */}
        <linearGradient id={insetId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
          <stop offset="50%" stopColor="rgba(255,255,255,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.15)" />
        </linearGradient>
      </defs>

      {/* Hint highlight glow ring */}
      {hintHighlight && (
        <rect
          x={-3}
          y={-3}
          width={CARD_WIDTH + 6}
          height={CARD_HEIGHT + 6}
          rx={10}
          ry={10}
          fill="none"
          stroke="#f1c40f"
          strokeWidth={2}
          opacity={0.4}
          className="hint-glow-ring"
        />
      )}

      {/* Card body with shadow */}
      <rect
        width={CARD_WIDTH}
        height={CARD_HEIGHT}
        rx={8}
        ry={8}
        fill={card.color ? `url(#${gradId})` : `url(#${backGradId})`}
        stroke={strokeColor}
        strokeWidth={strokeW}
        filter={`url(#${shadowId})`}
      />

      {/* Inset overlay for depth */}
      <rect
        width={CARD_WIDTH}
        height={CARD_HEIGHT}
        rx={8}
        ry={8}
        fill={`url(#${insetId})`}
        pointerEvents="none"
      />

      {/* Inner border inset */}
      <rect
        x={3}
        y={3}
        width={CARD_WIDTH - 6}
        height={CARD_HEIGHT - 6}
        rx={5}
        ry={5}
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={0.75}
        pointerEvents="none"
      />

      {/* ---- Visible card: rank + centered symbol + corner symbols ---- */}
      {!isHidden && card.rank && card.color && (
        <>
          {/* Large center symbol (behind the number) */}
          <SymbolIcon color={card.color} size={30} x={(CARD_WIDTH - 30) / 2} y={10} opacity={0.18} />

          {/* Rank number */}
          <text
            x={CARD_WIDTH / 2}
            y={CARD_HEIGHT / 2 + 10}
            textAnchor="middle"
            fontSize={32}
            fontWeight="800"
            fill={textColor}
            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
          >
            {card.rank}
          </text>

          {/* Top-left corner: mini symbol */}
          <SymbolIcon color={card.color} size={11} x={4} y={4} opacity={0.65} />
          {/* Top-left corner: mini rank */}
          <text x={9} y={24} textAnchor="middle" fontSize={8} fontWeight="700" fill={textColor} opacity={0.65}>
            {card.rank}
          </text>

          {/* Bottom-right corner: mini symbol */}
          <SymbolIcon color={card.color} size={11} x={CARD_WIDTH - 15} y={CARD_HEIGHT - 15} opacity={0.65} />
          {/* Bottom-right corner: mini rank */}
          <text x={CARD_WIDTH - 9} y={CARD_HEIGHT - 18} textAnchor="middle" fontSize={8} fontWeight="700" fill={textColor} opacity={0.65}>
            {card.rank}
          </text>

          {/* Bottom center: medium symbol for extra polish */}
          <SymbolIcon color={card.color} size={14} x={(CARD_WIDTH - 14) / 2} y={CARD_HEIGHT - 22} opacity={0.35} />
        </>
      )}

      {/* ---- Hidden card back: elegant pattern ---- */}
      {isHidden && (
        <>
          {/* Repeating motif pattern */}
          <rect
            x={6}
            y={6}
            width={CARD_WIDTH - 12}
            height={CARD_HEIGHT - 12}
            rx={4}
            ry={4}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
          <rect
            x={10}
            y={10}
            width={CARD_WIDTH - 20}
            height={CARD_HEIGHT - 20}
            rx={3}
            ry={3}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={0.75}
          />
          {/* Diamond motif in center */}
          <path
            d={`M${CARD_WIDTH / 2} ${CARD_HEIGHT / 2 - 12} L${CARD_WIDTH / 2 + 8} ${CARD_HEIGHT / 2} L${CARD_WIDTH / 2} ${CARD_HEIGHT / 2 + 12} L${CARD_WIDTH / 2 - 8} ${CARD_HEIGHT / 2} Z`}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={1}
          />
          {/* Small decorative dots at corners of inner rect */}
          <circle cx={14} cy={14} r={1.5} fill="rgba(255,255,255,0.1)" />
          <circle cx={CARD_WIDTH - 14} cy={14} r={1.5} fill="rgba(255,255,255,0.1)" />
          <circle cx={14} cy={CARD_HEIGHT - 14} r={1.5} fill="rgba(255,255,255,0.1)" />
          <circle cx={CARD_WIDTH - 14} cy={CARD_HEIGHT - 14} r={1.5} fill="rgba(255,255,255,0.1)" />

          {/* Cross lines for texture */}
          <line x1={CARD_WIDTH / 2} y1={16} x2={CARD_WIDTH / 2} y2={CARD_HEIGHT - 16} stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />
          <line x1={16} y1={CARD_HEIGHT / 2} x2={CARD_WIDTH - 16} y2={CARD_HEIGHT / 2} stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />

          {/* Known clue color indicators */}
          {knownColors.length > 0 && (
            <g>
              {knownColors.map((c, i) => (
                <g key={c}>
                  <circle
                    cx={12 + i * 14}
                    cy={14}
                    r={5}
                    fill={COLOR_HEX[c]}
                    stroke="rgba(255,255,255,0.35)"
                    strokeWidth={1}
                  />
                  {/* Tiny symbol inside the clue dot */}
                  <SymbolIcon color={c} size={6} x={12 + i * 14 - 3} y={11} opacity={0.8} />
                </g>
              ))}
            </g>
          )}

          {/* Known rank or question mark */}
          <text
            x={CARD_WIDTH / 2}
            y={CARD_HEIGHT / 2 + 8}
            textAnchor="middle"
            fontSize={knownRanks.length > 0 ? 24 : 18}
            fontWeight="700"
            fill={knownRanks.length > 0 ? '#ddd' : '#555'}
            opacity={knownRanks.length > 0 ? 1 : 0.6}
          >
            {knownRanks.length > 0 ? knownRanks.join(',') : '?'}
          </text>
        </>
      )}
    </g>
  );
}

export { CARD_WIDTH, CARD_HEIGHT };
