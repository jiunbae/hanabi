import type { Card, Color, Rank, Fireworks } from '@nolbul/engine';
import { COLORS, RANKS, RANK_COPIES } from '@nolbul/engine';
import { COLOR_HEX } from '../../lib/colors.js';
import { useT } from '../../lib/i18n.js';

interface DiscardPileViewProps {
  cards: readonly Card[];
  fireworks: Fireworks;
}

export function DiscardPileView({ cards, fireworks }: DiscardPileViewProps) {
  const t = useT();

  // Build count grid: discardCounts[color][rank] = number discarded
  const discardCounts = new Map<Color, Map<Rank, number>>();
  for (const color of COLORS) {
    const rankMap = new Map<Rank, number>();
    for (const rank of RANKS) rankMap.set(rank, 0);
    discardCounts.set(color, rankMap);
  }
  for (const card of cards) {
    const rm = discardCounts.get(card.color)!;
    rm.set(card.rank, (rm.get(card.rank) ?? 0) + 1);
  }

  // Check if a card is "dead" (all copies discarded, stack can't reach it)
  const isDead = (color: Color, rank: Rank): boolean => {
    if (fireworks[color] >= rank) return false; // already played
    // Check if any rank below is fully dead
    for (let r = (fireworks[color] + 1) as Rank; r <= rank; r++) {
      const discarded = discardCounts.get(color)!.get(r as Rank) ?? 0;
      if (discarded >= RANK_COPIES[r as Rank]) return true;
    }
    return false;
  };

  // Check if a card is "critical" (only 1 copy remaining)
  const isCritical = (color: Color, rank: Rank): boolean => {
    if (fireworks[color] >= rank) return false;
    if (isDead(color, rank)) return false;
    const discarded = discardCounts.get(color)!.get(rank) ?? 0;
    return RANK_COPIES[rank] - discarded === 1;
  };

  if (cards.length === 0) {
    return <div className="discard-pile" style={{ color: '#445', fontSize: 12 }}>{t('discard.empty')}</div>;
  }

  return (
    <div className="discard-pile">
      <div style={{ fontSize: 12, color: '#667', marginBottom: 6, fontWeight: 600 }}>
        {t('discard.count', { n: cards.length })}
      </div>
      <div className="discard-grid">
        {/* Header row: ranks */}
        <div className="discard-grid-row">
          <div className="discard-grid-header" />
          {RANKS.map((rank) => (
            <div key={rank} className="discard-grid-header">{rank}</div>
          ))}
        </div>
        {/* Color rows */}
        {COLORS.map((color) => (
          <div key={color} className="discard-grid-row">
            <div className="discard-grid-color" style={{ background: COLOR_HEX[color] }} />
            {RANKS.map((rank) => {
              const discarded = discardCounts.get(color)!.get(rank) ?? 0;
              const total = RANK_COPIES[rank];
              const played = fireworks[color] >= rank;
              const dead = isDead(color, rank);
              const critical = isCritical(color, rank);

              return (
                <div
                  key={rank}
                  className={`discard-grid-cell ${played ? 'discard-played' : ''} ${dead ? 'discard-dead' : ''} ${critical ? 'discard-critical' : ''}`}
                  title={`${color} ${rank}: ${discarded}/${total} discarded${dead ? ' (DEAD)' : critical ? ' (CRITICAL)' : ''}`}
                >
                  {played ? '✓' : discarded > 0 ? `${discarded}` : '·'}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
