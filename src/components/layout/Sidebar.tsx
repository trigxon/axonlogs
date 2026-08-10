import React from 'react';
import { 
  LayoutDashboard, 
  Bot, 
  Settings, 
  FileText, 
  ChevronLeft, 
  ChevronRight,
  ShieldAlert
} from 'lucide-react';

export type ActiveView = 'dashboard' | 'axon-ai' | 'settings' | 'logs';

export interface SidebarProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  setActiveView,
  isCollapsed,
  setIsCollapsed,
}) => {
  const navItems: { id: ActiveView; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-5 h-5 shrink-0" />,
    },
    {
      id: 'axon-ai',
      label: 'Axon AI',
      icon: <Bot className="w-5 h-5 shrink-0" />,
      badge: 'AI',
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings className="w-5 h-5 shrink-0" />,
    },
    {
      id: 'logs',
      label: 'Logs',
      icon: <FileText className="w-5 h-5 shrink-0" />,
    },
  ];

  return (
    <aside
      className={`bg-[#0a0a0f] border-r border-zinc-800/80 flex flex-col transition-all duration-300 z-30 select-none ${
        isCollapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Header / Brand */}
      <div className="h-14 border-b border-zinc-800/80 flex items-center justify-between px-3.5 bg-[#050505]/50">
        {!isCollapsed ? (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-7 h-7 rounded bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-4 h-4 text-cyan-400" />
            </div>
            <span className="font-bold tracking-widest text-sm text-cyan-400 truncate">
              AXON<span className="text-zinc-400 font-normal">LOGS</span>
            </span>
          </div>
        ) : (
          <div className="w-full flex justify-center">
            <div className="w-7 h-7 rounded bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4 text-cyan-400" />
            </div>
          </div>
        )}

        {!isCollapsed && (
          <button
            onClick={() => setIsCollapsed(prev => !prev)}
            title="Collapse Sidebar"
            className="p-1 text-zinc-500 hover:text-cyan-400 hover:bg-zinc-800/50 rounded transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Collapse Toggle for collapsed state */}
      {isCollapsed && (
        <div className="p-2 border-b border-zinc-800/50 flex justify-center">
          <button
            onClick={() => setIsCollapsed(prev => !prev)}
            title="Expand Sidebar"
            className="p-1 text-zinc-500 hover:text-cyan-400 hover:bg-zinc-800/50 rounded transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation Items */}
      <nav className="flex-1 p-2 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              title={isCollapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-xs font-mono tracking-wider transition-all duration-150 ${
                isActive
                  ? 'bg-cyan-500/10 text-cyan-400 border-l-2 border-cyan-400 font-semibold shadow-sm shadow-cyan-950/20'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border-l-2 border-transparent'
              } ${isCollapsed ? 'justify-center px-0' : ''}`}
            >
              {item.icon}
              {!isCollapsed && (
                <span className="truncate flex-1 text-left">{item.label}</span>
              )}
              {!isCollapsed && item.badge && (
                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-cyan-400/20 text-cyan-300 border border-cyan-400/30">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer info */}
      {!isCollapsed && (
        <div className="p-3 border-t border-zinc-800/80 bg-[#050505]/40 text-[10px] text-zinc-600 font-mono flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            ONLINE
          </span>
          <span>v2.4.0</span>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
