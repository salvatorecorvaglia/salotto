import React, { useState } from 'react';
import { X, Shield, Copy, Check } from 'lucide-react';
import { API_BASE } from '../../store/chatStore';

interface WorkspaceSettingsModalProps {
  workspaceId: string;
  token: string | null;
  onClose: () => void;
}

export const WorkspaceSettingsModal: React.FC<WorkspaceSettingsModalProps> = ({
  workspaceId,
  token,
  onClose,
}) => {
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleGenerateInvite = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/invites`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setInviteCode(data.code);
      }
    } catch (err) {
      console.error('Failed to generate invite code', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <h3 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
            <Shield className="w-5 h-5 text-indigo-400" />
            <span>Workspace Invites & Settings</span>
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            Generate an invite code to allow team members to join this workspace.
          </p>

          {inviteCode ? (
            <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 rounded-2xl p-3">
              <span className="font-mono text-sm text-indigo-300 flex-1 truncate">{inviteCode}</span>
              <button
                onClick={handleCopy}
                className="p-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 transition"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          ) : (
            <button
              onClick={handleGenerateInvite}
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition shadow-md shadow-indigo-600/20"
            >
              {loading ? 'Generating...' : 'Generate New Invite Code'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
