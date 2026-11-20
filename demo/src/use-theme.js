import { useLayoutEffect, useState, useSyncExternalStore } from 'react';

const preference = window.matchMedia('(prefers-color-scheme: dark)');

function subscribe(listener) {
  preference.addEventListener('change', listener);
  return () => preference.removeEventListener('change', listener);
}

function systemTheme() {
  return preference.matches ? 'dark' : 'light';
}

export function useTheme() {
  const [mode, setMode] = useState(() => document.documentElement.dataset.themeMode);
  const system = useSyncExternalStore(subscribe, systemTheme);
  const theme = mode === 'system' ? system : mode;

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.themeMode = mode;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  }, [mode, theme]);

  function chooseMode(next) {
    setMode(next);
    try {
      localStorage.setItem('thymio.demo.theme', next);
    } catch { /* The choice still applies for this visit. */ }
  }

  return { mode, theme, chooseMode };
}
