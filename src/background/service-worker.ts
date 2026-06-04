import type {
  ExtensionMessage,
  DetectedVideo,
  DownloadJob,
  AppSettings,
  BackendStatus,
  MessageType,
  DownloadMethod,
  VideoStream,
  AudioStream,
} from '../types';
import { createLogger } from '../utils/logger';
import { getSettings, saveSettings, saveDownload, getDownloads, deleteDownload } from '../utils/storage';
import { generateId, sanitizeFilename, buildFilename } from '../utils/helpers';
import { BackendService } from './backend-service';
import { DownloadManager } from './download-manager';

const log = createLogger('ServiceWorker');

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  videos: new Map<string, DetectedVideo>(),        // videoId → DetectedVideo
  activeVideoByTab: new Map<number, string>(),      // tabId → videoId
  settings: null as AppSettings | null,
  backendStatus: { connected: false, url: '', lastChecked: 0 } as BackendStatus,
};

const backend = new BackendService();
const downloader = new DownloadManager();

// ── Initialisation ────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  log.info('Extension installed', { reason });
  state.settings = await getSettings();
  await checkBackendStatus();
  createContextMenus();
});

chrome.runtime.onStartup.addListener(async () => {
  log.info('Browser started');
  state.settings = await getSettings();
  await checkBackendStatus();
});

// ── Message handling ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    log.error('Message handler error', { type: message.type, error: String(err) });
    sendResponse({ success: false, error: String(err) });
  });
  return true; // keep channel open for async response
});

async function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  const tabId = sender.tab?.id ?? message.tabId;

  switch (message.type as MessageType) {
    // ── Video lifecycle ──────────────────────────────────────────────────────

    case 'VIDEO_DETECTED': {
      const video = message.payload as DetectedVideo;
      video.tabId = tabId!;
      state.videos.set(video.id, video);
      state.activeVideoByTab.set(tabId!, video.id);
      log.info('Video detected', { id: video.id, platform: video.platform, url: video.url });
      broadcastToPopup({ type: 'VIDEO_DETECTED', payload: video, timestamp: Date.now() });
      return { success: true };
    }

    case 'VIDEO_CHANGED': {
      const { previousId, video } = message.payload as { previousId?: string; video: DetectedVideo };
      video.tabId = tabId!;
      if (previousId) state.videos.delete(previousId);
      state.videos.set(video.id, video);
      state.activeVideoByTab.set(tabId!, video.id);
      log.info('Video changed', { from: previousId, to: video.id, platform: video.platform });
      broadcastToPopup({ type: 'VIDEO_CHANGED', payload: { previousId, video }, timestamp: Date.now() });
      return { success: true };
    }

    case 'VIDEO_REMOVED': {
      const { videoId } = message.payload as { videoId: string };
      state.videos.delete(videoId);
      if (state.activeVideoByTab.get(tabId!) === videoId) {
        state.activeVideoByTab.delete(tabId!);
      }
      log.info('Video removed', { id: videoId });
      broadcastToPopup({ type: 'VIDEO_REMOVED', payload: { videoId }, timestamp: Date.now() });
      return { success: true };
    }

    case 'GET_VIDEOS': {
      const tabVideos = [...state.videos.values()].filter(v => v.tabId === tabId);
      return { success: true, videos: tabVideos };
    }

    case 'GET_ACTIVE_VIDEO': {
      const activeId = state.activeVideoByTab.get(tabId!);
      const active = activeId ? state.videos.get(activeId) : null;
      return { success: true, video: active ?? null };
    }

    case 'CLEAR_VIDEOS': {
      for (const [id, video] of state.videos.entries()) {
        if (video.tabId === tabId) state.videos.delete(id);
      }
      state.activeVideoByTab.delete(tabId!);
      return { success: true };
    }

    // ── Analysis ─────────────────────────────────────────────────────────────

    case 'ANALYZE_VIDEO': {
      const { videoId, url, platform, pageUrl } = message.payload as {
        videoId: string; url: string; platform: string; pageUrl: string;
      };
      log.info('Analyzing video', { videoId, platform });
      try {
        const settings = await getSettings();
        if (settings.advanced.backendEnabled) {
          const result = await backend.analyzeVideo({ url, platform: platform as any, pageUrl });
          if (result.success && result.metadata) {
            const video = state.videos.get(videoId);
            if (video) {
              video.metadata = result.metadata;
              state.videos.set(videoId, video);
              broadcastToPopup({ type: 'METADATA_UPDATE', payload: video, timestamp: Date.now() });
            }
            return { success: true, metadata: result.metadata };
          }
          return { success: false, error: result.error };
        }
        return { success: false, error: 'Backend disabled. Enable backend in settings for full analysis.' };
      } catch (err) {
        log.error('Analysis failed', { error: String(err) });
        return { success: false, error: String(err) };
      }
    }

    // ── Downloads ─────────────────────────────────────────────────────────────

    case 'START_DOWNLOAD': {
      const { videoId, streamIndex, method, audioStreamIndex } = message.payload as {
        videoId: string; streamIndex: number; method: DownloadMethod; audioStreamIndex?: number;
      };
      const video = state.videos.get(videoId);
      if (!video?.metadata) return { success: false, error: 'Video metadata not found' };

      const stream = video.metadata.videoStreams[streamIndex];
      if (!stream) return { success: false, error: 'Stream not found' };

      const audioStream = audioStreamIndex !== undefined
        ? video.metadata.audioStreams[audioStreamIndex]
        : undefined;

      const settings = await getSettings();
      const filename = buildFilename(
        settings.download.namingTemplate,
        { title: video.metadata.title, platform: video.platform, quality: stream.quality },
        stream.format
      );

      const job: DownloadJob = {
        id: generateId(),
        videoId,
        title: video.metadata.title,
        platform: video.platform,
        pageUrl: video.metadata.pageUrl,
        stream,
        audioStream,
        method,
        status: 'queued',
        progress: 0,
        fileSize: stream.fileSize,
        filename,
        createdAt: Date.now(),
      };

      log.info('Starting download', { jobId: job.id, method, quality: stream.quality });
      await saveDownload(job);
      downloader.enqueue(job, backend, (updated) => {
        saveDownload(updated);
        broadcastToPopup({ type: 'DOWNLOAD_PROGRESS', payload: updated, timestamp: Date.now() });
      });
      return { success: true, jobId: job.id };
    }

    case 'CANCEL_DOWNLOAD': {
      const { jobId } = message.payload as { jobId: string };
      downloader.cancel(jobId);
      return { success: true };
    }

    case 'PAUSE_DOWNLOAD': {
      const { jobId } = message.payload as { jobId: string };
      downloader.pause(jobId);
      return { success: true };
    }

    case 'RESUME_DOWNLOAD': {
      const { jobId } = message.payload as { jobId: string };
      downloader.resume(jobId);
      return { success: true };
    }

    case 'GET_DOWNLOADS': {
      const jobs = await getDownloads();
      return { success: true, jobs };
    }

    // ── Settings ──────────────────────────────────────────────────────────────

    case 'GET_SETTINGS': {
      const settings = await getSettings();
      return { success: true, settings };
    }

    case 'SET_SETTINGS': {
      const settings = message.payload as AppSettings;
      await saveSettings(settings);
      state.settings = settings;
      backend.setBaseUrl(settings.advanced.backendUrl);
      backend.setApiKey(settings.advanced.backendApiKey);
      return { success: true };
    }

    // ── Backend status ────────────────────────────────────────────────────────

    case 'BACKEND_STATUS': {
      await checkBackendStatus();
      return { success: true, status: state.backendStatus };
    }

    // ── Debug/Dev ─────────────────────────────────────────────────────────────

    case 'RESCAN_PAGE': {
      if (tabId) {
        await chrome.tabs.sendMessage(tabId, { type: 'RESCAN_PAGE', payload: {}, timestamp: Date.now() });
      }
      return { success: true };
    }

    case 'LOG_ENTRY': {
      // Content scripts forward logs to background for persistence
      return { success: true };
    }

    default:
      return { success: false, error: `Unknown message type: ${message.type}` };
  }
}

// ── Tab lifecycle ─────────────────────────────────────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [id, video] of state.videos.entries()) {
    if (video.tabId === tabId) state.videos.delete(id);
  }
  state.activeVideoByTab.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    // Tab navigated — clear old videos for this tab
    for (const [id, video] of state.videos.entries()) {
      if (video.tabId === tabId) state.videos.delete(id);
    }
    state.activeVideoByTab.delete(tabId);
  }
});

// ── Context menus ─────────────────────────────────────────────────────────────

function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'uvd-download-video',
      title: 'Download Video (Ultimate Downloader)',
      contexts: ['video', 'link'],
    });
    chrome.contextMenus.create({
      id: 'uvd-scan-page',
      title: 'Scan Page for Videos',
      contexts: ['page'],
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === 'uvd-scan-page') {
    await chrome.tabs.sendMessage(tab.id, { type: 'RESCAN_PAGE', payload: {}, timestamp: Date.now() });
  }
});

// ── Backend health check ──────────────────────────────────────────────────────

async function checkBackendStatus(): Promise<void> {
  const settings = await getSettings();
  if (!settings.advanced.backendEnabled) {
    state.backendStatus = { connected: false, url: settings.advanced.backendUrl, lastChecked: Date.now() };
    return;
  }
  backend.setBaseUrl(settings.advanced.backendUrl);
  backend.setApiKey(settings.advanced.backendApiKey);
  const status = await backend.checkHealth();
  state.backendStatus = status;
  log.info('Backend health check', { connected: status.connected, latency: status.latency });
}

// Run health check every 30 seconds
setInterval(checkBackendStatus, 30_000);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function broadcastToPopup(message: ExtensionMessage): Promise<void> {
  try {
    // In MV3 service workers, broadcast via runtime.sendMessage to all extension pages
    chrome.runtime.sendMessage(message).catch(() => { /* popup may not be open */ });
  } catch { /* ignore */ }
}

log.info('Background service worker started');
