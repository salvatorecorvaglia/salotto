import React, { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useChatStore, API_BASE } from '../store/chatStore';
import {
  Plus,
  Send,
  Video,
  Hash,
  Volume2,
  LogOut,
  Settings,
  Paperclip,
  X,
  FileText,
  MessageCircle,
  Sparkles,
  Search,
} from 'lucide-react';
import CallRoom from '../components/CallRoom';

const EMOJI_LIST = ['👍', '❤️', '😂', '🔥', '😮', '😢'];

export default function MainPage() {
  const { user, token, clearAuth } = useAuthStore();
  const chatStore = useChatStore();

  // State for popups
  const [showNewWorkspace, setShowNewWorkspace] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [newWsSlug, setNewWsSlug] = useState('');
  const [newWsDesc, setNewWsDesc] = useState('');

  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChanName, setNewChanName] = useState('');
  const [newChanKind, setNewChanKind] = useState<'text' | 'voice'>('text');
  const [newChanTopic, setNewChanTopic] = useState('');
  const [newChanPrivate, setNewChanPrivate] = useState(false);

  const [showNewDm, setShowNewDm] = useState(false);
  const [workspaceMembers, setWorkspaceMembers] = useState<any[]>([]);
  const [selectedDmUsers, setSelectedDmUsers] = useState<string[]>([]);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Chat input
  const [messageText, setMessageText] = useState('');
  const [threadText, setThreadText] = useState('');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  // References
  const messageEndRef = useRef<HTMLDivElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any | null>(null);

  // Connect socket and fetch workspaces
  useEffect(() => {
    chatStore.connectSocket();
    fetchWorkspaces();
    return () => {
      chatStore.disconnectSocket();
    };
  }, []);

  // Fetch domain entities on active workspace changes
  useEffect(() => {
    if (chatStore.activeWorkspaceId) {
      fetchChannels();
      fetchDms();
      fetchWorkspaceMembers();
    }
  }, [chatStore.activeWorkspaceId]);

  // Fetch messages when active channel changes
  useEffect(() => {
    if (chatStore.activeChannelId) {
      fetchMessages();
    }
  }, [chatStore.activeChannelId]);

  // Fetch DM messages when active DM changes
  useEffect(() => {
    if (chatStore.activeConversationId) {
      fetchDmMessages();
    }
  }, [chatStore.activeConversationId]);

  // Auto-scroll messages
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatStore.messages[chatStore.activeChannelId || chatStore.activeConversationId || '']]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatStore.activeThreadParent]);

  // Handle typing status updates
  const handleTyping = () => {
    if (!chatStore.socket || !chatStore.activeChannelId) return;

    if (!typingTimeoutRef.current) {
      chatStore.socket.send(
        JSON.stringify({
          type: 'typing_start',
          payload: { channel_id: chatStore.activeChannelId },
        })
      );
    } else {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      if (chatStore.socket && chatStore.activeChannelId) {
        chatStore.socket.send(
          JSON.stringify({
            type: 'typing_stop',
            payload: { channel_id: chatStore.activeChannelId },
          })
        );
      }
      typingTimeoutRef.current = null;
    }, 2500);
  };

  // ── API Actions ──

  const fetchWorkspaces = async () => {
    try {
      const res = await fetch(`${API_BASE}/workspaces`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        chatStore.setWorkspaces(data);
        if (data.length > 0 && !chatStore.activeWorkspaceId) {
          chatStore.setActiveWorkspaceId(data[0].id);
        }
      }
    } catch (e) {
      console.error('Fetch workspaces failed', e);
    }
  };

  const createWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/workspaces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newWsName, slug: newWsSlug, description: newWsDesc }),
      });
      if (res.ok) {
        const newWs = await res.json();
        setShowNewWorkspace(false);
        setNewWsName('');
        setNewWsSlug('');
        setNewWsDesc('');
        fetchWorkspaces();
        chatStore.setActiveWorkspaceId(newWs.id);
      }
    } catch (e) {
      console.error('Create workspace failed', e);
    }
  };

  const fetchChannels = async () => {
    try {
      const res = await fetch(`${API_BASE}/workspaces/${chatStore.activeWorkspaceId}/channels`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        chatStore.setChannels(data);
        if (data.length > 0 && !chatStore.activeChannelId && !chatStore.activeConversationId) {
          chatStore.setActiveChannelId(data[0].id);
        }
      }
    } catch (e) {
      console.error('Fetch channels failed', e);
    }
  };

  const createChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/workspaces/${chatStore.activeWorkspaceId}/channels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newChanName,
          kind: newChanKind,
          topic: newChanTopic,
          is_private: newChanPrivate,
        }),
      });
      if (res.ok) {
        const newChan = await res.json();
        setShowNewChannel(false);
        setNewChanName('');
        setNewChanTopic('');
        setNewChanPrivate(false);
        fetchChannels();
        chatStore.setActiveChannelId(newChan.id);
      }
    } catch (e) {
      console.error('Create channel failed', e);
    }
  };

  const fetchDms = async () => {
    try {
      const res = await fetch(`${API_BASE}/workspaces/${chatStore.activeWorkspaceId}/dms`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        chatStore.setDirectConversations(data);
      }
    } catch (e) {
      console.error('Fetch DMs failed', e);
    }
  };

  const fetchWorkspaceMembers = async () => {
    try {
      const res = await fetch(`${API_BASE}/workspaces/${chatStore.activeWorkspaceId}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setWorkspaceMembers(data);
      }
    } catch (e) {
      console.error('Fetch workspace members failed', e);
    }
  };

  const createDm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedDmUsers.length === 0) return;

    try {
      const res = await fetch(`${API_BASE}/workspaces/${chatStore.activeWorkspaceId}/dms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_ids: selectedDmUsers }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowNewDm(false);
        setSelectedDmUsers([]);
        fetchDms();
        chatStore.setActiveConversationId(data.id);
      }
    } catch (err) {
      console.error('Create DM failed', err);
    }
  };

  const fetchMessages = async () => {
    try {
      const res = await fetch(`${API_BASE}/channels/${chatStore.activeChannelId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        chatStore.setMessages(chatStore.activeChannelId!, data.messages);
      }
    } catch (e) {
      console.error('Fetch messages failed', e);
    }
  };

  const fetchDmMessages = async () => {
    try {
      const res = await fetch(`${API_BASE}/dms/${chatStore.activeConversationId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        chatStore.setMessages(chatStore.activeConversationId!, data.messages);
      }
    } catch (e) {
      console.error('Fetch DM messages failed', e);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/files/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        const meta = await res.json();
        setAttachments([...attachments, meta]);
      }
    } catch (err) {
      console.error('File upload failed', err);
    } finally {
      setUploading(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() && attachments.length === 0) return;

    const isDm = !!chatStore.activeConversationId;
    const url = isDm 
      ? `${API_BASE}/dms/${chatStore.activeConversationId}/messages`
      : `${API_BASE}/channels/${chatStore.activeChannelId}/messages`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: messageText,
          attachments: attachments.length > 0 ? attachments : undefined,
        }),
      });

      if (res.ok) {
        const msg = await res.json();
        const activeKey = isDm ? chatStore.activeConversationId! : chatStore.activeChannelId!;
        chatStore.addMessage(activeKey, msg);
        setMessageText('');
        setAttachments([]);
      }
    } catch (err) {
      console.error('Send message failed', err);
    }
  };

  const sendThreadReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!threadText.trim()) return;

    const parent = chatStore.activeThreadParent;
    if (!parent) return;

    const isDm = !!chatStore.activeConversationId;
    const url = isDm 
      ? `${API_BASE}/dms/${chatStore.activeConversationId}/messages`
      : `${API_BASE}/channels/${chatStore.activeChannelId}/messages`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: threadText,
          parent_id: parent.id,
        }),
      });

      if (res.ok) {
        const msg = await res.json();
        const activeKey = isDm ? chatStore.activeConversationId! : chatStore.activeChannelId!;
        chatStore.addMessage(activeKey, msg);
        setThreadText('');
      }
    } catch (err) {
      console.error('Send thread reply failed', err);
    }
  };

  // Toggle reactions
  const toggleReaction = async (messageId: string, emoji: string, existingReactions?: any[]) => {
    const reacted = existingReactions?.some((r) => r.emoji === emoji && r.user_id === user?.id);
    
    try {
      const method = reacted ? 'DELETE' : 'POST';
      const endpoint = reacted 
        ? `/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`
        : `/messages/${messageId}/reactions`;
        
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: reacted ? undefined : JSON.stringify({ emoji }),
      });

      if (res.ok) {
        if (reacted) {
          chatStore.removeReaction(messageId, user!.id, emoji);
        } else {
          chatStore.addReaction(messageId, user!.id, emoji);
        }
      }
    } catch (err) {
      console.error('Failed to toggle reaction', err);
    }
  };

  // Search messages
  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/workspaces/${chatStore.activeWorkspaceId}/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        chatStore.setSearchResults(data);
        chatStore.setShowSearch(true);
      }
    } catch (e) {
      console.error('Search query failed', e);
    }
  };

  // Join Call
  const handleJoinCall = async () => {
    if (!chatStore.activeChannelId) return;
    try {
      const res = await fetch(`${API_BASE}/channels/${chatStore.activeChannelId}/calls/token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        chatStore.setActiveCall({
          channelId: chatStore.activeChannelId,
          token: data.token,
          livekitUrl: data.livekit_url,
        });
      }
    } catch (err) {
      console.error('Join call failed', err);
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedDmUsers((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]
    );
  };

  // Helpers
  const currentWorkspace = chatStore.workspaces.find((w) => w.id === chatStore.activeWorkspaceId);
  const currentChannel = chatStore.channels.find((c) => c.id === chatStore.activeChannelId);
  const activeKey = chatStore.activeConversationId || chatStore.activeChannelId || '';
  const currentChannelMessages = chatStore.messages[activeKey] || [];
  
  const activeDm = chatStore.directConversations.find((d) => d.id === chatStore.activeConversationId);
  const activeDmName = activeDm?.members
    .filter((m) => m.id !== user?.id)
    .map((m) => m.display_name)
    .join(', ') || 'Direct Chat';

  const parentThreadMessages = currentChannelMessages.filter(
    (m) => m.parent_id === chatStore.activeThreadParent?.id || m.id === chatStore.activeThreadParent?.id
  );

  return (
    <div className="h-screen w-screen bg-[#070b13] flex overflow-hidden">
      {/* 1. Thin Workspaces Left-most Sidebar */}
      <div className="w-18 bg-[#04060b] border-r border-slate-900 flex flex-col items-center py-4 gap-3 shrink-0">
        <div className="p-3 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl shadow-lg shadow-indigo-900/30 mb-2">
          <Sparkles className="h-6 w-6 text-white" />
        </div>

        <div className="w-8 h-px bg-slate-800" />

        {/* Workspaces List */}
        <div className="flex-1 w-full flex flex-col items-center gap-2 overflow-y-auto no-scrollbar">
          {chatStore.workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => chatStore.setActiveWorkspaceId(ws.id)}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-sm transition-all select-none hover:scale-[1.05] relative cursor-pointer group ${
                chatStore.activeWorkspaceId === ws.id
                  ? 'bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-900/35'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {ws.name.substring(0, 2).toUpperCase()}
              {/* Tooltip */}
              <span className="absolute left-16 bg-slate-950 text-white text-xs px-2.5 py-1.5 rounded-lg border border-slate-800 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-xl z-50">
                {ws.name}
              </span>
            </button>
          ))}

          <button
            onClick={() => setShowNewWorkspace(true)}
            className="w-12 h-12 bg-slate-950 border border-dashed border-slate-800 hover:border-indigo-500 hover:text-indigo-400 text-slate-500 rounded-2xl flex items-center justify-center transition-colors cursor-pointer"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        <button
          onClick={clearAuth}
          className="w-12 h-12 bg-slate-900/40 border border-slate-800/80 hover:bg-rose-950/20 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 rounded-2xl flex items-center justify-center transition-colors cursor-pointer"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>

      {/* 2. Channels & DMs Left Sidebar */}
      <div className="w-64 bg-[#0a0f1d] border-r border-slate-900/80 flex flex-col shrink-0">
        <div className="h-14 border-b border-slate-900 px-6 flex items-center justify-between bg-[#070b14]/50">
          <span className="font-bold text-white text-sm tracking-wide truncate">
            {currentWorkspace?.name || 'Workspace'}
          </span>
          <button className="text-slate-400 hover:text-slate-200 cursor-pointer">
            <Settings className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {/* Section: Channels */}
          <div>
            <div className="flex items-center justify-between px-3 text-slate-500 text-[11px] font-bold uppercase tracking-wider mb-2">
              <span>Channels</span>
              <button
                onClick={() => setShowNewChannel(true)}
                className="hover:text-indigo-400 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-0.5">
              {chatStore.channels.map((chan) => (
                <button
                  key={chan.id}
                  onClick={() => chatStore.setActiveChannelId(chan.id)}
                  className={`w-full px-3 py-2 rounded-xl flex items-center gap-2.5 text-sm transition-colors cursor-pointer ${
                    chatStore.activeChannelId === chan.id
                      ? 'bg-slate-900 text-white font-medium'
                      : 'text-slate-400 hover:bg-slate-900/40 hover:text-slate-200'
                  }`}
                >
                  {chan.kind === 'voice' ? (
                    <Volume2 className="h-4 w-4 shrink-0 text-slate-500" />
                  ) : (
                    <Hash className="h-4 w-4 shrink-0 text-slate-500" />
                  )}
                  <span className="truncate">{chan.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Section: Direct Messages */}
          <div>
            <div className="flex items-center justify-between px-3 text-slate-500 text-[11px] font-bold uppercase tracking-wider mb-2">
              <span>Direct Messages</span>
              <button
                onClick={() => setShowNewDm(true)}
                className="hover:text-indigo-400 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-0.5">
              {chatStore.directConversations.map((dm) => {
                const membersList = dm.members.filter((m) => m.id !== user?.id);
                const dmLabel = membersList.map((m) => m.display_name).join(', ') || 'Direct Chat';
                const firstMember = membersList[0];
                const presence = firstMember ? (chatStore.presences[firstMember.id] || firstMember.status) : 'offline';

                return (
                  <button
                    key={dm.id}
                    onClick={() => chatStore.setActiveConversationId(dm.id)}
                    className={`w-full px-3 py-2 rounded-xl flex items-center gap-2.5 text-sm transition-colors cursor-pointer ${
                      chatStore.activeConversationId === dm.id
                        ? 'bg-slate-900 text-white font-medium'
                        : 'text-slate-400 hover:bg-slate-900/40 hover:text-slate-200'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div className="w-5.5 h-5.5 bg-slate-800 rounded-lg flex items-center justify-center font-bold text-[9px] text-white">
                        {dmLabel.substring(0, 1).toUpperCase()}
                      </div>
                      <div
                        className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-900 ${
                          presence === 'online' ? 'bg-emerald-500' : 'bg-slate-600'
                        }`}
                      />
                    </div>
                    <span className="truncate">{dmLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Profile Footer */}
        <div className="p-4 border-t border-slate-900 bg-[#080c18] flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center font-bold text-sm text-white relative">
            {user?.display_name.substring(0, 1).toUpperCase()}
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white font-medium text-sm truncate">{user?.display_name}</div>
            <div className="text-slate-500 text-xs truncate">@{user?.username}</div>
          </div>
        </div>
      </div>

      {/* 3. Main Center Pane */}
      {chatStore.activeCall ? (
        <CallRoom
          token={chatStore.activeCall.token}
          livekitUrl={chatStore.activeCall.livekitUrl}
        />
      ) : (
        <div className="flex-1 flex flex-col bg-[#0b0f19] overflow-hidden">
          {/* Main Top Header */}
          <div className="h-14 border-b border-slate-900/60 px-6 flex items-center justify-between shrink-0 bg-[#080b14]/35">
            <div className="flex items-center gap-2">
              {chatStore.activeConversationId ? (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-white font-bold text-sm tracking-wide">{activeDmName}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Hash className="h-5 w-5 text-slate-500" />
                  <span className="text-white font-bold text-sm tracking-wide">
                    {currentChannel?.name || 'select-a-channel'}
                  </span>
                  {currentChannel?.topic && (
                    <span className="text-slate-500 text-xs border-l border-slate-800 pl-3 ml-3 max-w-sm truncate">
                      {currentChannel.topic}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Global Search box in header */}
            <div className="flex items-center gap-4">
              <form onSubmit={runSearch} className="relative bg-slate-950/65 border border-slate-800 rounded-xl px-3 py-1.5 flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search workspace..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent text-white text-xs focus:outline-none placeholder-slate-600 w-44"
                />
              </form>

              {currentChannel?.kind === 'voice' && (
                <button
                  onClick={handleJoinCall}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-900/20 active:scale-[0.98] transition-transform cursor-pointer"
                >
                  <Video className="h-4 w-4" />
                  <span>Join Video Call</span>
                </button>
              )}
            </div>
          </div>

          {/* Messages List Area */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5 no-scrollbar">
            {currentChannelMessages.filter((m) => !m.parent_id).map((msg) => (
              <div key={msg.id} className="flex items-start gap-4 group relative">
                <div className="w-10 h-10 bg-slate-800 border border-slate-700/50 rounded-xl shrink-0 flex items-center justify-center font-semibold text-white select-none">
                  {msg.sender_id.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-white font-bold text-sm">User</span>
                    <span className="text-[10px] text-slate-500">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-slate-300 text-sm break-words leading-relaxed">{msg.content}</div>

                  {/* Render reactions */}
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {Object.entries(
                        msg.reactions.reduce((acc: Record<string, string[]>, curr) => {
                          acc[curr.emoji] = acc[curr.emoji] || [];
                          acc[curr.emoji].push(curr.user_id);
                          return acc;
                        }, {})
                      ).map(([emoji, userIds]) => {
                        const hasReacted = userIds.includes(user?.id || '');
                        return (
                          <button
                            key={emoji}
                            onClick={() => toggleReaction(msg.id, emoji, msg.reactions)}
                            className={`px-2.5 py-1 rounded-lg border text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                              hasReacted
                                ? 'bg-indigo-950/40 border-indigo-500/40 text-indigo-300'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                            }`}
                          >
                            <span>{emoji}</span>
                            <span className="font-semibold">{userIds.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Render attachments */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {msg.attachments.map((att: any, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2.5 p-2.5 bg-slate-900/60 border border-slate-800/80 rounded-xl max-w-xs"
                        >
                          <FileText className="h-5 w-5 text-indigo-400" />
                          <div className="min-w-0 flex-1">
                            <div className="text-slate-200 text-xs font-medium truncate">{att.filename}</div>
                            <div className="text-slate-500 text-[10px]">{(att.size / 1024).toFixed(1)} KB</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Popover/ActionBar */}
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 bg-slate-900 border border-slate-800/80 rounded-lg p-1 transition-opacity absolute top-0 right-0 z-10 shadow-lg">
                  {/* Emoji Quick Picker */}
                  <div className="flex border-r border-slate-800 pr-1 mr-1">
                    {EMOJI_LIST.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => toggleReaction(msg.id, emoji, msg.reactions)}
                        className="p-1 hover:bg-slate-800 rounded text-sm cursor-pointer"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => chatStore.setActiveThreadParent(msg)}
                    className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 cursor-pointer"
                    title="Reply in thread"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
            <div ref={messageEndRef} />
          </div>

          {/* Typing Indicator */}
          {chatStore.typingUsers[chatStore.activeChannelId || '']?.length > 0 && (
            <div className="px-6 py-1.5 text-slate-500 text-xs bg-[#0b0f19] border-t border-slate-900/40 flex items-center gap-1.5 font-medium">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" />
              <span>Some users are typing...</span>
            </div>
          )}

          {/* Chat Form Input */}
          {(chatStore.activeChannelId || chatStore.activeConversationId) && (
            <div className="p-6 border-t border-slate-900 bg-[#090d16]/30 shrink-0">
              <form onSubmit={sendMessage} className="relative bg-slate-950/60 border border-slate-800/80 rounded-2xl overflow-hidden p-2 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={
                      chatStore.activeConversationId
                        ? `Message direct conversation`
                        : `Message #${currentChannel?.name || 'channel'}`
                    }
                    value={messageText}
                    onChange={(e) => {
                      setMessageText(e.target.value);
                      handleTyping();
                    }}
                    className="flex-1 bg-transparent text-white px-4 py-2.5 placeholder-slate-600 focus:outline-none text-sm"
                  />

                  <label className="p-2.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-900 cursor-pointer transition-colors">
                    <input type="file" onChange={handleFileUpload} className="hidden" />
                    <Paperclip className="h-4.5 w-4.5" />
                  </label>

                  <button
                    type="submit"
                    className="p-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-md cursor-pointer transition-transform active:scale-95"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>

                {uploading && (
                  <div className="px-4 py-1 text-slate-400 text-xs flex items-center gap-2 font-medium">
                    <span className="h-3 w-3 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                    <span>Uploading file...</span>
                  </div>
                )}

                {attachments.length > 0 && (
                  <div className="flex gap-2 p-2 border-t border-slate-900">
                    {attachments.map((att, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 rounded-xl border border-slate-800"
                      >
                        <span className="text-slate-300 text-xs truncate max-w-xs">{att.filename}</span>
                        <button
                          type="button"
                          onClick={() => setAttachments(attachments.filter((_, i) => i !== idx))}
                          className="text-slate-500 hover:text-white cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </form>
            </div>
          )}
        </div>
      )}

      {/* 4. Slide-out Threads Panel on Right */}
      {chatStore.activeThreadParent && (
        <div className="w-96 bg-[#0a0f1d] border-l border-slate-900 flex flex-col shrink-0">
          <div className="h-14 border-b border-slate-900 px-6 flex items-center justify-between bg-[#070b14]/50">
            <span className="text-white font-bold text-sm tracking-wide">Thread Reply</span>
            <button
              onClick={() => chatStore.setActiveThreadParent(null)}
              className="text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
            <div className="p-4 bg-slate-900/30 border border-slate-800/60 rounded-2xl mb-4">
              <div className="text-slate-400 text-xs font-bold uppercase mb-2">Original Message</div>
              <div className="text-slate-200 text-sm break-words leading-relaxed">
                {chatStore.activeThreadParent.content}
              </div>
            </div>

            {parentThreadMessages.filter((m) => m.id !== chatStore.activeThreadParent?.id).map((reply) => (
              <div key={reply.id} className="flex gap-3">
                <div className="w-8 h-8 bg-slate-800 border border-slate-700/50 rounded-lg shrink-0 flex items-center justify-center font-semibold text-white select-none text-xs">
                  {reply.sender_id.substring(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-white font-bold text-xs">User</span>
                    <span className="text-[9px] text-slate-500">
                      {new Date(reply.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-slate-300 text-xs break-words leading-relaxed">{reply.content}</div>
                </div>
              </div>
            ))}
            <div ref={threadEndRef} />
          </div>

          <div className="p-6 border-t border-slate-900 bg-[#090d16]/30 shrink-0">
            <form onSubmit={sendThreadReply} className="relative bg-slate-950/60 border border-slate-800/80 rounded-2xl overflow-hidden p-2 flex items-center gap-2">
              <input
                type="text"
                placeholder="Reply in thread..."
                value={threadText}
                onChange={(e) => setThreadText(e.target.value)}
                className="flex-1 bg-transparent text-white px-4 py-2 placeholder-slate-600 focus:outline-none text-xs"
              />
              <button
                type="submit"
                className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg cursor-pointer transition-transform active:scale-95"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 5. Slide-out Search Results Panel on Right */}
      {chatStore.showSearch && (
        <div className="w-96 bg-[#0a0f1d] border-l border-slate-900 flex flex-col shrink-0">
          <div className="h-14 border-b border-slate-900 px-6 flex items-center justify-between bg-[#070b14]/50">
            <span className="text-white font-bold text-sm tracking-wide">Search Results</span>
            <button
              onClick={() => chatStore.setShowSearch(false)}
              className="text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
            {chatStore.searchResults.length === 0 ? (
              <div className="text-center text-slate-500 text-sm mt-8">No matching messages found</div>
            ) : (
              chatStore.searchResults.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    if (item.channel_id) {
                      chatStore.setActiveChannelId(item.channel_id);
                    } else if (item.conversation_id) {
                      chatStore.setActiveConversationId(item.conversation_id);
                    }
                  }}
                  className="p-3 bg-slate-900/40 border border-slate-800 rounded-xl hover:bg-slate-900/80 cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                      {item.channel_name ? `#${item.channel_name}` : `DM Thread`}
                    </span>
                    <span className="text-[9px] text-slate-600">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-white text-xs break-words">{item.content}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 6. Create Workspace Modal */}
      {showNewWorkspace && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4 z-50">
          <div className="w-full max-w-md glass rounded-3xl p-8 relative overflow-hidden shadow-2xl border border-slate-800">
            <h2 className="text-xl font-bold text-white mb-6">Create a new workspace</h2>
            <form onSubmit={createWorkspace} className="space-y-4">
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-1.5">Workspace Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Corp"
                  value={newWsName}
                  onChange={(e) => {
                    setNewWsName(e.target.value);
                    setNewWsSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
                  }}
                  className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-1.5">Slug (Workspace URL)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. acme-corp"
                  value={newWsSlug}
                  onChange={(e) => setNewWsSlug(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-1.5">Description</label>
                <textarea
                  placeholder="Optional details"
                  value={newWsDesc}
                  onChange={(e) => setNewWsDesc(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowNewWorkspace(false)}
                  className="px-4 py-2.5 text-slate-400 hover:text-white text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl text-sm shadow-lg active:scale-95 cursor-pointer"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Create Channel Modal */}
      {showNewChannel && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4 z-50">
          <div className="w-full max-w-md glass rounded-3xl p-8 relative overflow-hidden shadow-2xl border border-slate-800">
            <h2 className="text-xl font-bold text-white mb-6">Create a new channel</h2>
            <form onSubmit={createChannel} className="space-y-4">
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-1.5">Channel Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. general"
                  value={newChanName}
                  onChange={(e) => setNewChanName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-1.5">Channel Type</label>
                <div className="flex gap-3">
                  <label className="flex-1 bg-slate-900/40 border border-slate-800 rounded-xl p-3 flex items-center gap-2 cursor-pointer text-sm text-slate-300 hover:border-indigo-500/50">
                    <input
                      type="radio"
                      checked={newChanKind === 'text'}
                      onChange={() => setNewChanKind('text')}
                      className="accent-indigo-500"
                    />
                    <span>Text Channel</span>
                  </label>
                  <label className="flex-1 bg-slate-900/40 border border-slate-800 rounded-xl p-3 flex items-center gap-2 cursor-pointer text-sm text-slate-300 hover:border-indigo-500/50">
                    <input
                      type="radio"
                      checked={newChanKind === 'voice'}
                      onChange={() => setNewChanKind('voice')}
                      className="accent-indigo-500"
                    />
                    <span>Voice/Video Call</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-1.5">Topic</label>
                <input
                  type="text"
                  placeholder="e.g. general discussion topic"
                  value={newChanTopic}
                  onChange={(e) => setNewChanTopic(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowNewChannel(false)}
                  className="px-4 py-2.5 text-slate-400 hover:text-white text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl text-sm shadow-lg active:scale-95 cursor-pointer"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. Start Direct Conversation modal */}
      {showNewDm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4 z-50">
          <div className="w-full max-w-md glass rounded-3xl p-8 relative overflow-hidden shadow-2xl border border-slate-800 flex flex-col max-h-[80vh]">
            <h2 className="text-xl font-bold text-white mb-4 shrink-0">Direct Messages</h2>
            <form onSubmit={createDm} className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto mb-6 pr-2 space-y-2 no-scrollbar">
                {workspaceMembers
                  .filter((m) => m.id !== user?.id)
                  .map((m) => {
                    const isSelected = selectedDmUsers.includes(m.id);
                    return (
                      <div
                        key={m.id}
                        onClick={() => toggleUserSelection(m.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${
                          isSelected
                            ? 'bg-indigo-950/20 border-indigo-500/55'
                            : 'bg-slate-950/30 border-slate-800 hover:bg-slate-900/30'
                        }`}
                      >
                        <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center font-bold text-[10px] text-white">
                          {m.display_name.substring(0, 1).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-white text-xs font-semibold">{m.display_name}</div>
                          <div className="text-slate-500 text-[10px]">@{m.username}</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          className="accent-indigo-500 cursor-pointer h-4 w-4 rounded-md border-slate-700 bg-slate-900"
                        />
                      </div>
                    );
                  })}
              </div>

              <div className="flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewDm(false);
                    setSelectedDmUsers([]);
                  }}
                  className="px-4 py-2.5 text-slate-400 hover:text-white text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={selectedDmUsers.length === 0}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl text-sm shadow-lg active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  Start Chat
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
