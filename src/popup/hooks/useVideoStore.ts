import { create } from 'zustand';
import type { DetectedVideo, ExtensionMessage } from '../../types';
import { createLogger } from '../../utils/logger';

const log = createLogger('useVideoStore');

interface VideoStore {
  videos: DetectedVideo[];
  activeVideo: DetectedVideo | null;
  loading: boolean;
  error: string | null;
  loadVideos: () => Promise<void>;
  setActiveVideo: (video: DetectedVideo | null) => void;
  handleMessage: (msg: ExtensionMessage) => void;
}

export const useVideoStore = create<VideoStore>((set, get) => ({
  videos: [],
  activeVideo: null,
  loading: false,
  error: null,

  loadVideos: async () => {
    set({ loading: true, error: null });
    try {
      const [tabsResult] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabsResult?.id) return;

      const response = await chrome.runtime.sendMessage({
        type: 'GET_VIDEOS',
        tabId: tabsResult.id,
        timestamp: Date.now(),
      });

      if (response?.success) {
        const videos: DetectedVideo[] = response.videos || [];
        const activeResponse = await chrome.runtime.sendMessage({
          type: 'GET_ACTIVE_VIDEO',
          tabId: tabsResult.id,
          timestamp: Date.now(),
        });
        set({
          videos,
          activeVideo: activeResponse?.video || (videos.length > 0 ? videos[0] : null),
          loading: false,
        });
      }
    } catch (err) {
      log.error('Failed to load videos', { error: String(err) });
      set({ loading: false, error: String(err) });
    }
  },

  setActiveVideo: (video) => set({ activeVideo: video }),

  handleMessage: (msg) => {
    switch (msg.type) {
      case 'VIDEO_DETECTED': {
        const video = msg.payload as DetectedVideo;
        set(state => ({
          videos: [video, ...state.videos.filter(v => v.id !== video.id)],
          activeVideo: video,
        }));
        break;
      }
      case 'VIDEO_CHANGED': {
        const { previousId, video } = msg.payload as { previousId?: string; video: DetectedVideo };
        set(state => ({
          videos: [
            video,
            ...state.videos.filter(v => v.id !== previousId && v.id !== video.id),
          ],
          activeVideo: video,
        }));
        break;
      }
      case 'VIDEO_REMOVED': {
        const { videoId } = msg.payload as { videoId: string };
        set(state => {
          const newVideos = state.videos.filter(v => v.id !== videoId);
          return {
            videos: newVideos,
            activeVideo: state.activeVideo?.id === videoId
              ? (newVideos[0] || null)
              : state.activeVideo,
          };
        });
        break;
      }
      case 'METADATA_UPDATE': {
        const updated = msg.payload as DetectedVideo;
        set(state => ({
          videos: state.videos.map(v => v.id === updated.id ? updated : v),
          activeVideo: state.activeVideo?.id === updated.id ? updated : state.activeVideo,
        }));
        break;
      }
    }
  },
}));
