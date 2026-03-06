import { createContext, useContext, useState, ReactNode } from 'react';

export type View = 'projects' | 'links' | 'settings' | 'project-detail' | 'jira-ticket-detail';
export type SettingsTab = 'projects' | 'links' | 'shortcuts' | 'general';

interface ViewContextValue {
  activeView: View;
  setActiveView: (view: View) => void;
  selectedProjectId: string | null;
  navigateToProject: (id: string) => void;
  navigateBack: () => void;
  navigateToRoot: () => void;
  settingsTab: SettingsTab | null;
  setSettingsTab: (tab: SettingsTab | null) => void;
  selectedJiraIssueKey: string | null;
  navigateToJiraIssue: (issueKey: string) => void;
}

const ViewContext = createContext<ViewContextValue | null>(null);

export function ViewProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveView] = useState<View>('projects');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedJiraIssueKey, setSelectedJiraIssueKey] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);

  const handleSetActiveView = (view: View) => {
    // Reset settings sub-nav when navigating away from settings
    if (view !== 'settings') setSettingsTab(null);
    setActiveView(view);
  };

  const navigateToProject = (id: string) => {
    setSelectedProjectId(id);
    setActiveView('project-detail');
  };

  const navigateToJiraIssue = (issueKey: string) => {
    setSelectedJiraIssueKey(issueKey);
    setActiveView('jira-ticket-detail');
  };

  const navigateToRoot = () => {
    setSelectedJiraIssueKey(null);
    setSelectedProjectId(null);
    setActiveView('projects');
  };

  const navigateBack = () => {
    if (activeView === 'jira-ticket-detail') {
      // Go back to project detail, keeping the selected project
      setSelectedJiraIssueKey(null);
      setActiveView('project-detail');
    } else {
      setSelectedProjectId(null);
      setActiveView('projects');
    }
  };

  return (
    <ViewContext.Provider value={{
      activeView,
      setActiveView: handleSetActiveView,
      selectedProjectId,
      navigateToProject,
      navigateBack,
      navigateToRoot,
      settingsTab,
      setSettingsTab,
      selectedJiraIssueKey,
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
