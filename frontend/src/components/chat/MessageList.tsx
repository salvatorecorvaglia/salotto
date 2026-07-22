import React from 'react';
import { MessageItem } from './MessageItem';
import type { Message } from '../../store/chatStore';

interface MessageListProps {
  messages: Message[];
  currentUserId: string | undefined;
  typingUsers?: string[];
  messageEndRef: React.RefObject<HTMLDivElement | null>;
  onOpenThread: (message: Message) => void;
  onAddReaction: (messageId: string, emoji: string) => void;
  onRemoveReaction: (messageId: string, emoji: string) => void;
  onDeleteMessage: (messageId: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  currentUserId,
  typingUsers = [],
  messageEndRef,
  onOpenThread,
  onAddReaction,
  onRemoveReaction,
  onDeleteMessage,
}) => {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
          <p className="text-sm">No messages yet. Start the conversation!</p>
        </div>
      ) : (
        messages.map((msg) => (
          <MessageItem
            key={msg.id}
            message={msg}
            currentUserId={currentUserId}
            onOpenThread={onOpenThread}
            onAddReaction={onAddReaction}
            onRemoveReaction={onRemoveReaction}
            onDeleteMessage={onDeleteMessage}
          />
        ))
      )}

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <div className="px-4 text-xs text-indigo-400 animate-pulse italic flex items-center space-x-1">
          <span>
            {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
          </span>
        </div>
      )}

      <div ref={messageEndRef} />
    </div>
  );
};
