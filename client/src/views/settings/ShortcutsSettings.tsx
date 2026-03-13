import { useState, useEffect, useRef } from 'react';
import { useConfig } from '../../context/ConfigContext';
import { useShortcuts, mouseButtonToLabel, displayBinding } from '../../context/ShortcutsContext';
import { SettingsHeader } from '../../components/SettingsHeader';
import { SettingsCollapsibleSection } from '../../components/SettingsCollapsibleSection';

// Keys that should be ignored for binding (modifier-only presses, etc.)
const IGNORED_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab']);

const NAV_ACTIONS: { action: string; label: string; description: string }[] = [
  { action: 'nav-back',    label: 'Go back',    description: 'Navigate to the previous view' },
  { action: 'nav-forward', label: 'Go forward', description: 'Navigate to the next view' },
];

export function ShortcutsSettings() {
  const { config } = useConfig();
  const { shortcuts, setShortcut, clearShortcut, resetShortcuts } = useShortcuts();

  // Which action is currently being re-bound (null = none)
  const [capturing, setCapturing] = useState<string | null>(null);
  const captureRef = useRef<string | null>(null);

  // Keep the ref in sync so the document keydown handler always has the latest value
  useEffect(() => {
    captureRef.current = capturing;
  }, [capturing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = captureRef.current;
      if (!action) return;

      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setCapturing(null);
        return;
      }

      if (IGNORED_KEYS.has(e.key)) return;

      setShortcut(action, e.key);
      setCapturing(null);
    };

    // Capture mouse buttons ≥ 2 (avoid left/right conflicts) for any action currently capturing
    const onMouse = (e: MouseEvent) => {
      const action = captureRef.current;
      if (!action) return;
      const label = mouseButtonToLabel(e.button);
      if (!label) return;
      e.preventDefault();
      e.stopPropagation();
      setShortcut(action, label);
      setCapturing(null);
    };

    document.addEventListener('keydown', onKey, { capture: true });
    document.addEventListener('mousedown', onMouse, { capture: true });
    return () => {
      document.removeEventListener('keydown', onKey, { capture: true });
      document.removeEventListener('mousedown', onMouse, { capture: true });
    };
  }, [setShortcut]);

  const projects = config.projects;

  const KeyBadge = ({ action }: { action: string }) => {
    const boundKey = shortcuts[action];
    const isCapturing = capturing === action;
    return (
      <button
        onClick={() => setCapturing(isCapturing ? null : action)}
        className={[
          'flex items-center justify-center rounded px-2 py-1 font-mono text-xs transition-all',
          isCapturing
            ? 'bg-amber-500/20 border border-amber-500 text-amber-300 animate-pulse'
            : boundKey
              ? 'bg-zinc-800 border border-zinc-600 text-zinc-200 hover:border-zinc-400'
              : 'bg-zinc-800 border border-dashed border-zinc-600 text-zinc-500 hover:border-zinc-400',
        ].join(' ')}
        title={isCapturing ? 'Press any key or click a mouse button, Esc to cancel' : 'Click to change shortcut'}
      >
        {isCapturing ? '…key or click' : (boundKey ? displayBinding(boundKey) : 'unbound')}
      </button>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
      <SettingsHeader
        title="Shortcuts"
        description="Click any key badge to change its binding, then press the new key. Press Esc to cancel."
        actions={
          <button className="btn-secondary" onClick={resetShortcuts}>
            Reset to defaults
          </button>
        }
      />

      {/* ── Navigation ───────────────────────────────────────── */}
      <SettingsCollapsibleSection
        title="Navigation"
        description="Jump between the main tabs without touching the mouse."
        defaultOpen
      >
        <div className="border border-zinc-800 rounded-lg overflow-hidden -mx-0">
          <div className="grid grid-cols-[1fr_10rem_2.5rem] gap-4 px-4 py-2 bg-zinc-800 border-b border-zinc-700">
            <span className="font-mono text-xs text-zinc-500">Action</span>
            <span className="font-mono text-xs text-zinc-500">Binding</span>
            <span />
          </div>
          {NAV_ACTIONS.map(({ action, label, description }) => {
            const boundKey   = shortcuts[action];
            const isCapturing = capturing === action;
            return (
              <div
                key={action}
                className="grid grid-cols-[1fr_10rem_2.5rem] gap-4 items-center px-4 py-3 bg-zinc-900 hover:bg-zinc-800/50 transition-colors border-b border-zinc-800 last:border-0"
              >
                <div>
                  <p className="font-mono text-sm text-zinc-100">{label}</p>
                  <p className="font-mono text-xs text-zinc-500">{description}</p>
                </div>
                <KeyBadge action={action} />
                {boundKey && !isCapturing ? (
                  <button
                    onClick={() => clearShortcut(action)}
                    className="font-mono text-xs text-zinc-600 hover:text-red-400 transition-colors text-center"
                    title="Remove shortcut"
                  >
                    ✕
                  </button>
                ) : <span />}
              </div>
            );
          })}
        </div>
      </SettingsCollapsibleSection>

      {/* ── Project shortcuts ────────────────────────────────── */}
      <SettingsCollapsibleSection
        title="Open project"
        description="Assign a key to open any project directly from the Projects view."
        defaultOpen
      >
        {projects.length === 0 ? (
          <p className="font-mono text-zinc-500 text-xs">No projects yet. Add some in Projects settings.</p>
        ) : (
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <div className="grid grid-cols-[2rem_1fr_8rem_2.5rem] gap-4 px-4 py-2 bg-zinc-800 border-b border-zinc-700">
              <span className="font-mono text-xs text-zinc-500">#</span>
              <span className="font-mono text-xs text-zinc-500">Project</span>
              <span className="font-mono text-xs text-zinc-500">Open project</span>
              <span />
            </div>

            {projects.map((project, idx) => {
              const action     = `navigate-${idx}`;
              const boundKey   = shortcuts[action];
              const isCapturing = capturing === action;

              return (
                <div
                  key={project.id}
                  className="grid grid-cols-[2rem_1fr_8rem_2.5rem] gap-4 items-center px-4 py-3 bg-zinc-900 hover:bg-zinc-800/50 transition-colors border-b border-zinc-800 last:border-0"
                  style={{ borderLeft: `3px solid ${project.color}` }}
                >
                  <span className="font-mono text-xs text-zinc-500">{idx + 1}</span>
                  <span className="font-mono text-sm text-zinc-100 truncate">{project.name}</span>
                  <button
                    onClick={() => setCapturing(isCapturing ? null : action)}
                    className={[
                      'flex items-center justify-center rounded px-2 py-1 font-mono text-xs transition-all',
                      isCapturing
                        ? 'bg-amber-500/20 border border-amber-500 text-amber-300 animate-pulse'
                        : boundKey
                          ? 'bg-zinc-800 border border-zinc-600 text-zinc-200 hover:border-zinc-400'
                          : 'bg-zinc-800 border border-dashed border-zinc-600 text-zinc-500 hover:border-zinc-400',
                    ].join(' ')}
                    title={isCapturing ? 'Press any key to bind, Esc to cancel' : 'Click to change shortcut'}
                  >
                    {isCapturing ? '…press a key' : (boundKey ? displayBinding(boundKey) : 'unbound')}
                  </button>
                  {boundKey && !isCapturing ? (
                    <button
                      onClick={() => clearShortcut(action)}
                      className="font-mono text-xs text-zinc-600 hover:text-red-400 transition-colors text-center"
                      title="Remove shortcut"
                    >
                      ✕
                    </button>
                  ) : <span />}
                </div>
              );
            })}
          </div>
        )}
        <p className="font-mono text-xs text-zinc-600">
          Shortcuts are active on the Projects view. They do not fire when an input is focused.
        </p>
      </SettingsCollapsibleSection>
    </div>
  );
}
