import { useT } from '../lib/i18n.js';
import { COLORS } from '@nolbul/engine';
import { COLOR_HEX } from '../lib/colors.js';
import { COLOR_SYMBOL } from '../lib/symbols.js';

interface TutorialViewProps {
  onBack: () => void;
}

export function TutorialView({ onBack }: TutorialViewProps) {
  const t = useT();

  return (
    <div className="lobby" style={{ maxWidth: 640 }}>
      <button className="btn btn-dark btn-sm" onClick={onBack} style={{ marginBottom: 16 }}>
        ← {t('tutorial.back')}
      </button>

      <h1 style={{ color: '#f1c40f', fontSize: 28, fontWeight: 800, marginBottom: 16 }}>
        {t('tutorial.title')}
      </h1>

      <p style={{ color: '#bbb', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
        {t('tutorial.intro')}
      </p>

      {/* Cards display */}
      <Section title={t('tutorial.cards.title')}>
        <p style={{ color: '#999', marginBottom: 12 }}>{t('tutorial.cards.text')}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {COLORS.map((color) => {
            const sym = COLOR_SYMBOL[color];
            return (
              <div key={color} style={{
                width: 48, height: 68, borderRadius: 8,
                background: COLOR_HEX[color],
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 2,
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}>
                <svg width={16} height={16} viewBox={sym.viewBox}>
                  <path d={sym.path} fill={color === 'yellow' || color === 'white' ? '#222' : '#fff'} />
                </svg>
                <span style={{
                  fontSize: 18, fontWeight: 800,
                  color: color === 'yellow' || color === 'white' ? '#222' : '#fff',
                }}>5</span>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title={t('tutorial.goal.title')}>
        <p style={{ color: '#999' }}>{t('tutorial.goal.text')}</p>
      </Section>

      <Section title={t('tutorial.actions.title')}>
        <ActionItem emoji="🎴" text={t('tutorial.action.play')} />
        <ActionItem emoji="🗑️" text={t('tutorial.action.discard')} />
        <ActionItem emoji="💡" text={t('tutorial.action.hint')} />
      </Section>

      <Section title={t('tutorial.endgame.title')}>
        <p style={{ color: '#999' }}>{t('tutorial.endgame.text')}</p>
      </Section>

      <Section title={t('tutorial.tips.title')}>
        <TipItem text={t('tutorial.tip1')} />
        <TipItem text={t('tutorial.tip2')} />
        <TipItem text={t('tutorial.tip3')} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      marginBottom: 20, padding: 16,
      background: 'rgba(22, 33, 62, 0.5)',
      borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)',
      animation: 'fadeIn 0.3s ease-out',
    }}>
      <h3 style={{ color: '#f1c40f', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{title}</h3>
      {children}
    </div>
  );
}

function ActionItem({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{emoji}</span>
      <span style={{ color: '#bbb', fontSize: 14, lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

function TipItem({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
      <span style={{ color: '#2ecc71', fontWeight: 700 }}>•</span>
      <span style={{ color: '#999', fontSize: 14 }}>{text}</span>
    </div>
  );
}
