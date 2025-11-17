/**
 * WebSocket Custom Hook
 * React hook for managing WebSocket connections
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'message' | 'broadcast' | 'error';
  worktreeId?: string;
  data?: any;
  error?: string;
}

export interface UseWebSocketOptions {
  /**
   * Worktree IDs to subscribe to
   */
  worktreeIds?: string[];

  /**
   * Callback when a message is received
   */
  onMessage?: (message: WebSocketMessage) => void;

  /**
   * Callback when connection status changes
   */
  onStatusChange?: (status: WebSocketStatus) => void;

  /**
   * Auto-reconnect on disconnect
   */
  autoReconnect?: boolean;

  /**
   * Reconnect delay in milliseconds
   */
  reconnectDelay?: number;
}

/**
 * Custom hook for WebSocket connection
 *
 * @example
 * ```tsx
 * const { status, subscribe, unsubscribe, sendMessage } = useWebSocket({
 *   worktreeIds: ['main', 'feature-branch'],
 *   onMessage: (msg) => console.log('Received:', msg),
 * });
 * ```
 */
export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    worktreeIds = [],
    onMessage,
    onStatusChange,
    autoReconnect = true,
    reconnectDelay = 3000,
  } = options;

  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const subscribedIdsRef = useRef<Set<string>>(new Set());

  /**
   * Update status and trigger callback
   */
  const updateStatus = useCallback((newStatus: WebSocketStatus) => {
    setStatus(newStatus);
    onStatusChange?.(newStatus);
  }, [onStatusChange]);

  /**
   * Connect to WebSocket server
   */
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    updateStatus('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
      updateStatus('connected');

      // Re-subscribe to previously subscribed worktrees
      subscribedIdsRef.current.forEach((id) => {
        ws.send(JSON.stringify({ type: 'subscribe', worktreeId: id }));
      });
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        onMessage?.(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onerror = () => {
      updateStatus('error');
    };

    ws.onclose = () => {
      updateStatus('disconnected');
      wsRef.current = null;

      // Auto-reconnect
      if (autoReconnect) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, reconnectDelay);
      }
    };

    wsRef.current = ws;
  }, [updateStatus, onMessage, autoReconnect, reconnectDelay]);

  /**
   * Disconnect from WebSocket server
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    updateStatus('disconnected');
  }, [updateStatus]);

  /**
   * Subscribe to a worktree
   */
  const subscribe = useCallback((worktreeId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', worktreeId }));
      subscribedIdsRef.current.add(worktreeId);
    }
  }, []);

  /**
   * Unsubscribe from a worktree
   */
  const unsubscribe = useCallback((worktreeId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unsubscribe', worktreeId }));
      subscribedIdsRef.current.delete(worktreeId);
    }
  }, []);

  /**
   * Send a custom message
   */
  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Subscribe to initial worktree IDs
  useEffect(() => {
    if (status === 'connected' && worktreeIds.length > 0) {
      worktreeIds.forEach((id) => {
        subscribe(id);
      });
    }
  }, [status, worktreeIds, subscribe]);

  return {
    status,
    subscribe,
    unsubscribe,
    sendMessage,
    connect,
    disconnect,
  };
}
