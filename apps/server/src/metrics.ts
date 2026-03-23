/**
 * Prometheus metrics for Hanabi
 */
import { Counter, Histogram, Gauge, Registry } from 'prom-client';

export const register = new Registry();

// --- Game metrics ---

export const gamesTotal = new Counter({
  name: 'hanabi_games_total',
  help: 'Total games by status',
  labelNames: ['status'] as const, // started / finished
  registers: [register],
});

export const activeGames = new Gauge({
  name: 'hanabi_active_games',
  help: 'Currently active games',
  registers: [register],
});

// --- LLM API metrics ---

export const llmCallsTotal = new Counter({
  name: 'hanabi_llm_calls_total',
  help: 'Total LLM API calls',
  labelNames: ['model', 'provider', 'status'] as const, // status: success / error / unsafe_rejected
  registers: [register],
});

export const llmCallDurationSeconds = new Histogram({
  name: 'hanabi_llm_call_duration_seconds',
  help: 'LLM API call duration',
  labelNames: ['model', 'provider'] as const,
  buckets: [0.5, 1, 2, 5, 10, 15, 30, 60],
  registers: [register],
});

export const llmFallbacksTotal = new Counter({
  name: 'hanabi_llm_fallbacks_total',
  help: 'Times smart fallback action was used instead of LLM',
  labelNames: ['provider', 'reason'] as const, // reason: error / unsafe
  registers: [register],
});

// --- AI turn metrics ---

export const aiTurnsTotal = new Counter({
  name: 'hanabi_ai_turns_total',
  help: 'Total AI turns executed',
  labelNames: ['action_type'] as const, // play / discard / hint
  registers: [register],
});

// --- Pre-initialize common label combinations ---
for (const status of ['success', 'error', 'unsafe_rejected']) {
  llmCallsTotal.labels({ model: '', provider: '', status });
}
for (const reason of ['error', 'unsafe']) {
  llmFallbacksTotal.labels({ provider: '', reason });
}
for (const status of ['started', 'finished']) {
  gamesTotal.labels({ status });
}
for (const action of ['play', 'discard', 'hint']) {
  aiTurnsTotal.labels({ action_type: action });
}
