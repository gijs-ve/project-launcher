import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { useView } from '../context/ViewContext';
import { useConfig } from '../context/ConfigContext';
import { JiraIssue, JiraUser, JiraComment, AdfNode, TempoWorklog } from '../types';
import { AssigneeChip } from '../components/AssigneeChip';
import { WorklogAuthor } from '../components/WorklogAuthor';

import { JiraAttachment } from '../types';

// Context that threads projectId + attachments into deeply-nested ADF nodes
const AdfCtx = createContext<{ projectId: string | undefined; attachments: JiraAttachment[] }>(
  { projectId: undefined, attachments: [] },
);

// ── Atlassian Document Format renderer ──────────────────────────────────────

function AdfText({ node }: { node: AdfNode }): React.ReactElement {
  let el: React.ReactElement = <>{node.text ?? ''}</>;

  for (const mark of node.marks ?? []) {
    if (mark.type === 'strong')        el = <strong className="font-semibold text-zinc-100">{el}</strong>;
    else if (mark.type === 'em')       el = <em className="italic">{el}</em>;
    else if (mark.type === 'code')     el = <code className="font-mono text-xs bg-zinc-800 text-emerald-400 px-1 rounded">{el}</code>;
    else if (mark.type === 'strike')   el = <del className="line-through text-zinc-500">{el}</del>;
    else if (mark.type === 'underline') el = <span className="underline">{el}</span>;
    else if (mark.type === 'textColor') {
      const color = mark.attrs?.color as string | undefined;
      el = <span style={color ? { color } : {}}>{el}</span>;
    } else if (mark.type === 'link') {
      const href = mark.attrs?.href as string | undefined;
      el = (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-400 hover:underline"
        >
          {el}
        </a>
      );
    }
  }
  return el;
}

function AdfNodeRenderer({ node, depth = 0 }: { node: AdfNode; depth?: number }): React.ReactElement | null {
  const { projectId, attachments } = useContext(AdfCtx);
  switch (node.type) {
    case 'doc':
      return (
        <div className="flex flex-col gap-2">
          {node.content?.map((child, i) => <AdfNodeRenderer key={i} node={child} depth={depth} />)}
        </div>
      );

    case 'paragraph':
      return (
        <p className="text-sm text-zinc-300 leading-relaxed">
          {node.content?.map((child, i) => <AdfNodeRenderer key={i} node={child} depth={depth} />) ?? <br />}
        </p>
      );

    case 'text':
      return <AdfText node={node} />;

    case 'hardBreak':
      return <br />;

    case 'heading': {
      const level = (node.attrs?.level as number) ?? 1;
      const cls = [
        'font-mono font-semibold text-zinc-100 mt-2',
        level === 1 ? 'text-base' :
        level === 2 ? 'text-sm' : 'text-xs',
      ].join(' ');
      return (
        <p className={cls}>
          {node.content?.map((child, i) => <AdfNodeRenderer key={i} node={child} depth={depth} />)}
        </p>
      );
    }

    case 'bulletList':
      return (
        <ul className="list-disc pl-5 flex flex-col gap-1">
          {node.content?.map((child, i) => <AdfNodeRenderer key={i} node={child} depth={depth + 1} />)}
        </ul>
      );

    case 'orderedList':
      return (
        <ol className="list-decimal pl-5 flex flex-col gap-1">
          {node.content?.map((child, i) => <AdfNodeRenderer key={i} node={child} depth={depth + 1} />)}
        </ol>
      );

    case 'listItem':
      return (
        <li className="text-sm text-zinc-300 leading-relaxed">
          {node.content?.map((child, i) => <AdfNodeRenderer key={i} node={child} depth={depth} />)}
        </li>
      );

    case 'codeBlock': {
      const lang = node.attrs?.language as string | undefined;
      return (
        <div className="rounded-lg overflow-hidden border border-zinc-700">
          {lang && (
            <div className="bg-zinc-800 px-3 py-1 font-mono text-[10px] text-zinc-500 border-b border-zinc-700">
              {lang}
            </div>
          )}
          <pre className="bg-zinc-900 p-3 overflow-x-auto">
            <code className="font-mono text-xs text-zinc-200 whitespace-pre">
              {node.content?.map((child, i) => <AdfNodeRenderer key={i} node={child} depth={depth} />)}
            </code>
          </pre>
        </div>
      );
    }

    case 'blockquote':
      return (
        <blockquote className="border-l-2 border-zinc-600 pl-3 text-zinc-400 italic">
          {node.content?.map((child, i) => <AdfNodeRenderer key={i} node={child} depth={depth} />)}
        </blockquote>
      );

    case 'rule':
      return <hr className="border-zinc-700" />;

    case 'mention': {
      const text = node.attrs?.text as string | undefined;
      return <span className="text-sky-400 font-mono text-xs">{text ?? '@mention'}</span>;
    }

    case 'emoji': {
      const text = node.attrs?.text as string | undefined;
      const shortName = node.attrs?.shortName as string | undefined;
      return <span>{text ?? shortName ?? ''}</span>;
    }

    case 'inlineCard':
    case 'blockCard': {
      const url = node.attrs?.url as string | undefined;
      return url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline font-mono text-xs break-all">
          {url}
        </a>
      ) : null;
    }

    case 'panel': {
      const panelType = node.attrs?.panelType as string | undefined;
      const panelCls =
        panelType === 'warning' ? 'border-yellow-800 bg-yellow-950/40' :
        panelType === 'error'   ? 'border-red-800 bg-red-950/40' :
        panelType === 'success' ? 'border-emerald-800 bg-emerald-950/40' :
        'border-sky-800 bg-sky-950/40';
      return (
        <div className={`border rounded-lg p-3 flex flex-col gap-1 ${panelCls}`}>
          {node.content?.map((child, i) => <AdfNodeRenderer key={i} node={child} depth={depth} />)}
        </div>
      );
    }

    case 'table': {
      return (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-xs font-mono text-zinc-300">
            <tbody>
              {node.content?.map((row, i) => (
                <tr key={i} className="border-b border-zinc-800 last:border-b-0">
                  {row.content?.map((cell, j) => {
                    const Tag = cell.type === 'tableHeader' ? 'th' : 'td';
                    return (
                      <Tag key={j} className={`px-3 py-2 text-left ${cell.type === 'tableHeader' ? 'bg-zinc-800 text-zinc-100 font-semibold' : ''}`}>
                        {cell.content?.map((child, k) => <AdfNodeRenderer key={k} node={child} depth={depth} />)}
                      </Tag>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case 'mediaSingle':
      return (
        <div className="my-2">
          {node.content?.map((child, i) => <AdfNodeRenderer key={i} node={child} depth={depth} />)}
        </div>
      );

    case 'media': {
      const mediaType = node.attrs?.type as string | undefined;
      const alt       = node.attrs?.alt as string | undefined;
      if (mediaType === 'file') {
        // The ADF id is a Media Service UUID — map to numeric Jira attachment ID via filename
        const attachment = alt ? attachments.find((a) => a.filename === alt) : undefined;
        if (attachment) {
          const qs  = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
          const src = `/api/jira/attachment/${encodeURIComponent(attachment.id)}${qs}`;
          return (
            <img
              src={src}
              alt={alt ?? 'attachment'}
              className="max-w-full rounded border border-zinc-700 my-1"
              loading="lazy"
            />
          );
        }
        // Attachment not in list — show filename as placeholder
        return alt ? <span className="font-mono text-xs text-zinc-500">[{alt}]</span> : null;
      }
      // External/link media
      const url = node.attrs?.url as string | undefined;
      return url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline font-mono text-xs break-all">{url}</a>
      ) : null;
    }

    default:
      // Render children if possible, otherwise nothing
      if (node.content?.length) {
        return <>{node.content.map((child, i) => <AdfNodeRenderer key={i} node={child} depth={depth} />)}</>;
      }
      if (node.text) return <>{node.text}</>;
      return null;
  }
}

// ── Utility helpers ──────────────────────────────────────────────────────────

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusColor(key: string) {
  if (key === 'done')          return 'text-emerald-400 border-emerald-800 bg-emerald-950/50';
  if (key === 'indeterminate') return 'text-sky-400 border-sky-800 bg-sky-950/50';
  return 'text-zinc-400 border-zinc-700 bg-zinc-800/50';
}

function priorityColor(name: string | undefined) {
  if (!name) return 'text-zinc-500';
  const n = name.toLowerCase();
  if (n === 'highest' || n === 'critical') return 'text-red-400';
  if (n === 'high')   return 'text-orange-400';
  if (n === 'medium') return 'text-yellow-400';
  if (n === 'low' || n === 'lowest') return 'text-blue-400';
  return 'text-zinc-500';
}

// ── Comment card ─────────────────────────────────────────────────────────────

function CommentCard({ comment, isMe }: { comment: JiraComment; isMe: boolean }) {
  return (
    <div className={[
      'rounded-lg border p-3 flex flex-col gap-2',
      isMe ? 'border-sky-800 bg-sky-950/20' : 'border-zinc-800 bg-zinc-900',
    ].join(' ')}>
      <div className="flex items-center justify-between gap-3">
        <AssigneeChip user={comment.author} isMe={isMe} />
        <span className="font-mono text-[10px] text-zinc-600">{formatDate(comment.created)}</span>
      </div>
      <div className="text-sm text-zinc-400 leading-relaxed">
        <AdfNodeRenderer node={comment.body} />
      </div>
    </div>
  );
}

// ── Hours / TEMPO tab ────────────────────────────────────────────────────────

function formatWorklogDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(year, month - 1, day));
  } catch {
    return dateStr;
  }
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function HoursTab({
  issueKey,
  issueId,
  currentUserAccountId,
  originalEstimateSeconds,
  projectId,
}: {
  issueKey: string;
  issueId: string;
  currentUserAccountId?: string;
  originalEstimateSeconds?: number | null;
  projectId?: string;
}) {
  const { config } = useConfig();
  const defaultDescription = config.tempo?.defaultDescription ?? '';

  const [worklogs, setWorklogs]         = useState<TempoWorklog[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [timeSeconds, setTimeSeconds]   = useState(3600);
  const [date, setDate]                 = useState(() => new Date().toISOString().split('T')[0]);
  const [description, setDescription]  = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [submitError, setSubmitError]   = useState<string | null>(null);
  const [deletingId, setDeletingId]             = useState<number | null>(null);
  const [deleteError, setDeleteError]           = useState<string | null>(null);
  const [editingId, setEditingId]               = useState<number | null>(null);
  const [editTimeSeconds, setEditTimeSeconds]   = useState(3600);
  const [editDate, setEditDate]                 = useState('');
  const [editDesc, setEditDesc]                 = useState('');
  const [editSaving, setEditSaving]             = useState(false);
  const [editError, setEditError]               = useState<string | null>(null);

  const fetchWorklogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/tempo/worklogs?issueId=${encodeURIComponent(issueId)}`);
      if (!r.ok) {
        let msg = `HTTP ${r.status}`;
        try { msg = ((await r.json()) as { error?: string }).error ?? msg; } catch {}
        throw new Error(msg);
      }
      let data: { results?: TempoWorklog[] };
      try { data = await r.json() as { results?: TempoWorklog[] }; }
      catch { throw new Error('Server returned HTML instead of JSON — install the latest build of the app'); }
      setWorklogs(data.results ?? []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [issueId]);

  useEffect(() => { fetchWorklogs(); }, [fetchWorklogs]);

  const adjustTime = (deltaSeconds: number) => {
    setTimeSeconds((t) => Math.max(0, t + deltaSeconds));
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    if (timeSeconds < 60) { setSubmitError('Select at least 1 minute'); return; }
    if (!currentUserAccountId) { setSubmitError('Jira account not found — check General Settings'); return; }

    setSubmitting(true);
    try {
      const r = await fetch('/api/tempo/worklogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId: parseInt(issueId, 10),
          authorAccountId: currentUserAccountId,
          timeSpentSeconds: timeSeconds,
          startDate: date,
          description: description.trim() || defaultDescription,
        }),
      });
      if (!r.ok) {
        let msg = `HTTP ${r.status}`;
        try { msg = ((await r.json()) as { error?: string }).error ?? msg; } catch {}
        throw new Error(msg);
      }
      setTimeSeconds(3600);
      setDescription('');
      fetchWorklogs();
    } catch (err) {
      setSubmitError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeleteError(null);
    setDeletingId(id);
    try {
      const r = await fetch(`/api/tempo/worklogs/${id}`, { method: 'DELETE' });
      if (!r.ok) {
        let msg = `HTTP ${r.status}`;
        try { msg = ((await r.json()) as { error?: string }).error ?? msg; } catch {}
        throw new Error(msg);
      }
      fetchWorklogs();
    } catch (err) {
      setDeleteError(String(err));
    } finally {
      setDeletingId(null);
    }
  };

  const startEdit = (w: TempoWorklog) => {
    setEditingId(w.tempoWorklogId);
    setEditTimeSeconds(w.timeSpentSeconds);
    setEditDate(w.startDate);
    setEditDesc(w.description ?? '');
    setEditError(null);
  };

  const handleEditSave = async (w: TempoWorklog) => {
    setEditError(null);
    if (editTimeSeconds < 60) { setEditError('Select at least 1 minute'); return; }
    if (!currentUserAccountId) { setEditError('Jira account not found — check General Settings'); return; }
    setEditSaving(true);
    try {
      const r = await fetch(`/api/tempo/worklogs/${w.tempoWorklogId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId:          w.issueId,
          authorAccountId:  currentUserAccountId,
          timeSpentSeconds: editTimeSeconds,
          startDate:        editDate,
          description:      editDesc.trim() || defaultDescription,
        }),
      });
      if (!r.ok) {
        let msg = `HTTP ${r.status}`;
        try { msg = ((await r.json()) as { error?: string }).error ?? msg; } catch {}
        throw new Error(msg);
      }
      setEditingId(null);
      fetchWorklogs();
    } catch (err) {
      setEditError(String(err));
    } finally {
      setEditSaving(false);
    }
  };

  const totalSeconds = worklogs.reduce((sum, w) => sum + w.timeSpentSeconds, 0);
  const sortedWorklogs = [...worklogs].sort((a, b) => b.startDate.localeCompare(a.startDate));

  return (
    <div className="px-6 py-6 flex flex-col gap-6 max-w-5xl mx-auto">

      {/* ── Log Time form ─────────────────────────────── */}
      <div className="flex flex-col gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-4 max-w-xl">
        <h2 className="font-mono text-xs font-medium text-zinc-400 uppercase tracking-widest">Log Time</h2>

        {/* Time display */}
        <div className="text-center font-mono text-3xl font-bold text-zinc-100 py-1">
          {timeSeconds < 60 ? <span className="text-zinc-600">0m</span> : formatDuration(timeSeconds)}
        </div>

        {/* Adjustment buttons */}
        <div className="grid grid-cols-4 gap-2">
          {([[-3600, '−1h'], [-900, '−15m'], [900, '+15m'], [3600, '+1h']] as const).map(([delta, label]) => (
            <button
              key={label}
              onClick={() => adjustTime(delta)}
              className="btn-secondary text-xs py-2"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Date picker */}
        <div className="flex items-center gap-3">
          <label className="font-mono text-xs text-zinc-400 w-20 shrink-0">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input flex-1"
          />
        </div>

        {/* Description */}
        <div className="flex items-center gap-3">
          <label className="font-mono text-xs text-zinc-400 w-20 shrink-0">Note</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={defaultDescription || 'Description…'}
            className="input flex-1"
          />
        </div>

        {submitError && <p className="font-mono text-xs text-red-400">{submitError}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting || timeSeconds < 60}
          className="btn-primary"
        >
          {submitting ? 'Logging…' : 'Submit'}
        </button>
      </div>

      {/* ── Logged worklogs ───────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-xs font-medium text-zinc-400 uppercase tracking-widest">
            Logged Hours
          </h2>
          <div className="flex items-center gap-3">
            {originalEstimateSeconds != null && originalEstimateSeconds > 0 && (
              <span className="font-mono text-xs text-zinc-500">
                Est: {formatDuration(originalEstimateSeconds)}
              </span>
            )}
            {!loading && worklogs.length > 0 && (
              <span className="font-mono text-xs text-zinc-500">
                Total: {formatDuration(totalSeconds)}
              </span>
            )}
          </div>
        </div>

        {loading && <p className="font-mono text-xs text-zinc-500">Loading…</p>}

        {!loading && error && (
          <div className="bg-zinc-900 border border-red-900 rounded-lg p-3">
            <p className="font-mono text-xs text-red-400">{error}</p>
          </div>
        )}

        {!loading && !error && worklogs.length === 0 && (
          <p className="font-mono text-xs text-zinc-600">No hours logged yet.</p>
        )}

        {deleteError && <p className="font-mono text-xs text-red-400">{deleteError}</p>}
        {editError && <p className="font-mono text-xs text-red-400">{editError}</p>}

        {!loading && !error && sortedWorklogs.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {sortedWorklogs.map((w) => {
              if (editingId === w.tempoWorklogId) {
                return (
                  <div key={w.tempoWorklogId} className="flex flex-col gap-2 bg-zinc-900 border border-blue-800 rounded-lg px-3 py-3">
                    <div className="flex flex-col gap-1">
                      <div className="text-center font-mono text-2xl font-bold text-zinc-100">
                        {editTimeSeconds < 60 ? <span className="text-zinc-600">0m</span> : formatDuration(editTimeSeconds)}
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {([[-3600, '−1h'], [-900, '−15m'], [900, '+15m'], [3600, '+1h']] as const).map(([delta, label]) => (
                          <button key={label} onClick={() => setEditTimeSeconds((t) => Math.max(0, t + delta))} className="btn-secondary text-xs py-1.5">{label}</button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="font-mono text-xs text-zinc-500 w-16 shrink-0">Date</label>
                      <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="input flex-1" />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="font-mono text-xs text-zinc-500 w-16 shrink-0">Note</label>
                      <input type="text" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder={defaultDescription || 'Description…'} className="input flex-1" />
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleEditSave(w)} disabled={editSaving || editTimeSeconds < 60} className="btn-primary text-xs px-3 py-1.5">{editSaving ? 'Saving…' : 'Save'}</button>
                      <button onClick={() => setEditingId(null)} disabled={editSaving} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={w.tempoWorklogId}
                  className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2"
                >
                  <span className="font-mono text-xs text-zinc-500 shrink-0 w-24">
                    {formatWorklogDate(w.startDate)}
                  </span>
                  <span className="font-mono text-sm font-semibold text-zinc-100 w-16 shrink-0">
                    {formatDuration(w.timeSpentSeconds)}
                  </span>
                  <span className="w-fit shrink-0 overflow-visible">
                    <WorklogAuthor
                      accountId={w.author.accountId}
                      tempoDisplayName={w.author.displayName}
                      projectId={projectId}
                    />
                  </span>
                  {w.description && (
                    <span className="font-mono text-xs text-zinc-600 truncate flex-1 italic">
                      {w.description}
                    </span>
                  )}
                  <button
                    onClick={() => startEdit(w)}
                    className="btn-secondary px-2 py-0.5 text-xs shrink-0 ml-auto"
                    title="Edit worklog"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(w.tempoWorklogId)}
                    disabled={deletingId === w.tempoWorklogId}
                    className="btn-danger px-2 py-0.5 text-xs shrink-0"
                    title="Delete worklog"
                  >
                    {deletingId === w.tempoWorklogId ? '…' : 'Delete'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main view ────────────────────────────────────────────────────────────────

export function JiraTicketDetailView() {
  const { selectedJiraIssueKey, selectedProjectId, navigateBack } = useView();
  const { config } = useConfig();

  const [issue, setIssue]         = useState<JiraIssue | null>(null);
  const [currentUser, setCurrentUser] = useState<JiraUser | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'hours'>('details');

  const project = config.projects.find((p) => p.id === selectedProjectId);

  // Escape key navigates back
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') navigateBack(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigateBack]);

  const fetchData = useCallback(() => {
    if (!selectedJiraIssueKey || !selectedProjectId) return;
    setLoading(true);
    setError(null);

    const pid = encodeURIComponent(selectedProjectId);
    const key = encodeURIComponent(selectedJiraIssueKey);

    Promise.all([
      fetch(`/api/jira/issue/${key}?projectId=${pid}`).then(async (r) => {
        if (!r.ok) {
          let msg = `HTTP ${r.status}`;
          try { msg = ((await r.json()) as { error?: string }).error ?? msg; } catch {}
          throw new Error(msg);
        }
        const data = await r.json() as { issue?: JiraIssue; error?: string };
        if (data.error) throw new Error(data.error);
        return data.issue ?? null;
      }),
      fetch(`/api/jira/me?projectId=${pid}`)
        .then((r) => (r.ok ? r.json() as Promise<JiraUser> : null))
        .catch(() => null),
    ])
      .then(([fetchedIssue, me]) => {
        setIssue(fetchedIssue);
        setCurrentUser(me);
      })
      .catch((err: unknown) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [selectedJiraIssueKey, selectedProjectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const baseUrl   = config.jira?.baseUrl?.replace(/\/+$/, '') ?? '';
  const jiraHref  = selectedJiraIssueKey ? `${baseUrl}/browse/${selectedJiraIssueKey}` : '#';
  const isMe      = (user: JiraUser | null) =>
    !!currentUser && !!user && user.accountId === currentUser.accountId;

  const f = issue?.fields;
  const catKey = f?.status.statusCategory?.key ?? '';
  const comments = f?.comment?.comments ?? [];

  return (
    <AdfCtx.Provider value={{ projectId: selectedProjectId ?? undefined, attachments: f?.attachment ?? [] }}>
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto">

        {/* ── Header ──────────────────────────────────────── */}
        <div className="border-b border-zinc-800 px-6 pt-5 pb-0">
          <button
            onClick={navigateBack}
            className="flex items-center gap-1.5 text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors mb-4"
          >
            ← Back to project
          </button>

          {loading && (
            <p className="font-mono text-xs text-zinc-500">Loading issue…</p>
          )}

          {!loading && error && (
            <div className="bg-zinc-900 border border-red-900 rounded-lg p-3">
              <p className="font-mono text-xs text-red-400">{error}</p>
            </div>
          )}

          {!loading && !error && issue && (
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs text-zinc-500">{issue.key}</span>
                  {f?.issuetype?.name && (
                    <span className="font-mono text-[10px] text-zinc-500 border border-zinc-700 px-1.5 py-0.5 rounded">
                      {f.issuetype.name}
                    </span>
                  )}
                </div>
                <h1 className="font-mono font-semibold text-zinc-100 text-lg leading-snug">
                  {f?.summary}
                </h1>
              </div>
              <div className="flex items-center gap-2 shrink-0 mt-1">
                <span className={['font-mono text-[10px] px-1.5 py-0.5 rounded border', statusColor(catKey)].join(' ')}>
                  {f?.status.name}
                </span>
                <a
                  href={jiraHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary text-xs"
                >
                  ↗ Open in Jira
                </a>
              </div>
            </div>
          )}

          {/* ── Tab bar ────────────────────────────────── */}
          {!loading && !error && issue && (
            <div className="flex mt-4">
              {(['details', 'hours'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={[
                    'font-mono text-xs px-4 py-2 border-b-2 -mb-px transition-colors capitalize',
                    activeTab === tab
                      ? 'border-blue-500 text-zinc-100'
                      : 'border-transparent text-zinc-500 hover:text-zinc-300',
                  ].join(' ')}
                >
                  {tab}
                </button>
              ))}
            </div>
          )}
        </div>

        {!loading && !error && issue && (
          activeTab === 'details' ? (
          <div className="px-6 py-6 flex flex-col gap-6">

            {/* ── Meta grid ─────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetaCard label="Assignee">
                {f?.assignee ? (
                  <AssigneeChip user={f.assignee} isMe={isMe(f.assignee)} />
                ) : (
                  <span className="font-mono text-xs text-zinc-600">Unassigned</span>
                )}
              </MetaCard>

              <MetaCard label="Reporter">
                {f?.reporter ? (
                  <AssigneeChip user={f.reporter} isMe={isMe(f.reporter)} />
                ) : (
                  <span className="font-mono text-xs text-zinc-600">—</span>
                )}
              </MetaCard>

              <MetaCard label="Priority">
                <span className={['font-mono text-xs', priorityColor(f?.priority?.name)].join(' ')}>
                  {f?.priority?.name ?? '—'}
                </span>
              </MetaCard>

              <MetaCard label="Updated">
                <span className="font-mono text-xs text-zinc-300">
                  {f?.updated ? formatDate(f.updated) : '—'}
                </span>
              </MetaCard>
            </div>

            {/* ── Labels ────────────────────────────────── */}
            {f?.labels && f.labels.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <h2 className="font-mono text-xs font-medium text-zinc-400 uppercase tracking-widest">Labels</h2>
                <div className="flex flex-wrap gap-1.5">
                  {f.labels.map((label) => (
                    <span key={label} className="font-mono text-[10px] px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── Description ───────────────────────────── */}
            <div className="flex flex-col gap-2">
              <h2 className="font-mono text-xs font-medium text-zinc-400 uppercase tracking-widest">Description</h2>
              {f?.description ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                  <AdfNodeRenderer node={f.description} />
                </div>
              ) : (
                <p className="font-mono text-xs text-zinc-600">No description.</p>
              )}
            </div>

            {/* ── Comments ──────────────────────────────── */}
            {comments.length > 0 && (
              <div className="flex flex-col gap-2">
                <h2 className="font-mono text-xs font-medium text-zinc-400 uppercase tracking-widest">
                  Comments ({comments.length})
                </h2>
                <div className="flex flex-col gap-2">
                  {[...comments].reverse().map((comment) => (
                    <CommentCard key={comment.id} comment={comment} isMe={isMe(comment.author)} />
                  ))}
                </div>
              </div>
            )}

          </div>
          ) : (
            <HoursTab
              issueKey={selectedJiraIssueKey!}
              issueId={issue.id}
              currentUserAccountId={currentUser?.accountId}
              originalEstimateSeconds={f?.timeoriginalestimate}
              projectId={selectedProjectId ?? undefined}
            />
          )
        )}

      </div>
    </div>
    </AdfCtx.Provider>
  );
}

function MetaCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex flex-col gap-1">
      <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">{label}</span>
      {children}
    </div>
  );
}
