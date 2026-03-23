import { useI18nStore } from '../lib/i18n.js';
import type { Locale } from '../lib/i18n.js';

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18nStore();

  return (
    <div className="lang-switcher">
      {(['en', 'ko'] as Locale[]).map((l) => (
        <button
          key={l}
          className={`lang-btn ${locale === l ? 'active' : ''}`}
          onClick={() => setLocale(l)}
          style={{ marginLeft: l === 'ko' ? 4 : 0 }}
        >
          {l === 'en' ? 'EN' : '한국어'}
        </button>
      ))}
    </div>
  );
}
