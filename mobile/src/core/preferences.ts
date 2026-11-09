import { Uniwind } from 'uniwind';
import { create } from 'zustand';

import { readJSON, writeJSON } from '@/core/storage';

export type ThemePreference = 'system' | 'light' | 'dark';

type Preferences = {
  theme: ThemePreference;
  setTheme: (t: ThemePreference) => void;
};

const KEY = 'pref.app';
const saved = readJSON<Pick<Preferences, 'theme'>>(KEY);

export const usePreferences = create<Preferences>((set) => ({
  theme: saved?.theme ?? 'system',
  setTheme: (theme) => {
    Uniwind.setTheme(theme);
    set({ theme });
    writeJSON(KEY, { theme });
  },
}));

/** Applies the saved theme before the first frame. */
export function applyThemePreference() {
  Uniwind.setTheme(usePreferences.getState().theme);
}
