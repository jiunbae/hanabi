import { useT } from '../../lib/i18n.js';

export function FeatureHighlights() {
  const t = useT();

  const features = [
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
      title: t('feature.coop.title'),
      desc: t('feature.coop.desc'),
      color: '#2ecc71',
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ),
      title: t('feature.hidden.title'),
      desc: t('feature.hidden.desc'),
      color: '#f1c40f',
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      ),
      title: t('feature.players.title'),
      desc: t('feature.players.desc'),
      color: '#3498db',
    },
  ];

  return (
    <div className="features-section">
      {features.map((f, i) => (
        <div
          key={i}
          className="feature-card"
          style={{
            animationDelay: `${0.3 + i * 0.12}s`,
            borderColor: `${f.color}22`,
          }}
        >
          <div className="feature-icon" style={{ color: f.color }}>
            {f.icon}
          </div>
          <div className="feature-text">
            <div className="feature-title" style={{ color: f.color }}>{f.title}</div>
            <div className="feature-desc">{f.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
