import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { ProjectStatus } from '../types';
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
  startProject: (id: string) => Promise<void>;
  stopProject: (id: string) => Promise<void>;
  restartProject: (id: string) => Promise<void>;
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

  const { send } = useWebSocket({
    onStatusUpdate: handleStatusUpdate,
    onOutput: handleOutput,
    onBufferReplay: handleBufferReplay,
    onInitialState: handleInitialState,
  });

  const subscribeOutput = useCallback(
    (projectId: string) => send({ type: 'subscribe-output', projectId }),
    [send],
  );

  const unsubscribeOutput = useCallback(
    (projectId: string) => send({ type: 'unsubscribe-output', projectId }),
    [send],
  );

  const sendInput = useCallback(
    (projectId: string, data: string) => send({ type: 'stdin', projectId, data }),
    [send],
  );

  const startProject = useCallback(async (id: string) => {
    await fetch(`/api/projects/${id}/start`, { method: 'POST' });
  }, []);

  const stopProject = useCallback(async (id: string) => {
    await fetch(`/api/projects/${id}/stop`, { method: 'POST' });
  }, []);

  const restartProject = useCallback(async (id: string) => {
    await fetch(`/api/projects/${id}/restart`, { method: 'POST' });
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
