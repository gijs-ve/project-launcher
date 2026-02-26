import { useState } from 'react';
import { Link } from '../types';
import { useView } from '../context/ViewContext';

interface LinkCardProps {
  link: Link;
}

export function LinkCard({ link }: LinkCardProps) {
  const { setActiveView } = useView();
  const [showWebview, setShowWebview] = useState(false);

  const handleClick = () => {
    if (link.openMode === 'browser') {
      window.open(link.url, '_blank', 'noopener,noreferrer');
    } else {
      setShowWebview(true);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className="bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-lg p-4 flex flex-col gap-2 text-left transition-colors min-w-[180px] group"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{link.openMode === 'browser' ? '🔗' : '🖥'}</span>
          <span className="font-mono font-medium text-zinc-100 text-sm group-hover:text-white">
            {link.label}
          </span>
        </div>
        <span className="font-mono text-xs text-zinc-500 truncate max-w-[200px]">{link.url}</span>
        <span className="font-mono text-xs text-zinc-600">
          {link.openMode === 'browser' ? 'Opens in browser' : 'Opens in webview'}
        </span>
      </button>

      {/* Inline webview overlay */}
      {showWebview && (
        <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
          <div className="flex items-center justify-between px-4 h-10 border-b border-zinc-800 shrink-0">
            <span className="font-mono text-sm text-zinc-300">{link.label}</span>
            <div className="flex items-center gap-3">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-zinc-400 hover:text-zinc-100"
                onClick={() => setShowWebview(false)}
              >
                ↗ Open in browser
              </a>
              <button
                onClick={() => setShowWebview(false)}
                className="font-mono text-xs text-zinc-400 hover:text-zinc-100"
              >
                ✕ Close
              </button>
              <button
                onClick={() => { setShowWebview(false); setActiveView('settings'); }}
                className="font-mono text-xs text-zinc-400 hover:text-zinc-100"
              >
                ⚙ Settings
              </button>
            </div>
          </div>
          <iframe
            src={link.url}
            className="flex-1 w-full border-0"
            title={link.label}
          />
        </div>
      )}
    </>
  );
}
