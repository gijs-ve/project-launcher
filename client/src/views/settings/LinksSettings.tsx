import { useState } from 'react';
import { useConfig } from '../../context/ConfigContext';
import { Link } from '../../types';
import { LinkForm } from './LinkForm';
import { SettingsHeader } from '../../components/SettingsHeader';
import { SettingsCollapsibleRow } from '../../components/SettingsCollapsibleRow';

export function LinksSettings() {
  const { config, deleteLink, loading } = useConfig();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addingLink, setAddingLink] = useState(false);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="font-mono text-zinc-500 text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
      <SettingsHeader
        title="Links"
        description="Links that always appear in the Links tab — great for staging environments, team dashboards, or any frequently visited page."
        actions={
          <button className="btn-primary" onClick={() => setAddingLink(true)}>
            + Add
          </button>
        }
      />

      {/* ── Add form ────────────────────────────────────────── */}
      {addingLink && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4">
          <p className="font-mono text-xs text-zinc-400 mb-1">New link</p>
          <LinkForm onDone={() => setAddingLink(false)} />
        </div>
      )}

      {/* ── Links list ──────────────────────────────────────── */}
      <div className="flex flex-col gap-px border border-zinc-800 rounded-lg overflow-hidden">
        {config.links.length === 0 && (
          <p className="font-mono text-zinc-500 text-xs p-4">No links yet.</p>
        )}
        {config.links.map((link) => (
          <SettingsCollapsibleRow
            key={link.id}
            title={link.label}
            summary={link.url}
            badge={
              <span className="font-mono text-xs text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded shrink-0">
                {link.openMode === 'browser' ? '🔗 Browser' : '🖥 Webview'}
              </span>
            }
            isOpen={expanded.has(link.id)}
            onToggle={() => toggleExpand(link.id)}
            headerActions={
              <button className="btn-danger text-xs" onClick={() => deleteLink(link.id)}>
                Delete
              </button>
            }
          >
            <LinkForm
              initial={link}
              onDone={() => setExpanded((prev) => { const n = new Set(prev); n.delete(link.id); return n; })}
            />
          </SettingsCollapsibleRow>
        ))}
      </div>
    </div>
  );
}
