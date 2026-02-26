import { createContext, useContext, useState, ReactNode } from 'react';

export type View = 'projects' | 'links' | 'settings' | 'project-detail';

interface ViewContextValue {
  activeView: View;
  setActiveView: (view: View) => void;
  selectedProjectId: string | null;
  navigateToProject: (id: string) => void;
  navigateBack: () => void;
}

const ViewContext = createContext<ViewContextValue | null>(null);

export function ViewProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveView] = useState<View>('projects');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const navigateToProject = (id: string) => {
    setSelectedProjectId(id);
    setActiveView('project-detail');
  };

  const navigateBack = () => {
    setSelectedProjectId(null);
    setActiveView('projects');
  };

  return (
    <ViewContext.Provider value={{ activeView, setActiveView, selectedProjectId, navigateToProject, navigateBack }}>
      {children}
    </ViewContext.Provider>
  );
}

export function useView() {
  const ctx = useContext(ViewContext);
  if (!ctx) throw new Error('useView must be used inside ViewProvider');
  return ctx;
}
