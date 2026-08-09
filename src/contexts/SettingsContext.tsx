import { createContext, useContext, useState, type ReactNode, useEffect } from 'react';

interface SettingsContextType {
  burnerMode: boolean;
  setBurnerMode: (val: boolean) => void;
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean) => void;
  stealthMode: boolean;
  setStealthMode: (val: boolean) => void;
  enterToSend: boolean;
  setEnterToSend: (val: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [burnerMode, setBurnerMode] = useState(false);
  
  const [stealthMode, setStealthMode] = useState(() => {
    const saved = localStorage.getItem('axon_stealth_mode');
    return saved !== null ? saved === 'true' : false;
  });

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('axon_dark_mode');
    return saved !== null ? saved === 'true' : true;
  });

  const [enterToSend, setEnterToSend] = useState(() => {
    const saved = localStorage.getItem('axon_enter_send');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem('axon_stealth_mode', stealthMode.toString());
  }, [stealthMode]);

  useEffect(() => {
    localStorage.setItem('axon_enter_send', enterToSend.toString());
  }, [enterToSend]);

  useEffect(() => {
    localStorage.setItem('axon_dark_mode', isDarkMode.toString());
    const root = document.documentElement;
    // Strip old theme classes if they exist
    root.classList.remove('theme-terminal', 'theme-cyberpunk', 'theme-minimalist');
    if (isDarkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDarkMode]);

  return (
    <SettingsContext.Provider
      value={{
        burnerMode,
        setBurnerMode,
        isDarkMode,
        setIsDarkMode,
        stealthMode,
        setStealthMode,
        enterToSend,
        setEnterToSend
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
