import { useGameStore } from './stores/game-store.js';
import { useT } from './lib/i18n.js';
import { LobbyView } from './components/lobby/LobbyView.js';
import { GameBoard } from './components/game/GameBoard.js';
import { TutorialView } from './components/TutorialView.js';
import { AdminPanel } from './components/admin/AdminPanel.js';
import { LanguageSwitcher } from './components/LanguageSwitcher.js';
import { FireworksBackground } from './components/FireworksBackground.js';

export function App() {
  const { screen, view, error, setError, setScreen } = useGameStore();
  const t = useT();

  const isGameFinished = screen === 'game' && view?.status === 'finished';
  const score = view ? Object.values(view.fireworks).reduce((a, b) => a + b, 0) : 0;
  const fireworksIntensity = isGameFinished && score >= 20 ? 'celebration'
    : screen === 'lobby' || screen === 'tutorial' ? 'lobby'
    : 'game';

  return (
    <>
      {/* Background layer — always behind */}
      <FireworksBackground intensity={fireworksIntensity} />

      {/* Content layer — always in front */}
      <div className="app-content">
        {screen !== 'lobby' && <LanguageSwitcher />}

        {error && (
          <div className="error-banner" onClick={() => setError(null)}>
            {error} {t('error.dismiss')}
          </div>
        )}

        {screen === 'lobby' && <LobbyView />}
        {screen === 'game' && <GameBoard />}
        {screen === 'tutorial' && <TutorialView onBack={() => setScreen('lobby')} />}
        {screen === 'admin' && <AdminPanel />}
      </div>
    </>
  );
}
