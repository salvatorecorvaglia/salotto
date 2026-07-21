import { create } from 'zustand';

export interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  status: string;
  last_seen_at: string | null;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  setAuth: (token: string, refreshToken: string, user: UserProfile) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()((set) => {
  // Try loading from localStorage on startup
  const savedToken = localStorage.getItem('access_token');
  const savedRefreshToken = localStorage.getItem('refresh_token');
  const savedUserStr = localStorage.getItem('user');
  const savedUser = savedUserStr ? JSON.parse(savedUserStr) : null;

  return {
    token: savedToken,
    refreshToken: savedRefreshToken,
    user: savedUser,
    isAuthenticated: !!savedToken,
    setAuth: (token, refreshToken, user) => {
      localStorage.setItem('access_token', token);
      localStorage.setItem('refresh_token', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));
      set({ token, refreshToken, user, isAuthenticated: true });
    },
    clearAuth: () => {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      set({ token: null, refreshToken: null, user: null, isAuthenticated: false });
    },
  };
});
