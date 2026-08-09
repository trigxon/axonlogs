import { CryptoProvider, useCrypto } from './contexts/CryptoContext';
import LoginScreen from './components/layout/LoginScreen';
import TerminalUI from './components/layout/TerminalUI';

const AppRouter = () => {
  const { alias, roomCode } = useCrypto();

  // If we have both an alias and a roomCode, we are "logged in" to a channel.
  if (alias && roomCode) {
    return <TerminalUI />;
  }

  // Otherwise, show the login screen.
  return <LoginScreen />;
};

function App() {
  return (
    <CryptoProvider>
      <AppRouter />
    </CryptoProvider>
  );
}

export default App;
