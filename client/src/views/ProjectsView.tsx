import { useState } from 'react';
import { useConfig } from '../context/ConfigContext';
import { useProcesses } from '../context/ProcessesContext';
import { useView } from '../context/ViewContext';
import { ProjectCard } from '../components/ProjectCard';
import { LogPanel } from '../components/LogPanel';

export function ProjectsView() {
  const { config, loading } = useConfig();
  const { statuses } = useProcesses();
  const { navigateToProject } = useView();
  const [openLogId, setOpenLogId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="font-mono text-zinc-500 text-sm">Loading…</p>
      </div>
    );
  }

  const openLogProject = config.projects.find((p) => p.id === openLogId);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Project grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {config.projects.length === 0 ? (
          <p className="font-mono text-zinc-500 text-sm">
            No projects yet. Add one in Settings.
          </p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {config.projects.map((project) => {
              const status = statuses[project.id] ?? 'stopped';
              return (
                <ProjectCard
                  key={project.id}
                  project={project}
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
