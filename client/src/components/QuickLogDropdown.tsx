import { useState, useEffect, useRef } from 'react';
import { useConfig } from '../context/ConfigContext';
import { useView } from '../context/ViewContext';
import { TempoFavorite } from '../types';

interface Props {
  currentUserAccountId: string | undefined;
  /** Called after a worklog is successfully created so the list can refresh. */
  onLogged: () => void;
}

function formatMins(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * A "Quick log ▾" dropdown button that one-click-logs time to favourite tickets.
 * Favourites are configured in Settings → Quick Log.
 */
export function QuickLogDropdown({ currentUserAccountId, onLogged }: Props) {
  const { config, saveConfig } = useConfig();
  const { setActiveView, setSettingsTab } = useView();

  const [open, setOpen]           = useState(false);
  const [loggingId, setLoggingId] = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const favorites: TempoFavorite[] = config.tempo?.favorites ?? [];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setError(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setError(null); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const handleLog = async (fav: TempoFavorite) => {
    if (!currentUserAccountId) {
      setError('Jira account not found — check General Settings');
      return;
    }
    setError(null);
    setLoggingId(fav.id);
    try {
      // Resolve issueId if not yet cached
      let issueId = fav.ticketId;
      if (!issueId) {
        const r = await fetch(`/api/jira/issue-id/${encodeURIComponent(fav.ticketKey)}`);
        if (!r.ok) {
          let msg = `HTTP ${r.status}`;
          try { msg = ((await r.json()) as { error?: string }).error ?? msg; } catch {}
          throw new Error(`Could not resolve ${fav.ticketKey}: ${msg}`);
        }
        const data = await r.json() as { id: number };
        issueId = data.id;
        // Persist the resolved ID so future clicks skip the API call
        const updated = favorites.map((f) =>
          f.id === fav.id ? { ...f, ticketId: issueId } : f
        );
        await saveConfig({ ...config, tempo: { ...config.tempo!, favorites: updated } });
      }

      const r = await fetch('/api/tempo/worklogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId,
          authorAccountId:  currentUserAccountId,
          timeSpentSeconds: fav.minutes * 60,
          startDate:        todayString(),
          description:      config.tempo?.defaultDescription ?? fav.label,
        }),
      });
      if (!r.ok) {
        let msg = `HTTP ${r.status}`;
        try { msg = ((await r.json()) as { error?: string }).error ?? msg; } catch {}
        throw new Error(msg);
      }
      setOpen(false);
      onLogged();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoggingId(null);
    }
  };

  const goToSettings = () => {
    setOpen(false);
    setActiveView('settings');
    setSettingsTab('tempo');
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen((v) => !v); setError(null); }}
        className="btn-secondary text-xs flex items-center gap-1.5"
      >
        Quick log
        <span className="text-zinc-500 text-[10px]">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden flex flex-col" style={{ minWidth: '18rem' }}>

          {error && (
            <p className="font-mono text-[10px] text-red-400 px-3 py-2 border-b border-zinc-800">{error}</p>
          )}

          {favorites.length === 0 ? (
            <p className="font-mono text-[10px] text-zinc-500 px-3 py-3 text-center leading-relaxed">
              No favorites yet.<br />
              Click any ticket key to add one.
            </p>
          ) : (
            <div className="flex flex-col">
              {favorites.map((fav) => (
                <button
                  key={fav.id}
                  onClick={() => handleLog(fav)}
                  disabled={loggingId !== null}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 font-mono text-xs text-left hover:bg-zinc-800 transition-colors disabled:opacity-50 border-b border-zinc-800 last:border-b-0"
                >
                  <span className="text-zinc-200 truncate">
                    {loggingId === fav.id ? '…' : fav.label}
                  </span>
                  <span className="text-zinc-500 shrink-0 text-[10px]">
                    {fav.ticketKey} · {formatMins(fav.minutes)}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="border-t border-zinc-800 px-3 py-2">
            <button
              onClick={goToSettings}
              className="font-mono text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors w-full text-left"
            >
              ⚙ Manage favorites…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
