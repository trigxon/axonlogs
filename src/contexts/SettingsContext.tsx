import { createContext, useContext, useState, type ReactNode, useEffect } from 'react';

export type AppTheme = 'Terminal' | 'Cyberpunk' | 'Minimalist';

interface SettingsContextType {
  burnerMode: boolean;
  setBurnerMode: (val: boolean) => void;
  appTheme: AppTheme;
  setAppTheme: (val: AppTheme) => void;
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

  const [enterToSend, setEnterToSend] = useState(() => {
    const saved = localStorage.getItem('axon_enter_send');
    return saved !== null ? saved === 'true' : true;
  });

  const [appTheme, setAppTheme] = useState<AppTheme>(() => {
    return (localStorage.getItem('axon_app_theme') as AppTheme) || 'Minimalist';
  });

  useEffect(() => {
    localStorage.setItem('axon_stealth_mode', stealthMode.toString());
  }, [stealthMode]);

  useEffect(() => {
    localStorage.setItem('axon_enter_send', enterToSend.toString());
  }, [enterToSend]);

  useEffect(() => {
    localStorage.setItem('axon_app_theme', appTheme);
    const root = document.documentElement;
    root.classList.remove('theme-terminal', 'theme-cyberpunk', 'theme-minimalist');
    
    if (appTheme === 'Terminal') {
      root.classList.add('theme-terminal');
    } else if (appTheme === 'Cyberpunk') {
      root.classList.add('theme-cyberpunk');
    } else {
      root.classList.add('theme-minimalist');
    }
  }, [appTheme]);

  return (
    <SettingsContext.Provider
      value={{
        burnerMode,
        setBurnerMode,
        appTheme,
        setAppTheme,
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
