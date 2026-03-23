import { useEffect, useRef, useCallback } from 'react';
import type { ClientMessage, ServerMessage } from '@hanabi/shared';
import type { GameAction } from '@hanabi/engine';
import { useGameStore } from '../stores/game-store.js';

const MAX_RECONNECT_DELAY = 10000;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);
  const { gameId, apiKey, playerName, setView, setError } = useGameStore();

  const connect = useCallback(() => {
    if (!gameId || !apiKey) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectDelay.current = 1000; // reset on successful connection
      const msg: ClientMessage = {
        type: 'JOIN_GAME',
        gameId,
        playerName,
        apiKey,
      };
      ws.send(JSON.stringify(msg));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data) as ServerMessage;
      switch (msg.type) {
        case 'GAME_STATE': {
          // Only apply if this state is same or newer than current
          const currentView = useGameStore.getState().view;
          if (!currentView || msg.view.turn >= currentView.turn) {
            setView(msg.view);
          }
          break;
        }
        case 'ACTION_RESULT':
          if (msg.success) setView(msg.view);
          break;
        case 'GAME_ENDED':
          setView(msg.view);
          break;
        case 'ERROR':
          setError(msg.message);
          break;
      }
    };

    ws.onclose = (event) => {
      wsRef.current = null;
      // Don't reconnect on intentional close (code 1000) or server shutdown (1001)
      if (event.code === 1000 || event.code === 1001) return;
      // Auto-reconnect with exponential backoff
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, MAX_RECONNECT_DELAY);
        connect();
      }, reconnectDelay.current);
    };

    ws.onerror = () => {
      // onclose will fire after onerror, triggering reconnect
    };
  }, [gameId, apiKey, playerName, setView, setError]);

  useEffect(() => {
    connect();

    // Ping interval
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'PING' }));
      }
    }, 30000);

    return () => {
      clearInterval(pingInterval);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close(1000);
      wsRef.current = null;
    };
  }, [connect]);

  const sendAction = useCallback((action: GameAction) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !gameId) {
      setError('Connection lost. Reconnecting...');
      return;
    }
    const msg: ClientMessage = {
      type: 'GAME_ACTION',
      gameId,
      action,
    };
    ws.send(JSON.stringify(msg));
  }, [gameId, setError]);

  return { sendAction };
}
