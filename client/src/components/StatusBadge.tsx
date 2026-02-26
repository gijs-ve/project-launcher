import { ProjectStatus } from '../types';

const CONFIG: Record<ProjectStatus, { dot: string; label: string }> = {
  stopped:  { dot: 'bg-zinc-500',  label: 'Stopped' },
  starting: { dot: 'bg-yellow-400 animate-pulse', label: 'Starting' },
  running:  { dot: 'bg-emerald-400', label: 'Running' },
  errored:  { dot: 'bg-red-500',   label: 'Errored' },
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const { dot, label } = CONFIG[status];
  return (
    <span className="flex items-center gap-1.5 text-xs font-mono text-zinc-400">
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
