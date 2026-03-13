import { useState } from 'react';
import { useConfig } from '../context/ConfigContext';
import { JiraUser } from '../types';
import { AssigneeChip } from './AssigneeChip';

interface Props {
  accountId: string;
  /** Display name as returned by TEMPO (may be absent). */
  tempoDisplayName?: string;
  /** Jira projectId for scoped user lookup (optional). */
  projectId?: string;
}

/**
 * Renders the author of a Tempo worklog entry.
 *
 * Resolution order:
 *   1. Result of on-demand Jira user lookup (triggers AssigneeChip with "Add to settings")
 *   2. Saved assignee from settings
 *   3. TEMPO's own displayName (also triggers AssigneeChip)
 *   4. Truncated accountId with a "lookup" button for unknown users
 */
export function WorklogAuthor({ accountId, tempoDisplayName, projectId }: Props) {
  const { config } = useConfig();
  const [fetching, setFetching]       = useState(false);
  const [fetchedUser, setFetchedUser] = useState<JiraUser | null>(null);
  const [fetchError, setFetchError]   = useState<string | null>(null);

  const savedMatch = (config.jira?.savedAssignees ?? []).find(
    (u) => u.accountId === accountId,
  );
  const resolvedUser: JiraUser | null =
    fetchedUser ??
    savedMatch ??
    (tempoDisplayName ? { accountId, displayName: tempoDisplayName } : null);

  if (resolvedUser) {
    return <AssigneeChip user={resolvedUser} size="text-xs" />;
  }

  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      <span className="font-mono text-xs text-zinc-600 truncate" title={accountId}>
        {accountId.length > 10 ? `${accountId.slice(0, 10)}…` : accountId}
      </span>
      {!fetching && !fetchError && (
        <button
          onClick={async () => {
            setFetching(true);
            try {
              const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
              const r = await fetch(`/api/jira/user/${encodeURIComponent(accountId)}${qs}`);
              const data = await r.json() as {
                accountId?: string;
                displayName?: string;
                emailAddress?: string;
                error?: string;
              };
              if (!r.ok || data.error) throw new Error(data.error ?? `HTTP ${r.status}`);
              setFetchedUser({
                accountId: data.accountId!,
                displayName: data.displayName!,
                emailAddress: data.emailAddress,
              });
            } catch (err) {
              setFetchError(String(err));
            } finally {
              setFetching(false);
            }
          }}
          className="font-mono text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors shrink-0"
          title="Look up name from Jira"
        >
          lookup
        </button>
      )}
      {fetching && <span className="font-mono text-[10px] text-zinc-600">…</span>}
      {fetchError && (
        <span className="font-mono text-[10px] text-red-500 shrink-0" title={fetchError}>!</span>
      )}
    </span>
  );
}
