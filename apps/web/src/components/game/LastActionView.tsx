import type { GameAction } from '@hanabi/engine';
import { useT } from '../../lib/i18n.js';

interface LastActionViewProps {
  action: GameAction | null;
  myIndex: number;
}

export function LastActionView({ action, myIndex }: LastActionViewProps) {
  const t = useT();
  if (!action) return null;

  const playerLabel = (idx: number) => idx === myIndex ? t('game.you') : t('game.player', { n: idx + 1 });

  let text = '';
  switch (action.type) {
    case 'play':
      text = t('action.played', { player: playerLabel(action.playerIndex), n: action.cardIndex + 1 });
      break;
    case 'discard':
      text = t('action.discarded', { player: playerLabel(action.playerIndex), n: action.cardIndex + 1 });
      break;
    case 'hint':
      text = t('action.hinted', {
        player: playerLabel(action.playerIndex),
        target: playerLabel(action.targetIndex),
        value: String(action.hint.value),
      });
      break;
  }

  return <div className="last-action">{t('action.last')}: {text}</div>;
}
