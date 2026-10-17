import { CryptoProvider } from './contexts/CryptoContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ChatApp from './components/layout/ChatApp';

function App() {
  return (
    <ThemeProvider>
      <CryptoProvider>
        <ChatApp />
      </CryptoProvider>
    </ThemeProvider>
  );
}

export default App;
