/**
 * Content Main — injected into every page.
 * Orchestrates all detectors and reports to the background service worker.
 */
import { createLogger } from '../utils/logger';
import { detectPlatform, generateId, debounce } from '../utils/helpers';
import type { DetectedVideo, Platform, ExtensionMessage } from '../types';
import { VideoDetectionEngine } from './detection-engine';

const log = createLogger('ContentMain');

// ── Bootstrap ─────────────────────────────────────────────────────────────────

let engine: VideoDetectionEngine | null = null;
let currentVideoId: string | null = null;
let isInitialized = false;

async function init() {
  if (isInitialized) return;
  isInitialized = true;

  const platform = detectPlatform(window.location.href);
  log.info('Content script initialised', { url: window.location.href, platform });

  engine = new VideoDetectionEngine(platform, onVideoDetected, onVideoChanged, onVideoRemoved);
  await engine.start();

  // Listen for messages from background / popup
  chrome.runtime.onMessage.addListener(handleMessage);
}

// ── Callbacks ─────────────────────────────────────────────────────────────────

function onVideoDetected(video: DetectedVideo): void {
  currentVideoId = video.id;
  log.info('Video detected', { id: video.id, platform: video.platform });
  sendToBackground({ type: 'VIDEO_DETECTED', payload: video, timestamp: Date.now() });
}

function onVideoChanged(video: DetectedVideo, previousId?: string): void {
  const prev = currentVideoId;
  currentVideoId = video.id;
  log.info('Video changed', { from: prev, to: video.id });
  sendToBackground({ type: 'VIDEO_CHANGED', payload: { previousId: prev ?? previousId, video }, timestamp: Date.now() });
}

function onVideoRemoved(videoId: string): void {
  if (currentVideoId === videoId) currentVideoId = null;
  log.info('Video removed', { id: videoId });
  sendToBackground({ type: 'VIDEO_REMOVED', payload: { videoId }, timestamp: Date.now() });
}

// ── Message handler ───────────────────────────────────────────────────────────

function handleMessage(
  message: ExtensionMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (r: unknown) => void
): boolean {
  if (message.type === 'RESCAN_PAGE') {
    engine?.rescan();
    sendResponse({ success: true });
    return true;
  }
  return false;
}

// ── Navigation detection (SPA support) ───────────────────────────────────────

let lastUrl = window.location.href;

const handleNavigation = debounce(() => {
  const newUrl = window.location.href;
  if (newUrl !== lastUrl) {
    log.debug('Navigation detected', { from: lastUrl, to: newUrl });
    lastUrl = newUrl;
    engine?.handleNavigation(newUrl);
  }
}, 300);

// History API interception
const originalPushState = history.pushState.bind(history);
const originalReplaceState = history.replaceState.bind(history);

history.pushState = function (...args) {
  originalPushState(...args);
  handleNavigation();
};

history.replaceState = function (...args) {
  originalReplaceState(...args);
  handleNavigation();
};

window.addEventListener('popstate', handleNavigation);
window.addEventListener('hashchange', handleNavigation);

// Navigation API (Chrome 102+)
if ('navigation' in window) {
  (window as any).navigation.addEventListener('navigate', handleNavigation);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sendToBackground(message: ExtensionMessage): void {
  try {
    chrome.runtime.sendMessage(message);
  } catch (err) {
    log.warn('Could not send message to background', { error: String(err) });
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
