import { useState, useEffect, useCallback, useRef } from 'react';
import { useConfig } from '../context/ConfigContext';
import { TempoWorklog } from '../types';
import { WorklogAuthor } from '../components/WorklogAuthor';
import { TicketKeyChip } from '../components/TicketKeyChip';
import { QuickLogDropdown } from '../components/QuickLogDropdown';

// ── Date helpers ─────────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return dt;
}

function addDays(d: Date, n: number): Date {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt;
}

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDayHeader(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month:   'short',
    day:     'numeric',
  }).format(new Date(year, month - 1, day));
}

function formatWeekRange(from: Date, to: Date): string {
  const fromStr = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(from);
  const toStr   = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(to);
  return `${fromStr} – ${toStr}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface JiraSearchResult {
  id: string;
  key: string;
  fields: { summary: string };
}

interface TempoTeam {
  id: number;
  name: string;
}

// ── HoursView ────────────────────────────────────────────────────────────────

export function HoursView() {
  const { config, saveConfig } = useConfig();

  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const weekEnd = addDays(weekStart, 6);

  const [worklogs, setWorklogs]         = useState<TempoWorklog[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [currentUserAccountId, setCurrentUserAccountId] = useState<string | undefined>();

  // ── Teams ──
  const [teams, setTeams]             = useState<TempoTeam[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [activeTab, setActiveTab]     = useState<'me' | number>('me');

  // ── Add-entry form ──
  const [showAddForm, setShowAddForm]   = useState(false);
  const [addDate, setAddDate]           = useState(() => toDateString(new Date()));
  const [addTimeSeconds, setAddTimeSeconds] = useState(3600);
  const [addDescription, setAddDescription] = useState(config.tempo?.defaultDescription ?? '');
  const [submitting, setSubmitting]     = useState(false);
  const [submitError, setSubmitError]   = useState<string | null>(null);

  // Ticket search
  const [ticketQuery, setTicketQuery]       = useState('');
  const [ticketResults, setTicketResults]   = useState<JiraSearchResult[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<JiraSearchResult | null>(null);
  const [searchLoading, setSearchLoading]   = useState(false);
  const [showDropdown, setShowDropdown]     = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Delete
  const [deletingId, setDeletingId]   = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Fetch current Jira user once ──────────────────────────────────────────
  useEffect(() => {
    fetch('/api/jira/me')
      .then((r) => (r.ok ? (r.json() as Promise<{ accountId: string }>) : null))
      .then((data) => { if (data) setCurrentUserAccountId(data.accountId); })
      .catch(() => {});
  }, []);

  // ── Fetch teams once ─────────────────────────────────────────────────────
  useEffect(() => {
    setTeamsLoading(true);
    fetch('/api/tempo/my-teams')
      .then((r) => (r.ok ? (r.json() as Promise<{ teams?: TempoTeam[] }>) : null))
      .then((data) => { if (data) setTeams(data.teams ?? []); })
      .catch(() => {})
      .finally(() => setTeamsLoading(false));
  }, []);

  // ── Fetch worklogs for the selected week ─────────────────────────────────
  const fetchWorklogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from = toDateString(weekStart);
      const to   = toDateString(weekEnd);
      const url = activeTab === 'me'
        ? `/api/tempo/my-worklogs?from=${from}&to=${to}`
        : `/api/tempo/team-worklogs?teamId=${activeTab}&from=${from}&to=${to}`;
      const r = await fetch(url);
      if (!r.ok) {
        let msg = `HTTP ${r.status}`;
        try { msg = ((await r.json()) as { error?: string }).error ?? msg; } catch {}
        throw new Error(msg);
      }
      const data = await r.json() as { results?: TempoWorklog[] };
      setWorklogs(data.results ?? []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [weekStart, activeTab]);

  useEffect(() => { fetchWorklogs(); }, [fetchWorklogs]);

  // ── Ticket search (debounced) ─────────────────────────────────────────────
  useEffect(() => {
    if (!ticketQuery.trim() || selectedTicket) {
      setTicketResults([]);
      setShowDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const r = await fetch(`/api/jira/search?q=${encodeURIComponent(ticketQuery.trim())}&maxResults=8`);
        if (r.ok) {
          const data = await r.json() as { issues?: JiraSearchResult[] };
          setTicketResults(data.issues ?? []);
          setShowDropdown((data.issues ?? []).length > 0);
        }
      } catch { /* silently ignore */ }
      finally { setSearchLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [ticketQuery, selectedTicket]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const adjustTime = (delta: number) =>
    setAddTimeSeconds((t) => Math.max(0, t + delta));

  const handleSubmit = async () => {
    setSubmitError(null);
    if (!selectedTicket)        { setSubmitError('Select a ticket'); return; }
    if (addTimeSeconds < 60)    { setSubmitError('Select at least 1 minute'); return; }
    if (!currentUserAccountId)  { setSubmitError('Jira account not found — check General Settings'); return; }

    const descToSend = addDescription.trim() || (config.tempo?.defaultDescription ?? '');
    if (!descToSend) { setSubmitError('Description is required by Tempo — add a default in Settings → Tempo or enter one here'); return; }

    setSubmitting(true);
    try {
      const r = await fetch('/api/tempo/worklogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId:          parseInt(selectedTicket.id, 10),
          authorAccountId:  currentUserAccountId,
          timeSpentSeconds: addTimeSeconds,
          startDate:        addDate,
          description:      descToSend,
        }),
      });
      if (!r.ok) {
        let msg = `HTTP ${r.status}`;
        try { msg = ((await r.json()) as { error?: string }).error ?? msg; } catch {}
        throw new Error(msg);
      }
      // Reset form, keep date + description for quick repeat logging
      setSelectedTicket(null);
      setTicketQuery('');
      setAddTimeSeconds(3600);
      setShowAddForm(false);
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

  // ── Group worklogs by day (newest first) ─────────────────────────────────
  const dayMap = new Map<string, TempoWorklog[]>();
  for (const w of worklogs) {
    dayMap.set(w.startDate, [...(dayMap.get(w.startDate) ?? []), w]);
  }
  const days = [...dayMap.entries()].sort(([a], [b]) => b.localeCompare(a));
  const weekTotal = worklogs.reduce((s, w) => s + w.timeSpentSeconds, 0);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 flex flex-col gap-6">

        {/* ── Tab strip ──────────────────────────────────────────── */}
        {(teams.length > 0 || teamsLoading) && (
          <div className="flex items-center gap-1 flex-wrap">
            {/* Me tab */}
            <button
              onClick={() => setActiveTab('me')}
              className={[
                'font-mono text-xs px-3 py-1.5 rounded border transition-colors',
                activeTab === 'me'
                  ? 'bg-zinc-700 text-zinc-100 border-zinc-600'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border-transparent',
              ].join(' ')}
            >
              Me
            </button>
            {teams.map((team) => (
              <button
                key={team.id}
                onClick={() => setActiveTab(team.id)}
                className={[
                  'font-mono text-xs px-3 py-1.5 rounded border transition-colors',
                  activeTab === team.id
                    ? 'bg-zinc-700 text-zinc-100 border-zinc-600'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border-transparent',
                ].join(' ')}
              >
                {team.name}
              </button>
            ))}
            {teamsLoading && (
              <span className="font-mono text-[10px] text-zinc-600 self-center">loading teams…</span>
            )}
          </div>
        )}

        {/* ── Week navigation ─────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekStart((d) => addDays(d, -7))}
              className="btn-secondary text-xs px-3 py-1.5"
            >
              ← Prev
            </button>
            <span className="font-mono text-sm text-zinc-300">
              {formatWeekRange(weekStart, weekEnd)}
            </span>
            <button
              onClick={() => setWeekStart((d) => addDays(d, 7))}
              className="btn-secondary text-xs px-3 py-1.5"
            >
              Next →
            </button>
            <button
              onClick={() => setWeekStart(getMonday(new Date()))}
              className="btn-secondary text-xs px-3 py-1.5"
            >
              Today
            </button>
          </div>
          <div className="flex items-center gap-4">
            {!loading && weekTotal > 0 && (
              <span className="font-mono text-xs text-zinc-500">
                Week: {formatDuration(weekTotal)}
              </span>
            )}
            <button
              onClick={() => {
                setShowAddForm((v) => !v);
                setSubmitError(null);
              }}
              className={showAddForm ? 'btn-secondary text-xs' : 'btn-primary text-xs'}
            >
              {showAddForm ? '× Close' : '+ Log Time'}
            </button>
            <QuickLogDropdown
              currentUserAccountId={currentUserAccountId}
              onLogged={fetchWorklogs}
            />
          </div>
        </div>

        {/* ── Log-time form ───────────────────────────────────────── */}
        {showAddForm && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-4">
            <h2 className="font-mono text-xs font-medium text-zinc-400 uppercase tracking-widest">Log Time</h2>

            {/* Ticket search */}
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-xs text-zinc-500">Ticket</label>
              <div ref={searchRef} className="relative">
                {selectedTicket ? (
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 font-mono text-sm text-zinc-100 flex-1 min-w-0">
                      <span className="text-zinc-400 shrink-0">{selectedTicket.key}</span>
                      <span className="truncate text-zinc-300">{selectedTicket.fields.summary}</span>
                    </span>
                    <button
                      onClick={() => { setSelectedTicket(null); setTicketQuery(''); }}
                      className="btn-secondary text-xs px-2 py-2 shrink-0"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={ticketQuery}
                    onChange={(e) => { setTicketQuery(e.target.value); setShowDropdown(false); }}
                    placeholder="Search by ticket key or summary…"
                    className="input w-full"
                    autoFocus
                  />
                )}

                {showDropdown && ticketResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden max-h-48 overflow-y-auto">
                    {ticketResults.map((issue) => (
                      <button
                        key={issue.id}
                        type="button"
                        className="w-full text-left px-3 py-2 font-mono text-xs hover:bg-zinc-700 transition-colors flex items-center gap-2"
                        onClick={() => {
                          setSelectedTicket(issue);
                          setTicketQuery('');
                          setShowDropdown(false);
                        }}
                      >
                        <span className="text-zinc-400 shrink-0 w-20 truncate">{issue.key}</span>
                        <span className="text-zinc-300 truncate">{issue.fields.summary}</span>
                      </button>
                    ))}
                  </div>
                )}
                {searchLoading && (
                  <p className="font-mono text-[10px] text-zinc-600 mt-1">Searching…</p>
                )}
              </div>
            </div>

            {/* Date */}
            <div className="flex items-center gap-3">
              <label className="font-mono text-xs text-zinc-500 w-20 shrink-0">Date</label>
              <input
                type="date"
                value={addDate}
                onChange={(e) => setAddDate(e.target.value)}
                className="input max-w-xs"
              />
            </div>

            {/* Time adjuster */}
            <div className="flex flex-col gap-2">
              <div className="text-center font-mono text-3xl font-bold text-zinc-100 py-1">
                {addTimeSeconds < 60
                  ? <span className="text-zinc-600">0m</span>
                  : formatDuration(addTimeSeconds)}
              </div>
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
            </div>

            {/* Description */}
            <div className="flex items-center gap-3">
              <label className="font-mono text-xs text-zinc-500 w-20 shrink-0">Note</label>
              <input
                type="text"
                value={addDescription}
                onChange={(e) => setAddDescription(e.target.value)}
                placeholder={config.tempo?.defaultDescription ?? 'Description (required by Tempo)…'}
                className="input flex-1"
              />
            </div>

            {submitError && <p className="font-mono text-xs text-red-400">{submitError}</p>}

            <button
              onClick={handleSubmit}
              disabled={submitting || addTimeSeconds < 60 || !selectedTicket}
              className="btn-primary self-start"
            >
              {submitting ? 'Logging…' : 'Submit'}
            </button>
          </div>
        )}

        {/* ── Status ──────────────────────────────────────────────── */}
        {loading && <p className="font-mono text-xs text-zinc-500">Loading…</p>}

        {!loading && error && (
          <div className="bg-zinc-900 border border-red-900 rounded-lg p-3">
            <p className="font-mono text-xs text-red-400">{error}</p>
          </div>
        )}

        {deleteError && <p className="font-mono text-xs text-red-400">{deleteError}</p>}

        {!loading && !error && days.length === 0 && (
          <p className="font-mono text-xs text-zinc-600">No hours logged this week.</p>
        )}

        {/* ── Day-by-day breakdown ─────────────────────────────────── */}
        {!loading && !error && days.map(([dateStr, entries]) => {
          const dayTotal = entries.reduce((s, w) => s + w.timeSpentSeconds, 0);
          const sorted   = [...entries].sort((a, b) => a.tempoWorklogId - b.tempoWorklogId);

          return (
            <div key={dateStr} className="flex flex-col gap-2">
              {/* Day header */}
              <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                <span className="font-mono text-xs font-semibold text-zinc-300">
                  {formatDayHeader(dateStr)}
                </span>
                <span className="font-mono text-xs text-zinc-500">
                  {formatDuration(dayTotal)}
                </span>
              </div>

              {/* Entry rows */}
              <div className="flex flex-col gap-1.5">
                {sorted.map((w) => (
                  <div
                    key={w.tempoWorklogId}
                    className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2"
                  >
                    {/* Duration */}
                    <span className="font-mono text-sm font-semibold text-zinc-100 w-16 shrink-0">
                      {formatDuration(w.timeSpentSeconds)}
                    </span>

                    {/* Ticket key */}
                    <span className="shrink-0 w-24 overflow-visible">
                      {w.issueKey
                        ? <TicketKeyChip issueKey={w.issueKey} issueId={w.issueId} />
                        : <span className="font-mono text-xs text-zinc-600">{`#${w.issueId}`}</span>
                      }
                    </span>

                    {/* Description */}
                    {w.description ? (
                      <span className="font-mono text-xs text-zinc-600 truncate flex-1 italic">
                        {w.description}
                      </span>
                    ) : (
                      <span className="flex-1" />
                    )}

                    {/* Author */}
                    <span className="shrink-0 w-28 overflow-visible">
                      <WorklogAuthor
                        accountId={w.author.accountId}
                        tempoDisplayName={w.author.displayName}
                      />
                    </span>

                    {/* Delete — only for own entries */}
                    {w.author.accountId === currentUserAccountId && (
                      <button
                        onClick={() => handleDelete(w.tempoWorklogId)}
                        disabled={deletingId === w.tempoWorklogId}
                        className="btn-danger px-2 py-0.5 text-xs shrink-0 ml-auto"
                        title="Delete worklog"
                      >
                        {deletingId === w.tempoWorklogId ? '…' : '×'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

      </div>
    </div>
  );
}
