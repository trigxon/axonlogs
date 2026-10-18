import { BrowserRouter } from 'react-router-dom';
import { CryptoProvider, useCrypto } from './contexts/CryptoContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ChatApp from './components/layout/ChatApp';
import AuthScreen from './components/auth/AuthScreen';

function Gate() {
  const { account } = useCrypto();
  return account ? <ChatApp /> : <AuthScreen />;
}

function App() {
  return (
    <ThemeProvider>
      <CryptoProvider>
        <BrowserRouter>
          <Gate />
        </BrowserRouter>
      </CryptoProvider>
    </ThemeProvider>
  );
}

export default App;
