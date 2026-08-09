import { createContext, useContext, useState, type ReactNode, useEffect } from 'react';

export type FontSize = 'S' | 'M' | 'L';
export type CornerStyle = 'Sharp' | 'Rounded' | 'Pill';

interface SettingsContextType {
  burnerMode: boolean;
  setBurnerMode: (val: boolean) => void;
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean) => void;
  enterToSend: boolean;
  setEnterToSend: (val: boolean) => void;
  fontSize: FontSize;
  setFontSize: (val: FontSize) => void;
  cornerStyle: CornerStyle;
  setCornerStyle: (val: CornerStyle) => void;
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

  const [fontSize, setFontSize] = useState<FontSize>(() => {
    return (localStorage.getItem('axon_font_size') as FontSize) || 'M';
  });

  const [cornerStyle, setCornerStyle] = useState<CornerStyle>(() => {
    return (localStorage.getItem('axon_corner_style') as CornerStyle) || 'Rounded';
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

  useEffect(() => {
    localStorage.setItem('axon_font_size', fontSize);
    const root = document.documentElement;
    if (fontSize === 'S') root.style.setProperty('--font-scale', '0.875rem');
    else if (fontSize === 'M') root.style.setProperty('--font-scale', '1rem');
    else if (fontSize === 'L') root.style.setProperty('--font-scale', '1.125rem');
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('axon_corner_style', cornerStyle);
    const root = document.documentElement;
    if (cornerStyle === 'Sharp') root.style.setProperty('--radius', '0px');
    else if (cornerStyle === 'Rounded') root.style.setProperty('--radius', '0.75rem');
    else if (cornerStyle === 'Pill') root.style.setProperty('--radius', '9999px');
  }, [cornerStyle]);

  return (
    <SettingsContext.Provider
      value={{
        burnerMode,
        setBurnerMode,
        isDarkMode,
        setIsDarkMode,
        enterToSend,
        setEnterToSend,
        fontSize,
        setFontSize,
        cornerStyle,
        setCornerStyle
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
