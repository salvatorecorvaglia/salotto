import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useChatStore, API_BASE } from '../store/chatStore';
import {
  Video,
  Hash,
  X,
} from 'lucide-react';
import CallRoom from '../components/CallRoom';
import { WorkspaceSidebar } from '../components/sidebar/WorkspaceSidebar';
import { ChannelList } from '../components/sidebar/ChannelList';
import { MessageList } from '../components/chat/MessageList';
import { MessageInput } from '../components/chat/MessageInput';
import { ThreadView } from '../components/chat/ThreadView';
import { UserSettingsModal } from '../components/modals/UserSettingsModal';
import { WorkspaceSettingsModal } from '../components/modals/WorkspaceSettingsModal';

export default function MainPage() {
  const { user, token, clearAuth, updateUser } = useAuthStore();
  const chatStore = useChatStore();

  // Modals
  const [showSettings, setShowSettings] = useState(false);
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);

  // Workspace creation/join popup
  const [showNewWorkspace, setShowNewWorkspace] = useState(false);
  const [workspaceModalTab, setWorkspaceModalTab] = useState<'create' | 'join'>('create');
  const [newWsName, setNewWsName] = useState('');
  const [newWsSlug, setNewWsSlug] = useState('');
  const [newWsDesc, setNewWsDesc] = useState('');
  const [joinInviteCode, setJoinInviteCode] = useState('');

  // Channel creation popup
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChanName, setNewChanName] = useState('');
  const [newChanKind, setNewChanKind] = useState<'text' | 'voice'>('text');
  const [newChanTopic, setNewChanTopic] = useState('');
  const [newChanPrivate, setNewChanPrivate] = useState(false);

  // DM creation popup
  const [showNewDm, setShowNewDm] = useState(false);
  const [workspaceMembers, setWorkspaceMembers] = useState<any[]>([]);
  const [selectedDmUsers, setSelectedDmUsers] = useState<string[]>([]);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Chat drafting
  const [messageText, setMessageText] = useState('');
  const [threadText, setThreadText] = useState('');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  // Refs
  const messageEndRef = useRef<HTMLDivElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any | null>(null);

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

  const fetchWorkspaces = useCallback(async () => {
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
  }, [chatStore, token]);

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

  const joinWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinInviteCode.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/workspaces/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: joinInviteCode }),
      });

      if (res.ok) {
        const workspace = await res.json();
        setShowNewWorkspace(false);
        setJoinInviteCode('');
        fetchWorkspaces();
        chatStore.setActiveWorkspaceId(workspace.id);
      } else {
        alert('Invalid invite code or unable to join workspace.');
      }
    } catch (err) {
      console.error('Failed to join workspace', err);
    }
  };

  const fetchChannels = useCallback(async () => {
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
  }, [chatStore, token]);

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

  const fetchDms = useCallback(async () => {
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
  }, [chatStore, token]);

  const fetchWorkspaceMembers = useCallback(async () => {
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
  }, [chatStore, token]);

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

  const fetchMessages = useCallback(async () => {
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
  }, [chatStore, token]);

  const fetchDmMessages = useCallback(async () => {
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
  }, [chatStore, token]);

  // Connect socket and fetch workspaces
  useEffect(() => {
    chatStore.connectSocket();
    fetchWorkspaces();
    return () => {
      chatStore.disconnectSocket();
    };
  }, [chatStore, fetchWorkspaces]);

  // Fetch domain entities on active workspace changes
  useEffect(() => {
    if (chatStore.activeWorkspaceId) {
      fetchChannels();
      fetchDms();
      fetchWorkspaceMembers();
    }
  }, [chatStore.activeWorkspaceId, fetchChannels, fetchDms, fetchWorkspaceMembers]);

  // Fetch messages when active channel changes
  useEffect(() => {
    if (chatStore.activeChannelId) {
      fetchMessages();
    }
  }, [chatStore.activeChannelId, fetchMessages]);

  // Fetch DM messages when active DM changes
  useEffect(() => {
    if (chatStore.activeConversationId) {
      fetchDmMessages();
    }
  }, [chatStore.activeConversationId, fetchDmMessages]);

  const activeMessageKey = chatStore.activeChannelId || chatStore.activeConversationId || '';
  const messagesForActiveChannel = chatStore.messages[activeMessageKey] || [];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    if (chatStore.activeWorkspaceId) {
      formData.append('workspace_id', chatStore.activeWorkspaceId);
    }

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
    if ((!messageText.trim() && attachments.length === 0) || uploading) return;

    const currentText = messageText;
    const currentAtts = attachments;
    setMessageText('');
    setAttachments([]);

    try {
      const endpoint = chatStore.activeChannelId
        ? `${API_BASE}/channels/${chatStore.activeChannelId}/messages`
        : `${API_BASE}/dms/${chatStore.activeConversationId}/messages`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: currentText,
          attachments: currentAtts.length > 0 ? currentAtts : undefined,
        }),
      });

      if (res.ok) {
        const newMsg = await res.json();
        chatStore.addMessage(activeMessageKey, newMsg);
      }
    } catch (e) {
      console.error('Send message failed', e);
    }
  };

  const sendThreadMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!threadText.trim() || !chatStore.activeThreadParent || !chatStore.activeChannelId) return;

    const text = threadText;
    setThreadText('');

    try {
      const res = await fetch(`${API_BASE}/channels/${chatStore.activeChannelId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: text,
          parent_id: chatStore.activeThreadParent.id,
        }),
      });

      if (res.ok) {
        const newMsg = await res.json();
        chatStore.addMessage(chatStore.activeChannelId, newMsg);
      }
    } catch (err) {
      console.error('Failed to send thread reply', err);
    }
  };

  const addReaction = async (messageId: string, emoji: string) => {
    try {
      const res = await fetch(`${API_BASE}/messages/${messageId}/reactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ emoji }),
      });
      if (res.ok && user) {
        chatStore.addReaction(messageId, user.id, emoji);
      }
    } catch (err) {
      console.error('Add reaction failed', err);
    }
  };

  const removeReaction = async (messageId: string, emoji: string) => {
    try {
      const res = await fetch(
        `${API_BASE}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (res.ok && user) {
        chatStore.removeReaction(messageId, user.id, emoji);
      }
    } catch (err) {
      console.error('Remove reaction failed', err);
    }
  };

  const deleteMessage = async (messageId: string) => {
    try {
      const res = await fetch(`${API_BASE}/messages/${messageId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchMessages();
      }
    } catch (err) {
      console.error('Failed to delete message', err);
    }
  };

  const executeSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !chatStore.activeWorkspaceId) return;

    try {
      const res = await fetch(
        `${API_BASE}/workspaces/${chatStore.activeWorkspaceId}/search?q=${encodeURIComponent(
          searchQuery
        )}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const results = await res.json();
        chatStore.setSearchResults(results);
        chatStore.setShowSearch(true);
      }
    } catch (err) {
      console.error('Search failed', err);
    }
  };

  const joinCall = async (channelId: string) => {
    try {
      const res = await fetch(`${API_BASE}/channels/${channelId}/calls/token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        chatStore.setActiveCall({
          channelId,
          token: data.token,
          livekitUrl: data.livekit_url,
        });
      }
    } catch (err) {
      console.error('Failed to join call', err);
    }
  };

  const activeWorkspace =
    chatStore.workspaces.find((w) => w.id === chatStore.activeWorkspaceId) || null;
  const activeChannel = chatStore.channels.find((c) => c.id === chatStore.activeChannelId);
  const activeConversation = chatStore.directConversations.find(
    (c) => c.id === chatStore.activeConversationId
  );

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Workspace Navigation Bar */}
      <WorkspaceSidebar
        workspaces={chatStore.workspaces}
        activeWorkspaceId={chatStore.activeWorkspaceId}
        onSelectWorkspace={(id) => chatStore.setActiveWorkspaceId(id)}
        onOpenNewWorkspace={() => setShowNewWorkspace(true)}
        onOpenUserSettings={() => setShowSettings(true)}
        onLogout={clearAuth}
      />

      {/* Channel & DM Navigation List */}
      <ChannelList
        activeWorkspace={activeWorkspace}
        channels={chatStore.channels}
        directConversations={chatStore.directConversations}
        activeChannelId={chatStore.activeChannelId}
        activeConversationId={chatStore.activeConversationId}
        currentUser={user}
        presences={chatStore.presences}
        onSelectChannel={(id) => chatStore.setActiveChannelId(id)}
        onSelectConversation={(id) => chatStore.setActiveConversationId(id)}
        onOpenNewChannel={() => setShowNewChannel(true)}
        onOpenNewDm={() => setShowNewDm(true)}
        onOpenWorkspaceSettings={() => setShowWorkspaceSettings(true)}
        onOpenSearch={() => chatStore.setShowSearch(true)}
      />

      {/* Main Chat Stream Container */}
      <main className="flex-1 flex flex-col h-full bg-slate-950 relative overflow-hidden">
        {/* Active Room Header */}
        <header className="h-14 px-6 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/60 backdrop-blur-md z-10">
          <div className="flex items-center space-x-3">
            {activeChannel && (
              <>
                <Hash className="w-5 h-5 text-indigo-400" />
                <h1 className="font-bold text-slate-100">{activeChannel.name}</h1>
                {activeChannel.topic && (
                  <span className="text-xs text-slate-500 border-l border-slate-800 pl-3 hidden sm:inline">
                    {activeChannel.topic}
                  </span>
                )}
              </>
            )}
            {activeConversation && (
              <h1 className="font-bold text-slate-100">Direct Conversation</h1>
            )}
          </div>

          {/* Action buttons (Video Call trigger) */}
          {activeChannel && activeChannel.kind === 'voice' && (
            <button
              onClick={() => joinCall(activeChannel.id)}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-600/20 transition"
            >
              <Video className="w-4 h-4" />
              <span>Join Video Call</span>
            </button>
          )}
        </header>

        {/* Global Search Drawer Overlay */}
        {chatStore.showSearch ? (
          <div className="flex-1 p-6 overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-slate-100">Workspace Message Search</h2>
              <button
                onClick={() => chatStore.setShowSearch(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={executeSearch} className="flex space-x-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search keywords..."
                className="flex-1 px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition"
              >
                Search
              </button>
            </form>
            <div className="space-y-3">
              {chatStore.searchResults.map((res) => (
                <div key={res.id} className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-500 mb-1">
                    {res.channel_name ? `#${res.channel_name}` : 'Direct Conversation'}
                  </div>
                  <p className="text-sm text-slate-200">{res.content}</p>
                </div>
              ))}
            </div>
          </div>
        ) : chatStore.activeCall ? (
          <CallRoom
            token={chatStore.activeCall.token}
            livekitUrl={chatStore.activeCall.livekitUrl}
          />
        ) : (
          <>
            {/* Stream */}
            <MessageList
              messages={messagesForActiveChannel}
              currentUserId={user?.id}
              typingUsers={chatStore.typingUsers[chatStore.activeChannelId || ''] || []}
              messageEndRef={messageEndRef}
              onOpenThread={(msg) => chatStore.setActiveThreadParent(msg)}
              onAddReaction={addReaction}
              onRemoveReaction={removeReaction}
              onDeleteMessage={deleteMessage}
            />

            {/* Input drafting bar */}
            <MessageInput
              value={messageText}
              onChange={setMessageText}
              onSend={sendMessage}
              onTyping={handleTyping}
              attachments={attachments}
              onUploadFile={handleFileUpload}
              onRemoveAttachment={(idx) =>
                setAttachments(attachments.filter((_, i) => i !== idx))
              }
              uploading={uploading}
            />
          </>
        )}
      </main>

      {/* Right Side Panel: Message Thread Replies */}
      {chatStore.activeThreadParent && (
        <ThreadView
          parentMessage={chatStore.activeThreadParent}
          threadText={threadText}
          onThreadTextChange={setThreadText}
          onSendThreadMessage={sendThreadMessage}
          onCloseThread={() => chatStore.setActiveThreadParent(null)}
          threadEndRef={threadEndRef}
        />
      )}

      {/* Modals */}
      {showSettings && (
        <UserSettingsModal
          user={user}
          token={token}
          onClose={() => setShowSettings(false)}
          onUpdateUser={(fields) => updateUser(fields)}
        />
      )}

      {showWorkspaceSettings && chatStore.activeWorkspaceId && (
        <WorkspaceSettingsModal
          workspaceId={chatStore.activeWorkspaceId}
          token={token}
          onClose={() => setShowWorkspaceSettings(false)}
        />
      )}

      {/* New Workspace Modal */}
      {showNewWorkspace && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex space-x-4">
                <button
                  onClick={() => setWorkspaceModalTab('create')}
                  className={`font-bold text-sm ${
                    workspaceModalTab === 'create' ? 'text-indigo-400' : 'text-slate-500'
                  }`}
                >
                  Create Workspace
                </button>
                <button
                  onClick={() => setWorkspaceModalTab('join')}
                  className={`font-bold text-sm ${
                    workspaceModalTab === 'join' ? 'text-indigo-400' : 'text-slate-500'
                  }`}
                >
                  Join via Code
                </button>
              </div>
              <button onClick={() => setShowNewWorkspace(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {workspaceModalTab === 'create' ? (
              <form onSubmit={createWorkspace} className="space-y-4">
                <input
                  type="text"
                  placeholder="Workspace Name"
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200"
                  required
                />
                <input
                  type="text"
                  placeholder="Workspace Slug"
                  value={newWsSlug}
                  onChange={(e) => setNewWsSlug(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200"
                  required
                />
                <button
                  type="submit"
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-sm"
                >
                  Create
                </button>
              </form>
            ) : (
              <form onSubmit={joinWorkspace} className="space-y-4">
                <input
                  type="text"
                  placeholder="Invite Code (e.g. invite_...)"
                  value={joinInviteCode}
                  onChange={(e) => setJoinInviteCode(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200"
                  required
                />
                <button
                  type="submit"
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-sm"
                >
                  Join Workspace
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* New Channel Modal */}
      {showNewChannel && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="font-bold text-slate-100">Create New Channel</h3>
              <button onClick={() => setShowNewChannel(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={createChannel} className="space-y-4">
              <input
                type="text"
                placeholder="Channel Name"
                value={newChanName}
                onChange={(e) => setNewChanName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200"
                required
              />
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setNewChanKind('text')}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold ${
                    newChanKind === 'text' ? 'bg-indigo-600 text-white' : 'bg-slate-950 text-slate-400'
                  }`}
                >
                  Text Channel
                </button>
                <button
                  type="button"
                  onClick={() => setNewChanKind('voice')}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold ${
                    newChanKind === 'voice' ? 'bg-indigo-600 text-white' : 'bg-slate-950 text-slate-400'
                  }`}
                >
                  Voice Channel
                </button>
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-sm"
              >
                Create Channel
              </button>
            </form>
          </div>
        </div>
      )}

      {/* New DM Modal */}
      {showNewDm && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="font-bold text-slate-100">Start Direct Message</h3>
              <button onClick={() => setShowNewDm(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={createDm} className="space-y-4">
              <div className="max-h-60 overflow-y-auto space-y-2">
                {workspaceMembers
                  .filter((m) => m.id !== user?.id)
                  .map((m) => (
                    <label
                      key={m.id}
                      className="flex items-center space-x-3 p-2 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:bg-slate-850"
                    >
                      <input
                        type="checkbox"
                        checked={selectedDmUsers.includes(m.id)}
                        onChange={(e) =>
                          e.target.checked
                            ? setSelectedDmUsers([...selectedDmUsers, m.id])
                            : setSelectedDmUsers(selectedDmUsers.filter((id) => id !== m.id))
                        }
                      />
                      <span className="text-sm text-slate-200">{m.display_name || m.username}</span>
                    </label>
                  ))}
              </div>
              <button
                type="submit"
                disabled={selectedDmUsers.length === 0}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold rounded-xl text-sm"
              >
                Start Conversation
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
