import { createContext, useContext, useState, ReactNode } from 'react';

export type View = 'projects' | 'links' | 'settings' | 'project-detail';
export type SettingsTab = 'projects' | 'links' | 'shortcuts' | 'general';

interface ViewContextValue {
  activeView: View;
  setActiveView: (view: View) => void;
  selectedProjectId: string | null;
  navigateToProject: (id: string) => void;
  navigateBack: () => void;
  settingsTab: SettingsTab | null;
  setSettingsTab: (tab: SettingsTab | null) => void;
}

const ViewContext = createContext<ViewContextValue | null>(null);

export function ViewProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveView] = useState<View>('projects');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
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

  const navigateBack = () => {
    setSelectedProjectId(null);
    setActiveView('projects');
  };

  return (
    <ViewContext.Provider value={{
      activeView,
      setActiveView: handleSetActiveView,
      selectedProjectId,
      navigateToProject,
      navigateBack,
      settingsTab,
      setSettingsTab,
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
