import { useState, useEffect } from 'react';
import { useConfig } from '../context/ConfigContext';
import { useProcesses } from '../context/ProcessesContext';
import { useView } from '../context/ViewContext';
import { useShortcuts } from '../context/ShortcutsContext';
import { ProjectCard } from '../components/ProjectCard';
import { LogPanel } from '../components/LogPanel';
import { CategorySection } from '../components/CategorySection';

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

  const activeProjects = config.projects.filter((p) => {
    const s = statuses[p.id] ?? 'stopped';
    return s === 'running' || s === 'starting';
  });

  const categories = config.categories ?? [];
  const hasCategories = categories.length > 0;
  const validCategoryIds = new Set(categories.map((c) => c.id));

  // Projects with no categoryId or a stale/unknown categoryId — always shown flat at the top
  const uncategorized = config.projects.filter(
    (p) => !p.categoryId || !validCategoryIds.has(p.categoryId),
  );

  const renderCard = (project: (typeof config.projects)[0]) => {
    const idx = config.projects.indexOf(project);
    const status = statuses[project.id] ?? 'stopped';
    const isActive = status === 'running' || status === 'starting';
    return (
      <ProjectCard
        key={project.id}
        project={project}
        index={idx}
        status={status}
        compact={isActive}
        isLogOpen={openLogId === project.id}
        onToggleLogs={() =>
          setOpenLogId((prev) => (prev === project.id ? null : project.id))
        }
        onNavigate={() => navigateToProject(project.id)}
      />
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8">
        {config.projects.length === 0 ? (
          <p className="font-mono text-zinc-500 text-sm">
            No projects yet. Add one in Settings.
          </p>
        ) : (
          <>
            {/* ── Uncategorized projects — always flat at the top, never collapsible ── */}
            {(!hasCategories || uncategorized.length > 0) && (
              <div className="flex flex-wrap gap-4">
                {(hasCategories ? uncategorized : config.projects).map(renderCard)}
              </div>
            )}

            {/* ── Category groups — each collapsible ── */}
            {hasCategories &&
              categories.map((category) => {
                const projects = config.projects.filter((p) => p.categoryId === category.id);
                if (projects.length === 0) return null;
                return (
                  <CategorySection
                    key={category.id}
                    name={category.name}
                    color={category.color ?? '#6366f1'}
                    projectCount={projects.length}
                  >
                    {projects.map(renderCard)}
                  </CategorySection>
                );
              })}

            {/* ── Running projects — full cards with all options ── */}
            {activeProjects.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest">Running</p>
                <div className="flex flex-wrap gap-4">
                  {activeProjects.map((project) => {
                    const idx = config.projects.indexOf(project);
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
