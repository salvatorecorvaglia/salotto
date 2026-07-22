import React from 'react';
import { Plus, Hash, Volume2, Search, MessageCircle, UserPlus, Settings } from 'lucide-react';
import type { Channel, DirectConversation, Workspace } from '../../store/chatStore';

interface ChannelListProps {
  activeWorkspace: Workspace | null;
  channels: Channel[];
  directConversations: DirectConversation[];
  activeChannelId: string | null;
  activeConversationId: string | null;
  currentUser: any;
  presences: Record<string, string>;
  onSelectChannel: (id: string) => void;
  onSelectConversation: (id: string) => void;
  onOpenNewChannel: () => void;
  onOpenNewDm: () => void;
  onOpenWorkspaceSettings: () => void;
  onOpenSearch: () => void;
}

export const ChannelList: React.FC<ChannelListProps> = ({
  activeWorkspace,
  channels,
  directConversations,
  activeChannelId,
  activeConversationId,
  currentUser,
  presences,
  onSelectChannel,
  onSelectConversation,
  onOpenNewChannel,
  onOpenNewDm,
  onOpenWorkspaceSettings,
  onOpenSearch,
}) => {
  if (!activeWorkspace) {
    return (
      <div className="w-64 bg-slate-900 border-r border-slate-800/80 flex items-center justify-center text-slate-500 text-sm">
        No Workspace Selected
      </div>
    );
  }

  const textChannels = channels.filter((c) => c.kind === 'text');
  const voiceChannels = channels.filter((c) => c.kind === 'voice');

  return (
    <div className="w-64 bg-slate-900 border-r border-slate-800/80 flex flex-col h-full select-none">
      {/* Header / Workspace Title */}
      <div className="h-14 px-4 border-b border-slate-800/80 flex items-center justify-between">
        <h2 className="font-bold text-slate-100 truncate flex-1">{activeWorkspace.name}</h2>
        <button
          onClick={onOpenWorkspaceSettings}
          title="Workspace Settings & Invites"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Global Search trigger */}
      <div className="p-3">
        <button
          onClick={onOpenSearch}
          className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl bg-slate-950/60 text-slate-400 text-sm hover:bg-slate-950 transition border border-slate-800/60"
        >
          <Search className="w-4 h-4 text-slate-500" />
          <span>Search workspace...</span>
        </button>
      </div>

      {/* Channels & DMs Tree */}
      <div className="flex-1 overflow-y-auto px-2 space-y-6">
        {/* Text Channels */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-xs font-semibold text-slate-500 tracking-wider uppercase">
              Channels
            </span>
            <button
              onClick={onOpenNewChannel}
              title="Create Channel"
              className="p-1 text-slate-500 hover:text-slate-300 rounded transition"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-0.5">
            {textChannels.map((c) => {
              const isActive = c.id === activeChannelId;
              return (
                <button
                  key={c.id}
                  onClick={() => onSelectChannel(c.id)}
                  className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-sm transition ${
                    isActive
                      ? 'bg-indigo-600/20 text-indigo-300 font-medium'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
                >
                  <Hash className="w-4 h-4 text-slate-500" />
                  <span className="truncate">{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Voice Channels */}
        {voiceChannels.length > 0 && (
          <div>
            <div className="px-2 mb-1">
              <span className="text-xs font-semibold text-slate-500 tracking-wider uppercase">
                Voice Rooms
              </span>
            </div>
            <div className="space-y-0.5">
              {voiceChannels.map((c) => {
                const isActive = c.id === activeChannelId;
                return (
                  <button
                    key={c.id}
                    onClick={() => onSelectChannel(c.id)}
                    className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-sm transition ${
                      isActive
                        ? 'bg-emerald-600/20 text-emerald-300 font-medium'
                        : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                    }`}
                  >
                    <Volume2 className="w-4 h-4 text-emerald-500" />
                    <span className="truncate">{c.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Direct Messages */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-xs font-semibold text-slate-500 tracking-wider uppercase">
              Direct Messages
            </span>
            <button
              onClick={onOpenNewDm}
              title="Start DM"
              className="p-1 text-slate-500 hover:text-slate-300 rounded transition"
            >
              <UserPlus className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-0.5">
            {directConversations.map((dm) => {
              const isActive = dm.id === activeConversationId;
              const otherMembers = dm.members.filter((m) => m.id !== currentUser?.id);
              const label =
                otherMembers.length > 0
                  ? otherMembers.map((m) => m.display_name || m.username).join(', ')
                  : 'Self Direct Message';

              const isOnline = otherMembers.some((m) => presences[m.id] === 'online');

              return (
                <button
                  key={dm.id}
                  onClick={() => onSelectConversation(dm.id)}
                  className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg text-sm transition ${
                    isActive
                      ? 'bg-indigo-600/20 text-indigo-300 font-medium'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
                >
                  <div className="relative">
                    <MessageCircle className="w-4 h-4 text-slate-500" />
                    {isOnline && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full border border-slate-900" />
                    )}
                  </div>
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
