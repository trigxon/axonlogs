import { useState } from 'react';
import { CryptoProvider } from './contexts/CryptoContext';
import { ThemeProvider } from './contexts/ThemeContext';
import TerminalUI from './components/layout/TerminalUI';
import type { ActiveView } from './components/layout/Sidebar';

function App() {
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');

  return (
    <ThemeProvider>
      <CryptoProvider>
        <TerminalUI activeView={activeView} setActiveView={setActiveView} />
      </CryptoProvider>
    </ThemeProvider>
  );
}

export default App;
