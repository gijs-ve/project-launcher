import { useEffect, useRef, useState, useCallback } from 'react';
import { useProcesses } from '../context/ProcessesContext';

const MIN_HEIGHT = 100;
const MAX_HEIGHT = 700;
const DEFAULT_HEIGHT = 260;

interface LogPanelProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
}

export function LogPanel({ projectId, projectName, onClose }: LogPanelProps) {
  const { logs, subscribeOutput, unsubscribeOutput, sendInput } = useProcesses();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const dragState = useRef<{ startY: number; startH: number } | null>(null);
  const [inputValue, setInputValue] = useState('');

  const handleSend = useCallback((value: string) => {
    // node-pty expects \r for Enter, not \n
    sendInput(projectId, value + '\r');
    setInputValue('');
  }, [sendInput, projectId]);

  // Subscribe to this project's output while the panel is open
  useEffect(() => {
    subscribeOutput(projectId);
    return () => unsubscribeOutput(projectId);
  }, [projectId, subscribeOutput, unsubscribeOutput]);

  // Auto-scroll to the bottom when new lines arrive
  const lines = logs[projectId] ?? [];
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length]);

  // Resize drag handlers
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragState.current) return;
      const delta = dragState.current.startY - e.clientY;
      setHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, dragState.current.startH + delta)));
    };
    const onMouseUp = () => { dragState.current = null; };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const onDragHandleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragState.current = { startY: e.clientY, startH: height };
  };

  return (
    <div className="border-t border-zinc-800 bg-zinc-950 flex flex-col" style={{ height }}>
      {/* Resize handle */}
      <div
        onMouseDown={onDragHandleMouseDown}
        className="h-1.5 w-full shrink-0 cursor-ns-resize group flex items-center justify-center hover:bg-zinc-700 transition-colors"
        title="Drag to resize"
      >
        <div className="w-8 h-0.5 rounded-full bg-zinc-700 group-hover:bg-zinc-400 transition-colors" />
      </div>

      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-zinc-800 shrink-0">
        <span className="text-xs font-mono text-zinc-400">
          ▼ <span className="text-zinc-200">{projectName}</span> — live output
        </span>
        <button
          onClick={onClose}
          className="text-xs font-mono text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          ✕ close
        </button>
      </div>

      {/* Output */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {lines.length === 0 ? (
          <p className="text-xs font-mono text-zinc-600">Waiting for output…</p>
        ) : (
          lines.map((line, i) => (
            <pre
              key={i}
              className="text-xs font-mono text-zinc-300 whitespace-pre-wrap break-all leading-5"
            >
              {line}
            </pre>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Stdin input bar */}
      <div className="shrink-0 border-t border-zinc-800 flex items-center px-3 py-1.5 gap-2">
        <span className="font-mono text-xs text-zinc-500 select-none">$</span>
        <input
          className="flex-1 bg-transparent font-mono text-xs text-zinc-200 outline-none placeholder-zinc-600 caret-zinc-300"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSend(inputValue);
            } else if (e.key === 'c' && e.ctrlKey) {
              e.preventDefault();
              sendInput(projectId, '\x03'); // Ctrl+C
            }
          }}
          placeholder="type a command and press Enter…"
          spellCheck={false}
          autoComplete="off"
        />
      </div>
    </div>
  );
}
