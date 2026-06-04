import { create } from 'zustand';
import type { DownloadJob, ExtensionMessage } from '../../types';
import { createLogger } from '../../utils/logger';

const log = createLogger('useDownloadStore');

interface DownloadStore {
  jobs: DownloadJob[];
  loading: boolean;
  loadJobs: () => Promise<void>;
  handleMessage: (msg: ExtensionMessage) => void;
  cancelJob: (id: string) => void;
  pauseJob: (id: string) => void;
  resumeJob: (id: string) => void;
}

export const useDownloadStore = create<DownloadStore>((set, get) => ({
  jobs: [],
  loading: false,

  loadJobs: async () => {
    set({ loading: true });
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_DOWNLOADS', timestamp: Date.now() });
      if (res?.success) set({ jobs: res.jobs || [], loading: false });
    } catch (err) {
      log.error('Load jobs failed', { error: String(err) });
      set({ loading: false });
    }
  },

  handleMessage: (msg) => {
    if (msg.type === 'DOWNLOAD_PROGRESS') {
      const updated = msg.payload as DownloadJob;
      set(state => ({
        jobs: state.jobs.some(j => j.id === updated.id)
          ? state.jobs.map(j => j.id === updated.id ? updated : j)
          : [updated, ...state.jobs],
      }));
    }
  },

  cancelJob: (id) => {
    chrome.runtime.sendMessage({ type: 'CANCEL_DOWNLOAD', payload: { jobId: id }, timestamp: Date.now() });
    set(state => ({ jobs: state.jobs.map(j => j.id === id ? { ...j, status: 'cancelled' as const } : j) }));
  },

  pauseJob: (id) => {
    chrome.runtime.sendMessage({ type: 'PAUSE_DOWNLOAD', payload: { jobId: id }, timestamp: Date.now() });
    set(state => ({ jobs: state.jobs.map(j => j.id === id ? { ...j, status: 'paused' as const } : j) }));
  },

  resumeJob: (id) => {
    chrome.runtime.sendMessage({ type: 'RESUME_DOWNLOAD', payload: { jobId: id }, timestamp: Date.now() });
  },
}));
