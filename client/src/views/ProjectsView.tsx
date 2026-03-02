import { useState, useEffect } from 'react';
import { useConfig } from '../context/ConfigContext';
import { useProcesses } from '../context/ProcessesContext';
import { useView } from '../context/ViewContext';
import { useShortcuts } from '../context/ShortcutsContext';
import { ProjectCard } from '../components/ProjectCard';
import { LogPanel } from '../components/LogPanel';

export function ProjectsView() {
  const { config, loading } = useConfig();
  const { statuses } = useProcesses();
  const { navigateToProject } = useView();
  const { keyToAction } = useShortcuts();
  const [openLogId, setOpenLogId] = useState<string | null>(null);

  // Keyboard shortcuts — fire when not inside an input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const action = keyToAction[e.key];
      if (!action?.startsWith('navigate-')) return;
      const idx = parseInt(action.slice('navigate-'.length), 10);
      const project = config.projects[idx];
      if (project) navigateToProject(project.id);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [keyToAction, config.projects, navigateToProject]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="font-mono text-zinc-500 text-sm">Loading…</p>
      </div>
    );
  }

  const openLogProject = config.projects.find((p) => p.id === openLogId);

  // Split projects into active (running/starting) and inactive (stopped/errored)
  const activeProjects   = config.projects.filter((p) => {
    const s = statuses[p.id] ?? 'stopped';
    return s === 'running' || s === 'starting';
  });
  const inactiveProjects = config.projects.filter((p) => {
    const s = statuses[p.id] ?? 'stopped';
    return s !== 'running' && s !== 'starting';
  });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Project grid */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8">
        {config.projects.length === 0 ? (
          <p className="font-mono text-zinc-500 text-sm">
            No projects yet. Add one in Settings.
          </p>
        ) : (
          <>
            {/* ── All projects — inactive ones full, active ones compact ── */}
            <div className="flex flex-wrap gap-4">
              {/* Inactive projects (full card) */}
              {inactiveProjects.map((project) => {
                const idx    = config.projects.indexOf(project);
                const status = statuses[project.id] ?? 'stopped';
                return (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    index={idx}
                    status={status}
                    isLogOpen={openLogId === project.id}
                    onToggleLogs={() =>
                      setOpenLogId((prev) => (prev === project.id ? null : project.id))
                    }
                    onNavigate={() => navigateToProject(project.id)}
                  />
                );
              })}
              {/* Active projects (compact card — only Stop is clickable) */}
              {activeProjects.map((project) => {
                const idx    = config.projects.indexOf(project);
                const status = statuses[project.id] ?? 'stopped';
                return (
                  <ProjectCard
                    key={`compact-${project.id}`}
                    project={project}
                    index={idx}
                    status={status}
                    compact
                    isLogOpen={false}
                    onToggleLogs={() => {}}
                    onNavigate={() => navigateToProject(project.id)}
                  />
                );
              })}
            </div>

            {/* ── Running projects — full cards with all options ── */}
            {activeProjects.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest">Running</p>
                <div className="flex flex-wrap gap-4">
                  {activeProjects.map((project) => {
                    const idx    = config.projects.indexOf(project);
                    const status = statuses[project.id] ?? 'stopped';
                    return (
                      <ProjectCard
                        key={`full-${project.id}`}
                        project={project}
                        index={idx}
                        status={status}
                        isLogOpen={openLogId === project.id}
                        onToggleLogs={() =>
                          setOpenLogId((prev) => (prev === project.id ? null : project.id))
                        }
                        onNavigate={() => navigateToProject(project.id)}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Log panel — docked to the bottom, only rendered when a project is selected */}
      {openLogId && openLogProject && (
        <LogPanel
          projectId={openLogId}
          projectName={openLogProject.name}
          onClose={() => setOpenLogId(null)}
        />
      )}
    </div>
  );
}
