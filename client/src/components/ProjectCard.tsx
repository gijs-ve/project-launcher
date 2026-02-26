import { useRef, useState, useEffect } from 'react';
import { Project, ProjectStatus } from '../types';
import { StatusBadge } from './StatusBadge';
import { useProcesses } from '../context/ProcessesContext';

interface ProjectCardProps {
  project: Project;
  index: number;
  status: ProjectStatus;
  isLogOpen: boolean;
  onToggleLogs: () => void;
  onNavigate?: () => void;
}

export function ProjectCard({ project, index, status, isLogOpen, onToggleLogs, onNavigate }: ProjectCardProps) {
  const { startProject, stopProject, restartProject } = useProcesses();
  const [linksOpen, setLinksOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const canStart   = status === 'stopped' || status === 'errored';
  const canStop    = status === 'running' || status === 'starting';
  const canRestart = status === 'running' || status === 'errored';

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!linksOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setLinksOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [linksOpen]);

  // Shorten the cwd for display: show the last two path segments
  const shortPath = project.cwd.split('/').slice(-2).join('/');

  const hasLinks = project.links && project.links.length > 0;

  return (
    <div
      className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3 min-w-[220px] cursor-pointer hover:border-zinc-600 transition-colors"
      style={{ borderLeftColor: project.color, borderLeftWidth: 3 }}
      onClick={onNavigate}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* 1-based index badge */}
          <span className="font-mono text-xs text-zinc-600 bg-zinc-800 rounded px-1.5 py-0.5 shrink-0">
            {index + 1}
          </span>
          <div>
            <p className="font-mono font-medium text-zinc-100 text-sm leading-tight">{project.name}</p>
            <p className="font-mono text-xs text-zinc-500 mt-0.5 truncate max-w-[200px]">{shortPath}</p>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Command */}
      <code className="text-xs text-zinc-400 bg-zinc-800 px-2 py-1 rounded truncate">{project.command}</code>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
        {canStart && (
          <button
            onClick={() => startProject(project.id)}
            className="btn-primary"
          >
            Start
          </button>
        )}
        {canStop && (
          <button
            onClick={() => stopProject(project.id)}
            className="btn-danger"
          >
            Stop
          </button>
        )}
        {canRestart && (
          <button
            onClick={() => restartProject(project.id)}
            className="btn-secondary"
          >
            Restart
          </button>
        )}
        {status === 'running' && project.url && (
          <a
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            ↗ Open
          </a>
        )}

        {/* Links dropdown */}
        {hasLinks && (
          <div ref={dropdownRef} className="relative">
            <button
              className="btn-secondary"
              onClick={() => setLinksOpen((o) => !o)}
            >
              Links {linksOpen ? '▲' : '▼'}
            </button>
            {linksOpen && (
              <div className="absolute bottom-full mb-1 left-0 z-50 min-w-[160px] bg-zinc-800 border border-zinc-700 rounded-md shadow-lg overflow-hidden">
                {project.links!.map((lnk, i) => (
                  <a
                    key={i}
                    href={lnk.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 text-xs font-mono text-zinc-200 hover:bg-zinc-700 transition-colors"
                    onClick={() => setLinksOpen(false)}
                  >
                    <span className="text-zinc-500">↗</span>
                    {lnk.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={onToggleLogs}
          className={['btn-secondary ml-auto', isLogOpen ? 'text-zinc-100' : ''].join(' ')}
        >
          Logs {isLogOpen ? '▲' : '▼'}
        </button>
      </div>
    </div>
  );
}
