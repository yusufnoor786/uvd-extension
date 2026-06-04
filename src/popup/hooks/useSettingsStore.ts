import { create } from 'zustand';
import type { AppSettings } from '../../types';
import { DEFAULT_SETTINGS } from '../../types';

interface SettingsStore {
  settings: AppSettings;
  loading: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: DEFAULT_SETTINGS,
  loading: false,

  loadSettings: async () => {
    set({ loading: true });
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS', timestamp: Date.now() });
    if (response?.success) {
      set({ settings: response.settings || DEFAULT_SETTINGS, loading: false });
    } else {
      set({ loading: false });
    }
  },

  updateSettings: async (partial) => {
    set(state => {
      const updated = { ...state.settings, ...partial };
      chrome.runtime.sendMessage({ type: 'SET_SETTINGS', payload: updated, timestamp: Date.now() });
      return { settings: updated };
    });
  },
}));
