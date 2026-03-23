import { useT } from '../../lib/i18n.js';

interface DeckViewProps {
  deckSize: number;
  x: number;
  y: number;
}

export function DeckView({ deckSize, x, y }: DeckViewProps) {
  const t = useT();
  const w = 50;
  const h = 70;
  const isEmpty = deckSize === 0;

  return (
    <g transform={`translate(${x}, ${y})`}>
      <defs>
        <linearGradient id="deck-card-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5a5a7a" />
          <stop offset="100%" stopColor="#3a3a5a" />
        </linearGradient>
        <filter id="deck-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="1" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.4" />
        </filter>
      </defs>

      <text x={w / 2} y={-8} textAnchor="middle" fontSize={11} fill="#667" fontWeight="700" letterSpacing={0.5} style={{ textTransform: 'uppercase' }}>
        {t('game.deck')}
      </text>

      {/* Stacked cards effect */}
      {!isEmpty && deckSize > 5 && (
        <rect x={4} y={4} width={w} height={h} rx={6} fill="#2a2a3e" stroke="#333" strokeWidth={0.75} />
      )}
      {!isEmpty && deckSize > 2 && (
        <rect x={2} y={2} width={w} height={h} rx={6} fill="#333" stroke="#444" strokeWidth={0.75} />
      )}

      {/* Top card */}
      <rect
        width={w}
        height={h}
        rx={6}
        fill={isEmpty ? '#1a1a2e' : 'url(#deck-card-grad)'}
        stroke={isEmpty ? '#333' : '#666'}
        strokeWidth={isEmpty ? 0.75 : 1}
        opacity={isEmpty ? 0.4 : 1}
        filter={isEmpty ? undefined : 'url(#deck-shadow)'}
      />

      {!isEmpty && (
        <>
          {/* Inner border for depth */}
          <rect x={3} y={3} width={w - 6} height={h - 6} rx={4} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={0.5} />
          {/* Decorative back pattern */}
          <rect x={8} y={8} width={w - 16} height={h - 16} rx={3} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={0.75} />
          {/* Diamond motif */}
          <path
            d={`M${w / 2} ${h / 2 - 8} L${w / 2 + 6} ${h / 2} L${w / 2} ${h / 2 + 8} L${w / 2 - 6} ${h / 2} Z`}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={0.75}
          />
          {/* Count */}
          <text x={w / 2} y={h / 2 + 8} textAnchor="middle" fontSize={22} fontWeight="800" fill="#bbb">
            {deckSize}
          </text>
        </>
      )}
      {isEmpty && (
        <text x={w / 2} y={h / 2 + 4} textAnchor="middle" fontSize={11} fill="#555" fontWeight="600">
          Empty
        </text>
      )}
    </g>
  );
}
