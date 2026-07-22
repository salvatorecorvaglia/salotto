import React, { useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { API_BASE } from '../../store/chatStore';

interface UserSettingsModalProps {
  user: any;
  token: string | null;
  onClose: () => void;
  onUpdateUser: (updatedFields: any) => void;
}

const STATUS_EMOJI_PRESETS = ['💻', '🥪', '🏝️', '🏠', '🤒', '🚀', '💡'];

export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
  user,
  token,
  onClose,
  onUpdateUser,
}) => {
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [statusEmoji, setStatusEmoji] = useState(user?.custom_status_emoji || '');
  const [statusText, setStatusText] = useState(user?.custom_status_text || '');
  const [avatarUrl] = useState<string | null>(user?.avatar_url || null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          display_name: displayName || undefined,
          avatar_url: avatarUrl || undefined,
          custom_status_emoji: statusEmoji,
          custom_status_text: statusText,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        onUpdateUser(updated);
        onClose();
      }
    } catch (err) {
      console.error('Update profile failed', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <h3 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <span>Profile & Status Settings</span>
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Custom Status Text</label>
            <input
              type="text"
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
              placeholder="What's on your mind?"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2">Status Emoji Preset</label>
            <div className="flex space-x-2">
              {STATUS_EMOJI_PRESETS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setStatusEmoji(emoji === statusEmoji ? '' : emoji)}
                  className={`w-9 h-9 rounded-xl border text-base flex items-center justify-center transition ${
                    statusEmoji === emoji
                      ? 'bg-indigo-600/20 border-indigo-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 transition shadow-md shadow-indigo-600/20"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
