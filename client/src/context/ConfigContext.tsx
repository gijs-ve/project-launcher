import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { Config, Project, Link, Category } from '../types';

interface ConfigContextValue {
  config: Config;
  /** Replace the entire config — persists to disk */
  saveConfig: (next: Config) => Promise<void>;
  /** Convenience: upsert a project */
  saveProject: (project: Project) => Promise<void>;
  /** Convenience: remove a project */
  deleteProject: (id: string) => Promise<void>;
  /** Convenience: upsert a link */
  saveLink: (link: Link) => Promise<void>;
  /** Convenience: remove a link */
  deleteLink: (id: string) => Promise<void>;
  /** Convenience: upsert a category */
  saveCategory: (category: Category) => Promise<void>;
  /** Convenience: remove a category and clear it from projects */
  deleteCategory: (id: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<Config>({ projects: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Keep a stable ref to the last confirmed (saved) config for rollbacks
  const lastSavedRef = useRef<Config>({ projects: [], links: [] });

  // Load config on mount
  useEffect(() => {
    fetch('/api/config')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Config>;
      })
      .then((data) => {
        setConfig(data);
        lastSavedRef.current = data;
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, []);

  const saveConfig = useCallback(async (next: Config) => {
    // Snapshot current confirmed state before optimistic update
    const previous = lastSavedRef.current;
    // Optimistic update so the UI feels instant
    setConfig(next);
    try {
      const r = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const saved = (await r.json()) as Config;
      lastSavedRef.current = saved;
      setConfig(saved);
    } catch (err) {
      // Roll back to the last successfully saved state
      setConfig(previous);
      setError(String(err));
      throw err; // re-throw so callers can show inline errors
    }
  }, []);

  const saveProject = useCallback(
    async (project: Project) => {
      const existing = config.projects.find((p) => p.id === project.id);
      const projects = existing
        ? config.projects.map((p) => (p.id === project.id ? project : p))
        : [...config.projects, project];
      await saveConfig({ ...config, projects });
    },
    [config, saveConfig],
  );

  const deleteProject = useCallback(
    async (id: string) => {
      await saveConfig({
        ...config,
        projects: config.projects.filter((p) => p.id !== id),
      });
    },
    [config, saveConfig],
  );

  const saveLink = useCallback(
    async (link: Link) => {
      const existing = config.links.find((l) => l.id === link.id);
      const links = existing
        ? config.links.map((l) => (l.id === link.id ? link : l))
        : [...config.links, link];
      await saveConfig({ ...config, links });
    },
    [config, saveConfig],
  );

  const deleteLink = useCallback(
    async (id: string) => {
      await saveConfig({
        ...config,
        links: config.links.filter((l) => l.id !== id),
      });
    },
    [config, saveConfig],
  );

  const saveCategory = useCallback(
    async (category: Category) => {
      const existing = (config.categories ?? []).find((c) => c.id === category.id);
      const categories = existing
        ? (config.categories ?? []).map((c) => (c.id === category.id ? category : c))
        : [...(config.categories ?? []), category];
      await saveConfig({ ...config, categories });
    },
    [config, saveConfig],
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      await saveConfig({
        ...config,
        categories: (config.categories ?? []).filter((c) => c.id !== id),
        projects: config.projects.map((p) =>
          p.categoryId === id ? { ...p, categoryId: undefined } : p,
        ),
      });
    },
    [config, saveConfig],
  );

  return (
    <ConfigContext.Provider
      value={{ config, saveConfig, saveProject, deleteProject, saveLink, deleteLink, saveCategory, deleteCategory, loading, error }}
    >
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfig must be used inside ConfigProvider');
  return ctx;
}
