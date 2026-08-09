import { CryptoProvider } from './contexts/CryptoContext';
import TerminalUI from './components/layout/TerminalUI';

function App() {
  return (
    <CryptoProvider>
      <TerminalUI />
    </CryptoProvider>
  );
}

export default App;
