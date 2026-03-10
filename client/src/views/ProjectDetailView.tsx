import { useState, useEffect, useMemo } from 'react';
import { useView } from '../context/ViewContext';
import { useConfig } from '../context/ConfigContext';
import { useProcesses } from '../context/ProcessesContext';
import { StatusBadge } from '../components/StatusBadge';
import { LogPanel } from '../components/LogPanel';
import { SplitStartButton } from '../components/SplitStartButton';
import { Modal, ModalSection } from '../components/Modal';
import { Project, JiraIssue, JiraUser } from '../types';

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

        {/* ── Jira ──────────────────────────────────────────── */}
        {config.jira?.baseUrl && project.jiraProjectKeys?.length && (
          <div className="px-6 pb-6">
            <JiraPanel project={project} />
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

// ── JiraPanel helpers ──────────────────────────────────────────────────────

type SortField = 'tag' | 'number' | 'assignee' | 'status' | 'priority';
type SortDir   = 'asc' | 'desc';

const PRIORITY_ORDER: Record<string, number> = {
  // Standard Atlassian names
  Highest: 0, High: 1, Medium: 2, Low: 3, Lowest: 4,
  // Alternative common scheme
  Blocker: 0, Critical: 1, Major: 2, Minor: 3, Trivial: 4,
};

const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: 'tag',      label: 'Tag'      },
  { field: 'number',   label: 'No.'      },
  { field: 'assignee', label: 'Assignee' },
  { field: 'status',   label: 'Status'   },
  { field: 'priority', label: 'Priority' },
];

function statusColor(key: string) {
  if (key === 'done')          return 'text-emerald-400 border-emerald-800 bg-emerald-950/50';
  if (key === 'indeterminate') return 'text-sky-400 border-sky-800 bg-sky-950/50';
  return 'text-zinc-400 border-zinc-700 bg-zinc-800/50';
}

function priorityBadgeStyle(name: string | undefined | null) {
  switch (name) {
    case 'Highest': case 'Blocker':   return 'text-red-400    border-red-800    bg-red-950/50';
    case 'High':    case 'Critical':  return 'text-orange-400 border-orange-800 bg-orange-950/50';
    case 'Medium':  case 'Major':     return 'text-yellow-400 border-yellow-800 bg-yellow-950/50';
    case 'Low':     case 'Minor':     return 'text-sky-400    border-sky-800    bg-sky-950/50';
    case 'Lowest':  case 'Trivial':   return 'text-zinc-400   border-zinc-700   bg-zinc-800/50';
    default:                          return 'text-zinc-400   border-zinc-700   bg-zinc-800/50';
  }
}

function sortIssues(issues: JiraIssue[], field: SortField, dir: SortDir): JiraIssue[] {
  return [...issues].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case 'tag': {
        const tA = a.key.split('-')[0] ?? '';
        const tB = b.key.split('-')[0] ?? '';
        cmp = tA.localeCompare(tB);
        // tiebreak on ticket number when tags are equal
        if (cmp === 0) {
          cmp = parseInt(a.key.split('-')[1] ?? '0', 10) - parseInt(b.key.split('-')[1] ?? '0', 10);
        }
        break;
      }
      case 'number': {
        const nA = parseInt(a.key.split('-')[1] ?? '0', 10);
        const nB = parseInt(b.key.split('-')[1] ?? '0', 10);
        cmp = nA - nB;
        break;
      }
      case 'assignee':
        cmp = (a.fields.assignee?.displayName ?? '').localeCompare(
              b.fields.assignee?.displayName ?? '');
        break;
      case 'status':
        cmp = a.fields.status.name.localeCompare(b.fields.status.name);
        break;
      case 'priority': {
        const pA = PRIORITY_ORDER[a.fields.priority?.name ?? ''] ?? 99;
        const pB = PRIORITY_ORDER[b.fields.priority?.name ?? ''] ?? 99;
        cmp = pA - pB;
        break;
      }
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

interface JiraFilters {
  tags:       string[];
  assignees:  string[]; // accountIds
  statuses:   string[];
  priorities: string[];
}

const EMPTY_FILTERS: JiraFilters = { tags: [], assignees: [], statuses: [], priorities: [] };

function activeFilterCount(f: JiraFilters) {
  return f.tags.length + f.assignees.length + f.statuses.length + f.priorities.length;
}

// ── JiraPanel ──────────────────────────────────────────────────────────────

function JiraPanel({ project }: { project: Project }) {
  const { navigateToJiraIssue } = useView();
  const [issues, setIssues]     = useState<JiraIssue[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<JiraUser | null>(null);

  // Sort state — default: number descending (newest first)
  const [sortField, setSortField] = useState<SortField>('number');
  const [sortDir,   setSortDir]   = useState<SortDir>('desc');

  // Column visibility
  const [showPriority, setShowPriority] = useState(true);
  const [showStatus,   setShowStatus]   = useState(true);

  // Filter state
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters]       = useState<JiraFilters>(EMPTY_FILTERS);

  // Bulk selection
  const [selectedIds, setSelectedIds]           = useState<Set<string>>(new Set());
  const [bulkTransitioning, setBulkTransitioning] = useState(false);
  const [bulkResult, setBulkResult]               = useState<{ ok: number; failed: string[]; action: 'transition' | 'assign' } | null>(null);

  // Debug panel
  const [debugOpen, setDebugOpen] = useState(false);
  type DebugEntry = { issueKey: string; currentStatus: string; transitions: Array<{ id: string; name: string; to: string }> };
  const [debugData, setDebugData] = useState<DebugEntry[] | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);

  const fetchDebugData = async () => {
    setDebugLoading(true);
    setDebugData(null);
    const entries: DebugEntry[] = [];
    for (const issueKey of selectedIds) {
      const issue = issues.find((i) => i.key === issueKey);
      try {
        const r = await fetch(`/api/jira/transitions/${encodeURIComponent(issueKey)}?projectId=${encodeURIComponent(project.id)}`);
        const data = await r.json() as { transitions?: Array<{ id: string; name: string; to: { name: string } }>; error?: string };
        entries.push({
          issueKey,
          currentStatus: issue?.fields.status.name ?? '?',
          transitions: (data.transitions ?? []).map((t) => ({ id: t.id, name: t.name, to: t.to.name })),
        });
      } catch {
        entries.push({ issueKey, currentStatus: issue?.fields.status.name ?? '?', transitions: [] });
      }
    }
    setDebugData(entries);
    setDebugLoading(false);
  };

  // All statuses defined in the Jira project (for the bulk transition dropdown)
  const [projectStatuses, setProjectStatuses] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/jira/statuses?projectId=${encodeURIComponent(project.id)}`)
      .then((r) => r.ok ? r.json() as Promise<{ statuses?: Array<{ name: string }> }> : null)
      .then((data) => { if (data?.statuses) setProjectStatuses(data.statuses.map((s) => s.name)); })
      .catch(() => {});
  }, [project.id]);

  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/jira/issues?projectId=${encodeURIComponent(project.id)}`).then(async (r) => {
        const text = await r.text();
        let data: { issues?: JiraIssue[]; error?: string };
        try { data = JSON.parse(text); } catch {
          throw new Error(
            r.status === 404
              ? 'Jira API route not found — rebuild the app to apply server changes'
              : `Server returned non-JSON response (status ${r.status})`,
          );
        }
        if (!r.ok || data.error) throw new Error(data.error ?? `HTTP ${r.status}`);
        return data.issues ?? [];
      }),
      fetch(`/api/jira/me?projectId=${encodeURIComponent(project.id)}`)
        .then((r) => (r.ok ? r.json() as Promise<JiraUser> : null))
        .catch(() => null),
    ])
      .then(([fetchedIssues, me]) => {
        setIssues(fetchedIssues);
        setCurrentUser(me);
      })
      .catch((err: unknown) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [project.id]);

  // ── computed filter options ────────────────────────────
  const allTags = useMemo(
    () => [...new Set(issues.map((i) => i.key.split('-')[0]))].sort(),
    [issues],
  );
  const allAssignees = useMemo(() => {
    const seen = new Map<string, JiraUser>();
    let hasUnassigned = false;
    for (const issue of issues) {
      if (issue.fields.assignee)
        seen.set(issue.fields.assignee.accountId, issue.fields.assignee);
      else
        hasUnassigned = true;
    }
    const named = [...seen.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
    // Prepend a sentinel entry so users can filter for unassigned tickets
    if (hasUnassigned)
      named.unshift({ accountId: '__unassigned__', displayName: 'Unassigned' });
    return named;
  }, [issues]);
  const allStatuses = useMemo(
    () => [...new Set(issues.map((i) => i.fields.status.name))].sort(),
    [issues],
  );
  const allPriorities = useMemo(() => {
    const order = ['Highest', 'Blocker', 'High', 'Critical', 'Medium', 'Major', 'Low', 'Minor', 'Lowest', 'Trivial'];
    const found = new Set(issues.map((i) => i.fields.priority?.name).filter(Boolean));
    // Return in severity order, then any unknowns alphabetically at the end
    const known = order.filter((p) => found.has(p));
    const unknown = [...found].filter((p) => p && !order.includes(p)).sort() as string[];
    return [...known, ...unknown];
  }, [issues]);

  // ── filtered + sorted issues ───────────────────────────
  const displayIssues = useMemo(() => {
    const filtered = issues.filter((issue) => {
      const tag = issue.key.split('-')[0];
      if (filters.tags.length       && !filters.tags.includes(tag))                                  return false;
      if (filters.assignees.length) {
        const wantUnassigned = filters.assignees.includes('__unassigned__');
        const wantedIds = filters.assignees.filter((id) => id !== '__unassigned__');
        const matchesUnassigned = wantUnassigned && !issue.fields.assignee;
        const matchesNamed = wantedIds.length > 0 && !!issue.fields.assignee &&
          wantedIds.includes(issue.fields.assignee.accountId);
        if (!matchesUnassigned && !matchesNamed) return false;
      }
      if (filters.statuses.length   && !filters.statuses.includes(issue.fields.status.name))        return false;
      if (filters.priorities.length && !filters.priorities.includes(issue.fields.priority?.name ?? '')) return false;
      return true;
    });
    return sortIssues(filtered, sortField, sortDir);
  }, [issues, filters, sortField, sortDir]);
  // ── bulk transition ─────────────────────────────
  const [bulkTargetStatus, setBulkTargetStatus] = useState<string>('');
  const [bulkAssigneeId, setBulkAssigneeId]     = useState<string>(''); // '' = unset, '__unassigned__' = unassign
  const [bulkAssigning, setBulkAssigning]       = useState(false);

  const handleBulkAssign = async () => {
    if (selectedIds.size === 0 || bulkAssigning) return;
    setBulkAssigning(true);
    setBulkResult(null);
    let ok = 0;
    const failed: string[] = [];
    const accountId = bulkAssigneeId === '__unassigned__' ? null : bulkAssigneeId;
    for (const issueKey of selectedIds) {
      try {
        const r = await fetch(
          `/api/jira/assign/${encodeURIComponent(issueKey)}?projectId=${encodeURIComponent(project.id)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId }),
          },
        );
        const data = await r.json() as { ok?: boolean; error?: string };
        if (!r.ok || data.error) throw new Error(data.error ?? `HTTP ${r.status}`);
        ok++;
      } catch (err) {
        failed.push(`${issueKey}: ${String(err)}`);
      }
    }
    setBulkResult({ ok, failed, action: 'assign' });
    setBulkAssigning(false);
    // Refresh issues
    setLoading(true);
    setError(null);
    fetch(`/api/jira/issues?projectId=${encodeURIComponent(project.id)}`)
      .then((r) => r.json() as Promise<{ issues?: JiraIssue[]; error?: string }>)
      .then((data) => { if (data.issues) setIssues(data.issues); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const handleBulkTransition = async () => {
    if (!bulkTargetStatus || selectedIds.size === 0 || bulkTransitioning) return;
    setBulkTransitioning(true);
    setBulkResult(null);
    let ok = 0;
    const failed: string[] = [];
    for (const issueKey of selectedIds) {
      try {
        await transitionIssueToTarget(issueKey, project.id, bulkTargetStatus, projectStatuses);
        ok++;
      } catch (err) {
        failed.push(`${issueKey}: ${String(err)}`);
      }
    }
    setBulkResult({ ok, failed, action: 'transition' });
    setBulkTransitioning(false);
    // Refresh issues after bulk transition (keep selection intact)
    setLoading(true);
    setError(null);
    fetch(`/api/jira/issues?projectId=${encodeURIComponent(project.id)}`)
      .then((r) => r.json() as Promise<{ issues?: JiraIssue[]; error?: string }>)
      .then((data) => { if (data.issues) setIssues(data.issues); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  // ── helpers ───────────────────────────────────────────
  const isMe = (assignee: JiraUser | null) =>
    !!currentUser && !!assignee && assignee.accountId === currentUser.accountId;

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  };

  const allDisplayIds = useMemo(() => displayIssues.map((i) => i.key), [displayIssues]);
  const allSelected = allDisplayIds.length > 0 && allDisplayIds.every((id) => selectedIds.has(id));
  const someSelected = !allSelected && allDisplayIds.some((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allDisplayIds));
    }
  };

  const toggleSelectOne = (issueKey: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(issueKey)) next.delete(issueKey); else next.add(issueKey);
      return next;
    });
  };

  function toggleFilter<K extends keyof JiraFilters>(key: K, value: string) {
    setFilters((prev) => {
      const arr = prev[key] as string[];
      return {
        ...prev,
        [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
      };
    });
  }

  const filterCount = activeFilterCount(filters);
  const boardUrl = project.jiraBoardUrl || null;

  return (
    <div className="flex flex-col gap-3">

      {/* ── Title row ──────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-mono text-xs font-medium text-zinc-400 uppercase tracking-widest">
          Jira — {project.jiraProjectKeys?.join(', ')}
        </h2>
        {boardUrl && (
          <a
            href={boardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs shrink-0"
          >
            ↗ Open board
          </a>
        )}
      </div>

      {/* ── Column visibility row ───────────────────────── */}
      {!loading && !error && issues.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-zinc-600 uppercase tracking-wider shrink-0 mr-0.5">
            Show:
          </span>
          {(['priority', 'status'] as const).map((col) => {
            const on = col === 'priority' ? showPriority : showStatus;
            const toggle = col === 'priority'
              ? () => setShowPriority((v) => !v)
              : () => setShowStatus((v) => !v);
            return (
              <button
                key={col}
                onClick={toggle}
                className={[
                  'font-mono text-[10px] px-2 py-0.5 rounded border transition-colors',
                  on
                    ? 'bg-zinc-700 border-zinc-500 text-zinc-100'
                    : 'bg-zinc-800/60 border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600',
                ].join(' ')}
              >
                {col === 'priority' ? 'Priority' : 'Status'}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Sort bar + filter button ────────────────────── */}
      {!loading && !error && issues.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-[10px] text-zinc-600 uppercase tracking-wider shrink-0 mr-0.5">
            Sort:
          </span>
          {SORT_OPTIONS.map(({ field, label }) => {
            const active = sortField === field;
            return (
              <button
                key={field}
                onClick={() => toggleSort(field)}
                className={[
                  'font-mono text-[10px] px-2 py-0.5 rounded border transition-colors',
                  active
                    ? 'bg-zinc-700 border-zinc-500 text-zinc-100'
                    : 'bg-zinc-800/60 border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600',
                ].join(' ')}
              >
                {label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
              </button>
            );
          })}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Filter button */}
          <button
            onClick={() => setFilterOpen(true)}
            className={[
              'font-mono text-[10px] px-2 py-0.5 rounded border transition-colors flex items-center gap-1',
              filterCount > 0
                ? 'bg-sky-900/60 border-sky-700 text-sky-300'
                : 'bg-zinc-800/60 border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600',
            ].join(' ')}
          >
            ⚙ Filters{filterCount > 0 ? ` (${filterCount})` : ''}
          </button>
        </div>
      )}

      {/* ── States ─────────────────────────────────────── */}
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
      {!loading && !error && issues.length > 0 && displayIssues.length === 0 && (
        <p className="font-mono text-xs text-zinc-500">
          No issues match the active filters.{' '}
          <button
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="text-sky-400 hover:text-sky-300 underline transition-colors"
          >
            Clear filters
          </button>
        </p>
      )}

      {/* ── Issue list ─────────────────────────────────── */}
      {!loading && !error && displayIssues.length > 0 && (
        <div className="flex flex-col gap-0 border border-zinc-800 rounded-lg overflow-hidden">
          {/* Select-all header row */}
          <div className="flex items-center gap-2.5 px-3 py-1.5 bg-zinc-800/80 border-b border-zinc-700">
            <span
              onClick={toggleSelectAll}
              className={[
                'w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer transition-colors',
                allSelected
                  ? 'bg-sky-600 border-sky-500'
                  : someSelected
                    ? 'bg-sky-900 border-sky-600'
                    : 'bg-zinc-700 border-zinc-600 hover:border-zinc-400',
              ].join(' ')}
            >
              {allSelected && <span className="text-white text-[9px] font-bold leading-none">✓</span>}
              {someSelected && <span className="text-sky-400 text-[9px] font-bold leading-none">–</span>}
            </span>
            <span className="font-mono text-[10px] text-zinc-500">
              {selectedIds.size > 0
                ? `${selectedIds.size} selected`
                : `${displayIssues.length} issue${displayIssues.length !== 1 ? 's' : ''}`}
            </span>
          </div>

          {displayIssues.map((issue) => {
            const catKey      = issue.fields.status.statusCategory?.key ?? '';
            const assignedToMe = isMe(issue.fields.assignee);
            const priorityName = issue.fields.priority?.name;
            return (
              <div
                key={issue.id}
                className={[
                  'group flex items-center gap-2.5 px-3 py-2.5 border-b border-zinc-800 last:border-b-0 transition-colors text-left w-full',
                  selectedIds.has(issue.key)
                    ? 'bg-sky-950/40'
                    : assignedToMe
                      ? 'bg-zinc-800/60 hover:bg-zinc-700/60'
                      : 'bg-zinc-900 hover:bg-zinc-800',
                ].join(' ')}
              >
                {/* Row checkbox */}
                <span
                  onClick={(e) => { e.stopPropagation(); toggleSelectOne(issue.key); }}
                  className={[
                    'w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer transition-colors',
                    selectedIds.has(issue.key)
                      ? 'bg-sky-600 border-sky-500'
                      : 'bg-zinc-800 border-zinc-600 group-hover:border-zinc-400',
                  ].join(' ')}
                >
                  {selectedIds.has(issue.key) && (
                    <span className="text-white text-[9px] font-bold leading-none">✓</span>
                  )}
                </span>
                <button
                  className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                  onClick={() => navigateToJiraIssue(issue.key)}
                >
                {/* Priority badge */}
                {showPriority && priorityName && (
                  <span
                    className={[
                      'font-mono text-[10px] px-1.5 py-0.5 rounded border shrink-0',
                      priorityBadgeStyle(priorityName),
                    ].join(' ')}
                  >
                    {priorityName}
                  </span>
                )}

                {/* Ticket key */}
                <span className="font-mono text-xs text-zinc-500 shrink-0 w-[4.5rem] group-hover:text-zinc-400 transition-colors">
                  {issue.key}
                </span>

                {/* Summary */}
                <span className="font-mono text-xs text-zinc-200 flex-1 truncate group-hover:text-white transition-colors">
                  {issue.fields.summary}
                </span>

                {/* Status badge */}
                {showStatus && (
                  <span
                    className={[
                      'font-mono text-[10px] px-1.5 py-0.5 rounded border shrink-0 hidden sm:inline',
                      statusColor(catKey),
                    ].join(' ')}
                  >
                    {issue.fields.status.name}
                  </span>
                )}

                  {/* Assignee */}
                  {issue.fields.assignee && (
                    <span
                      className={[
                        'font-mono text-[10px] shrink-0 hidden md:block',
                        assignedToMe ? 'text-sky-400 font-semibold' : 'text-zinc-500',
                      ].join(' ')}
                    >
                      {assignedToMe ? '● ' : ''}{issue.fields.assignee.displayName.split(' ')[0]}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Bulk action bar ────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="mt-3 flex flex-col gap-1.5 bg-zinc-800/80 border border-zinc-700 rounded-lg px-3 py-2.5">
          {/* header + controls row */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-mono text-xs text-zinc-400 shrink-0">
              {selectedIds.size} selected
            </span>

            {/* Status row */}
            <span className="font-mono text-[10px] text-zinc-600 w-14 text-right shrink-0">status</span>
            <select
              value={bulkTargetStatus}
              onChange={(e) => setBulkTargetStatus(e.target.value)}
              disabled={bulkTransitioning || bulkAssigning}
              className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1 font-mono text-xs text-zinc-100 focus:outline-none focus:border-zinc-400 disabled:opacity-50 cursor-pointer"
            >
              <option value="">— move to… —</option>
              {(projectStatuses.length ? projectStatuses : allStatuses).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              onClick={handleBulkTransition}
              disabled={!bulkTargetStatus || bulkTransitioning || bulkAssigning}
              className="font-mono text-xs px-3 py-1 rounded border bg-sky-900/60 border-sky-700 text-sky-200 hover:bg-sky-800/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {bulkTransitioning ? 'Moving…' : 'Move ↗'}
            </button>

            <div className="flex-1" />
          <button
            onClick={() => {
              const next = !debugOpen;
              setDebugOpen(next);
              if (next && !debugData) fetchDebugData();
            }}
            className={[
              'font-mono text-[10px] px-2 py-0.5 rounded border transition-colors',
              debugOpen
                ? 'bg-amber-900/50 border-amber-700 text-amber-300'
                : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600',
            ].join(' ')}
          >
            Debug
          </button>
          <button
            onClick={() => { setSelectedIds(new Set()); setDebugOpen(false); setDebugData(null); }}
            className="font-mono text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            ✕
          </button>
          </div>

          {/* Assignee row */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-mono text-[10px] text-zinc-600 w-[calc(theme(spacing.14)+theme(spacing.2.5))] shrink-0" />{/* spacer aligns with above */}
            <span className="font-mono text-[10px] text-zinc-600 w-14 text-right shrink-0">assignee</span>
            <select
              value={bulkAssigneeId}
              onChange={(e) => setBulkAssigneeId(e.target.value)}
              disabled={bulkAssigning || bulkTransitioning}
              className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1 font-mono text-xs text-zinc-100 focus:outline-none focus:border-zinc-400 disabled:opacity-50 cursor-pointer"
            >
              <option value="">— assign to… —</option>
              <option value="__unassigned__">Unassigned</option>
              {allAssignees.filter((u) => u.accountId !== '__unassigned__').map((u) => (
                <option key={u.accountId} value={u.accountId}>
                  {u.accountId === currentUser?.accountId ? `● ${u.displayName} (me)` : u.displayName}
                </option>
              ))}
            </select>
            <button
              onClick={handleBulkAssign}
              disabled={!bulkAssigneeId || bulkAssigning || bulkTransitioning}
              className="font-mono text-xs px-3 py-1 rounded border bg-violet-900/60 border-violet-700 text-violet-200 hover:bg-violet-800/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {bulkAssigning ? 'Assigning…' : 'Assign ↗'}
            </button>
          </div>
        </div>
      )}

      {/* ── Debug panel ────────────────────────────────── */}
      {selectedIds.size > 0 && debugOpen && (
        <div className="bg-zinc-950 border border-amber-900/60 rounded-lg p-3 flex flex-col gap-3 font-mono text-xs">
          {/* Status chain */}
          <div>
            <p className="text-amber-400 mb-1">Status chain ({projectStatuses.length ? 'from Jira API' : 'hardcoded fallback'}):</p>
            {projectStatuses.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {projectStatuses.map((s, i) => (
                  <span key={s} className="flex items-center gap-0.5">
                    {i > 0 && <span className="text-zinc-600">→</span>}
                    <span className={[
                      'px-1.5 py-0.5 rounded border',
                      s === bulkTargetStatus ? 'bg-sky-900/60 border-sky-700 text-sky-200' : 'bg-zinc-800 border-zinc-700 text-zinc-300',
                    ].join(' ')}>{s}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-amber-600 italic">No statuses fetched — /api/jira/statuses may have failed. Using STATUS_CHAIN fallback.</p>
            )}
          </div>

          {/* Per-issue transitions */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-amber-400">Available transitions per issue:</p>
              <button
                onClick={fetchDebugData}
                disabled={debugLoading}
                className="text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
              >
                ↺ Refresh
              </button>
            </div>
            {debugLoading && <p className="text-zinc-500">Fetching…</p>}
            {debugData && debugData.map((entry) => (
              <div key={entry.issueKey} className="mb-2">
                <p className="text-zinc-400">
                  <span className="text-zinc-200">{entry.issueKey}</span>{' '}
                  current: <span className="text-emerald-400">{entry.currentStatus}</span>
                </p>
                {entry.transitions.length === 0 ? (
                  <p className="text-red-400 ml-3">No transitions available (already at target, or workflow blocked)</p>
                ) : (
                  <div className="flex flex-wrap gap-1 ml-3 mt-0.5">
                    {entry.transitions.map((t) => (
                      <span
                        key={t.id}
                        className={[
                          'px-1.5 py-0.5 rounded border',
                          normStatus(t.to) === normStatus(bulkTargetStatus)
                            ? 'bg-sky-900/60 border-sky-700 text-sky-200'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-400',
                        ].join(' ')}
                        title={`transition id: ${t.id}`}
                      >
                        {t.name} → {t.to}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Bulk result ────────────────────────────────── */}
      {bulkResult && (
        <div className={[
          'mt-2 px-3 py-2 rounded-lg border font-mono text-xs',
          bulkResult.failed.length === 0
            ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
            : 'bg-amber-950/50 border-amber-800 text-amber-300',
        ].join(' ')}>
          {bulkResult.ok > 0 && bulkResult.action === 'transition' && (
            <p>✓ {bulkResult.ok} issue{bulkResult.ok !== 1 ? 's' : ''} moved to "{bulkTargetStatus}".</p>
          )}
          {bulkResult.ok > 0 && bulkResult.action === 'assign' && (() => {
            const label = bulkAssigneeId === '__unassigned__'
              ? 'Unassigned'
              : (allAssignees.find((u) => u.accountId === bulkAssigneeId)?.displayName ?? bulkAssigneeId);
            return <p>✓ {bulkResult.ok} issue{bulkResult.ok !== 1 ? 's' : ''} assigned to "{label}".</p>;
          })()}
          {bulkResult.failed.map((msg, i) => (
            <p key={i} className="text-red-400 mt-0.5">✕ {msg}</p>
          ))}
          <button
            onClick={() => setBulkResult(null)}
            className="mt-1 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Filter modal ───────────────────────────────── */}
      {filterOpen && (
        <Modal title="Filter issues" onClose={() => setFilterOpen(false)}>

          {allTags.length > 1 && (
            <ModalSection title="Tag">
              <div className="flex flex-col gap-1.5">
                {allTags.map((tag) => (
                  <CheckRow
                    key={tag}
                    label={tag}
                    checked={filters.tags.includes(tag)}
                    onChange={() => toggleFilter('tags', tag)}
                  />
                ))}
              </div>
            </ModalSection>
          )}

          {allAssignees.length > 0 && (
            <ModalSection title="Assignee">
              <div className="flex flex-col gap-1.5">
                {allAssignees.map((user) => (
                  <CheckRow
                    key={user.accountId}
                    label={user.displayName}
                    checked={filters.assignees.includes(user.accountId)}
                    onChange={() => toggleFilter('assignees', user.accountId)}
                  />
                ))}
              </div>
            </ModalSection>
          )}

          {allStatuses.length > 0 && (
            <ModalSection title="Status">
              <div className="flex flex-col gap-1.5">
                {allStatuses.map((s) => (
                  <CheckRow
                    key={s}
                    label={s}
                    checked={filters.statuses.includes(s)}
                    onChange={() => toggleFilter('statuses', s)}
                  />
                ))}
              </div>
            </ModalSection>
          )}

          {allPriorities.length > 0 && (
            <ModalSection title="Priority">
              <div className="flex flex-col gap-1.5">
                {allPriorities.map((p) => (
                  <CheckRow
                    key={p}
                    label={p}
                    checked={filters.priorities.includes(p)}
                    onChange={() => toggleFilter('priorities', p)}
                  />
                ))}
              </div>
            </ModalSection>
          )}

          {/* Clear all */}
          {filterCount > 0 && (
            <button
              onClick={() => { setFilters(EMPTY_FILTERS); setFilterOpen(false); }}
              className="font-mono text-xs text-red-400 hover:text-red-300 transition-colors text-left"
            >
              ✕ Clear all filters
            </button>
          )}
        </Modal>
      )}

    </div>
  );
}

// ── Jira transition helpers ──────────────────────────────────────────────────

/**
 * Canonical ordered list of common Jira Software status names (lower-cased).
 * Used to find intermediate steps when a direct transition is not available.
 * Earlier index = earlier in the workflow.
 */
const STATUS_CHAIN: string[] = [
  'backlog',
  'to do',
  'open',
  'selected for development',
  'in progress',
  'in development',
  'in review',
  'code review',
  'peer review',
  'testing',
  'qa',
  'uat',
  'done',
  'closed',
  'resolved',
];

function normStatus(s: string) { return s.toLowerCase().trim(); }

function chainIdx(name: string) {
  return STATUS_CHAIN.indexOf(normStatus(name));
}

type JiraTransition = { id: string; name: string; to: { name: string } };

/**
 * From the available transitions for an issue, returns the best one to take
 * in order to reach `targetStatus`.
 *
 * Strategy:
 *  1. Direct match — transition goes straight to the target.
 *  2. Intermediate step — using the provided `statusChain` (real project order)
 *     merged with the hardcoded STATUS_CHAIN fallback, find the transition that
 *     advances us furthest toward the target without overshooting.
 *
 * Returns null when no forward progress is possible (already at target, or
 * the workflow provides no path).
 */
function findBestTransition(
  transitions: JiraTransition[],
  targetStatus: string,
  statusChain: string[],
): JiraTransition | null {
  const tgt = normStatus(targetStatus);

  // 1. Direct match
  const direct = transitions.find((t) => normStatus(t.to.name) === tgt);
  if (direct) return direct;

  // 2. Build a merged index: prefer projectStatuses order; fall back to STATUS_CHAIN
  const chainLower = statusChain.map(normStatus);
  const targetIdx = (() => {
    const i = chainLower.indexOf(tgt);
    return i !== -1 ? i : chainIdx(targetStatus);
  })();

  if (targetIdx === -1) return null; // target not in any known chain — give up

  const resolveIdx = (name: string) => {
    const n = normStatus(name);
    const i = chainLower.indexOf(n);
    return i !== -1 ? i : chainIdx(name);
  };

  // 3. Pick the transition that advances us furthest toward the target
  let best: JiraTransition | null = null;
  let bestIdx = -1;
  for (const t of transitions) {
    const idx = resolveIdx(t.to.name);
    if (idx !== -1 && idx < targetIdx && idx > bestIdx) {
      bestIdx = idx;
      best = t;
    }
  }
  return best;
}

/**
 * Transitions a single issue toward `targetStatus`, automatically chaining
 * through intermediate states (e.g. To Do → In Progress → In Review).
 *
 * `statusChain` should be the ordered list of real Jira status names for the
 * project, as returned by /api/jira/statuses.  Falls back to STATUS_CHAIN.
 *
 * Throws on API error or if the target cannot be reached in 8 steps.
 */
async function transitionIssueToTarget(
  issueKey: string,
  projectId: string,
  targetStatus: string,
  statusChain: string[] = [],
): Promise<void> {
  const chain = statusChain.length ? statusChain : STATUS_CHAIN;

  for (let attempt = 0; attempt < 8; attempt++) {
    const r = await fetch(
      `/api/jira/transitions/${encodeURIComponent(issueKey)}?projectId=${encodeURIComponent(projectId)}`,
    );
    const data = (await r.json()) as { transitions?: JiraTransition[]; error?: string };
    if (!r.ok || data.error) throw new Error(data.error ?? `HTTP ${r.status}`);

    const transitions = data.transitions ?? [];

    // If the target is already available as a direct transition, or no transitions
    // exist at all, treat either as "done or stuck" based on whether any transition
    // even goes forward (avoids masking genuine failures as silent success).
    const next = findBestTransition(transitions, targetStatus, chain);

    if (!next) {
      // No forward path found. Either we're already at the target, or the
      // workflow truly has no path. Either way, stop without error.
      return;
    }

    const applyR = await fetch(
      `/api/jira/transition/${encodeURIComponent(issueKey)}?projectId=${encodeURIComponent(projectId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transitionId: next.id }),
      },
    );
    const applyData = (await applyR.json()) as { ok?: boolean; error?: string };
    if (!applyR.ok || applyData.error) throw new Error(applyData.error ?? `HTTP ${applyR.status}`);

    // Reached the target — done
    if (normStatus(next.to.name) === normStatus(targetStatus)) return;
    // Otherwise loop for the next intermediate step
  }

  throw new Error(`Could not reach "${targetStatus}" in 8 steps — check the workflow configuration`);
}

/** Reusable checkbox row used in the filter modal */
function CheckRow({
  label, checked, onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group">
      <span
        className={[
          'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
          checked
            ? 'bg-sky-600 border-sky-500'
            : 'bg-zinc-800 border-zinc-600 group-hover:border-zinc-400',
        ].join(' ')}
        onClick={onChange}
      >
        {checked && (
          <span className="text-white text-[9px] font-bold leading-none">✓</span>
        )}
      </span>
      <span
        className={[
          'font-mono text-xs transition-colors',
          checked ? 'text-zinc-100' : 'text-zinc-400 group-hover:text-zinc-200',
        ].join(' ')}
        onClick={onChange}
      >
        {label}
      </span>
    </label>
  );
}
