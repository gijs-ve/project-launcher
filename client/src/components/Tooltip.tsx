import { useState, useRef, useEffect } from 'react';

interface Props {
  text: string;
  children: React.ReactNode;
  /** Where to place the tooltip relative to the trigger. Defaults to 'top'. */
  placement?: 'top' | 'bottom';
  /** Extra classes on the tooltip bubble. */
  className?: string;
}

/**
 * Reusable hover tooltip.
 *
 * Usage:
 *   <Tooltip text="Explain something">
 *     <button>hover me</button>
 *   </Tooltip>
 */
export function Tooltip({ text, children, placement = 'top', className = '' }: Props) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Small delay before showing so fast mouse-overs don't flash
  const show = () => { timer.current = setTimeout(() => setVisible(true), 120); };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
  };

  // Clean up on unmount
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={[
            'pointer-events-none absolute z-50 whitespace-nowrap',
            'font-mono text-[10px] text-zinc-300',
            'bg-zinc-800 border border-zinc-700 rounded px-2 py-1 shadow-lg',
            placement === 'top'
              ? 'bottom-full left-1/2 -translate-x-1/2 mb-1.5'
              : 'top-full left-1/2 -translate-x-1/2 mt-1.5',
            className,
          ].join(' ')}
        >
          {text}
        </span>
      )}
    </span>
  );
}
