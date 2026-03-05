import { useState, useEffect } from 'react';
import { useView } from '../context/ViewContext';
import { useConfig } from '../context/ConfigContext';
import { useProcesses } from '../context/ProcessesContext';
import { StatusBadge } from '../components/StatusBadge';
import { LogPanel } from '../components/LogPanel';
import { SplitStartButton } from '../components/SplitStartButton';
import { Project } from '../types';

export function ProjectDetailView() {
  const { selectedProjectId, navigateBack } = useView();
  const { config } = useConfig();
  const { statuses, startProject, stopProject, restartProject, openInEditor } = useProcesses();
  const [logsOpen, setLogsOpen] = useState(false);

  // Escape key navigates back to the project list
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigateBack();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigateBack]);

  const project = config.projects.find((p) => p.id === selectedProjectId);

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="font-mono text-zinc-500 text-sm">Project not found.</p>
      </div>
    );
  }

  const status = statuses[project.id] ?? 'stopped';
  const canStart   = status === 'stopped' || status === 'errored';
  const canStop    = status === 'running'  || status === 'starting';
  const canRestart = status === 'running'  || status === 'errored';

  // Split the cwd into segments for a breadcrumb-style display
  const cwdSegments = project.cwd.split('/').filter(Boolean);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Hero / header bar ─────────────────────────────── */}
        <div
          className="border-b border-zinc-800"
          style={{ borderTopColor: project.color, borderTopWidth: 3 }}
        >
          <div className="px-6 pt-5 pb-4">
            {/* Back link */}
            <button
              onClick={navigateBack}
              className="flex items-center gap-1.5 text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors mb-4"
            >
              ← All projects
            </button>

            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                {/* Color dot */}
                <span
                  className="w-3 h-3 rounded-full shrink-0 mt-0.5"
                  style={{ backgroundColor: project.color }}
                />
                <div>
                  <h1 className="font-mono font-semibold text-zinc-100 text-xl leading-tight">
                    {project.name}
                  </h1>
                  <p className="font-mono text-xs text-zinc-500 mt-0.5">
                    {project.id}
                  </p>
                </div>
              </div>
              <div className="shrink-0 mt-1">
                <StatusBadge status={status} />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              {canStart && (
                <SplitStartButton
                  onStart={() => startProject(project.id)}
                  onStartWith={(opts) => startProject(project.id, opts)}
                />
              )}
              {canStop && (
                <button className="btn-danger" onClick={() => stopProject(project.id)}>
                  ■ Stop
                </button>
              )}
              {canRestart && (
                <button className="btn-secondary" onClick={() => restartProject(project.id)}>
                  ↺ Restart
                </button>
              )}
              {project.url && (
                <a
                  href={project.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary"
                >
                  ↗ Open URL
                </a>
              )}
              <button
                className={['btn-secondary ml-auto', logsOpen ? 'text-zinc-100' : ''].join(' ')}
                onClick={() => setLogsOpen((o) => !o)}
              >
                Logs {logsOpen ? '▲' : '▼'}
              </button>
              <button
                className="btn-secondary"
                onClick={() => openInEditor(project.id)}
                title="Open in editor"
              >
                Code
              </button>
            </div>
          </div>
        </div>

        {/* ── Detail grid ───────────────────────────────────── */}
        <div className="px-6 py-6 grid grid-cols-1 gap-6 md:grid-cols-2">

          {/* Working directory */}
          <Section title="Working directory">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <p className="font-mono text-xs text-zinc-500 mb-1.5">Full path</p>
              <code className="font-mono text-xs text-zinc-200 break-all">{project.cwd}</code>
              <div className="flex items-center gap-1 mt-2 flex-wrap">
                {cwdSegments.map((seg, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-zinc-600 text-xs">/</span>}
                    <span
                      className={[
                        'font-mono text-xs px-1.5 py-0.5 rounded',
                        i === cwdSegments.length - 1
                          ? 'bg-zinc-700 text-zinc-100'
                          : 'text-zinc-500',
                      ].join(' ')}
                    >
                      {seg}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </Section>

          {/* Start command */}
          <Section title="Start command">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <code className="font-mono text-sm text-emerald-400 break-all">{project.command}</code>
            </div>
          </Section>

          {/* Dev URL */}
          {project.url && (
            <Section title="Dev URL">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex items-center justify-between gap-3">
                <code className="font-mono text-xs text-zinc-300 break-all flex-1">{project.url}</code>
                <a
                  href={project.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary text-xs shrink-0"
                >
                  ↗ Open
                </a>
              </div>
            </Section>
          )}

          {/* Colour */}
          <Section title="Colour">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex items-center gap-3">
              <span
                className="w-8 h-8 rounded-md border border-zinc-700 shrink-0"
                style={{ backgroundColor: project.color }}
              />
              <code className="font-mono text-xs text-zinc-400">{project.color}</code>
            </div>
          </Section>

        </div>

        {/* ── Jira ──────────────────────────────────────────── */}
        {project.jiraBaseUrl && project.jiraProjectKeys?.length && (
          <div className="px-6 pb-6">
            <JiraPanel project={project} />
          </div>
        )}

        {/* ── Links ─────────────────────────────────────────── */}
        {project.links && project.links.length > 0 && (
          <div className="px-6 pb-6">
            <h2 className="font-mono text-xs font-medium text-zinc-400 uppercase tracking-widest mb-3">
              Links
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {project.links.map((lnk, i) => (
                <a
                  key={i}
                  href={lnk.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-lg p-4 flex flex-col gap-2 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-medium text-sm text-zinc-100 group-hover:text-white transition-colors">
                      {lnk.label}
                    </span>
                    <span
                      className={[
                        'font-mono text-[10px] px-1.5 py-0.5 rounded border',
                        lnk.openMode === 'browser'
                          ? 'text-sky-400 border-sky-800 bg-sky-950/50'
                          : 'text-violet-400 border-violet-800 bg-violet-950/50',
                      ].join(' ')}
                    >
                      {lnk.openMode === 'browser' ? 'Browser' : 'Webview'}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-zinc-500 truncate group-hover:text-zinc-400 transition-colors">
                    {lnk.url}
                  </p>
                  <div className="flex items-center gap-1 text-zinc-600 group-hover:text-zinc-400 transition-colors mt-auto">
                    <span className="text-xs font-mono">↗ Open</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ── Log panel — docked to bottom ──────────────────── */}
      {logsOpen && (
        <LogPanel
          projectId={project.id}
          projectName={project.name}
          onClose={() => setLogsOpen(false)}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-mono text-xs font-medium text-zinc-400 uppercase tracking-widest">
        {title}
      </h2>
      {children}
    </div>
  );
}

// ── Types returned by /api/jira/issues ─────────────────────────────────────

interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: { name: string; statusCategory: { key: string } };
    assignee: { displayName: string } | null;
    priority: { name: string } | null;
    issuetype: { name: string } | null;
  };
}

// ── JiraPanel ──────────────────────────────────────────────────────────────

function JiraPanel({ project }: { project: Project }) {
  const [issues, setIssues]   = useState<JiraIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/jira/issues?projectId=${encodeURIComponent(project.id)}`)
      .then(async (r) => {
        const text = await r.text();
        let data: { issues?: JiraIssue[]; error?: string };
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`Server returned non-JSON response (status ${r.status})`);
        }
        if (!r.ok || data.error) throw new Error(data.error ?? `HTTP ${r.status}`);
        setIssues(data.issues ?? []);
      })
      .catch((err: unknown) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [project.id]);

  const boardUrl = project.jiraProjectKeys?.length === 1
    ? `${project.jiraBaseUrl}/jira/software/projects/${project.jiraProjectKeys[0]}/boards`
    : `${project.jiraBaseUrl}/jira/software/projects`;

  function statusColor(key: string) {
    if (key === 'done')       return 'text-emerald-400 border-emerald-800 bg-emerald-950/50';
    if (key === 'indeterminate') return 'text-sky-400 border-sky-800 bg-sky-950/50'; // in progress
    return 'text-zinc-400 border-zinc-700 bg-zinc-800/50'; // to do / default
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-xs font-medium text-zinc-400 uppercase tracking-widest">
          Jira — {project.jiraProjectKeys?.join(', ')} active sprint
        </h2>
        <a
          href={boardUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-xs"
        >
          ↗ Open board
        </a>
      </div>

      {loading && (
        <p className="font-mono text-xs text-zinc-500">Loading issues…</p>
      )}

      {!loading && error && (
        <div className="bg-zinc-900 border border-red-900 rounded-lg p-3">
          <p className="font-mono text-xs text-red-400">{error}</p>
        </div>
      )}

      {!loading && !error && issues.length === 0 && (
        <p className="font-mono text-xs text-zinc-500">No active sprint issues found.</p>
      )}

      {!loading && !error && issues.length > 0 && (
        <div className="flex flex-col gap-1 border border-zinc-800 rounded-lg overflow-hidden">
          {issues.map((issue) => {
            const catKey = issue.fields.status.statusCategory?.key ?? '';
            return (
              <a
                key={issue.id}
                href={`${project.jiraBaseUrl}/browse/${issue.key}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 px-3 py-2.5 bg-zinc-900 hover:bg-zinc-800 border-b border-zinc-800 last:border-b-0 transition-colors"
              >
                <span className="font-mono text-xs text-zinc-500 shrink-0 w-20 group-hover:text-zinc-400 transition-colors">
                  {issue.key}
                </span>
                <span className="font-mono text-xs text-zinc-200 flex-1 truncate group-hover:text-white transition-colors">
                  {issue.fields.summary}
                </span>
                <span
                  className={[
                    'font-mono text-[10px] px-1.5 py-0.5 rounded border shrink-0',
                    statusColor(catKey),
                  ].join(' ')}
                >
                  {issue.fields.status.name}
                </span>
                {issue.fields.assignee && (
                  <span className="font-mono text-[10px] text-zinc-500 shrink-0 hidden sm:block">
                    {issue.fields.assignee.displayName.split(' ')[0]}
                  </span>
                )}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
