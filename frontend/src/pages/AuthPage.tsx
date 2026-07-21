import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { API_BASE } from '../store/chatStore';
import { LogIn, UserPlus, ShieldAlert, Sparkles } from 'lucide-react';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const body = isLogin 
        ? { email, password }
        : { username, email, password, display_name: displayName || undefined };

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Authentication failed');
      }

      setAuth(data.access_token, data.refresh_token, data.user);
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b13] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.2),rgba(255,255,255,0))] flex flex-col justify-center items-center p-4">
      {/* Salotto Logo Brand Header */}
      <div className="flex items-center gap-2 mb-8 select-none scale-105">
        <div className="p-3 bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-500 rounded-2xl shadow-xl shadow-indigo-900/30">
          <Sparkles className="h-7 w-7 text-white" />
        </div>
        <span className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-indigo-200 font-sans tracking-tight">
          Salotto
        </span>
      </div>

      {/* Main Glassmorphic Form Card */}
      <div className="w-full max-w-md glass rounded-3xl p-8 relative overflow-hidden shadow-2xl shadow-black/50">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-indigo-500 to-cyan-500" />
        
        <h2 className="text-2xl font-bold text-center text-white mb-2">
          {isLogin ? 'Welcome back' : 'Create an account'}
        </h2>
        <p className="text-center text-slate-400 text-sm mb-6">
          {isLogin ? 'Sign in to access your workspaces' : 'Get started with self-hosted communication'}
        </p>

        {error && (
          <div className="mb-4 p-4 bg-red-900/20 border border-red-500/30 rounded-2xl flex items-start gap-3 text-red-300 text-sm">
            <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <>
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-1.5" htmlFor="username">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  required
                  placeholder="e.g. janesmith"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/70 transition-colors"
                />
              </div>

              <div>
                <label className="block text-slate-300 text-sm font-medium mb-1.5" htmlFor="displayName">
                  Display Name (Optional)
                </label>
                <input
                  id="displayName"
                  type="text"
                  placeholder="e.g. Jane Smith"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/70 transition-colors"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-slate-300 text-sm font-medium mb-1.5" htmlFor="email">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              required
              placeholder="e.g. jane@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/70 transition-colors"
            />
          </div>

          <div>
            <label className="block text-slate-300 text-sm font-medium mb-1.5" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/70 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium rounded-xl py-3 shadow-lg shadow-indigo-900/20 active:scale-[0.99] transition-transform flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <span className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : isLogin ? (
              <>
                <LogIn className="h-5 w-5" />
                <span>Sign In</span>
              </>
            ) : (
              <>
                <UserPlus className="h-5 w-5" />
                <span>Create Account</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-800 flex items-center justify-center text-sm">
          <span className="text-slate-400 mr-2">
            {isLogin ? "Don't have an account?" : 'Already have an account?'}
          </span>
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
            }}
            className="text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer"
          >
            {isLogin ? 'Register' : 'Login'}
          </button>
        </div>
      </div>
    </div>
  );
}
