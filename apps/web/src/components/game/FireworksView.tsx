import type { Fireworks, Color } from '@nolbul/engine';
import { COLORS } from '@nolbul/engine';
import { COLOR_HEX, COLOR_HEX_LIGHT, COLOR_HEX_DARK } from '../../lib/colors.js';
import { COLOR_SYMBOL } from '../../lib/symbols.js';
import { useT } from '../../lib/i18n.js';

interface FireworksViewProps {
  fireworks: Fireworks;
  x: number;
  y: number;
}

/** Sparkle burst particles for completed stacks (rank 5) */
function SparkleParticles({ color, cx, cy }: { color: Color; cx: number; cy: number }) {
  const hex = COLOR_HEX_LIGHT[color];
  // 8 sparkle particles radiating outward
  const sparkles = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * 45) * Math.PI / 180;
    const r1 = 22;
    const r2 = 30;
    const x1 = cx + Math.cos(angle) * r1;
    const y1 = cy + Math.sin(angle) * r1;
    const x2 = cx + Math.cos(angle) * r2;
    const y2 = cy + Math.sin(angle) * r2;
    return { x1, y1, x2, y2, delay: i * 0.08 };
  });

  return (
    <g className="sparkle-group">
      {sparkles.map((s, i) => (
        <line
          key={i}
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          stroke={hex}
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={0.8}
          className="sparkle-ray"
          style={{ animationDelay: `${s.delay}s` }}
        />
      ))}
      {/* Center glow circle */}
      <circle cx={cx} cy={cy} r={28} fill="none" stroke={hex} strokeWidth={1} opacity={0.3} className="sparkle-ring" />
      {/* Small diamond sparkles */}
      {[0, 90, 180, 270].map((deg, i) => {
        const a = deg * Math.PI / 180;
        const sx = cx + Math.cos(a) * 34;
        const sy = cy + Math.sin(a) * 34;
        return (
          <circle key={`dot-${i}`} cx={sx} cy={sy} r={1.5} fill={hex} className="sparkle-dot" style={{ animationDelay: `${i * 0.15}s` }} />
        );
      })}
    </g>
  );
}

export function FireworksView({ fireworks, x, y }: FireworksViewProps) {
  const t = useT();
  const pileWidth = 54;
  const gap = 10;

  return (
    <g transform={`translate(${x}, ${y})`}>
      <text x={0} y={-10} fontSize={11} fill="#667" fontWeight="700" letterSpacing={1} style={{ textTransform: 'uppercase' }}>
        {t('game.fireworks')}
      </text>
      <defs>
        {COLORS.map((color) => (
          <linearGradient key={`fw-bg-${color}`} id={`fw-bg-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLOR_HEX_LIGHT[color]} stopOpacity={0.15} />
            <stop offset="100%" stopColor={COLOR_HEX_DARK[color]} stopOpacity={0.05} />
          </linearGradient>
        ))}
        {COLORS.map((color) => (
          <linearGradient key={`fw-fill-${color}`} id={`fw-fill-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLOR_HEX_LIGHT[color]} />
            <stop offset="100%" stopColor={COLOR_HEX_DARK[color]} />
          </linearGradient>
        ))}
        <filter id="fw-glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {COLORS.map((color, i) => {
        const val = fireworks[color];
        const isComplete = val === 5;
        const sym = COLOR_SYMBOL[color];
        const textFill = val > 0 ? (color === 'yellow' || color === 'white' ? '#222' : '#fff') : '#444';
        const cx = pileWidth / 2;
        const cy = pileWidth / 2;

        return (
          <g
            key={color}
            transform={`translate(${i * (pileWidth + gap)}, 0)`}
            className={isComplete ? 'firework-complete' : val > 0 ? 'firework-stack' : ''}
          >
            {/* Subtle background gradient */}
            <rect
              width={pileWidth}
              height={pileWidth}
              rx={8}
              fill={val > 0 ? `url(#fw-fill-${color})` : `url(#fw-bg-${color})`}
              stroke={COLOR_HEX[color]}
              strokeWidth={isComplete ? 2.5 : val > 0 ? 1.5 : 0.75}
              opacity={val > 0 ? 1 : 0.5}
              filter={isComplete ? 'url(#fw-glow)' : undefined}
            />

            {/* Inner border for depth */}
            {val > 0 && (
              <rect
                x={2}
                y={2}
                width={pileWidth - 4}
                height={pileWidth - 4}
                rx={6}
                fill="none"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth={0.5}
              />
            )}

            {/* Background symbol watermark — large and visible */}
            <svg x={(pileWidth - 32) / 2} y={4} width={32} height={32} viewBox={sym.viewBox} opacity={val > 0 ? 0.25 : 0.12}>
              <path d={sym.path} fill={val > 0 ? '#fff' : COLOR_HEX[color]} />
            </svg>

            {/* Rank number */}
            <text
              x={cx}
              y={cy + 10}
              textAnchor="middle"
              fontSize={28}
              fontWeight="800"
              fill={textFill}
              className={val > 0 ? 'firework-number' : ''}
            >
              {val}
            </text>

            {/* Progress dots along bottom */}
            <g>
              {[1, 2, 3, 4, 5].map((rank) => (
                <circle
                  key={rank}
                  cx={7 + (rank - 1) * 10}
                  cy={pileWidth - 5}
                  r={2}
                  fill={rank <= val ? (color === 'yellow' || color === 'white' ? '#222' : '#fff') : 'rgba(255,255,255,0.1)'}
                />
              ))}
            </g>

            {/* Sparkle particles for completed stacks */}
            {isComplete && <SparkleParticles color={color} cx={cx} cy={cy} />}
          </g>
        );
      })}
    </g>
  );
}
