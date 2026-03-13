import { useState, useEffect, useRef } from 'react';
import { useConfig } from '../context/ConfigContext';
import { useView } from '../context/ViewContext';
import { TempoFavorite } from '../types';

interface Props {
  issueKey: string;
  issueId?: number;
}

function formatMins(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Displays a Jira issue key. Click to add / remove it from the quick-log
 * favorites stored in config.tempo.favorites.
 */
export function TicketKeyChip({ issueKey, issueId }: Props) {
  const { config, saveConfig } = useConfig();
  const { navigateToJiraIssue } = useView();
  const [open, setOpen]               = useState(false);
  const [showForm, setShowForm]       = useState(false);
  const [label, setLabel]             = useState(issueKey);
  const [minutes, setMinutes]         = useState(30);
  const [saving, setSaving]           = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  const favorites     = config.tempo?.favorites ?? [];
  const ticketFavs    = favorites.filter((f) => f.ticketKey === issueKey);
  const isFavorite    = ticketFavs.length > 0;

  // "View ticket" is only available if the issue's project key is configured
  const issueProjectKey = issueKey.split('-')[0];
  const matchingProject = (config.projects ?? []).find((p) =>
    (p.jiraProjectKeys ?? []).includes(issueProjectKey)
  );
  const canViewTicket = !!matchingProject;

  // Reset add-form when popup closes
  useEffect(() => {
    if (!open) {
      setShowForm(false);
      setLabel(issueKey);
      setMinutes(30);
    }
  }, [open, issueKey]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const handleRemove = async (id: string) => {
    setSaving(true);
    try {
      await saveConfig({
        ...config,
        tempo: { ...config.tempo!, favorites: favorites.filter((f) => f.id !== id) },
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!label.trim() || minutes < 1) return;
    setSaving(true);
    try {
      const newFav: TempoFavorite = {
        id:        Date.now().toString(),
        label:     label.trim(),
        ticketKey: issueKey,
        ticketId:  issueId,
        minutes,
      };
      await saveConfig({
        ...config,
        tempo: { ...config.tempo!, favorites: [...favorites, newFav] },
      });
      setShowForm(false);
      setLabel(issueKey);
      setMinutes(30);
    } finally {
      setSaving(false);
    }
  };

  return (
    <span ref={ref} className="relative inline-flex items-center">
      {/* Chip button */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={[
          'font-mono text-xs cursor-pointer hover:underline decoration-dotted underline-offset-2 transition-colors',
          isFavorite ? 'text-amber-400' : 'text-zinc-400',
        ].join(' ')}
      >
        {isFavorite && '★ '}{issueKey}
      </button>

      {/* Popup */}
      {open && (
        <span className="absolute bottom-full left-0 mb-1.5 z-50 flex flex-col bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden" style={{ minWidth: '13rem' }}>

          {/* Existing favorites for this ticket */}
          {ticketFavs.map((fav) => (
            <span key={fav.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 font-mono text-[10px]">
              <span className="text-amber-300 flex-1 truncate">{fav.label}</span>
              <span className="text-zinc-500 shrink-0">{formatMins(fav.minutes)}</span>
              <button
                onClick={() => handleRemove(fav.id)}
                disabled={saving}
                className="text-zinc-600 hover:text-red-400 transition-colors shrink-0 cursor-pointer disabled:opacity-40"
                title="Remove from quick log"
              >
                ×
              </button>
            </span>
          ))}

          {/* View ticket (only when project is configured) */}
          {canViewTicket && (
            <button
              onClick={() => { setOpen(false); navigateToJiraIssue(issueKey, matchingProject?.id); }}
              className="flex items-center gap-1.5 px-3 py-2 font-mono text-[10px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors text-left w-full border-b border-zinc-800"
            >
              <span>↗</span>
              <span>View ticket</span>
            </button>
          )}

          {/* Add-to-favorites form or trigger */}
          {showForm ? (
            <span className="flex flex-col gap-2 px-3 py-2">
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Label…"
                className="input text-[11px] py-1 px-2"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              />
              <span className="flex items-center gap-2">
                <input
                  type="number"
                  value={minutes}
                  min={1}
                  onChange={(e) => setMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                  className="input text-[11px] py-1 px-2 w-16"
                />
                <span className="font-mono text-[10px] text-zinc-500">min</span>
                <button
                  onClick={handleAdd}
                  disabled={saving || !label.trim()}
                  className="btn-primary text-[10px] py-1 px-2 ml-auto disabled:opacity-40"
                >
                  {saving ? '…' : 'Add'}
                </button>
              </span>
            </span>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-2 font-mono text-[10px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors text-left w-full"
            >
              <span>☆</span>
              <span>Add to quick log…</span>
            </button>
          )}
        </span>
      )}
    </span>
  );
}
