import React from 'react';
import { X, Send } from 'lucide-react';
import type { Message } from '../../store/chatStore';

interface ThreadViewProps {
  parentMessage: Message;
  threadText: string;
  onThreadTextChange: (val: string) => void;
  onSendThreadMessage: (e: React.FormEvent) => void;
  onCloseThread: () => void;
  threadEndRef: React.RefObject<HTMLDivElement | null>;
}

export const ThreadView: React.FC<ThreadViewProps> = ({
  parentMessage,
  threadText,
  onThreadTextChange,
  onSendThreadMessage,
  onCloseThread,
  threadEndRef,
}) => {
  return (
    <aside className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col h-full z-10">
      {/* Header */}
      <div className="h-14 px-4 border-b border-slate-800 flex items-center justify-between">
        <h3 className="font-bold text-slate-200 text-sm">Thread Reply</h3>
        <button
          onClick={onCloseThread}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Parent message preview */}
      <div className="p-4 border-b border-slate-800/80 bg-slate-950/40">
        <div className="flex items-center space-x-2 mb-1">
          <span className="font-semibold text-xs text-slate-300">
            User {parentMessage.sender_id.substring(0, 6)}
          </span>
          <span className="text-[10px] text-slate-500">
            {new Date(parentMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <p className="text-slate-300 text-sm">{parentMessage.content}</p>
      </div>

      {/* Thread messages stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="text-xs text-slate-500 text-center">Replies to this thread</div>
        <div ref={threadEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={onSendThreadMessage} className="p-3 border-t border-slate-800/80 bg-slate-950">
        <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 focus-within:border-indigo-500/60 transition">
          <input
            type="text"
            value={threadText}
            onChange={(e) => onThreadTextChange(e.target.value)}
            placeholder="Reply in thread..."
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!threadText.trim()}
            className="p-1.5 rounded-lg bg-indigo-600 text-white disabled:opacity-40 hover:bg-indigo-500 transition"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </aside>
  );
};
