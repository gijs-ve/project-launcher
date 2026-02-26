import { useView } from './context/ViewContext';
import { useConfig } from './context/ConfigContext';
import { NavBar } from './components/NavBar';
import { Toast } from './components/Toast';
import { ProjectsView } from './views/ProjectsView';
import { ProjectDetailView } from './views/ProjectDetailView';
import { LinksView } from './views/LinksView';
import { SettingsView } from './views/SettingsView';
import { useState, useEffect } from 'react';

function AppShell() {
  const { activeView } = useView();
  const { error } = useConfig();
  const [toast, setToast] = useState<string | null>(null);

  // Surface config errors as toasts
  useEffect(() => {
    if (error) setToast(error);
  }, [error]);

  return (
    <div className="h-full flex flex-col">
      <NavBar />

      {/* Views — conditionally rendered (not hidden) so they properly unmount */}
      {activeView === 'projects'       && <ProjectsView />}
      {activeView === 'project-detail' && <ProjectDetailView />}
      {activeView === 'links'          && <LinksView />}
      {activeView === 'settings'       && <SettingsView />}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}

export default AppShell;
