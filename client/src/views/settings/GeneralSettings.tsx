import { useState, useEffect, useRef } from 'react';
import { useConfig } from '../../context/ConfigContext';
import { JiraCredentials, Config } from '../../types';

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
  const [saveError, setSaveError]         = useState<string | null>(null);
  const [jiraBaseUrl, setJiraBaseUrl]   = useState(() => config.jira?.baseUrl ?? '');
  const [jiraEmail, setJiraEmail]       = useState(() => config.jira?.email ?? '');
  const [jiraApiToken, setJiraApiToken] = useState(() => config.jira?.apiToken ?? '');
  const [jiraSaved, setJiraSaved]       = useState(false);
  const [jiraError, setJiraError]       = useState<string | null>(null);

  // Export / Import state
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    setJiraBaseUrl(config.jira?.baseUrl ?? '');
    setJiraEmail(config.jira?.email ?? '');
    setJiraApiToken(config.jira?.apiToken ?? '');
  }, [config.jira?.baseUrl, config.jira?.email, config.jira?.apiToken]);

  const currentCommand = selection === 'known' ? dropdownValue : customValue.trim() || 'code';
  const isDirty = currentCommand !== rawCommand;

  const jiraIsDirty =
    jiraBaseUrl.trim()  !== (config.jira?.baseUrl  ?? '') ||
    jiraEmail.trim()    !== (config.jira?.email    ?? '') ||
    jiraApiToken.trim() !== (config.jira?.apiToken ?? '');

  const handleSave = async () => {
    setSaveError(null);
    try {
      await saveConfig({ ...config, codeEditor: currentCommand });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(String(err));
    }
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

  const handleSaveJira = async () => {
    setJiraError(null);
    const jira: JiraCredentials | undefined =
      jiraEmail.trim() || jiraApiToken.trim() || jiraBaseUrl.trim()
        ? { email: jiraEmail.trim(), apiToken: jiraApiToken.trim(), baseUrl: jiraBaseUrl.trim() || undefined }
        : undefined;
    try {
      await saveConfig({ ...config, jira });
      setJiraSaved(true);
      setTimeout(() => setJiraSaved(false), 2000);
    } catch (err) {
      setJiraError(String(err));
    }
  };

  const handleExport = async () => {
    try {
      const response = await fetch('/api/config/export');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'launch.config.gizzyb';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Export failed: ${String(err)}`);
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportSuccess(false);
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target?.result as string;
        let parsed: Config;
        try {
          parsed = JSON.parse(text) as Config;
        } catch {
          throw new Error('File is not valid JSON');
        }
        if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.links)) {
          throw new Error('Invalid .gizzyb file: missing projects or links');
        }
        const r = await fetch('/api/config/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed),
        });
        if (!r.ok) {
          const data = await r.json() as { error?: string };
          throw new Error(data.error ?? `HTTP ${r.status}`);
        }
        // Briefly show success, then reload so all contexts re-fetch the new config
        setImportSuccess(true);
        setTimeout(() => window.location.reload(), 600);
      } catch (err) {
        setImportError(String(err));
      } finally {
        setImporting(false);
        // Reset the file input so the same file can be re-selected
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
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
          <div className="flex flex-col gap-2">
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
            {saveError && (
              <p className="font-mono text-xs text-red-400">{saveError}</p>
            )}
          </div>
        </div>
      </div>

      {/* Jira credentials section */}
      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-zinc-800 border-b border-zinc-700">
          <p className="font-mono text-xs font-medium text-zinc-300">Jira credentials</p>
          <p className="font-mono text-xs text-zinc-500 mt-0.5">
            Used to fetch active sprint issues per project. Your API token is stored in{' '}
            <span className="text-zinc-300">launch.config.gizzyb</span> — keep that file private.
          </p>
        </div>

        <div className="px-4 py-4 bg-zinc-900 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-xs text-zinc-500">Base URL</label>
            <input
              type="text"
              value={jiraBaseUrl}
              onChange={(e) => setJiraBaseUrl(e.target.value)}
              placeholder="https://yourcompany.atlassian.net"
              spellCheck={false}
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 max-w-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-xs text-zinc-500">Atlassian e-mail</label>
            <input
              type="email"
              value={jiraEmail}
              onChange={(e) => setJiraEmail(e.target.value)}
              placeholder="you@company.com"
              spellCheck={false}
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 max-w-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-xs text-zinc-500">
              API token{' '}
              <a
                href="https://id.atlassian.com/manage-profile/security/api-tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 hover:text-zinc-200 underline transition-colors"
              >
                Generate ↗
              </a>
            </label>
            <input
              type="password"
              value={jiraApiToken}
              onChange={(e) => setJiraApiToken(e.target.value)}
              placeholder="••••••••••••••••••••"
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 max-w-xs"
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                className="btn-primary"
                onClick={handleSaveJira}
                disabled={!jiraIsDirty}
              >
                {jiraSaved ? 'Saved ✓' : 'Save'}
              </button>
              {jiraIsDirty && (
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setJiraBaseUrl(config.jira?.baseUrl ?? '');
                    setJiraEmail(config.jira?.email ?? '');
                    setJiraApiToken(config.jira?.apiToken ?? '');
                    setJiraError(null);
                  }}
                >
                  Discard
                </button>
              )}
            </div>
            {jiraError && (
              <p className="font-mono text-xs text-red-400">{jiraError}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Export / Import ──────────────────────────────── */}
      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-zinc-800 border-b border-zinc-700">
          <p className="font-mono text-xs font-medium text-zinc-300">Config file (.gizzyb)</p>
          <p className="font-mono text-xs text-zinc-500 mt-0.5">
            Export your full config to share with others, or import a <code className="text-zinc-400">.gizzyb</code> file
            to load someone else's setup. Importing <strong className="text-zinc-300">replaces</strong> your current config.
          </p>
        </div>
        <div className="px-4 py-4 bg-zinc-900 flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <button className="btn-secondary" onClick={handleExport}>
              Export config
            </button>
            <button
              className="btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              {importing ? 'Importing…' : 'Import config'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".gizzyb,application/json"
              className="hidden"
              onChange={handleImport}
            />
          </div>
          {importError && (
            <p className="font-mono text-xs text-red-400">{importError}</p>
          )}
          {importSuccess && (
            <p className="font-mono text-xs text-emerald-400">Config imported — reloading…</p>
          )}
        </div>
      </div>

    </div>
  );
}
