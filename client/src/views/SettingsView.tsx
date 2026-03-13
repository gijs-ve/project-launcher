/* eslint-disable @typescript-eslint/no-explicit-any */
declare const __APP_VERSION__: string;
/* eslint-enable @typescript-eslint/no-explicit-any */

import { useView, SettingsTab } from '../context/ViewContext';
import { ProjectsSettings } from './settings/ProjectsSettings';
import { LinksSettings } from './settings/LinksSettings';
import { ShortcutsSettings } from './settings/ShortcutsSettings';
import { GeneralSettings } from './settings/GeneralSettings';
import { TempoSettings } from './settings/TempoSettings';

// ── hub tile ───────────────────────────────────────────────────────────────

interface HubTileProps {
  icon: string;
  label: string;
  description: string;
  onClick: () => void;
}

function HubTile({ icon, label, description, onClick }: HubTileProps) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl p-6 text-left transition-colors group"
    >
      <span className="text-2xl">{icon}</span>
      <div>
        <p className="font-mono font-semibold text-zinc-100 text-sm group-hover:text-white transition-colors">
          {label}
        </p>
        <p className="font-mono text-xs text-zinc-500 mt-1">{description}</p>
      </div>
      <span className="font-mono text-xs text-zinc-600 group-hover:text-zinc-400 transition-colors mt-auto">
        Configure →
      </span>
    </button>
  );
}

// ── main component ─────────────────────────────────────────────────────────

export function SettingsView() {
  const { settingsTab, setSettingsTab } = useView();

  if (settingsTab === 'projects')  return <div className="flex-1 min-h-0 flex flex-col"><ProjectsSettings /></div>;
  if (settingsTab === 'links')     return <div className="flex-1 min-h-0 flex flex-col"><LinksSettings /></div>;
  if (settingsTab === 'shortcuts') return <div className="flex-1 min-h-0 flex flex-col"><ShortcutsSettings /></div>;
  if (settingsTab === 'general')   return <div className="flex-1 min-h-0 flex flex-col"><GeneralSettings /></div>;
  if (settingsTab === 'tempo')     return <div className="flex-1 min-h-0 flex flex-col"><TempoSettings /></div>;

  // Hub / landing page
  const tiles: { tab: SettingsTab; icon: string; label: string; description: string }[] = [
    {
      tab: 'projects',
      icon: '📁',
      label: 'Projects',
      description: 'Add, edit and remove dev projects — set the working directory, start command and colour.',
    },
    {
      tab: 'links',
      icon: '🔗',
      label: 'Links',
      description: 'Manage global links shown in the Links tab — useful for staging environments, dashboards, etc.',
    },
    {
      tab: 'shortcuts',
      icon: '⌨️',
      label: 'Shortcuts',
      description: 'Customise keyboard shortcuts. By default, pressing 1–9 opens the matching project.',
    },
    {
      tab: 'general',
      icon: '⚙️',
      label: 'General',
      description: 'Set the editor command used by the Code button on each project card.',
    },
    {
      tab: 'tempo',
      icon: '⏱️',
      label: 'Quick Log',
      description: 'Configure one-click time entry favorites for the Hours view.',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="font-mono font-semibold text-zinc-100 text-base">Settings</h1>
        <p className="font-mono text-xs text-zinc-500 mt-1">Choose a section to configure.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-4 max-w-3xl">
        {tiles.map((t) => (
          <HubTile
            key={t.tab}
            icon={t.icon}
            label={t.label}
            description={t.description}
            onClick={() => setSettingsTab(t.tab)}
          />
        ))}
      </div>
      <p className="font-mono text-[10px] text-zinc-700 mt-8">Launch v{__APP_VERSION__}</p>
    </div>
  );
}
