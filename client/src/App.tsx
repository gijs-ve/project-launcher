import { useView } from './context/ViewContext';
import { useConfig } from './context/ConfigContext';
import { ShortcutsProvider, useShortcuts, labelToMouseButton } from './context/ShortcutsContext';
import { NavBar } from './components/NavBar';
import { Toast } from './components/Toast';
import { ProjectsView } from './views/ProjectsView';
import { ProjectDetailView } from './views/ProjectDetailView';
import { JiraTicketDetailView } from './views/JiraTicketDetailView';
import { LinksView } from './views/LinksView';
import { SettingsView } from './views/SettingsView';
import { useState, useEffect } from 'react';

function AppShellInner() {
  const { activeView, navigateBack, navigateForward, canGoBack, canGoForward } = useView();
  const { error } = useConfig();
  const { shortcuts } = useShortcuts();
  const [toast, setToast] = useState<string | null>(null);

  // Surface config errors as toasts
  useEffect(() => {
    if (error) setToast(error);
  }, [error]);

  // Global mouse-button navigation (Mouse 4 = back, Mouse 5 = forward by default)
  useEffect(() => {
    const backButton  = labelToMouseButton(shortcuts['nav-back']    ?? '');
    const fwdButton   = labelToMouseButton(shortcuts['nav-forward'] ?? '');

    const handler = (e: MouseEvent) => {
      if (backButton !== null && e.button === backButton && canGoBack) {
        e.preventDefault();
        navigateBack();
      } else if (fwdButton !== null && e.button === fwdButton && canGoForward) {
        e.preventDefault();
        navigateForward();
      }
    };

    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [shortcuts, navigateBack, navigateForward, canGoBack, canGoForward]);

  return (
    <div className="h-full flex flex-col">
      <NavBar />

      {/* Views — conditionally rendered (not hidden) so they properly unmount */}
      {activeView === 'projects'            && <ProjectsView />}
      {activeView === 'project-detail'       && <ProjectDetailView />}
      {activeView === 'jira-ticket-detail'   && <JiraTicketDetailView />}
      {activeView === 'links'                && <LinksView />}
      {activeView === 'settings'             && <SettingsView />}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}

export default function AppShell() {
  return (
    <ShortcutsProvider>
      <AppShellInner />
    </ShortcutsProvider>
  );
}
