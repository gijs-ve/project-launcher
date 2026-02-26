import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  onDismiss: () => void;
}

export function Toast({ message, onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300); // allow fade-out before removal
    }, 4000);
    return () => clearTimeout(id);
  }, [onDismiss]);

  return (
    <div
      className={[
        'fixed bottom-4 right-4 z-50 bg-red-900 border border-red-700 text-red-100 px-4 py-2 rounded font-mono text-sm shadow-lg transition-opacity duration-300',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
    >
      {message}
    </div>
  );
}
