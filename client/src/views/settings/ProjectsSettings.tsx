import { useState } from 'react';
import { useConfig } from '../../context/ConfigContext';
import { Project } from '../../types';
import { ProjectFields, ProjectDraft, projectToDraft, isDraftDirty, DEFAULT_COLOR } from './ProjectFields';

const DEFAULT_CATEGORY_COLOR = '#6366f1';
import { SettingsHeader } from '../../components/SettingsHeader';
import { SettingsCollapsibleRow } from '../../components/SettingsCollapsibleRow';

function toId(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const BLANK_DRAFT: ProjectDraft = {
  name: '', cwd: '', command: '', url: '', color: DEFAULT_COLOR, categoryId: '', links: [],
  jiraProjectKeys: '', jiraBoardUrl: '',
};

export function ProjectsSettings() {
  const { config, saveConfig, saveProject, deleteProject, saveCategory, deleteCategory, loading } = useConfig();

  const [drafts, setDrafts]     = useState<Record<string, ProjectDraft>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, setSaving]     = useState(false);

  const [addingProject, setAddingProject] = useState(false);
  const [newDraft, setNewDraft]           = useState<ProjectDraft>({ ...BLANK_DRAFT });

  const [addingCategory, setAddingCategory]           = useState(false);
  const [newCategoryName, setNewCategoryName]         = useState('');
  const [newCategoryColor, setNewCategoryColor]       = useState(DEFAULT_CATEGORY_COLOR);
  const [editingCategoryId, setEditingCategoryId]     = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [editingCategoryColor, setEditingCategoryColor] = useState(DEFAULT_CATEGORY_COLOR);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="font-mono text-zinc-500 text-sm">Loading…</p>
      </div>
    );
  }

  const categories = config.categories ?? [];

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
    try {
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
            categoryId: d.categoryId || undefined,
            links: d.links.length > 0 ? d.links : undefined,
            jiraProjectKeys: d.jiraProjectKeys.split(',').map((k) => k.trim().toUpperCase()).filter(Boolean),
            jiraBoardUrl: d.jiraBoardUrl.trim() || undefined,
          });
        }),
      );
      setDrafts((prev) => {
        const n = { ...prev };
        dirtyIds.forEach((id) => delete n[id]);
        return n;
      });
    } catch {
      // Error already surfaced via global Toast from ConfigContext
    } finally {
      setSaving(false);
    }
  };

  const saveNewProject = async () => {
    if (!newDraft.name.trim() || !newDraft.cwd.trim() || !newDraft.command.trim()) return;
    setSaving(true);
    try {
      await saveProject({
        id: toId(newDraft.name),
        name: newDraft.name.trim(),
        cwd: newDraft.cwd.trim(),
        command: newDraft.command.trim(),
        url: newDraft.url.trim() || undefined,
        color: newDraft.color,
        categoryId: newDraft.categoryId || undefined,
        links: newDraft.links.length > 0 ? newDraft.links : undefined,
        jiraProjectKeys: newDraft.jiraProjectKeys.split(',').map((k) => k.trim().toUpperCase()).filter(Boolean),
        jiraBoardUrl: newDraft.jiraBoardUrl.trim() || undefined,
      });
      setNewDraft({ ...BLANK_DRAFT });
      setAddingProject(false);
    } catch {
      // Error already surfaced via global Toast from ConfigContext
    } finally {
      setSaving(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    await saveCategory({ id: toId(newCategoryName), name: newCategoryName.trim(), color: newCategoryColor });
    setNewCategoryName('');
    setNewCategoryColor(DEFAULT_CATEGORY_COLOR);
    setAddingCategory(false);
  };

  const handleRenameCategory = async (id: string) => {
    if (!editingCategoryName.trim()) return;
    await saveCategory({ id, name: editingCategoryName.trim(), color: editingCategoryColor });
    setEditingCategoryId(null);
    setEditingCategoryName('');
  };

  const moveCategory = async (id: string, direction: -1 | 1) => {
    const cats = [...(config.categories ?? [])];
    const idx = cats.findIndex((c) => c.id === id);
    if (idx === -1) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= cats.length) return;
    [cats[idx], cats[newIdx]] = [cats[newIdx], cats[idx]];
    await saveConfig({ ...config, categories: cats });
  };

  const moveProject = async (id: string, direction: -1 | 1) => {
    const projects = [...config.projects];
    const idx = projects.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= projects.length) return;
    [projects[idx], projects[newIdx]] = [projects[newIdx], projects[idx]];
    await saveConfig({ ...config, projects });
  };

  return (
    <div className="flex-1 p-6 flex flex-col gap-6">
      <SettingsHeader
        title="Projects"
        description="Manage the projects that appear in your Projects view."
        actions={
          <>
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
          </>
        }
      />

      {/* ── Categories ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs text-zinc-400 uppercase tracking-widest">Categories</span>
          <button
            className="btn-secondary text-xs"
            onClick={() => { setAddingCategory(true); setNewCategoryName(''); setNewCategoryColor(DEFAULT_CATEGORY_COLOR); }}
          >
            + Add
          </button>
        </div>

        {categories.length === 0 && !addingCategory && (
          <p className="font-mono text-xs text-zinc-600">No categories yet.</p>
        )}

        <div className="flex flex-col gap-px">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-md"
            >
              {editingCategoryId === cat.id ? (
                <>
                  <input
                    type="color"
                    value={editingCategoryColor}
                    onChange={(e) => setEditingCategoryColor(e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 shrink-0"
                  />
                  <input
                    className="input text-xs flex-1"
                    value={editingCategoryName}
                    onChange={(e) => setEditingCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameCategory(cat.id);
                      if (e.key === 'Escape') { setEditingCategoryId(null); setEditingCategoryName(''); }
                    }}
                    autoFocus
                  />
                  <button className="btn-primary text-xs" onClick={() => handleRenameCategory(cat.id)}>Save</button>
                  <button className="btn-secondary text-xs" onClick={() => { setEditingCategoryId(null); setEditingCategoryName(''); }}>Cancel</button>
                </>
              ) : (
                <>
                  <span className="font-mono text-sm shrink-0" style={{ color: cat.color ?? DEFAULT_CATEGORY_COLOR }}>●</span>
                  <span className="font-mono text-sm text-zinc-200 flex-1">{cat.name}</span>
                  <span className="font-mono text-xs text-zinc-600">
                    {config.projects.filter((p) => p.categoryId === cat.id).length} projects
                  </span>
                  <button
                    className="btn-secondary text-xs px-1.5"
                    onClick={() => moveCategory(cat.id, -1)}
                    disabled={categories.indexOf(cat) === 0}
                    title="Move up"
                  >↑</button>
                  <button
                    className="btn-secondary text-xs px-1.5"
                    onClick={() => moveCategory(cat.id, 1)}
                    disabled={categories.indexOf(cat) === categories.length - 1}
                    title="Move down"
                  >↓</button>
                  <button
                    className="btn-secondary text-xs"
                    onClick={() => { setEditingCategoryId(cat.id); setEditingCategoryName(cat.name); setEditingCategoryColor(cat.color ?? DEFAULT_CATEGORY_COLOR); }}
                  >
                    Edit
                  </button>
                  <button className="btn-danger text-xs" onClick={() => deleteCategory(cat.id)}>Delete</button>
                </>
              )}
            </div>
          ))}
        </div>

        {addingCategory && (
          <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md">
            <input
              type="color"
              value={newCategoryColor}
              onChange={(e) => setNewCategoryColor(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 shrink-0"
            />
            <input
              className="input text-xs flex-1"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddCategory();
                if (e.key === 'Escape') setAddingCategory(false);
              }}
              placeholder="Category name"
              autoFocus
            />
            <button className="btn-primary text-xs" onClick={handleAddCategory} disabled={!newCategoryName.trim()}>Add</button>
            <button className="btn-secondary text-xs" onClick={() => setAddingCategory(false)}>Cancel</button>
          </div>
        )}
      </div>

      {/* ── New project form ── */}
      {addingProject && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4">
          <p className="font-mono text-xs text-zinc-400 mb-3">New project</p>
          <ProjectFields
            draft={newDraft}
            onChange={(patch) => setNewDraft((d) => ({ ...d, ...patch }))}
            categories={categories}
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

      {/* ── Project list ── */}
      <div className="flex flex-col gap-px border border-zinc-800 rounded-lg overflow-hidden">
        {config.projects.length === 0 && (
          <p className="font-mono text-zinc-500 text-xs p-4">No projects yet.</p>
        )}
        {config.projects.map((project) => {
          const isOpen     = expanded.has(project.id);
          const draft      = getDraft(project);
          const dirty      = drafts[project.id] ? isDraftDirty(drafts[project.id], project) : false;
          const draftValid = draft.name.trim() && draft.cwd.trim() && draft.command.trim();

          return (
            <SettingsCollapsibleRow
              key={project.id}
              title={draft.name || project.name}
              summary={project.cwd}
              badge={
                <div className="flex items-center gap-1.5 shrink-0">
                  <code className="font-mono text-xs text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded truncate max-w-[200px]">
                    {project.command}
                  </code>
                  {project.categoryId && (() => {
                    const cat = categories.find((c) => c.id === project.categoryId);
                    return cat ? (
                      <span className="font-mono text-xs bg-zinc-800 px-1.5 py-0.5 rounded" style={{ color: cat.color ?? DEFAULT_CATEGORY_COLOR }}>
                        {cat.name}
                      </span>
                    ) : null;
                  })()}
                </div>
              }
              accentColor={project.color}
              isOpen={isOpen}
              onToggle={() => toggleExpand(project)}
              dirty={dirty}
              headerActions={
                <>
                  <button
                    className="btn-secondary text-xs px-1.5"
                    onClick={() => moveProject(project.id, -1)}
                    disabled={config.projects.indexOf(project) === 0}
                    title="Move up"
                  >↑</button>
                  <button
                    className="btn-secondary text-xs px-1.5"
                    onClick={() => moveProject(project.id, 1)}
                    disabled={config.projects.indexOf(project) === config.projects.length - 1}
                    title="Move down"
                  >↓</button>
                  {dirty && (
                    <button
                      className="btn-secondary text-xs text-zinc-500"
                      onClick={() => discardDraft(project.id)}
                    >
                      ✕ Discard
                    </button>
                  )}
                  <button className="btn-danger text-xs" onClick={() => deleteProject(project.id)}>
                    Delete
                  </button>
                </>
              }
            >
              <ProjectFields
                draft={draft}
                onChange={(patch) => patchDraft(project.id, patch)}
                categories={categories}
              />
              {!draftValid && (
                <p className="font-mono text-xs text-red-400 mt-2">Name, directory and command are required.</p>
              )}
            </SettingsCollapsibleRow>
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
