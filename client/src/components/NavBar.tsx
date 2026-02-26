import { useView, View } from '../context/ViewContext';
import { useConfig } from '../context/ConfigContext';

const NAV_ITEMS: { view: View; label: string }[] = [
  { view: 'projects', label: 'Projects' },
  { view: 'links', label: 'Links' },
  { view: 'settings', label: 'Settings' },
];

export function NavBar() {
  const { activeView, setActiveView, selectedProjectId, navigateBack } = useView();
  const { config } = useConfig();

  const selectedProject = selectedProjectId
    ? config.projects.find((p) => p.id === selectedProjectId)
    : null;

  return (
    <header className="flex items-center justify-between h-12 px-4 bg-zinc-900 border-b border-zinc-800 shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-2">
        <span className="text-base font-mono font-medium text-zinc-100 tracking-tight">
          🚀 Launch
        </span>
        {/* Breadcrumb when inside project detail */}
        {activeView === 'project-detail' && selectedProject && (
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
              className="font-mono text-sm text-zinc-100 font-medium"
              style={{ color: selectedProject.color }}
            >
              {selectedProject.name}
            </span>
          </>
        )}
      </div>

      {/* Navigation — hide detail pseudo-view from tabs */}
      <nav className="flex items-center gap-1">
        {NAV_ITEMS.map(({ view, label }) => {
          const active = activeView === view || (activeView === 'project-detail' && view === 'projects');
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
