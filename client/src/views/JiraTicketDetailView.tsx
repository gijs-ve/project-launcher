import { useState, useEffect, useCallback } from 'react';
import { useView } from '../context/ViewContext';
import { useConfig } from '../context/ConfigContext';
import { JiraIssue, JiraUser, JiraComment, AdfNode } from '../types';

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
        <span className={[
          'font-mono text-xs font-semibold',
          isMe ? 'text-sky-400' : 'text-zinc-300',
        ].join(' ')}>
          {isMe && '● '}{comment.author.displayName}
        </span>
        <span className="font-mono text-[10px] text-zinc-600">{formatDate(comment.created)}</span>
      </div>
      <div className="text-sm text-zinc-400 leading-relaxed">
        <AdfNodeRenderer node={comment.body} />
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
        const data = await r.json() as { issue?: JiraIssue; error?: string };
        if (!r.ok || data.error) throw new Error(data.error ?? `HTTP ${r.status}`);
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
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto">

        {/* ── Header ──────────────────────────────────────── */}
        <div className="border-b border-zinc-800 px-6 pt-5 pb-4">
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
        </div>

        {!loading && !error && issue && (
          <div className="px-6 py-6 flex flex-col gap-6">

            {/* ── Meta grid ─────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetaCard label="Assignee">
                {f?.assignee ? (
                  <span className={[
                    'font-mono text-xs',
                    isMe(f.assignee) ? 'text-sky-400 font-semibold' : 'text-zinc-200',
                  ].join(' ')}>
                    {isMe(f.assignee) && '● '}{f.assignee.displayName}
                  </span>
                ) : (
                  <span className="font-mono text-xs text-zinc-600">Unassigned</span>
                )}
              </MetaCard>

              <MetaCard label="Reporter">
                {f?.reporter ? (
                  <span className={[
                    'font-mono text-xs',
                    isMe(f.reporter) ? 'text-sky-400 font-semibold' : 'text-zinc-200',
                  ].join(' ')}>
                    {isMe(f.reporter) && '● '}{f.reporter.displayName}
                  </span>
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
        )}

      </div>
    </div>
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
