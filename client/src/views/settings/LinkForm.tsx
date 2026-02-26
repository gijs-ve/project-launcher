import { useState } from 'react';
import { Link } from '../../types';
import { useConfig } from '../../context/ConfigContext';

function toId(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

interface LinkFormProps {
  initial?: Link;
  onDone: () => void;
}

export function LinkForm({ initial, onDone }: LinkFormProps) {
  const { saveLink } = useConfig();
  const [label, setLabel]       = useState(initial?.label ?? '');
  const [url, setUrl]           = useState(initial?.url ?? '');
  const [openMode, setOpenMode] = useState<'browser' | 'webview'>(initial?.openMode ?? 'browser');
  const [saving, setSaving]     = useState(false);

  const valid = label.trim() && url.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    await saveLink({
      id: initial?.id ?? toId(label),
      label: label.trim(),
      url: url.trim(),
      openMode,
    });
    setSaving(false);
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-3">
      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs text-zinc-400">Label</span>
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Umbraco (local)" required />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs text-zinc-400">URL</span>
        <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:8080/umbraco" required />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs text-zinc-400">Open mode</span>
        <select
          className="input"
          value={openMode}
          onChange={(e) => setOpenMode(e.target.value as 'browser' | 'webview')}
        >
          <option value="browser">Browser — open in default browser</option>
          <option value="webview">Webview — open in embedded iframe</option>
        </select>
      </label>
      <div className="flex gap-2 mt-1">
        <button type="submit" className="btn-primary" disabled={!valid || saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn-secondary" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}
