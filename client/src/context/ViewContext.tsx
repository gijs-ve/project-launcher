import { createContext, useContext, useState, ReactNode } from 'react';

export type View = 'projects' | 'hours' | 'settings' | 'project-detail' | 'jira-ticket-detail';
export type SettingsTab = 'projects' | 'links' | 'shortcuts' | 'general' | 'tempo';

interface NavState {
  activeView: View;
  selectedProjectId: string | null;
  selectedJiraIssueKey: string | null;
  settingsTab: SettingsTab | null;
}

interface NavStore {
  current: NavState;
  history: NavState[];
  future: NavState[];
}

interface ViewContextValue {
  activeView: View;
  setActiveView: (view: View) => void;
  selectedProjectId: string | null;
  navigateToProject: (id: string) => void;
  navigateBack: () => void;
  navigateForward: () => void;
  navigateToRoot: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  settingsTab: SettingsTab | null;
  setSettingsTab: (tab: SettingsTab | null) => void;
  selectedJiraIssueKey: string | null;
  navigateToJiraIssue: (issueKey: string, projectId?: string) => void;
}

const INITIAL: NavState = {
  activeView: 'projects',
  selectedProjectId: null,
  selectedJiraIssueKey: null,
  settingsTab: null,
};

const ViewContext = createContext<ViewContextValue | null>(null);

export function ViewProvider({ children }: { children: ReactNode }) {
  const [nav, setNav] = useState<NavStore>({ current: INITIAL, history: [], future: [] });

  // Pushes a new state onto the stack, clearing forward history
  const push = (next: NavState) =>
    setNav(({ current, history }) => ({ current: next, history: [...history, current], future: [] }));

  const setActiveView = (view: View) => {
    push({
      activeView: view,
      selectedProjectId: nav.current.selectedProjectId,
      selectedJiraIssueKey: nav.current.selectedJiraIssueKey,
      // Reset settings sub-tab when navigating away from settings
      settingsTab: view === 'settings' ? nav.current.settingsTab : null,
    });
  };

  const navigateToProject = (id: string) => {
    push({ activeView: 'project-detail', selectedProjectId: id, selectedJiraIssueKey: null, settingsTab: null });
  };

  const navigateToJiraIssue = (issueKey: string, projectId?: string) => {
    push({ ...nav.current, activeView: 'jira-ticket-detail', selectedJiraIssueKey: issueKey, selectedProjectId: projectId ?? nav.current.selectedProjectId });
  };

  const navigateToRoot = () => {
    push({ activeView: 'projects', selectedProjectId: null, selectedJiraIssueKey: null, settingsTab: null });
  };

  const navigateBack = () => {
    setNav(({ current, history, future }) => {
      if (!history.length) return { current, history, future };
      return {
        current: history[history.length - 1],
        history: history.slice(0, -1),
        future: [current, ...future],
      };
    });
  };

  const navigateForward = () => {
    setNav(({ current, history, future }) => {
      if (!future.length) return { current, history, future };
      return {
        current: future[0],
        history: [...history, current],
        future: future.slice(1),
      };
    });
  };

  // Settings tab changes don't push to history — too granular
  const setSettingsTab = (tab: SettingsTab | null) =>
    setNav((s) => ({ ...s, current: { ...s.current, settingsTab: tab } }));

  return (
    <ViewContext.Provider value={{
      activeView: nav.current.activeView,
      setActiveView,
      selectedProjectId: nav.current.selectedProjectId,
      navigateToProject,
      navigateBack,
      navigateForward,
      navigateToRoot,
      canGoBack: nav.history.length > 0,
      canGoForward: nav.future.length > 0,
      settingsTab: nav.current.settingsTab,
      setSettingsTab,
      selectedJiraIssueKey: nav.current.selectedJiraIssueKey,
      navigateToJiraIssue,
    }}>
      {children}
    </ViewContext.Provider>
  );
}

export function useView() {
  const ctx = useContext(ViewContext);
  if (!ctx) throw new Error('useView must be used inside ViewProvider');
  return ctx;
}
