import { useState } from 'react';
import { SettingsProvider } from './contexts/SettingsContext';
import { CryptoProvider, useCrypto } from './contexts/CryptoContext';
import Sidebar from './components/layout/Sidebar';
import ChatFeed from './components/chat/ChatFeed';
import ChatInput from './components/chat/ChatInput';
import SettingsModal from './components/overlays/SettingsModal';
import { Menu } from 'lucide-react';

const Workspace = () => {
  const { activeChat } = useCrypto();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="h-[100dvh] w-full flex bg-background text-text-primary overflow-hidden">
      <Sidebar 
        isMobileOpen={isSidebarOpen} 
        setIsMobileOpen={setIsSidebarOpen} 
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      
      <main className="flex-1 flex flex-col min-w-0 h-full relative">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center h-14 border-b border-border bg-panel/80 backdrop-blur px-4 shrink-0 z-10">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 -ml-2 mr-2 text-text-secondary hover:text-text-primary"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="font-bold truncate text-sm">
            {activeChat ? activeChat.name : "Axon Workspace"}
          </div>
        </header>

        {activeChat ? (
          <>
            <ChatFeed />
            <ChatInput />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-secondary/50 text-sm">
            Select or create a chat to begin
          </div>
        )}
      </main>

      <SettingsModal isOpen={isSettingsOpen} close={() => setIsSettingsOpen(false)} />
    </div>
  );
};

function App() {
  return (
    <SettingsProvider>
      <CryptoProvider>
        <Workspace />
      </CryptoProvider>
    </SettingsProvider>
  );
}

export default App;
