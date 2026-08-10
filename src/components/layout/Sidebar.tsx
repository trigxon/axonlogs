import React from 'react';
import { 
  LayoutDashboard, 
  Bot, 
  Settings, 
  FileText, 
  ChevronLeft, 
  ChevronRight,
  ShieldAlert,
  UserCheck
} from 'lucide-react';
import { useCrypto } from '../../contexts/CryptoContext';

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
  const { alias } = useCrypto();

  const coreNav = [
    {
      id: 'dashboard' as ActiveView,
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'axon-ai' as ActiveView,
      label: 'Axon AI',
      icon: <Bot className="w-4 h-4 shrink-0" />,
      badge: 'AI',
    }
  ];

  const systemNav = [
    {
      id: 'settings' as ActiveView,
      label: 'Settings',
      icon: <Settings className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'logs' as ActiveView,
      label: 'Logs',
      icon: <FileText className="w-4 h-4 shrink-0" />,
    }
  ];

  const renderNavGroup = (title: string, items: typeof coreNav) => (
    <div className="mb-4">
      {!isCollapsed && (
        <div className="px-3 mb-2 text-[10px] font-bold text-zinc-600 tracking-[0.2em] uppercase">
          {title}
        </div>
      )}
      <div className="space-y-0.5">
        {items.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              title={isCollapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                isActive
                  ? 'bg-cyan-500/10 text-cyan-400 font-semibold shadow-sm shadow-cyan-950/20'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
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
      </div>
    </div>
  );

  return (
    <aside
      className={`bg-[#050505] border-r border-zinc-800/80 flex flex-col transition-all duration-300 z-30 select-none ${
        isCollapsed ? 'w-[72px]' : 'w-[260px]'
      }`}
    >
      {/* Header / Brand */}
      <div className="h-16 flex items-center justify-between px-4 mt-2">
        {!isCollapsed ? (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <span className="font-bold tracking-[0.2em] text-lg text-cyan-400 truncate flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" />
              AXON<span className="text-zinc-500 font-light">LOGS</span>
            </span>
          </div>
        ) : (
          <div className="w-full flex justify-center">
            <ShieldAlert className="w-5 h-5 text-cyan-400" />
          </div>
        )}

        {!isCollapsed && (
          <button
            onClick={() => setIsCollapsed(prev => !prev)}
            title="Collapse Sidebar"
            className="p-1.5 text-zinc-500 hover:text-cyan-400 hover:bg-zinc-800/50 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Collapse Toggle for collapsed state */}
      {isCollapsed && (
        <div className="p-2 flex justify-center mb-2">
          <button
            onClick={() => setIsCollapsed(prev => !prev)}
            title="Expand Sidebar"
            className="p-1.5 text-zinc-500 hover:text-cyan-400 hover:bg-zinc-800/50 rounded-lg transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation Items */}
      <nav className="flex-1 px-3 overflow-y-auto pt-2">
        {renderNavGroup('Core', coreNav)}
        {renderNavGroup('System', systemNav)}
      </nav>

      {/* Profile Footer */}
      {!isCollapsed ? (
        <div className="p-4 mt-auto">
          <div className="bg-[#0a0a0f] border border-zinc-800/60 rounded-xl p-3 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0">
                <UserCheck className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="flex flex-col overflow-hidden w-full">
                <span className="text-[9px] text-zinc-500 tracking-[0.15em] uppercase">CONSOLE WITH</span>
                <span className="text-xs font-bold text-cyan-400 truncate uppercase tracking-widest">{alias || 'ANONYMOUS'}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2 mt-1">
              <button onClick={() => setActiveView('settings')} className="p-1.5 text-zinc-500 hover:text-cyan-400 hover:bg-zinc-800/80 rounded-lg transition-colors bg-zinc-900" title="Settings">
                <Settings className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setActiveView('logs')} className="p-1.5 text-zinc-500 hover:text-cyan-400 hover:bg-zinc-800/80 rounded-lg transition-colors bg-zinc-900" title="Logs">
                <FileText className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-3 mt-auto flex justify-center">
          <div className="w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center" title={alias || 'ANONYMOUS'}>
            <UserCheck className="w-5 h-5 text-cyan-400" />
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
