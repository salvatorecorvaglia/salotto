import { useEffect, useState } from 'react';
import { Minus, Square, X } from 'lucide-react';

export default function TitleBar() {
  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      setIsTauri(true);
    }
  }, []);

  if (!isTauri) return null;

  const handleMinimize = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    getCurrentWindow().minimize();
  };

  const handleMaximize = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    getCurrentWindow().toggleMaximize();
  };

  const handleClose = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    getCurrentWindow().close();
  };

  return (
    <div
      data-tauri-drag-region
      className="h-10 w-full bg-[#04060b] border-b border-slate-900/60 flex items-center justify-between px-4 select-none shrink-0"
    >
      {/* App Title */}
      <div data-tauri-drag-region className="flex items-center gap-2 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
        <div className="w-2.5 h-2.5 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded" />
        <span>Salotto</span>
      </div>

      {/* Control Buttons */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={handleMinimize}
          className="p-1 hover:bg-slate-800/80 rounded transition-colors text-slate-400 hover:text-white cursor-pointer"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          className="p-1 hover:bg-slate-800/80 rounded transition-colors text-slate-400 hover:text-white cursor-pointer"
        >
          <Square className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleClose}
          className="p-1 hover:bg-rose-950/20 text-slate-400 hover:text-rose-400 rounded transition-colors cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
