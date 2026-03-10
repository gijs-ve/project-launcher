import { useState, useEffect, useRef } from 'react';
import { useConfig } from '../context/ConfigContext';
import { JiraUser } from '../types';

interface Props {
  user: JiraUser;
  /** Highlight as the current authenticated user */
  isMe?: boolean;
  /** Tailwind text-size class, defaults to text-xs */
  size?: string;
}

/**
 * Renders a user's display name. Click it to open a popup to save
 * them to the saved-assignees list in settings. Click outside or
 * press Escape to dismiss.
 */
export function AssigneeChip({ user, isMe = false, size = 'text-xs' }: Props) {
  const { config, saveConfig } = useConfig();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  const isSaved = saved || (config.jira?.savedAssignees ?? []).some(
    (u) => u.accountId === user.accountId,
  );

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSaved) return;
    const existing = config.jira?.savedAssignees ?? [];
    await saveConfig({
      ...config,
      jira: { ...config.jira!, savedAssignees: [...existing, user] },
    });
    setSaved(true);
  };

  return (
    <span ref={ref} className="relative inline-flex items-center">
      {/* Name — click to toggle popup */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={[
          'font-mono cursor-pointer hover:underline decoration-dotted underline-offset-2',
          size,
          isMe ? 'text-sky-400 font-semibold' : 'text-zinc-200',
        ].join(' ')}
      >
        {isMe && '● '}
        {user.displayName}
      </button>

      {/* Popup */}
      {open && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50">
          {isSaved ? (
            <span className="whitespace-nowrap font-mono text-[10px] text-emerald-400 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 shadow-lg">
              ✓ in settings
            </span>
          ) : (
            <button
              onClick={handleSave}
              className="whitespace-nowrap font-mono text-[10px] text-zinc-300 hover:text-emerald-400 bg-zinc-800 border border-zinc-700 hover:border-emerald-700 rounded px-2 py-1 shadow-lg transition-colors cursor-pointer"
            >
              + Add to settings
            </button>
          )}
        </span>
      )}
    </span>
  );
}

