import { createContext, useContext, useState, type ReactNode, useEffect } from 'react';

interface SettingsContextType {
  burnerMode: boolean;
  setBurnerMode: (val: boolean) => void;
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean) => void;
  enterToSend: boolean;
  setEnterToSend: (val: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [burnerMode, setBurnerMode] = useState(false);
  
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('axon_dark_mode');
    return saved !== null ? saved === 'true' : true;
  });

  const [enterToSend, setEnterToSend] = useState(() => {
    const saved = localStorage.getItem('axon_enter_send');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem('axon_dark_mode', isDarkMode.toString());
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('axon_enter_send', enterToSend.toString());
  }, [enterToSend]);

  return (
    <SettingsContext.Provider
      value={{
        burnerMode,
        setBurnerMode,
        isDarkMode,
        setIsDarkMode,
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
