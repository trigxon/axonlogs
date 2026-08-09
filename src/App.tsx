import { useState } from 'react';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { CryptoProvider, useCrypto } from './contexts/CryptoContext';
import TopNav from './components/layout/TopNav';
import Sidebar from './components/layout/Sidebar';
import ChatFeed from './components/chat/ChatFeed';
import CommandInput from './components/chat/CommandInput';
import SettingsModal from './components/overlays/SettingsModal';
import PanicScreen from './components/overlays/PanicScreen';
import JoinScreen from './components/overlays/JoinScreen';

const Terminal = () => {
  const { panicState } = useSettings();
  const { connectToRoom, username } = useCrypto();
  
  const [hasJoined, setHasJoined] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  if (panicState) {
    return <PanicScreen />;
  }

  if (!hasJoined || !username) {
    return (
      <JoinScreen 
        onJoin={(user, room) => {
          connectToRoom(user, room);
          setHasJoined(true);
        }} 
      />
    );
  }

  return (
    <div className="h-[100dvh] w-full overflow-hidden flex flex-col bg-void text-white relative">
      <div className="absolute inset-0 bg-grid-pattern opacity-100 pointer-events-none z-0" />
      
      <TopNav 
        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} 
        toggleSettings={() => setIsSettingsOpen(!isSettingsOpen)} 
      />
      
      <div className="flex flex-1 overflow-hidden relative z-10">
        <Sidebar 
          isOpen={isSidebarOpen} 
          close={() => setIsSidebarOpen(false)} 
          openSettings={() => setIsSettingsOpen(true)}
        />
        
        <main className="flex-1 flex flex-col h-full bg-void/90 border-l border-white/5 relative">
          <ChatFeed />
          <CommandInput />
        </main>
      </div>

      <SettingsModal isOpen={isSettingsOpen} close={() => setIsSettingsOpen(false)} />
    </div>
  );
};

function App() {
  return (
    <SettingsProvider>
      <CryptoProvider>
        <Terminal />
      </CryptoProvider>
    </SettingsProvider>
  );
}

export default App;
