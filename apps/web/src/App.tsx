import { useGameStore } from './stores/game-store.js';
import { useT } from './lib/i18n.js';
import { LobbyView } from './components/lobby/LobbyView.js';
import { GameBoard } from './components/game/GameBoard.js';
import { TutorialView } from './components/TutorialView.js';
import { LanguageSwitcher } from './components/LanguageSwitcher.js';

export function App() {
  const { screen, error, setError, setScreen } = useGameStore();
  const t = useT();

  return (
    <div>
      {/* Show floating lang switcher only outside lobby (lobby has its own in footer) */}
      {screen !== 'lobby' && <LanguageSwitcher />}

      {error && (
        <div className="error-banner" onClick={() => setError(null)}>
          {error} {t('error.dismiss')}
        </div>
      )}

      {screen === 'lobby' && <LobbyView />}
      {screen === 'game' && <GameBoard />}
      {screen === 'tutorial' && <TutorialView onBack={() => setScreen('lobby')} />}
    </div>
  );
}
