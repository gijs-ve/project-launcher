import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { ProjectStatus, ClientMessage, LaunchOptions } from '../types';
import { useWebSocket } from '../hooks/useWebSocket';

interface ProcessesContextValue {
  /** Current status of every known project */
  statuses: Record<string, ProjectStatus>;
  /** In-memory output lines per project */
  logs: Record<string, string[]>;
  /** Subscribe to a project's output over WS */
  subscribeOutput: (projectId: string) => void;
  /** Unsubscribe from output */
  unsubscribeOutput: (projectId: string) => void;
  /** Send raw input (stdin) to a running process */
  sendInput: (projectId: string, data: string) => void;
  startProject: (id: string, opts?: LaunchOptions) => Promise<void>;
  stopProject: (id: string) => Promise<void>;
  restartProject: (id: string) => Promise<void>;
  openInEditor: (id: string) => Promise<void>;
}

const ProcessesContext = createContext<ProcessesContextValue | null>(null);

export function ProcessesProvider({ children }: { children: ReactNode }) {
  const [statuses, setStatuses] = useState<Record<string, ProjectStatus>>({});
  // Use a ref for log lines so individual output messages don't trigger re-renders.
  // A separate flush cycle (below) copies them to state for the UI.
  const logBufferRef = useRef<Record<string, string[]>>({});
  const [logs, setLogs] = useState<Record<string, string[]>>({});

  const handleStatusUpdate = useCallback((projectId: string, status: ProjectStatus) => {
    setStatuses((prev) => ({ ...prev, [projectId]: status }));
  }, []);

  const handleOutput = useCallback((projectId: string, data: string) => {
    if (!logBufferRef.current[projectId]) {
      logBufferRef.current[projectId] = [];
    }
    logBufferRef.current[projectId].push(data);

    // Flush to state on the next animation frame so we batch many rapid lines
    requestAnimationFrame(() => {
      setLogs((prev) => ({
        ...prev,
        [projectId]: [...(logBufferRef.current[projectId] ?? [])],
      }));
    });
  }, []);

  const handleBufferReplay = useCallback((projectId: string, lines: string[]) => {
    logBufferRef.current[projectId] = lines;
    setLogs((prev) => ({ ...prev, [projectId]: [...lines] }));
  }, []);

  const handleInitialState = useCallback((incoming: Record<string, ProjectStatus>) => {
    setStatuses(incoming);
  }, []);

  // Track active subscriptions so we can re-subscribe after reconnect.
  const activeSubsRef  = useRef<Set<string>>(new Set());
  // A ref to the send function so onReconnect can use it before send is declared.
  const sendRef = useRef<((msg: ClientMessage) => void) | null>(null);

  const handleReconnect = useCallback(() => {
    for (const id of activeSubsRef.current) {
      sendRef.current?.({ type: 'subscribe-output', projectId: id });
    }
  }, []);

  const { send } = useWebSocket({
    onStatusUpdate: handleStatusUpdate,
    onOutput: handleOutput,
    onBufferReplay: handleBufferReplay,
    onInitialState: handleInitialState,
    onReconnect: handleReconnect,
  });

  // Keep the ref in sync so handleReconnect always has the latest send
  sendRef.current = send;

  const subscribeOutput = useCallback(
    (projectId: string) => {
      activeSubsRef.current.add(projectId);
      send({ type: 'subscribe-output', projectId });
    },
    [send],
  );

  const unsubscribeOutput = useCallback(
    (projectId: string) => {
      activeSubsRef.current.delete(projectId);
      send({ type: 'unsubscribe-output', projectId });
    },
    [send],
  );

  const sendInput = useCallback(
    (projectId: string, data: string) => send({ type: 'stdin', projectId, data }),
    [send],
  );

  const startProject = useCallback(async (id: string, opts?: LaunchOptions) => {
    await fetch(`/api/projects/${id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts ?? {}),
    });
  }, []);

  const stopProject = useCallback(async (id: string) => {
    await fetch(`/api/projects/${id}/stop`, { method: 'POST' });
  }, []);

  const restartProject = useCallback(async (id: string) => {
    await fetch(`/api/projects/${id}/restart`, { method: 'POST' });
  }, []);

  const openInEditor = useCallback(async (id: string) => {
    await fetch(`/api/projects/${id}/open-editor`, { method: 'POST' });
  }, []);

  return (
    <ProcessesContext.Provider
      value={{
        statuses,
        logs,
        subscribeOutput,
        unsubscribeOutput,
        sendInput,
        startProject,
        stopProject,
        restartProject,
        openInEditor,
      }}
    >
      {children}
    </ProcessesContext.Provider>
  );
}

export function useProcesses() {
  const ctx = useContext(ProcessesContext);
  if (!ctx) throw new Error('useProcesses must be used inside ProcessesProvider');
  return ctx;
}
