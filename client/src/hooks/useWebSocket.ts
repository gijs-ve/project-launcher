import { useEffect, useRef, useCallback } from 'react';
import { ClientMessage, ServerMessage, ProjectStatus } from '../types';

/**
 * Manages the single shared WebSocket connection to the server.
 * Exposes handlers for subscribing to a project's output and for
 * receiving status updates.
 *
 * Returns a stable `send` function that can be called from anywhere.
 */

type StatusHandler = (projectId: string, status: ProjectStatus) => void;
type OutputHandler = (projectId: string, data: string) => void;
type ReplayHandler = (projectId: string, lines: string[]) => void;
type InitialStateHandler = (statuses: Record<string, ProjectStatus>) => void;

interface UseWebSocketOptions {
  onStatusUpdate: StatusHandler;
  onOutput: OutputHandler;
  onBufferReplay: ReplayHandler;
  onInitialState: InitialStateHandler;
}

export function useWebSocket({
  onStatusUpdate,
  onOutput,
  onBufferReplay,
  onInitialState,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  // Queue messages sent before the socket is open
  const queueRef = useRef<string[]>([]);

  // Keep callbacks in refs so the effect doesn't need to re-run when they change
  const handlersRef = useRef({ onStatusUpdate, onOutput, onBufferReplay, onInitialState });
  useEffect(() => {
    handlersRef.current = { onStatusUpdate, onOutput, onBufferReplay, onInitialState };
  }, [onStatusUpdate, onOutput, onBufferReplay, onInitialState]);

  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      // Flush queued messages
      for (const msg of queueRef.current) {
        ws.send(msg);
      }
      queueRef.current = [];
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        const { onStatusUpdate, onOutput, onBufferReplay, onInitialState } = handlersRef.current;

        switch (msg.type) {
          case 'initial-state':
            onInitialState(msg.statuses);
            break;
          case 'status-update':
            onStatusUpdate(msg.projectId, msg.status);
            break;
          case 'output':
            onOutput(msg.projectId, msg.data);
            break;
          case 'buffer-replay':
            onBufferReplay(msg.projectId, msg.lines);
            break;
        }
      } catch {
        // Ignore unparseable messages
      }
    };

    ws.onerror = (err) => console.error('[WS] error', err);

    ws.onclose = () => {
      console.log('[WS] connection closed');
    };

    return () => {
      ws.close();
    };
  }, []); // Only run once on mount — connection is permanent for the session

  const send = useCallback((msg: ClientMessage) => {
    const serialised = JSON.stringify(msg);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(serialised);
    } else {
      // Buffer until open
      queueRef.current.push(serialised);
    }
  }, []);

  return { send };
}
