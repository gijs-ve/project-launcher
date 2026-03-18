import { ReactNode, useState } from 'react';

interface CategorySectionProps {
  name: string;
  color: string;
  projectCount: number;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function CategorySection({ name, color, projectCount, children, defaultOpen = true }: CategorySectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="flex flex-col gap-3">
      <button
        className="flex items-center gap-2 text-left group"
        onClick={() => setIsOpen((v) => !v)}
      >
        <span className="font-mono text-xs text-zinc-500 w-3 shrink-0">
          {isOpen ? '▼' : '▶'}
        </span>
        <span className="font-mono text-xs shrink-0" style={{ color }}>●</span>
        <span className="font-mono text-xs text-zinc-400 uppercase tracking-widest group-hover:text-zinc-200 transition-colors">
          {name}
        </span>
        <span className="font-mono text-xs text-zinc-600">({projectCount})</span>
      </button>
      {isOpen && (
        <div className="flex flex-wrap gap-4">
          {children}
        </div>
      )}
    </div>
  );
}
