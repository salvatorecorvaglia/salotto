import React from 'react';
import type { Message } from '../../store/chatStore';
import { API_BASE } from '../../store/chatStore';
import { MessageCircle, Trash2 } from 'lucide-react';

interface MessageItemProps {
  message: Message;
  currentUserId: string | undefined;
  onOpenThread: (message: Message) => void;
  onAddReaction: (messageId: string, emoji: string) => void;
  onRemoveReaction: (messageId: string, emoji: string) => void;
  onDeleteMessage: (messageId: string) => void;
}

const EMOJI_PRESETS = ['👍', '❤️', '😂', '🔥', '😮', '😢'];

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  currentUserId,
  onOpenThread,
  onAddReaction,
  onRemoveReaction,
  onDeleteMessage,
}) => {
  const isSender = message.sender_id === currentUserId;

  const getAttachmentUrl = (key: string) => {
    if (key.startsWith('http')) return key;
    return `${API_BASE}/files/download/${key}`;
  };

  return (
    <div className="group relative flex space-x-3 px-4 py-2 hover:bg-slate-900/40 rounded-xl transition duration-150">
      {/* Avatar placeholder */}
      <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-300 flex-shrink-0">
        {message.sender_id.substring(0, 2).toUpperCase()}
      </div>

      <div className="flex-1 overflow-hidden">
        {/* Header */}
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-slate-200 text-sm">
            {message.sender_id === currentUserId ? 'You' : `User ${message.sender_id.substring(0, 6)}`}
          </span>
          <span className="text-xs text-slate-500">
            {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {message.is_edited && <span className="text-[10px] text-slate-600 font-mono">(edited)</span>}
        </div>

        {/* Content */}
        <p className="text-slate-300 text-sm mt-0.5 whitespace-pre-wrap break-words">{message.content}</p>

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.attachments.map((att, idx) => (
              <a
                key={idx}
                href={getAttachmentUrl(att.key)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-850 border border-slate-800 text-xs text-indigo-400 hover:text-indigo-300 transition"
              >
                <span>📎 {att.filename}</span>
              </a>
            ))}
          </div>
        )}

        {/* Reactions List */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {Object.entries(
              message.reactions.reduce<Record<string, string[]>>((acc, r) => {
                acc[r.emoji] = acc[r.emoji] || [];
                acc[r.emoji].push(r.user_id);
                return acc;
              }, {})
            ).map(([emoji, users]) => {
              const hasReacted = currentUserId ? users.includes(currentUserId) : false;
              return (
                <button
                  key={emoji}
                  onClick={() =>
                    hasReacted
                      ? onRemoveReaction(message.id, emoji)
                      : onAddReaction(message.id, emoji)
                  }
                  className={`flex items-center space-x-1 px-2 py-0.5 rounded-md text-xs border transition ${
                    hasReacted
                      ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span>{emoji}</span>
                  <span className="font-semibold">{users.length}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Action Toolbar */}
      <div className="absolute right-4 -top-3 hidden group-hover:flex items-center space-x-1 bg-slate-900 border border-slate-800/80 rounded-lg p-1 shadow-lg z-10">
        {EMOJI_PRESETS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => onAddReaction(message.id, emoji)}
            className="p-1 hover:bg-slate-800 rounded transition text-xs"
          >
            {emoji}
          </button>
        ))}

        <div className="w-[1px] h-4 bg-slate-800 my-auto" />

        <button
          onClick={() => onOpenThread(message)}
          title="Reply in thread"
          className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition"
        >
          <MessageCircle className="w-3.5 h-3.5" />
        </button>

        {isSender && (
          <button
            onClick={() => onDeleteMessage(message.id)}
            title="Delete Message"
            className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
