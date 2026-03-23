import { useT } from '../../lib/i18n.js';
import { COLORS } from '@nolbul/engine';
import { COLOR_HEX } from '../../lib/colors.js';
import { COLOR_SYMBOL } from '../../lib/symbols.js';

interface HeroSectionProps {
  onCreateClick: () => void;
}

export function HeroSection({ onCreateClick }: HeroSectionProps) {
  const t = useT();

  return (
    <div className="hero-section">
      {/* Firework particles background */}
      <div className="hero-particles">
        {COLORS.map((color, i) =>
          [0, 1, 2].map((j) => (
            <div
              key={`${color}-${j}`}
              className="hero-particle"
              style={{
                background: COLOR_HEX[color],
                left: `${15 + i * 17 + j * 5}%`,
                animationDelay: `${i * 0.8 + j * 2.5}s`,
                animationDuration: `${3 + j * 1.5}s`,
              }}
            />
          ))
        )}
      </div>

      {/* Card fan */}
      <div className="hero-card-fan">
        {COLORS.map((color, i) => {
          const sym = COLOR_SYMBOL[color];
          const angle = (i - 2) * 14;
          const translateY = Math.abs(i - 2) * 6;
          return (
            <div
              key={color}
              className="hero-card"
              style={{
                background: `linear-gradient(135deg, ${COLOR_HEX[color]}, ${COLOR_HEX[color]}dd)`,
                transform: `rotate(${angle}deg) translateY(${translateY}px)`,
                animationDelay: `${i * 0.12}s`,
                zIndex: 5 - Math.abs(i - 2),
              }}
            >
              <svg
                width={20}
                height={20}
                viewBox={sym.viewBox}
                className="hero-card-symbol"
              >
                <path
                  d={sym.path}
                  fill={color === 'yellow' || color === 'white' ? '#222' : '#fff'}
                />
              </svg>
              <span
                className="hero-card-rank"
                style={{
                  color: color === 'yellow' || color === 'white' ? '#222' : '#fff',
                }}
              >
                {i + 1}
              </span>
            </div>
          );
        })}
      </div>

      {/* Title */}
      <h1 className="hero-title">{t('app.title')}</h1>
      <p className="hero-tagline">{t('hero.tagline')}</p>
      <p className="hero-subtitle">{t('hero.subtitle')}</p>

      {/* Primary CTA */}
      <button className="btn hero-cta" onClick={onCreateClick}>
        {t('hero.createGame')}
      </button>
    </div>
  );
}
