import { useEffect, useRef, useCallback } from 'react';
import { ClientMessage, ServerMessage, ProjectStatus } from '../types';

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

const RECONNECT_DELAY_MS = 1500;

export function useWebSocket({
  onStatusUpdate,
  onOutput,
  onBufferReplay,
  onInitialState,
}: UseWebSocketOptions) {
  const wsRef        = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destroyedRef = useRef(false);

  // Keep callbacks in refs so reconnect closures always call the latest version
  const handlersRef = useRef({ onStatusUpdate, onOutput, onBufferReplay, onInitialState });
  useEffect(() => {
    handlersRef.current = { onStatusUpdate, onOutput, onBufferReplay, onInitialState };
  }, [onStatusUpdate, onOutput, onBufferReplay, onInitialState]);

  // Stable send — works even while reconnecting (messages are dropped, which is
  // fine for stdin; status/subscribe messages will be re-sent after reconnect)
  const send = useCallback((msg: ClientMessage) => {
    const serialised = JSON.stringify(msg);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(serialised);
    }
  }, []);

  useEffect(() => {
    destroyedRef.current = false;

    function connect() {
      if (destroyedRef.current) return;

      const ws = new WebSocket(`ws://${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] connected');
        if (reconnectRef.current) {
          clearTimeout(reconnectRef.current);
          reconnectRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as ServerMessage;
          const { onStatusUpdate, onOutput, onBufferReplay, onInitialState } = handlersRef.current;
          switch (msg.type) {
            case 'initial-state':   onInitialState(msg.statuses); break;
            case 'status-update':   onStatusUpdate(msg.projectId, msg.status); break;
            case 'output':          onOutput(msg.projectId, msg.data); break;
            case 'buffer-replay':   onBufferReplay(msg.projectId, msg.lines); break;
          }
        } catch {
          // Ignore unparseable messages
        }
      };

      ws.onerror = () => { /* onclose fires immediately after, handles it */ };

      ws.onclose = () => {
        wsRef.current = null;
        if (!destroyedRef.current) {
          console.log(`[WS] disconnected — reconnecting in ${RECONNECT_DELAY_MS}ms`);
          reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };
    }

    connect();

    return () => {
      destroyedRef.current = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, []);

  return { send };
}
