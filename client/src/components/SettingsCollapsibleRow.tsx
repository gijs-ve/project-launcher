import { ReactNode } from 'react';

interface SettingsCollapsibleRowProps {
  title: string;
  summary?: string;
  badge?: ReactNode;
  /** Left-border accent colour. Defaults to a neutral zinc-600-equivalent gray. */
  accentColor?: string;
  isOpen: boolean;
  onToggle: () => void;
  /** Rendered in the header, click-propagation stopped so they don't toggle the row. */
  headerActions?: ReactNode;
  /** When true, title is rendered in amber with a ● indicator. */
  dirty?: boolean;
  children: ReactNode;
}

export function SettingsCollapsibleRow({
  title,
  summary,
  badge,
  accentColor,
  isOpen,
  onToggle,
  headerActions,
  dirty = false,
  children,
}: SettingsCollapsibleRowProps) {
  const borderColor = accentColor ?? '#52525b'; // neutral gray matching zinc-600

  return (
    <div className="first:rounded-t-lg last:rounded-b-lg overflow-hidden shrink-0">
      {/* ── Collapsed header bar ────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 transition-colors cursor-pointer select-none"
        style={{ borderLeft: `3px solid ${borderColor}` }}
        onClick={onToggle}
      >
        <span className="font-mono text-xs text-zinc-500 w-3 shrink-0">
          {isOpen ? '▼' : '▶'}
        </span>

        {/* Title */}
        <span
          className={[
            'font-mono text-sm w-36 shrink-0 truncate',
            dirty ? 'text-amber-300' : 'text-zinc-100',
          ].join(' ')}
        >
          {title}
          {dirty && ' ●'}
        </span>

        {/* Summary */}
        {summary ? (
          <span className="font-mono text-xs text-zinc-500 flex-1 min-w-0 truncate">{summary}</span>
        ) : (
          <span className="flex-1" />
        )}

        {/* Badge */}
        {badge}

        {/* Header actions (Delete, Discard, …) — stop-propagated */}
        {headerActions && (
          <div
            className="flex items-center gap-2 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {headerActions}
          </div>
        )}
      </div>

      {/* ── Expanded body ───────────────────────────────────── */}
      {isOpen && (
        <div
          className="bg-zinc-900 border-t border-zinc-800 px-4 py-4"
          style={{ borderLeft: `3px solid ${borderColor}` }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
