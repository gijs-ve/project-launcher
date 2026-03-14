import { useRef, useState, useEffect } from 'react';
import { LAUNCH_PRESETS, LaunchOptions } from '../types';

interface SplitStartButtonProps {
  /** Called for a normal start (no extra options) */
  onStart: () => void;
  /** Called for a modified start with the chosen preset's options */
  onStartWith: (opts: LaunchOptions) => void;
  /** Text label for the primary button. Defaults to "▶ Start" */
  label?: string;
  /** If true, the dropdown opens upward instead of downward */
  dropUp?: boolean;
}

export function SplitStartButton({
  onStart,
  onStartWith,
  label = '▶ Start',
  dropUp = false,
}: SplitStartButtonProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative flex items-center">
      {/* Primary start button */}
      <button
        onClick={onStart}
        className="px-3 py-1 rounded-l bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono transition-colors"
      >
        {label}
      </button>

      {/* Divider */}
      <span className="w-px self-stretch bg-blue-500/40" />

      {/* Chevron trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="More launch options"
        className="px-1.5 py-1 rounded-r bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono transition-colors"
      >
        {open ? '▴' : '▾'}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className={[
            'absolute left-0 z-50 min-w-[220px] bg-zinc-800 border border-zinc-700 rounded-md shadow-xl overflow-hidden',
            dropUp ? 'bottom-full mb-1' : 'top-full mt-1',
          ].join(' ')}
        >
          <p className="px-3 py-1.5 text-[10px] font-mono text-zinc-500 uppercase tracking-wider border-b border-zinc-700">
            Start with options
          </p>
          {LAUNCH_PRESETS.map((preset) => (
            <button
              key={preset.label}
              className="w-full flex flex-col gap-0.5 px-3 py-2 text-left hover:bg-zinc-700 transition-colors"
              onClick={() => {
                setOpen(false);
                onStartWith(preset.options);
              }}
            >
              <span className="text-xs font-mono text-zinc-100">{preset.label}</span>
              <span className="text-[10px] font-mono text-zinc-500">{preset.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
