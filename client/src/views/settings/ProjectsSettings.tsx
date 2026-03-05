import { useState } from 'react';
import { useConfig } from '../../context/ConfigContext';
import { Project } from '../../types';
import { ProjectFields, ProjectDraft, projectToDraft, isDraftDirty, DEFAULT_COLOR } from './ProjectFields';

function toId(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const BLANK_DRAFT: ProjectDraft = {
  name: '', cwd: '', command: '', url: '', color: DEFAULT_COLOR, links: [],
  jiraBaseUrl: '', jiraProjectKeys: '',
};

export function ProjectsSettings() {
  const { config, saveProject, deleteProject, loading } = useConfig();

  const [drafts, setDrafts]     = useState<Record<string, ProjectDraft>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, setSaving]     = useState(false);

  const [addingProject, setAddingProject] = useState(false);
  const [newDraft, setNewDraft]           = useState<ProjectDraft>({ ...BLANK_DRAFT });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="font-mono text-zinc-500 text-sm">Loading…</p>
      </div>
    );
  }

  const getDraft = (p: Project): ProjectDraft => drafts[p.id] ?? projectToDraft(p);

  const patchDraft = (id: string, patch: Partial<ProjectDraft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch } as ProjectDraft }));

  const toggleExpand = (p: Project) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(p.id)) {
        next.delete(p.id);
      } else {
        if (!drafts[p.id]) setDrafts((d) => ({ ...d, [p.id]: projectToDraft(p) }));
        next.add(p.id);
      }
      return next;
    });
  };

  const discardDraft = (id: string) => {
    setDrafts((prev) => { const n = { ...prev }; delete n[id]; return n; });
    setExpanded((prev) => { const n = new Set(prev); n.delete(id); return n; });
  };

  const dirtyIds = config.projects
    .filter((p) => drafts[p.id] && isDraftDirty(drafts[p.id], p))
    .map((p) => p.id);
  const hasDirty = dirtyIds.length > 0;

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
          jiraBaseUrl: d.jiraBaseUrl.trim() || undefined,
          jiraProjectKeys: d.jiraProjectKeys.split(',').map((k) => k.trim().toUpperCase()).filter(Boolean),
        });
      }),
    );
    setDrafts((prev) => {
      const n = { ...prev };
      dirtyIds.forEach((id) => delete n[id]);
      return n;
    });
    setSaving(false);
  };

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
      jiraBaseUrl: newDraft.jiraBaseUrl.trim() || undefined,
      jiraProjectKeys: newDraft.jiraProjectKeys.split(',').map((k) => k.trim().toUpperCase()).filter(Boolean),
    });
    setSaving(false);
    setNewDraft({ ...BLANK_DRAFT });
    setAddingProject(false);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono font-medium text-zinc-100 text-sm">Projects</h2>
        <div className="flex items-center gap-2">
          {hasDirty && (
            <span className="font-mono text-xs text-amber-400">{dirtyIds.length} unsaved</span>
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

      {addingProject && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4">
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

      <div className="flex flex-col gap-px border border-zinc-800 rounded-lg">
        {config.projects.length === 0 && (
          <p className="font-mono text-zinc-500 text-xs p-4">No projects yet.</p>
        )}
        {config.projects.map((project) => {
          const isOpen     = expanded.has(project.id);
          const draft      = getDraft(project);
          const dirty      = drafts[project.id] ? isDraftDirty(drafts[project.id], project) : false;
          const draftValid = draft.name.trim() && draft.cwd.trim() && draft.command.trim();

          return (
            <div key={project.id} className="first:rounded-t-lg last:rounded-b-lg overflow-hidden">
              <div
                className="flex items-center gap-4 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 transition-colors cursor-pointer select-none"
                style={{ borderLeft: `3px solid ${project.color}` }}
                onClick={() => toggleExpand(project)}
              >
                <span className="font-mono text-xs text-zinc-500 w-3 shrink-0">
                  {isOpen ? '▼' : '▶'}
                </span>
                <span className="font-mono text-sm text-zinc-100 w-32 truncate">
                  {dirty
                    ? <span className="text-amber-300">{draft.name || project.name} ●</span>
                    : (draft.name || project.name)}
                </span>
                <span className="font-mono text-xs text-zinc-500 flex-1 truncate">{project.cwd}</span>
                <code className="font-mono text-xs text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded truncate max-w-[200px]">
                  {project.command}
                </code>
                <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {dirty && (
                    <button className="btn-secondary text-xs text-zinc-500" onClick={() => discardDraft(project.id)}>
                      ✕ Discard
                    </button>
                  )}
                  <button className="btn-danger text-xs" onClick={() => deleteProject(project.id)}>
                    Delete
                  </button>
                </div>
              </div>

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

      {hasDirty && (
        <div className="sticky bottom-0 mt-auto flex items-center justify-between gap-3 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5">
          <span className="font-mono text-xs text-amber-400">
            {dirtyIds.length} project{dirtyIds.length > 1 ? 's' : ''} with unsaved changes
          </span>
          <div className="flex gap-2">
            <button className="btn-secondary text-xs" onClick={() => setDrafts({})}>Discard all</button>
            <button
              className="btn-primary"
              onClick={saveAll}
              disabled={saving || dirtyIds.some((id) => {
                const d = drafts[id];
                return !d?.name.trim() || !d?.cwd.trim() || !d?.command.trim();
              })}
            >
              {saving ? 'Saving…' : `● Save all (${dirtyIds.length})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
