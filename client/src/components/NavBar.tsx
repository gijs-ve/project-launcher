import { useView, View, SettingsTab } from '../context/ViewContext';
import { useConfig } from '../context/ConfigContext';

const NAV_ITEMS: { view: View; label: string }[] = [
  { view: 'projects', label: 'Projects' },
  { view: 'hours', label: 'Hours' },
  { view: 'settings', label: 'Settings' },
];

const SETTINGS_TAB_LABELS: Record<SettingsTab, string> = {
  projects: 'Projects',
  links: 'Links',
  shortcuts: 'Shortcuts',
  general: 'General',
  tempo: 'Quick Log',
};

export function NavBar() {
  const { activeView, setActiveView, selectedProjectId, navigateBack, navigateToRoot, settingsTab, setSettingsTab, selectedJiraIssueKey } = useView();
  const { config } = useConfig();

  const selectedProject = selectedProjectId
    ? config.projects.find((p) => p.id === selectedProjectId)
    : null;

  const showProjectBreadcrumb    = activeView === 'project-detail' && selectedProject;
  const showJiraBreadcrumb       = activeView === 'jira-ticket-detail' && selectedProject;
  const showSettingsBreadcrumb   = activeView === 'settings' && settingsTab !== null;

  return (
    <header className="titlebar-drag flex items-center justify-between h-[36px] pl-20 pr-4 bg-zinc-900 border-b border-zinc-800 shrink-0">
      {/* Brand + breadcrumb */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveView('projects')}
          className="text-base font-mono font-medium text-zinc-100 tracking-tight hover:text-zinc-300 transition-colors"
        >
          🚀 Proud Lazy
        </button>

        {/* Breadcrumb: project detail */}
        {showProjectBreadcrumb && (
          <>
            <span className="text-zinc-600 font-mono text-sm">/</span>
            <button
              onClick={navigateBack}
              className="font-mono text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Projects
            </button>
            <span className="text-zinc-600 font-mono text-sm">/</span>
            <span
              className="font-mono text-sm font-medium"
              style={{ color: selectedProject.color }}
            >
              {selectedProject.name}
            </span>
          </>
        )}

        {/* Breadcrumb: Jira ticket detail */}
        {showJiraBreadcrumb && (
          <>
            <span className="text-zinc-600 font-mono text-sm">/</span>
            <button
              onClick={navigateToRoot}
              className="font-mono text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Projects
            </button>
            <span className="text-zinc-600 font-mono text-sm">/</span>
            <button
              onClick={navigateBack}
              className="font-mono text-sm transition-colors hover:text-zinc-200"
              style={{ color: selectedProject.color }}
            >
              {selectedProject.name}
            </button>
            <span className="text-zinc-600 font-mono text-sm">/</span>
            <span className="font-mono text-sm text-zinc-100 font-medium">
              {selectedJiraIssueKey}
            </span>
          </>
        )}

        {/* Breadcrumb: settings sub-section */}
        {showSettingsBreadcrumb && (
          <>
            <span className="text-zinc-600 font-mono text-sm">/</span>
            <button
              onClick={() => setSettingsTab(null)}
              className="font-mono text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Settings
            </button>
            <span className="text-zinc-600 font-mono text-sm">/</span>
            <span className="font-mono text-sm text-zinc-100 font-medium">
              {SETTINGS_TAB_LABELS[settingsTab]}
            </span>
          </>
        )}
      </div>

      {/* Navigation tabs */}
      <nav className="flex items-center gap-1">
        {NAV_ITEMS.map(({ view, label }) => {
          const active = activeView === view
            || ((activeView === 'project-detail' || activeView === 'jira-ticket-detail') && view === 'projects');
          return (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={[
                'px-3 py-1 rounded text-sm font-mono transition-colors',
                active
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800',
              ].join(' ')}
            >
              {label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
