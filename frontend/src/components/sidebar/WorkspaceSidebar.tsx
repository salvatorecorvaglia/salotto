import React from 'react';
import { Plus, Settings, LogOut } from 'lucide-react';
import type { Workspace } from '../../store/chatStore';

interface WorkspaceSidebarProps {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onOpenNewWorkspace: () => void;
  onOpenUserSettings: () => void;
  onLogout: () => void;
}

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onOpenNewWorkspace,
  onOpenUserSettings,
  onLogout,
}) => {
  return (
    <aside className="w-18 bg-slate-950 border-r border-slate-800/80 flex flex-col items-center py-4 space-y-4 select-none z-20">
      {/* Brand logo */}
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-2">
        <span className="font-bold text-xl text-white tracking-wider">S</span>
      </div>

      <div className="w-8 h-[1px] bg-slate-800 my-1" />

      {/* Workspace List */}
      <div className="flex-1 w-full flex flex-col items-center space-y-3 overflow-y-auto no-scrollbar">
        {workspaces.map((ws) => {
          const isActive = ws.id === activeWorkspaceId;
          return (
            <button
              key={ws.id}
              onClick={() => onSelectWorkspace(ws.id)}
              title={ws.name}
              className={`relative group w-12 h-12 rounded-2xl flex items-center justify-center font-semibold text-lg transition-all duration-200 ${
                isActive
                  ? 'bg-indigo-600 text-white rounded-xl shadow-md shadow-indigo-600/30'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 hover:rounded-xl'
              }`}
            >
              {isActive && (
                <span className="absolute -left-3 w-1.5 h-8 bg-indigo-500 rounded-r-full" />
              )}
              {ws.name.substring(0, 2).toUpperCase()}
            </button>
          );
        })}

        {/* Create workspace button */}
        <button
          onClick={onOpenNewWorkspace}
          title="Create or Join Workspace"
          className="w-12 h-12 rounded-2xl bg-slate-900 border border-dashed border-slate-700 text-slate-400 hover:text-indigo-400 hover:border-indigo-500/50 hover:bg-slate-800/50 flex items-center justify-center transition-all duration-200"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      <div className="w-8 h-[1px] bg-slate-800 my-1" />

      {/* User Actions */}
      <div className="flex flex-col items-center space-y-3">
        <button
          onClick={onOpenUserSettings}
          title="User Settings"
          className="w-10 h-10 rounded-xl bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 flex items-center justify-center transition-all"
        >
          <Settings className="w-5 h-5" />
        </button>
        <button
          onClick={onLogout}
          title="Log Out"
          className="w-10 h-10 rounded-xl bg-slate-900 text-rose-400 hover:bg-rose-500/10 flex items-center justify-center transition-all"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </aside>
  );
};
