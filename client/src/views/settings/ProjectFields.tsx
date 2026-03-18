/**
 * Pure field editor for a project — no save/cancel buttons.
 * The parent owns the draft state and decides when to persist.
 */
import { Project, ProjectLink, Category } from '../../types';

export interface ProjectDraft {
  name: string;
  cwd: string;
  command: string;
  url: string;
  color: string;
  categoryId: string;
  links: ProjectLink[];
  jiraProjectKeys: string; // comma-separated, e.g. "API, WEB"
  jiraBoardUrl: string;
}

export const DEFAULT_COLOR = '#3B82F6';
const EMPTY_LINK: ProjectLink = { label: '', url: '', openMode: 'browser' };

export function projectToDraft(p: Project): ProjectDraft {
  return {
    name: p.name,
    cwd: p.cwd,
    command: p.command,
    url: p.url ?? '',
    color: p.color,
    categoryId: p.categoryId ?? '',
    links: p.links ? p.links.map((l) => ({ ...l })) : [],
    jiraProjectKeys: (p.jiraProjectKeys ?? []).join(', '),
    jiraBoardUrl: p.jiraBoardUrl ?? '',
  };
}

export function isDraftDirty(draft: ProjectDraft, original: Project): boolean {
  if (
    draft.name           !== original.name               ||
    draft.cwd            !== original.cwd                ||
    draft.command        !== original.command            ||
    draft.url            !== (original.url ?? '')        ||
    draft.color          !== original.color              ||
    draft.categoryId     !== (original.categoryId ?? '') ||
    draft.jiraProjectKeys !== (original.jiraProjectKeys ?? []).join(', ')     ||
    draft.jiraBoardUrl    !== (original.jiraBoardUrl ?? '')
  ) return true;
  const orig = original.links ?? [];
  if (draft.links.length !== orig.length) return true;
  return draft.links.some(
    (l, i) => l.label !== orig[i].label || l.url !== orig[i].url || l.openMode !== orig[i].openMode,
  );
}

interface ProjectFieldsProps {
  draft: ProjectDraft;
  onChange: (patch: Partial<ProjectDraft>) => void;
  categories: Category[];
}

export function ProjectFields({ draft, onChange, categories }: ProjectFieldsProps) {
  const updateLink = (i: number, patch: Partial<ProjectLink>) =>
    onChange({
      links: draft.links.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    });

  const removeLink = (i: number) =>
    onChange({ links: draft.links.filter((_, idx) => idx !== i) });

  const addLink = () =>
    onChange({ links: [...draft.links, { ...EMPTY_LINK }] });

  return (
    <div className="flex flex-col gap-3">
      <Field label="Name">
        <input
          className="input"
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="My App"
        />
      </Field>
      <Field label="Working directory">
        <input
          className="input"
          value={draft.cwd}
          onChange={(e) => onChange({ cwd: e.target.value })}
          placeholder="/Users/you/code/my-app"
        />
      </Field>
      <Field label="Start command">
        <input
          className="input"
          value={draft.command}
          onChange={(e) => onChange({ command: e.target.value })}
          placeholder="pnpm dev -p 3001"
        />
      </Field>
      <Field label="Dev URL (optional)">
        <input
          className="input"
          value={draft.url}
          onChange={(e) => onChange({ url: e.target.value })}
          placeholder="http://localhost:3001"
        />
      </Field>
      <Field label="Colour">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={draft.color}
            onChange={(e) => onChange({ color: e.target.value })}
            className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
          />
          <span className="font-mono text-xs text-zinc-400">{draft.color}</span>
        </div>
      </Field>
      {categories.length > 0 && (
        <Field label="Category">
          <select
            className="input"
            value={draft.categoryId}
            onChange={(e) => onChange({ categoryId: e.target.value })}
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
      )}

      {/* Jira */}
      <div className="flex flex-col gap-2 border border-zinc-800 rounded-md p-3 bg-zinc-950">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-medium text-zinc-300">Jira</span>
          <span className="font-mono text-[10px] text-zinc-600">(optional)</span>
        </div>
        <Field label="Project key(s)">
          <input
            className="input"
            value={draft.jiraProjectKeys}
            onChange={(e) => onChange({ jiraProjectKeys: e.target.value.toUpperCase() })}
            placeholder="AS or AS, SLODEV"
          />
          <span className="font-mono text-[10px] text-zinc-600">
            The prefix before the dash in ticket keys — e.g. <code>AS</code> for AS-13.
            Separate multiple with a comma.
          </span>
        </Field>
        <Field label="Board URL (optional)">
          <input
            className="input"
            value={draft.jiraBoardUrl}
            onChange={(e) => onChange({ jiraBoardUrl: e.target.value })}
            placeholder="https://yourcompany.atlassian.net/jira/software/c/projects/KEY/boards/123"
          />
          <span className="font-mono text-[10px] text-zinc-600">
            Paste the full URL of your board. Used by the ↗ Open board button.
          </span>
        </Field>
      </div>

      {/* Links */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs text-zinc-400">Links</span>
          <button type="button" className="btn-secondary text-xs" onClick={addLink}>
            + Add link
          </button>
        </div>

        {draft.links.length > 0 && (
          <div className="flex flex-col gap-1 border border-zinc-800 rounded-md overflow-hidden">
            {draft.links.map((lnk, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_1fr_auto_auto] gap-1.5 items-center px-2 py-1.5 bg-zinc-900 border-b border-zinc-800 last:border-b-0"
              >
                <input
                  className="input text-xs"
                  value={lnk.label}
                  onChange={(e) => updateLink(i, { label: e.target.value })}
                  placeholder="Label"
                />
                <input
                  className="input text-xs"
                  value={lnk.url}
                  onChange={(e) => updateLink(i, { url: e.target.value })}
                  placeholder="https://…"
                />
                <select
                  className="input text-xs"
                  value={lnk.openMode}
                  onChange={(e) =>
                    updateLink(i, { openMode: e.target.value as 'browser' | 'webview' })
                  }
                >
                  <option value="browser">Browser</option>
                  <option value="webview">Webview</option>
                </select>
                <button
                  type="button"
                  className="text-zinc-500 hover:text-red-400 transition-colors font-mono text-xs px-1"
                  onClick={() => removeLink(i)}
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
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
