import { useEffect } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Extra classes on the inner card, e.g. max-w-sm */
  className?: string;
}

/**
 * Generic popup modal.
 *
 * – Closes on Escape key press
 * – Closes on backdrop click
 * – Traps scroll: body scroll is disabled while open
 */
export function Modal({ title, onClose, children, className = 'max-w-sm' }: ModalProps) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={[
          'bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full mx-4 flex flex-col max-h-[80vh]',
          className,
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <h2 className="font-mono text-sm font-medium text-zinc-100">{title}</h2>
          <button
            onClick={onClose}
            className="font-mono text-zinc-500 hover:text-zinc-200 transition-colors text-base leading-none px-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-4 py-4 flex flex-col gap-5">
          {children}
        </div>
      </div>
    </div>
  );
}

/** A labelled group inside a Modal (title + checkboxes etc.) */
export function ModalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        {title}
      </p>
      {children}
    </div>
  );
}
