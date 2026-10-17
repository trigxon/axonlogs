import React, { createContext, useContext, useState, useEffect } from 'react';

export type TextSize = 'small' | 'medium' | 'large';
export type CardPadding = 'compact' | 'normal' | 'relaxed';
export type BorderRadius = 'sharp' | 'rounded' | 'pill';

export interface ThemeContextType {
  textSize: TextSize;
  cardPadding: CardPadding;
  borderRadius: BorderRadius;
  setTextSize: (size: TextSize) => void;
  setCardPadding: (padding: CardPadding) => void;
  setBorderRadius: (radius: BorderRadius) => void;
}

export const TEXT_SIZE_MAP: Record<TextSize, string> = {
  small: '12px',
  medium: '14px',
  large: '16px',
};

export const CARD_PADDING_MAP: Record<CardPadding, string> = {
  compact: '8px',
  normal: '16px',
  relaxed: '24px',
};

export const BORDER_RADIUS_MAP: Record<BorderRadius, string> = {
  sharp: '0px',
  rounded: '8px',
  pill: '24px',
};

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [textSize, setTextSizeState] = useState<TextSize>(() => {
    return (localStorage.getItem('axon_text_size') as TextSize) || 'medium';
  });
  const [cardPadding, setCardPaddingState] = useState<CardPadding>(() => {
    return (localStorage.getItem('axon_card_padding') as CardPadding) || 'normal';
  });
  const [borderRadius, setBorderRadiusState] = useState<BorderRadius>(() => {
    return (localStorage.getItem('axon_border_radius') as BorderRadius) || 'rounded';
  });

  const setTextSize = (size: TextSize) => {
    setTextSizeState(size);
    localStorage.setItem('axon_text_size', size);
  };

  const setCardPadding = (padding: CardPadding) => {
    setCardPaddingState(padding);
    localStorage.setItem('axon_card_padding', padding);
  };

  const setBorderRadius = (radius: BorderRadius) => {
    setBorderRadiusState(radius);
    localStorage.setItem('axon_border_radius', radius);
  };

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--ui-text-size', TEXT_SIZE_MAP[textSize] || '14px');
    root.style.setProperty('--ui-card-padding', CARD_PADDING_MAP[cardPadding] || '16px');
    root.style.setProperty('--ui-border-radius', BORDER_RADIUS_MAP[borderRadius] || '8px');
  }, [textSize, cardPadding, borderRadius]);

  return (
    <ThemeContext.Provider
      value={{
        textSize,
        cardPadding,
        borderRadius,
        setTextSize,
        setCardPadding,
        setBorderRadius,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
