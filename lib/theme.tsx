'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type ThemeMode = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  theme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  setTheme: (theme: ResolvedTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  theme: 'light',
  setMode: () => {},
  toggleTheme: () => {},
  setTheme: () => {},
});

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(t: ResolvedTheme) {
  if (t === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [resolved, setResolved] = useState<ResolvedTheme>('light');

  useEffect(() => {
    const stored = localStorage.getItem('theme') as ThemeMode | null;
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      setModeState(stored);
      const r = stored === 'system' ? getSystemTheme() : stored;
      setResolved(r);
      applyTheme(r);
    } else {
      // No preference stored — default to system
      const r = getSystemTheme();
      setResolved(r);
      applyTheme(r);
    }

    requestAnimationFrame(() => {
      document.documentElement.classList.remove('no-transitions');
    });
  }, []);

  // Listen for system theme changes when in system mode
  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      const r = e.matches ? 'dark' : 'light';
      setResolved(r);
      applyTheme(r);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    localStorage.setItem('theme', m);
    const r = m === 'system' ? getSystemTheme() : m;
    setResolved(r);
    applyTheme(r);
  };

  const setTheme = (t: ResolvedTheme) => {
    setMode(t);
  };

  const toggleTheme = () => {
    setMode(resolved === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ mode, theme: resolved, setMode, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
