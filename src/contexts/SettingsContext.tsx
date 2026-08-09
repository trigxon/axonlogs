import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface SettingsContextType {
  stealthMode: boolean;
  setStealthMode: (val: boolean) => void;
  burnOnRead: boolean;
  setBurnOnRead: (val: boolean) => void;
  crtEffect: boolean;
  setCrtEffect: (val: boolean) => void;
  timeFormat: 'UTC' | 'LOCAL';
  setTimeFormat: (val: 'UTC' | 'LOCAL') => void;
  panicState: boolean;
  setPanicState: (val: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [stealthMode, setStealthMode] = useState(false);
  const [burnOnRead, setBurnOnRead] = useState(true);
  const [crtEffect, setCrtEffect] = useState(true);
  const [timeFormat, setTimeFormat] = useState<'UTC' | 'LOCAL'>('UTC');
  const [panicState, setPanicState] = useState(false);

  // Apply CRT effect class to body
  useEffect(() => {
    if (crtEffect) {
      document.body.classList.add('crt-scanlines', 'crt-vignette');
    } else {
      document.body.classList.remove('crt-scanlines', 'crt-vignette');
    }
  }, [crtEffect]);

  return (
    <SettingsContext.Provider
      value={{
        stealthMode,
        setStealthMode,
        burnOnRead,
        setBurnOnRead,
        crtEffect,
        setCrtEffect,
        timeFormat,
        setTimeFormat,
        panicState,
        setPanicState
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
