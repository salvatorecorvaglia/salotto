import React, { useRef } from 'react';
import { Send, Paperclip, X } from 'lucide-react';
import type { Attachment } from '../../store/chatStore';

interface MessageInputProps {
  value: string;
  onChange: (val: string) => void;
  onSend: (e: React.FormEvent) => void;
  onTyping: () => void;
  attachments: Attachment[];
  onUploadFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveAttachment: (index: number) => void;
  uploading: boolean;
  placeholder?: string;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  value,
  onChange,
  onSend,
  onTyping,
  attachments,
  onUploadFile,
  onRemoveAttachment,
  uploading,
  placeholder = 'Type your message...',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend(e as any);
    }
  };

  return (
    <form onSubmit={onSend} className="p-4 bg-slate-950 border-t border-slate-800/80">
      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((att, idx) => (
            <div
              key={idx}
              className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300"
            >
              <span className="truncate max-w-[150px]">{att.filename}</span>
              <button
                type="button"
                onClick={() => onRemoveAttachment(idx)}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative flex items-center bg-slate-900 border border-slate-800/80 rounded-2xl p-2 focus-within:border-indigo-500/60 transition">
        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={onUploadFile}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="p-2 text-slate-400 hover:text-slate-200 rounded-xl transition"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        <textarea
          rows={1}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            onTyping();
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 bg-transparent border-none text-slate-200 placeholder-slate-500 text-sm px-3 focus:outline-none resize-none max-h-32"
        />

        <button
          type="submit"
          disabled={(!value.trim() && attachments.length === 0) || uploading}
          className="p-2.5 rounded-xl bg-indigo-600 text-white disabled:opacity-40 disabled:hover:bg-indigo-600 hover:bg-indigo-500 transition shadow-md shadow-indigo-600/20"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
};
