import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

function readStored(): Theme | null {
  try {
    const value = localStorage.getItem('theme');
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null; // storage can be blocked (private window): the theme just is not remembered
  }
}

function initialTheme(): Theme {
  return readStored() ?? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('theme', next);
      } catch {
        /* not remembered */
      }
      return next;
    });
  }, []);

  return [theme, toggle];
}
