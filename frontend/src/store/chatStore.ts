import { create } from 'zustand';
import { useAuthStore } from './authStore';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  owner_id: string;
  created_at: string;
}

export interface Channel {
  id: string;
  workspace_id: string;
  name: string;
  kind: 'text' | 'voice' | 'announcement';
  topic: string | null;
  is_private: boolean;
  created_by: string;
  created_at: string;
}

export interface Attachment {
  key: string;
  filename: string;
  content_type: string;
  size: number;
}

export interface Reaction {
  emoji: string;
  user_id: string;
}

export interface Message {
  id: string;
  channel_id: string | null;
  conversation_id: string | null;
  sender_id: string;
  parent_id: string | null;
  content: string;
  attachments: Attachment[];
  reactions?: Reaction[];
  is_edited: boolean;
  created_at: string;
  updated_at: string;
}

export interface DirectConversation {
  id: string;
  workspace_id: string;
  created_at: string;
  members: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    status: string;
    last_seen_at: string | null;
  }[];
}

export interface SearchResultItem {
  id: string;
  channel_id: string | null;
  conversation_id: string | null;
  sender_id: string;
  parent_id: string | null;
  content: string;
  attachments: Attachment[];
  is_edited: boolean;
  created_at: string;
  updated_at: string;
  channel_name: string | null;
  conversation_members: string[] | null;
}

interface CallState {
  channelId: string;
  token: string;
  livekitUrl: string;
}

interface ChatState {
  workspaces: Workspace[];
  channels: Channel[];
  directConversations: DirectConversation[];
  activeWorkspaceId: string | null;
  activeChannelId: string | null;
  activeConversationId: string | null;
  messages: Record<string, Message[]>; // channel_id or conversation_id -> messages
  activeThreadParent: Message | null;
  typingUsers: Record<string, string[]>; // channel_id -> usernames
  presences: Record<string, string>; // user_id -> status ('online', 'offline')
  activeCall: CallState | null;
  searchResults: SearchResultItem[];
  showSearch: boolean;
  socket: WebSocket | null;

  setWorkspaces: (workspaces: Workspace[]) => void;
  setChannels: (channels: Channel[]) => void;
  setDirectConversations: (conversations: DirectConversation[]) => void;
  setActiveWorkspaceId: (id: string | null) => void;
  setActiveChannelId: (id: string | null) => void;
  setActiveConversationId: (id: string | null) => void;
  setActiveThreadParent: (message: Message | null) => void;
  addMessage: (key: string, message: Message) => void;
  setMessages: (key: string, messages: Message[]) => void;
  setTyping: (channelId: string, userId: string, isTyping: boolean) => void;
  setPresence: (userId: string, status: string) => void;
  addReaction: (messageId: string, userId: string, emoji: string) => void;
  removeReaction: (messageId: string, userId: string, emoji: string) => void;
  setSearchResults: (results: SearchResultItem[]) => void;
  setShowSearch: (show: boolean) => void;
  setActiveCall: (call: CallState | null) => void;
  connectSocket: () => void;
  disconnectSocket: () => void;
}

// REST API URL matching the Rust backend
export const API_BASE = 'http://localhost:8080/api/v1';
export const WS_BASE = 'ws://localhost:8080/ws';

export const useChatStore = create<ChatState>()((set, get) => ({
  workspaces: [],
  channels: [],
  directConversations: [],
  activeWorkspaceId: null,
  activeChannelId: null,
  activeConversationId: null,
  messages: {},
  activeThreadParent: null,
  typingUsers: {},
  presences: {},
  activeCall: null,
  searchResults: [],
  showSearch: false,
  socket: null,

  setWorkspaces: (workspaces) => set({ workspaces }),
  setChannels: (channels) => set({ channels }),
  setDirectConversations: (directConversations) => set({ directConversations }),
  setActiveWorkspaceId: (id) =>
    set({
      activeWorkspaceId: id,
      activeChannelId: null,
      activeConversationId: null,
      activeThreadParent: null,
      showSearch: false,
    }),
  setActiveChannelId: (id) =>
    set({
      activeChannelId: id,
      activeConversationId: null,
      activeThreadParent: null,
      showSearch: false,
    }),
  setActiveConversationId: (id) =>
    set({
      activeConversationId: id,
      activeChannelId: null,
      activeThreadParent: null,
      showSearch: false,
    }),
  setActiveThreadParent: (message) => set({ activeThreadParent: message }),

  addMessage: (key, message) =>
    set((state) => {
      const list = state.messages[key] || [];
      // Prevent duplicate messages
      if (list.some((m) => m.id === message.id)) return state;

      const updatedList = [...list, message].sort((a, b) =>
        a.created_at.localeCompare(b.created_at)
      );

      return {
        messages: {
          ...state.messages,
          [key]: updatedList,
        },
      };
    }),

  setMessages: (key, messages) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [key]: messages.sort((a, b) => a.created_at.localeCompare(b.created_at)),
      },
    })),

  setTyping: (channelId, userId, isTyping) =>
    set((state) => {
      const currentTyping = state.typingUsers[channelId] || [];
      const updated = isTyping
        ? [...currentTyping.filter((id) => id !== userId), userId]
        : currentTyping.filter((id) => id !== userId);
      return {
        typingUsers: {
          ...state.typingUsers,
          [channelId]: updated,
        },
      };
    }),

  setPresence: (userId, status) =>
    set((state) => ({
      presences: {
        ...state.presences,
        [userId]: status,
      },
    })),

  addReaction: (messageId, userId, emoji) =>
    set((state) => {
      const updatedMessages = { ...state.messages };
      for (const [key, msgList] of Object.entries(updatedMessages)) {
        const index = msgList.findIndex((m) => m.id === messageId);
        if (index !== -1) {
          const msg = msgList[index];
          const reactions = msg.reactions || [];
          if (!reactions.some((r) => r.emoji === emoji && r.user_id === userId)) {
            const updatedMsg = {
              ...msg,
              reactions: [...reactions, { emoji, user_id: userId }],
            };
            const list = [...msgList];
            list[index] = updatedMsg;
            updatedMessages[key] = list;
          }
          break;
        }
      }
      return { messages: updatedMessages };
    }),

  removeReaction: (messageId, userId, emoji) =>
    set((state) => {
      const updatedMessages = { ...state.messages };
      for (const [key, msgList] of Object.entries(updatedMessages)) {
        const index = msgList.findIndex((m) => m.id === messageId);
        if (index !== -1) {
          const msg = msgList[index];
          const reactions = msg.reactions || [];
          const updatedMsg = {
            ...msg,
            reactions: reactions.filter((r) => !(r.emoji === emoji && r.user_id === userId)),
          };
          const list = [...msgList];
          list[index] = updatedMsg;
          updatedMessages[key] = list;
          break;
        }
      }
      return { messages: updatedMessages };
    }),

  setSearchResults: (searchResults) => set({ searchResults }),
  setShowSearch: (showSearch) => set({ showSearch }),
  setActiveCall: (call) => set({ activeCall: call }),

  connectSocket: () => {
    const currentSocket = get().socket;
    if (currentSocket) return;

    const token = useAuthStore.getState().token;
    if (!token) return;

    const wsUrl = `${WS_BASE}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('Real-time WebSocket connected');
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('WS Message received:', data);

        switch (data.type) {
          case 'new_message': {
            const { channel_id, message_id, sender_id, content } = data.payload;
            const msg: Message = {
              id: message_id,
              channel_id: channel_id,
              conversation_id: channel_id, // Backward/Forward compatible mapping
              sender_id,
              parent_id: null,
              content,
              attachments: [],
              reactions: [],
              is_edited: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            // Try adding to channel_id or conversation_id
            get().addMessage(channel_id, msg);
            break;
          }
          case 'message_edited': {
            const { channel_id, message_id, content } = data.payload;
            const list = get().messages[channel_id] || [];
            const updated = list.map((m) =>
              m.id === message_id
                ? {
                    ...m,
                    content,
                    is_edited: true,
                    updated_at: new Date().toISOString(),
                  }
                : m
            );
            set((state) => ({
              messages: { ...state.messages, [channel_id]: updated },
            }));
            break;
          }
          case 'message_deleted': {
            const { channel_id, message_id } = data.payload;
            const list = get().messages[channel_id] || [];
            const updated = list.filter((m) => m.id !== message_id);
            set((state) => ({
              messages: { ...state.messages, [channel_id]: updated },
            }));
            break;
          }
          case 'typing': {
            const { channel_id, user_id, is_typing } = data.payload;
            get().setTyping(channel_id, user_id, is_typing);
            break;
          }
          case 'presence': {
            const { user_id, status } = data.payload;
            get().setPresence(user_id, status);
            break;
          }
          case 'reaction_added': {
            const { message_id, user_id, emoji } = data.payload;
            get().addReaction(message_id, user_id, emoji);
            break;
          }
          case 'reaction_removed': {
            const { message_id, user_id, emoji } = data.payload;
            get().removeReaction(message_id, user_id, emoji);
            break;
          }
          case 'pong':
            break;
          default:
            break;
        }
      } catch (err) {
        console.error('Failed to parse WS payload', err);
      }
    };

    ws.onclose = () => {
      console.log('Real-time WebSocket disconnected');
      set({ socket: null });
      setTimeout(() => {
        if (useAuthStore.getState().isAuthenticated) {
          get().connectSocket();
        }
      }, 3000);
    };

    set({ socket: ws });
  },

  disconnectSocket: () => {
    const ws = get().socket;
    if (ws) {
      ws.close();
      set({ socket: null });
    }
  },
}));
