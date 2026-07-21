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

export interface Message {
  id: string;
  channel_id: string;
  sender_id: string;
  parent_id: string | null;
  content: string;
  attachments: Attachment[];
  is_edited: boolean;
  created_at: string;
  updated_at: string;
}

interface CallState {
  channelId: string;
  token: string;
  livekitUrl: string;
}

interface ChatState {
  workspaces: Workspace[];
  channels: Channel[];
  activeWorkspaceId: string | null;
  activeChannelId: string | null;
  messages: Record<string, Message[]>; // channel_id -> messages
  activeThreadParent: Message | null;
  typingUsers: Record<string, string[]>; // channel_id -> usernames
  presences: Record<string, string>; // user_id -> status ('online', 'offline')
  activeCall: CallState | null;
  socket: WebSocket | null;

  setWorkspaces: (workspaces: Workspace[]) => void;
  setChannels: (channels: Channel[]) => void;
  setActiveWorkspaceId: (id: string | null) => void;
  setActiveChannelId: (id: string | null) => void;
  setActiveThreadParent: (message: Message | null) => void;
  addMessage: (channelId: string, message: Message) => void;
  setMessages: (channelId: string, messages: Message[]) => void;
  setTyping: (channelId: string, userId: string, isTyping: boolean) => void;
  setPresence: (userId: string, status: string) => void;
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
  activeWorkspaceId: null,
  activeChannelId: null,
  messages: {},
  activeThreadParent: null,
  typingUsers: {},
  presences: {},
  activeCall: null,
  socket: null,

  setWorkspaces: (workspaces) => set({ workspaces }),
  setChannels: (channels) => set({ channels }),
  setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id, activeChannelId: null, activeThreadParent: null }),
  setActiveChannelId: (id) => set({ activeChannelId: id, activeThreadParent: null }),
  setActiveThreadParent: (message) => set({ activeThreadParent: message }),

  addMessage: (channelId, message) => set((state) => {
    const list = state.messages[channelId] || [];
    // Prevent duplicate messages
    if (list.some((m) => m.id === message.id)) return state;
    
    // If it's a thread reply, update active thread parent if matching
    let updatedParent = state.activeThreadParent;
    if (state.activeThreadParent && state.activeThreadParent.id === message.parent_id) {
      // No change to parent object itself, but UI will query list
    }

    return {
      messages: {
        ...state.messages,
        [channelId]: [...list, message].sort((a, b) => a.created_at.localeCompare(b.created_at)),
      },
      activeThreadParent: updatedParent,
    };
  }),

  setMessages: (channelId, messages) => set((state) => ({
    messages: {
      ...state.messages,
      [channelId]: messages.sort((a, b) => a.created_at.localeCompare(b.created_at)),
    },
  })),

  setTyping: (channelId, userId, isTyping) => set((state) => {
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

  setPresence: (userId, status) => set((state) => ({
    presences: {
      ...state.presences,
      [userId]: status,
    },
  })),

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
      // Periodically ping to keep alive
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
            // Create a fake message object that matches fields until re-fetch
            const msg: Message = {
              id: message_id,
              channel_id,
              sender_id,
              parent_id: null, // Basic messages
              content,
              attachments: [],
              is_edited: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            get().addMessage(channel_id, msg);
            break;
          }
          case 'message_edited': {
            const { channel_id, message_id, content } = data.payload;
            const list = get().messages[channel_id] || [];
            const updated = list.map((m) =>
              m.id === message_id ? { ...m, content, is_edited: true, updated_at: new Date().toISOString() } : m
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
          case 'pong':
            // Pong received
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
      // Reconnect after 3 seconds
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
