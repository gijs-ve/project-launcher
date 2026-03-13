import { ReactNode } from 'react';
import { useView } from '../context/ViewContext';

interface Props {
  title: string;
  description?: string;
  /** Optional buttons / controls rendered on the right side. */
  actions?: ReactNode;
}

/**
 * Consistent header for every settings sub-page.
 * Includes a ← Back button that returns to the settings hub.
 */
export function SettingsHeader({ title, description, actions }: Props) {
  const { setSettingsTab } = useView();
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => setSettingsTab(null)}
        className="btn-secondary text-xs shrink-0"
      >
        ← Back
      </button>
      <div className="flex-1 min-w-0">
        <h1 className="font-mono font-semibold text-zinc-100 text-base">{title}</h1>
        {description && (
          <p className="font-mono text-xs text-zinc-500 mt-0.5">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}
