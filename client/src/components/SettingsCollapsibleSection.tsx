import { ReactNode, useState } from 'react';

interface SettingsCollapsibleSectionProps {
  title: string;
  description?: string;
  /** Small inline hint shown in the header when not dirty (e.g. current value). */
  hint?: ReactNode;
  /** When true, shows an amber ● next to the title. */
  dirty?: boolean;
  /** Whether the section starts expanded. Defaults to false. */
  defaultOpen?: boolean;
  children: ReactNode;
}

export function SettingsCollapsibleSection({
  title,
  description,
  hint,
  dirty = false,
  defaultOpen = false,
  children,
}: SettingsCollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden shrink-0">
      {/* ── Header ─────────────────────────────────────────── */}
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 bg-zinc-800/50 hover:bg-zinc-800 transition-colors text-left"
        onClick={() => setIsOpen((v) => !v)}
      >
        <span className="font-mono text-xs text-zinc-500 shrink-0 w-3">
          {isOpen ? '▼' : '▶'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-mono text-sm font-medium text-zinc-200">{title}</p>
            {dirty && <span className="font-mono text-xs text-amber-400">●</span>}
            {!dirty && hint && (
              <span className="font-mono text-xs text-zinc-500 truncate">{hint}</span>
            )}
          </div>
          {description && (
            <p className="font-mono text-xs text-zinc-500 mt-0.5 leading-relaxed">{description}</p>
          )}
        </div>
      </button>

      {/* ── Body ───────────────────────────────────────────── */}
      {isOpen && (
        <div className="px-4 py-4 bg-zinc-900 border-t border-zinc-800 flex flex-col gap-4">
          {children}
        </div>
      )}
    </div>
  );
}
