import { useState, useEffect } from 'react';
import { useConfig } from '../../context/ConfigContext';

interface KnownEditor {
  label: string;
  command: string;
}

const KNOWN_EDITORS: KnownEditor[] = [
  { label: 'Visual Studio Code', command: 'code' },
  { label: 'Cursor', command: 'cursor' },
  { label: 'VSCodium', command: 'codium' },
  { label: 'Zed', command: 'zed' },
  { label: 'Sublime Text', command: 'subl' },
  { label: 'WebStorm', command: 'webstorm' },
  { label: 'Vim', command: 'vim' },
  { label: 'Neovim', command: 'nvim' },
];

const KNOWN_COMMANDS = new Set(KNOWN_EDITORS.map((e) => e.command));

function detectSelection(rawCommand: string): 'known' | 'custom' {
  const base = rawCommand.trim().split(/\s+/)[0];
  return KNOWN_COMMANDS.has(base) ? 'known' : 'custom';
}

export function GeneralSettings() {
  const { config, saveConfig } = useConfig();

  const rawCommand = config.codeEditor ?? 'code';
  const [selection, setSelection] = useState<'known' | 'custom'>(() => detectSelection(rawCommand));
  const [dropdownValue, setDropdownValue] = useState<string>(() => {
    const base = rawCommand.trim().split(/\s+/)[0];
    return KNOWN_COMMANDS.has(base) ? base : 'code';
  });
  const [customValue, setCustomValue] = useState<string>(() =>
    detectSelection(rawCommand) === 'custom' ? rawCommand : '',
  );
  const [saved, setSaved] = useState(false);

  // Sync local state when config changes externally
  useEffect(() => {
    const cmd = config.codeEditor ?? 'code';
    const kind = detectSelection(cmd);
    setSelection(kind);
    if (kind === 'known') {
      setDropdownValue(cmd.trim().split(/\s+/)[0]);
    } else {
      setCustomValue(cmd);
    }
  }, [config.codeEditor]);

  const currentCommand = selection === 'known' ? dropdownValue : customValue.trim() || 'code';
  const isDirty = currentCommand !== rawCommand;

  const handleSave = async () => {
    await saveConfig({ ...config, codeEditor: currentCommand });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDiscard = () => {
    const cmd = config.codeEditor ?? 'code';
    const kind = detectSelection(cmd);
    setSelection(kind);
    if (kind === 'known') {
      setDropdownValue(cmd.trim().split(/\s+/)[0]);
    } else {
      setCustomValue(cmd);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 className="font-mono font-medium text-zinc-100 text-sm">General</h2>
        <p className="font-mono text-xs text-zinc-500 mt-0.5">
          App-wide preferences.
        </p>
      </div>

      {/* Editor command section */}
      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-zinc-800 border-b border-zinc-700">
          <p className="font-mono text-xs font-medium text-zinc-300">Editor command</p>
          <p className="font-mono text-xs text-zinc-500 mt-0.5">
            Command used by the <span className="text-zinc-300">Code</span> button on each project card to open the project in your editor.
          </p>
        </div>

        <div className="px-4 py-4 bg-zinc-900 flex flex-col gap-4">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              className={[
                'btn-secondary text-xs',
                selection === 'known' ? 'bg-zinc-700 text-zinc-100' : '',
              ].join(' ')}
              onClick={() => setSelection('known')}
            >
              Preset editor
            </button>
            <button
              className={[
                'btn-secondary text-xs',
                selection === 'custom' ? 'bg-zinc-700 text-zinc-100' : '',
              ].join(' ')}
              onClick={() => setSelection('custom')}
            >
              Custom command
            </button>
          </div>

          {/* Known editors dropdown */}
          {selection === 'known' && (
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-xs text-zinc-500">Select editor</label>
              <select
                value={dropdownValue}
                onChange={(e) => setDropdownValue(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 font-mono text-sm text-zinc-100 focus:outline-none focus:border-zinc-500 max-w-xs"
              >
                {KNOWN_EDITORS.map((e) => (
                  <option key={e.command} value={e.command}>
                    {e.label} — {e.command}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Custom command input */}
          {selection === 'custom' && (
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-xs text-zinc-500">
                Command{' '}
                <span className="text-zinc-600">(e.g. <code className="text-zinc-400">cursor</code> or <code className="text-zinc-400">code --new-window</code>)</span>
              </label>
              <input
                type="text"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                placeholder="code"
                spellCheck={false}
                className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 max-w-xs"
              />
            </div>
          )}

          {/* Preview */}
          <p className="font-mono text-xs text-zinc-600">
            Will run:{' '}
            <code className="text-zinc-400">
              {currentCommand || 'code'} &lt;project-path&gt;
            </code>
          </p>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={!isDirty}
            >
              {saved ? 'Saved!' : 'Save'}
            </button>
            {isDirty && (
              <button className="btn-secondary" onClick={handleDiscard}>
                Discard
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
