import { useState } from 'react';
import { useConfig } from '../context/ConfigContext';
import { Project, Link } from '../types';
import { ProjectFields, ProjectDraft, projectToDraft, isDraftDirty, DEFAULT_COLOR } from './settings/ProjectFields';
import { LinkForm } from './settings/LinkForm';

// ── helpers ────────────────────────────────────────────────────────────

function toId(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const BLANK_DRAFT: ProjectDraft = {
  name: '', cwd: '', command: '', url: '', color: DEFAULT_COLOR, links: [],
};

// ── component ──────────────────────────────────────────────────────────

export function SettingsView() {
  const { config, saveProject, deleteProject, saveLink, deleteLink, loading } = useConfig();

  // Map of projectId → current draft (only for expanded rows)
  const [drafts, setDrafts]       = useState<Record<string, ProjectDraft>>({});
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());
  const [saving, setSaving]       = useState(false);

  // "Add new project" panel
  const [addingProject, setAddingProject] = useState(false);
  const [newDraft, setNewDraft]           = useState<ProjectDraft>({ ...BLANK_DRAFT });

  // Links section — unchanged single-edit model
  type EditingLink = { item: Link | null };
  const [editingLink, setEditingLink] = useState<EditingLink | null>(null);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="font-mono text-zinc-500 text-sm">Loading…</p>
      </div>
    );
  }

  // ── draft helpers ──────────────────────────────────────────────────

  const getDraft = (p: Project): ProjectDraft => drafts[p.id] ?? projectToDraft(p);

  const patchDraft = (id: string, patch: Partial<ProjectDraft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch } as ProjectDraft }));

  const toggleExpand = (p: Project) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(p.id)) {
        next.delete(p.id);
      } else {
        // Seed draft on first open
        if (!drafts[p.id]) {
          setDrafts((d) => ({ ...d, [p.id]: projectToDraft(p) }));
        }
        next.add(p.id);
      }
      return next;
    });
  };

  const discardDraft = (id: string) => {
    setDrafts((prev) => { const n = { ...prev }; delete n[id]; return n; });
    setExpanded((prev) => { const n = new Set(prev); n.delete(id); return n; });
  };

  // Which projects have unsaved changes
  const dirtyIds = config.projects
    .filter((p) => drafts[p.id] && isDraftDirty(drafts[p.id], p))
    .map((p) => p.id);

  const hasDirty = dirtyIds.length > 0;

  // ── save all ──────────────────────────────────────────────────────

  const saveAll = async () => {
    setSaving(true);
    await Promise.all(
      dirtyIds.map((id) => {
        const project = config.projects.find((p) => p.id === id)!;
        const d = drafts[id];
        return saveProject({
          id: project.id,
          name: d.name.trim(),
          cwd: d.cwd.trim(),
          command: d.command.trim(),
          url: d.url.trim() || undefined,
          color: d.color,
          links: d.links.length > 0 ? d.links : undefined,
        });
      }),
    );
    // Clear saved drafts
    setDrafts((prev) => {
      const n = { ...prev };
      dirtyIds.forEach((id) => delete n[id]);
      return n;
    });
    setSaving(false);
  };

  // ── add new project ───────────────────────────────────────────────

  const saveNewProject = async () => {
    if (!newDraft.name.trim() || !newDraft.cwd.trim() || !newDraft.command.trim()) return;
    setSaving(true);
    await saveProject({
      id: toId(newDraft.name),
      name: newDraft.name.trim(),
      cwd: newDraft.cwd.trim(),
      command: newDraft.command.trim(),
      url: newDraft.url.trim() || undefined,
      color: newDraft.color,
      links: newDraft.links.length > 0 ? newDraft.links : undefined,
    });
    setSaving(false);
    setNewDraft({ ...BLANK_DRAFT });
    setAddingProject(false);
  };

  // ── render ────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8">

      {/* ── Projects section ──────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-mono font-medium text-zinc-100 text-sm">Projects</h2>
          <div className="flex items-center gap-2">
            {hasDirty && (
              <span className="font-mono text-xs text-amber-400">
                {dirtyIds.length} unsaved
              </span>
            )}
            {hasDirty && (
              <button className="btn-primary" onClick={saveAll} disabled={saving}>
                {saving ? 'Saving…' : `● Save all (${dirtyIds.length})`}
              </button>
            )}
            <button
              className="btn-secondary"
              onClick={() => { setAddingProject(true); setNewDraft({ ...BLANK_DRAFT }); }}
            >
              + Add
            </button>
          </div>
        </div>

        {/* Add-new panel */}
        {addingProject && (
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 mb-3">
            <p className="font-mono text-xs text-zinc-400 mb-3">New project</p>
            <ProjectFields
              draft={newDraft}
              onChange={(patch) => setNewDraft((d) => ({ ...d, ...patch }))}
            />
            <div className="flex gap-2 mt-4">
              <button
                className="btn-primary"
                disabled={saving || !newDraft.name.trim() || !newDraft.cwd.trim() || !newDraft.command.trim()}
                onClick={saveNewProject}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button className="btn-secondary" onClick={() => setAddingProject(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Project accordions */}
        <div className="flex flex-col gap-px border border-zinc-800 rounded-lg overflow-hidden">
          {config.projects.length === 0 && (
            <p className="font-mono text-zinc-500 text-xs p-4">No projects yet.</p>
          )}
          {config.projects.map((project) => {
            const isOpen  = expanded.has(project.id);
            const draft   = getDraft(project);
            const dirty   = drafts[project.id] ? isDraftDirty(drafts[project.id], project) : false;
            const draftValid = draft.name.trim() && draft.cwd.trim() && draft.command.trim();

            return (
              <div key={project.id}>
                {/* Row header — click to expand/collapse */}
                <div
                  className="flex items-center gap-4 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 transition-colors cursor-pointer select-none"
                  style={{ borderLeft: `3px solid ${project.color}` }}
                  onClick={() => toggleExpand(project)}
                >
                  <span className="font-mono text-xs text-zinc-500 w-3 shrink-0">
                    {isOpen ? '▼' : '▶'}
                  </span>
                  <span className="font-mono text-sm text-zinc-100 w-32 truncate">
                    {dirty ? <span className="text-amber-300">{draft.name || project.name} ●</span> : (draft.name || project.name)}
                  </span>
                  <span className="font-mono text-xs text-zinc-500 flex-1 truncate">{project.cwd}</span>
                  <code className="font-mono text-xs text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded truncate max-w-[200px]">
                    {project.command}
                  </code>
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {dirty && (
                      <button
                        className="btn-secondary text-xs text-zinc-500"
                        onClick={() => discardDraft(project.id)}
                        title="Discard changes"
                      >
                        ✕ Discard
                      </button>
                    )}
                    <button
                      className="btn-danger text-xs"
                      onClick={() => deleteProject(project.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Collapsible body */}
                {isOpen && (
                  <div className="bg-zinc-900 border-t border-zinc-800 px-4 py-4">
                    <ProjectFields
                      draft={draft}
                      onChange={(patch) => patchDraft(project.id, patch)}
                    />
                    {!draftValid && (
                      <p className="font-mono text-xs text-red-400 mt-2">Name, directory and command are required.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom save bar — sticky, only when dirty */}
        {hasDirty && (
          <div className="sticky bottom-0 mt-3 flex items-center justify-between gap-3 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5">
            <span className="font-mono text-xs text-amber-400">
              {dirtyIds.length} project{dirtyIds.length > 1 ? 's' : ''} with unsaved changes
            </span>
            <div className="flex gap-2">
              <button
                className="btn-secondary text-xs"
                onClick={() => setDrafts({})}
              >
                Discard all
              </button>
              <button
                className="btn-primary"
                onClick={saveAll}
                disabled={saving || dirtyIds.some((id) => {
                  const d = drafts[id];
                  return !d.name.trim() || !d.cwd.trim() || !d.command.trim();
                })}
              >
                {saving ? 'Saving…' : `● Save all (${dirtyIds.length})`}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── Links section ─────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-mono font-medium text-zinc-100 text-sm">Links</h2>
          <button
            className="btn-primary"
            onClick={() => setEditingLink({ item: null })}
          >
            + Add
          </button>
        </div>

        {editingLink?.item === null && (
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 mb-3">
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
                  <button
                    className="btn-secondary text-xs"
                    onClick={() => setEditingLink({ item: link })}
                  >
                    Edit
                  </button>
                  <button
                    className="btn-danger text-xs"
                    onClick={() => deleteLink(link.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {editingLink?.item?.id === link.id && (
                <div className="bg-zinc-900 border-t border-zinc-700 px-4 pb-4">
                  <LinkForm
                    initial={link}
                    onDone={() => setEditingLink(null)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

