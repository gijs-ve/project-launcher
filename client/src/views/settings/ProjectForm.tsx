import { useEffect, useRef, useState } from 'react';
import { Project, ProjectLink } from '../../types';
import { useConfig } from '../../context/ConfigContext';

function toId(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

interface ProjectFormProps {
  initial?: Project;
  onDone: () => void;
  /** A ref whose .current is kept in sync with isDirty on every render. */
  dirtyRef?: React.MutableRefObject<boolean>;
}

const DEFAULT_COLOR = '#3B82F6';
const EMPTY_LINK: ProjectLink = { label: '', url: '', openMode: 'browser' };

function linksEqual(a: ProjectLink[], b: ProjectLink[]) {
  if (a.length !== b.length) return false;
  return a.every((l, i) => l.label === b[i].label && l.url === b[i].url && l.openMode === b[i].openMode);
}

export function ProjectForm({ initial, onDone, dirtyRef }: ProjectFormProps) {
  const { saveProject } = useConfig();
  const [name, setName]       = useState(initial?.name ?? '');
  const [cwd, setCwd]         = useState(initial?.cwd ?? '');
  const [command, setCommand] = useState(initial?.command ?? '');
  const [url, setUrl]         = useState(initial?.url ?? '');
  const [color, setColor]     = useState(initial?.color ?? DEFAULT_COLOR);
  const [links, setLinks]     = useState<ProjectLink[]>(initial?.links ?? []);
  const [saving, setSaving]   = useState(false);
  const [addingLink, setAddingLink]         = useState(false);
  const [newLink, setNewLink]               = useState<ProjectLink>({ ...EMPTY_LINK });
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const isDirty =
    name    !== (initial?.name    ?? '')           ||
    cwd     !== (initial?.cwd     ?? '')           ||
    command !== (initial?.command ?? '')           ||
    url     !== (initial?.url     ?? '')           ||
    color   !== (initial?.color   ?? DEFAULT_COLOR)||
    !linksEqual(links, initial?.links ?? []);

  // Keep dirtyRef in sync synchronously on every render (no async effect lag).
  if (dirtyRef) dirtyRef.current = isDirty;

  const valid = name.trim() && cwd.trim() && command.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    await saveProject({
      id: initial?.id ?? toId(name),
      name: name.trim(),
      cwd: cwd.trim(),
      command: command.trim(),
      url: url.trim() || undefined,
      color,
      links: links.length > 0 ? links : undefined,
    });
    setSaving(false);
    onDone();
  };

  const handleCancel = () => {
    if (isDirty) {
      setConfirmDiscard(true);
    } else {
      onDone();
    }
  };

  const commitNewLink = () => {
    if (!newLink.label.trim() || !newLink.url.trim()) return;
    setLinks((prev) => [...prev, { ...newLink, label: newLink.label.trim(), url: newLink.url.trim() }]);
    setNewLink({ ...EMPTY_LINK });
    setAddingLink(false);
  };

  const removeLink = (index: number) => setLinks((prev) => prev.filter((_, i) => i !== index));

  const updateLink = (index: number, patch: Partial<ProjectLink>) =>
    setLinks((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-3">
      <Field label="Name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="My App" required />
      </Field>
      <Field label="Working directory">
        <input className="input" value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder="/Users/you/code/my-app" required />
      </Field>
      <Field label="Start command">
        <input className="input" value={command} onChange={(e) => setCommand(e.target.value)} placeholder="pnpm dev -p 3001" required />
      </Field>
      <Field label="Dev URL (optional)">
        <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:3001" />
      </Field>
      <Field label="Colour">
        <div className="flex items-center gap-2">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-transparent border-0" />
          <span className="font-mono text-xs text-zinc-400">{color}</span>
        </div>
      </Field>

      {/* ── Links sub-section ─────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs text-zinc-400">Links</span>
          {!addingLink && (
            <button type="button" className="btn-secondary text-xs" onClick={() => setAddingLink(true)}>
              + Add link
            </button>
          )}
        </div>

        {links.length > 0 && (
          <div className="flex flex-col gap-1 border border-zinc-800 rounded-md overflow-hidden">
            {links.map((lnk, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] gap-1.5 items-center px-2 py-1.5 bg-zinc-900 border-b border-zinc-800 last:border-b-0">
                <input className="input text-xs" value={lnk.label} onChange={(e) => updateLink(i, { label: e.target.value })} placeholder="Label" />
                <input className="input text-xs" value={lnk.url} onChange={(e) => updateLink(i, { url: e.target.value })} placeholder="https://…" />
                <select className="input text-xs" value={lnk.openMode} onChange={(e) => updateLink(i, { openMode: e.target.value as 'browser' | 'webview' })}>
                  <option value="browser">Browser</option>
                  <option value="webview">Webview</option>
                </select>
                <button type="button" className="text-zinc-500 hover:text-red-400 transition-colors font-mono text-xs px-1" onClick={() => removeLink(i)} title="Remove">✕</button>
              </div>
            ))}
          </div>
        )}

        {addingLink && (
          <div className="border border-zinc-700 rounded-md p-2 bg-zinc-900 flex flex-col gap-1.5">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
              <input className="input text-xs" autoFocus value={newLink.label} onChange={(e) => setNewLink((p) => ({ ...p, label: e.target.value }))} placeholder="Label" />
              <input className="input text-xs" value={newLink.url} onChange={(e) => setNewLink((p) => ({ ...p, url: e.target.value }))} placeholder="https://…" />
              <select className="input text-xs" value={newLink.openMode} onChange={(e) => setNewLink((p) => ({ ...p, openMode: e.target.value as 'browser' | 'webview' }))}>
                <option value="browser">Browser</option>
                <option value="webview">Webview</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-primary text-xs" onClick={commitNewLink} disabled={!newLink.label.trim() || !newLink.url.trim()}>Add</button>
              <button type="button" className="btn-secondary text-xs" onClick={() => { setAddingLink(false); setNewLink({ ...EMPTY_LINK }); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Action row / discard confirmation ─────────────── */}
      {confirmDiscard ? (
        <div className="sticky bottom-0 flex items-center gap-3 mt-1 rounded-md border border-amber-700 bg-amber-950 px-3 py-2">
          <span className="font-mono text-xs text-amber-300 flex-1">Discard unsaved changes?</span>
          <button type="button" className="btn-danger text-xs" onClick={onDone}>Discard</button>
          <button type="button" className="btn-secondary text-xs" onClick={() => setConfirmDiscard(false)}>Keep editing</button>
        </div>
      ) : (
        <div className="sticky bottom-0 flex items-center gap-2 mt-1 pt-2 pb-1 bg-zinc-900">
          <button type="submit" className="btn-primary" disabled={!valid || saving}>
            {saving ? 'Saving…' : isDirty ? '● Save' : 'Save'}
          </button>
          <button type="button" className="btn-secondary" onClick={handleCancel}>Cancel</button>
        </div>
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-xs text-zinc-400">{label}</span>
      {children}
    </label>
  );
}
