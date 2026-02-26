import { createContext, useContext, useState, useMemo, ReactNode } from 'react';

// ── types ──────────────────────────────────────────────────────────────────

export type Shortcut = {
  /** Logical action identifier, e.g. "navigate-0" */
  action: string;
  /** The key the user has bound, e.g. "1", "a", "F2" */
  key: string;
};

interface ShortcutsContextValue {
  /** action → key */
  shortcuts: Record<string, string>;
  /** key → action  (inverse, derived) */
  keyToAction: Record<string, string>;
  setShortcut: (action: string, key: string) => void;
  clearShortcut: (action: string) => void;
  resetShortcuts: () => void;
}

// ── defaults ───────────────────────────────────────────────────────────────

function defaultShortcuts(): Record<string, string> {
  // navigate-0 → '1', navigate-1 → '2', … navigate-8 → '9'
  const map: Record<string, string> = {};
  for (let i = 0; i < 9; i++) map[`navigate-${i}`] = String(i + 1);
  return map;
}

function load(): Record<string, string> {
  try {
    const raw = localStorage.getItem('launch-shortcuts');
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch { /* ignore */ }
  return defaultShortcuts();
}

function save(map: Record<string, string>) {
  localStorage.setItem('launch-shortcuts', JSON.stringify(map));
}

// ── context ────────────────────────────────────────────────────────────────

const ShortcutsContext = createContext<ShortcutsContextValue | null>(null);

export function ShortcutsProvider({ children }: { children: ReactNode }) {
  const [shortcuts, setShortcuts] = useState<Record<string, string>>(load);

  const keyToAction = useMemo(
    () => Object.fromEntries(Object.entries(shortcuts).map(([action, key]) => [key, action])),
    [shortcuts],
  );

  const setShortcut = (action: string, key: string) => {
    setShortcuts((prev) => {
      // Remove any previous binding for the same key (avoid duplicates)
      const next: Record<string, string> = {};
      for (const [a, k] of Object.entries(prev)) {
        if (k !== key) next[a] = k;
      }
      next[action] = key;
      save(next);
      return next;
    });
  };

  const clearShortcut = (action: string) => {
    setShortcuts((prev) => {
      const next = { ...prev };
      delete next[action];
      save(next);
      return next;
    });
  };

  const resetShortcuts = () => {
    const defaults = defaultShortcuts();
    save(defaults);
    setShortcuts(defaults);
  };

  return (
    <ShortcutsContext.Provider value={{ shortcuts, keyToAction, setShortcut, clearShortcut, resetShortcuts }}>
      {children}
    </ShortcutsContext.Provider>
  );
}

export function useShortcuts() {
  const ctx = useContext(ShortcutsContext);
  if (!ctx) throw new Error('useShortcuts must be used inside ShortcutsProvider');
  return ctx;
}
