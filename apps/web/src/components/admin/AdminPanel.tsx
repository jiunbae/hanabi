import { useState, useEffect } from 'react';
import { useT } from '../../lib/i18n.js';
import { useGameStore } from '../../stores/game-store.js';
import * as api from '../../lib/api.js';
import type { AdminGameInfo, AdminStats } from '../../lib/api.js';

function LoginGate({ onLogin }: { onLogin: (key: string) => void }) {
  const t = useT();
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;
    try {
      await api.adminGetStats(key.trim());
      onLogin(key.trim());
    } catch {
      setError('Invalid admin key');
    }
  };

  return (
    <div className="admin-login">
      <h2>{t('admin.login')}</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <input
          className="input"
          type="password"
          placeholder={t('admin.password')}
          value={key}
          onChange={(e) => { setKey(e.target.value); setError(''); }}
          autoFocus
        />
        <button className="btn btn-primary" type="submit">{t('admin.enter')}</button>
      </form>
      {error && <div style={{ color: '#e74c3c', marginTop: 8, fontSize: 13 }}>{error}</div>}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="admin-stat-card">
      <div className="admin-stat-value">{value}</div>
      <div className="admin-stat-label">{label}</div>
    </div>
  );
}

function GamesTable({ games }: { games: AdminGameInfo[] }) {
  const statusColor = (s: string) =>
    s === 'playing' ? '#2ecc71' : s === 'waiting' ? '#f1c40f' : '#666';

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Status</th>
            <th>Players</th>
            <th>Score</th>
            <th>Actions</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {games.length === 0 && (
            <tr><td colSpan={6} style={{ textAlign: 'center', opacity: 0.5 }}>No games</td></tr>
          )}
          {games.map((g) => (
            <tr key={g.gameId}>
              <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{g.gameId}</td>
              <td>
                <span style={{ color: statusColor(g.status), fontWeight: 600, fontSize: 12 }}>
                  {g.status}
                </span>
              </td>
              <td>
                {g.players.map((name, i) => (
                  <span key={i} style={{ display: 'inline-block', marginRight: 4 }}>
                    {name}
                    {g.aiPlayers.includes(i) && (
                      <span style={{ fontSize: 9, color: '#3498db', marginLeft: 2 }}>AI</span>
                    )}
                    {i < g.players.length - 1 ? ',' : ''}
                  </span>
                ))}
                <span style={{ opacity: 0.4, fontSize: 11 }}> ({g.currentPlayers}/{g.numPlayers})</span>
              </td>
              <td>{g.score !== null ? `${g.score}/25` : '-'}</td>
              <td>{g.actionCount}</td>
              <td style={{ fontSize: 11, opacity: 0.6 }}>{new Date(g.createdAt).toLocaleTimeString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AIConfigPanel({ adminKey }: { adminKey: string }) {
  const t = useT();
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [configured, setConfigured] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.adminGetAIConfig(adminKey).then((c) => {
      setProvider(c.provider);
      setModel(c.model);
      setConfigured(c.configured);
    }).catch(() => {});
  }, [adminKey]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await api.adminSetAIConfig(adminKey, { provider, model });
      setConfigured(result.configured);
    } catch (e) {
      console.error('Failed to save AI config:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-config">
      <h3>{t('admin.aiConfig')}</h3>
      <div className="admin-config-status">
        <span style={{ color: configured ? '#2ecc71' : '#e74c3c' }}>
          {configured ? t('admin.configured') : t('admin.notConfigured')}
        </span>
      </div>
      <div className="admin-config-form">
        <label>
          {t('admin.provider')}
          <select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="claude">Claude</option>
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini</option>
          </select>
        </label>
        <label>
          {t('admin.model')}
          <input
            className="input"
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="(default)"
          />
        </label>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {t('admin.save')}
        </button>
      </div>
    </div>
  );
}

export function AdminPanel() {
  const t = useT();
  const { adminKey, setAdminKey, setScreen } = useGameStore();
  const [games, setGames] = useState<AdminGameInfo[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    if (!adminKey) return;
    const poll = () => {
      api.adminListGames(adminKey).then((r) => setGames(r.games)).catch(() => {});
      api.adminGetStats(adminKey).then(setStats).catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [adminKey]);

  if (!adminKey) {
    return (
      <div className="admin-panel" style={{ animation: 'fadeIn 0.3s ease-out' }}>
        <button className="btn btn-dark btn-sm" onClick={() => setScreen('lobby')} style={{ marginBottom: 20 }}>
          ← {t('admin.back')}
        </button>
        <LoginGate onLogin={setAdminKey} />
      </div>
    );
  }

  return (
    <div className="admin-panel" style={{ animation: 'fadeIn 0.3s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>{t('admin.title')}</h1>
        <button className="btn btn-dark btn-sm" onClick={() => setScreen('lobby')}>
          ← {t('admin.back')}
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="admin-stats-grid">
          <StatCard label={t('admin.totalGames')} value={stats.total} />
          <StatCard label={t('admin.activeGames')} value={stats.playing} />
          <StatCard label={t('admin.avgScore')} value={stats.avgScore} />
          <StatCard label={t('admin.aiGames')} value={stats.aiGames} />
        </div>
      )}

      {/* AI Config */}
      <AIConfigPanel adminKey={adminKey} />

      {/* Games Table */}
      <h3 style={{ marginTop: 24 }}>{t('admin.games')}</h3>
      <GamesTable games={games} />
    </div>
  );
}
