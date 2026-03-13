import { useState } from 'react';
import { useConfig } from '../../context/ConfigContext';
import { useView } from '../../context/ViewContext';
import { TempoFavorite } from '../../types';
import { SettingsHeader } from '../../components/SettingsHeader';

function formatMins(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function TempoSettings() {
  const { config, saveConfig } = useConfig();
  const { setSettingsTab } = useView();

  const favorites: TempoFavorite[] = config.tempo?.favorites ?? [];

  // ── Add form ──────────────────────────────────────────────────────────────
  const [addLabel,     setAddLabel]     = useState('');
  const [addTicketKey, setAddTicketKey] = useState('');
  const [addMinutes,   setAddMinutes]   = useState(30);
  const [adding,       setAdding]       = useState(false);
  const [addError,     setAddError]     = useState<string | null>(null);

  // ── Edit form ─────────────────────────────────────────────────────────────
  const [editingId,     setEditingId]     = useState<string | null>(null);
  const [editLabel,     setEditLabel]     = useState('');
  const [editTicketKey, setEditTicketKey] = useState('');
  const [editMinutes,   setEditMinutes]   = useState(30);
  const [saving,        setSaving]        = useState(false);

  const saveFavorites = (updated: TempoFavorite[]) =>
    saveConfig({ ...config, tempo: { ...config.tempo!, favorites: updated } });

  const handleAdd = async () => {
    setAddError(null);
    if (!addLabel.trim())     { setAddError('Label is required'); return; }
    if (!addTicketKey.trim()) { setAddError('Ticket key is required'); return; }
    setAdding(true);
    try {
      const newFav: TempoFavorite = {
        id:        Date.now().toString(),
        label:     addLabel.trim(),
        ticketKey: addTicketKey.trim().toUpperCase(),
        minutes:   addMinutes,
      };
      await saveFavorites([...favorites, newFav]);
      setAddLabel('');
      setAddTicketKey('');
      setAddMinutes(30);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    await saveFavorites(favorites.filter((f) => f.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const startEdit = (fav: TempoFavorite) => {
    setEditingId(fav.id);
    setEditLabel(fav.label);
    setEditTicketKey(fav.ticketKey);
    setEditMinutes(fav.minutes);
  };

  const handleSaveEdit = async () => {
    if (!editLabel.trim() || !editTicketKey.trim() || !editingId) return;
    setSaving(true);
    try {
      const updated = favorites.map((f) =>
        f.id === editingId
          // Clear ticketId so it gets re-resolved if the key changed
          ? { ...f, label: editLabel.trim(), ticketKey: editTicketKey.trim().toUpperCase(), minutes: editMinutes, ticketId: undefined }
          : f
      );
      await saveFavorites(updated);
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-xl flex flex-col gap-6">

        {/* Header */}
        <SettingsHeader
          title="Quick Log Favorites"
          description="One-click time entry favorites for the Hours view."
        />

        {/* Current favorites */}
        {favorites.length === 0 ? (
          <p className="font-mono text-xs text-zinc-600">No favorites yet — add one below.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {favorites.map((fav) =>
              editingId === fav.id ? (
                // ── Inline edit form ────────────────────────────────────────
                <div key={fav.id} className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-xs text-zinc-500">Label</label>
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="input"
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex flex-col gap-1.5 flex-1">
                      <label className="font-mono text-xs text-zinc-500">Ticket key</label>
                      <input
                        type="text"
                        value={editTicketKey}
                        onChange={(e) => setEditTicketKey(e.target.value)}
                        className="input font-mono"
                        placeholder="PROJ-42"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 w-28">
                      <label className="font-mono text-xs text-zinc-500">Minutes</label>
                      <input
                        type="number"
                        value={editMinutes}
                        min={1}
                        onChange={(e) => setEditMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                        className="input"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditingId(null)} className="btn-secondary text-xs">
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={saving || !editLabel.trim() || !editTicketKey.trim()}
                      className="btn-primary text-xs disabled:opacity-40"
                    >
                      {saving ? '…' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                // ── Row ────────────────────────────────────────────────────
                <div key={fav.id} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
                  <span className="font-mono text-sm text-zinc-100 flex-1 truncate">{fav.label}</span>
                  <span className="font-mono text-xs text-zinc-500 shrink-0">{fav.ticketKey}</span>
                  <span className="font-mono text-xs text-zinc-500 shrink-0 w-10 text-right">{formatMins(fav.minutes)}</span>
                  <button onClick={() => startEdit(fav)} className="btn-secondary text-xs shrink-0">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(fav.id)} className="btn-danger text-xs shrink-0">
                    Delete
                  </button>
                </div>
              )
            )}
          </div>
        )}

        {/* Add form */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-4">
          <h2 className="font-mono text-xs font-medium text-zinc-400 uppercase tracking-widest">
            Add favorite
          </h2>
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-xs text-zinc-500">Label</label>
            <input
              type="text"
              value={addLabel}
              onChange={(e) => setAddLabel(e.target.value)}
              placeholder="Stand-up"
              className="input"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="font-mono text-xs text-zinc-500">Ticket key</label>
              <input
                type="text"
                value={addTicketKey}
                onChange={(e) => setAddTicketKey(e.target.value)}
                placeholder="PROJ-42"
                className="input font-mono"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              />
            </div>
            <div className="flex flex-col gap-1.5 w-28">
              <label className="font-mono text-xs text-zinc-500">Minutes</label>
              <input
                type="number"
                value={addMinutes}
                min={1}
                onChange={(e) => setAddMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                className="input"
              />
            </div>
          </div>
          {addError && <p className="font-mono text-xs text-red-400">{addError}</p>}
          <div className="flex justify-end">
            <button
              onClick={handleAdd}
              disabled={adding}
              className="btn-primary text-xs disabled:opacity-40"
            >
              {adding ? '…' : '+ Add'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
