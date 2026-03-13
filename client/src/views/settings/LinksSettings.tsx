import { useState } from 'react';
import { useConfig } from '../../context/ConfigContext';
import { Link } from '../../types';
import { LinkForm } from './LinkForm';
import { SettingsHeader } from '../../components/SettingsHeader';

export function LinksSettings() {
  const { config, deleteLink, loading } = useConfig();

  type EditingLink = { item: Link | null };
  const [editingLink, setEditingLink] = useState<EditingLink | null>(null);

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
        description="Global links shown in the Links tab — useful for staging environments, dashboards, etc."
        actions={
          <button className="btn-primary" onClick={() => setEditingLink({ item: null })}>
            + Add
          </button>
        }
      />

      {editingLink?.item === null && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4">
          <p className="font-mono text-xs text-zinc-400 mb-1">New link</p>
          <LinkForm onDone={() => setEditingLink(null)} />
        </div>
      )}

      <div className="flex flex-col gap-px border border-zinc-800 rounded-lg overflow-hidden">
        {config.links.length === 0 && (
          <p className="font-mono text-zinc-500 text-xs p-4">No links yet.</p>
        )}
        {config.links.map((link) => (
          <div key={link.id}>
            <div className="flex items-center gap-4 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 transition-colors">
              <span className="font-mono text-sm text-zinc-100 w-36 truncate">{link.label}</span>
              <span className="font-mono text-xs text-zinc-500 flex-1 truncate">{link.url}</span>
              <span className="font-mono text-xs text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded shrink-0">
                {link.openMode === 'browser' ? '🔗 Browser' : '🖥 Webview'}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button className="btn-secondary text-xs" onClick={() => setEditingLink({ item: link })}>
                  Edit
                </button>
                <button className="btn-danger text-xs" onClick={() => deleteLink(link.id)}>
                  Delete
                </button>
              </div>
            </div>

            {editingLink?.item?.id === link.id && (
              <div className="bg-zinc-900 border-t border-zinc-700 px-4 pb-4">
                <LinkForm initial={link} onDone={() => setEditingLink(null)} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
