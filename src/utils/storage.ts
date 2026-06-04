import type { AppSettings, DownloadJob, DetectedVideo, LogEntry } from '../types';
import { DEFAULT_SETTINGS } from '../types';

const KEYS = {
  SETTINGS: 'uvd_settings',
  DOWNLOADS: 'uvd_downloads',
  VIDEOS: 'uvd_videos',
  LOGS: 'uvd_logs',
  CACHE: 'uvd_cache',
} as const;

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<AppSettings> {
  const data = await chrome.storage.sync.get(KEYS.SETTINGS);
  const stored = data[KEYS.SETTINGS] as Partial<AppSettings> | undefined;
  if (!stored) return DEFAULT_SETTINGS;
  // Deep merge to handle partial saves / new fields
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    download: { ...DEFAULT_SETTINGS.download, ...stored.download },
    detection: { ...DEFAULT_SETTINGS.detection, ...stored.detection },
    ui: { ...DEFAULT_SETTINGS.ui, ...stored.ui },
    advanced: { ...DEFAULT_SETTINGS.advanced, ...stored.advanced },
  };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await chrome.storage.sync.set({ [KEYS.SETTINGS]: settings });
}

export async function updateSettings(partial: DeepPartial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const updated: AppSettings = {
    ...current,
    download: { ...current.download, ...(partial.download ?? {}) },
    detection: { ...current.detection, ...(partial.detection ?? {}) },
    ui: { ...current.ui, ...(partial.ui ?? {}) },
    advanced: { ...current.advanced, ...(partial.advanced ?? {}) },
  };
  await saveSettings(updated);
  return updated;
}

export async function resetSettings(): Promise<AppSettings> {
  await saveSettings(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

// ── Downloads ─────────────────────────────────────────────────────────────────

export async function getDownloads(): Promise<DownloadJob[]> {
  const data = await chrome.storage.local.get(KEYS.DOWNLOADS);
  return (data[KEYS.DOWNLOADS] as DownloadJob[]) || [];
}

export async function saveDownload(job: DownloadJob): Promise<void> {
  const jobs = await getDownloads();
  const idx = jobs.findIndex(j => j.id === job.id);
  if (idx >= 0) jobs[idx] = job;
  else jobs.unshift(job);
  // Keep last 500
  const trimmed = jobs.slice(0, 500);
  await chrome.storage.local.set({ [KEYS.DOWNLOADS]: trimmed });
}

export async function deleteDownload(id: string): Promise<void> {
  const jobs = await getDownloads();
  await chrome.storage.local.set({ [KEYS.DOWNLOADS]: jobs.filter(j => j.id !== id) });
}

export async function clearCompletedDownloads(): Promise<void> {
  const jobs = await getDownloads();
  await chrome.storage.local.set({
    [KEYS.DOWNLOADS]: jobs.filter(j => j.status !== 'completed' && j.status !== 'failed'),
  });
}

// ── Detected videos cache ─────────────────────────────────────────────────────

export async function getCachedVideos(): Promise<DetectedVideo[]> {
  const data = await chrome.storage.local.get(KEYS.VIDEOS);
  return (data[KEYS.VIDEOS] as DetectedVideo[]) || [];
}

export async function setCachedVideos(videos: DetectedVideo[]): Promise<void> {
  await chrome.storage.local.set({ [KEYS.VIDEOS]: videos });
}

export async function clearCachedVideos(): Promise<void> {
  await chrome.storage.local.remove(KEYS.VIDEOS);
}

// ── Generic cache (metadata, thumbnails) ─────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export async function getCached<T>(key: string): Promise<T | null> {
  const storageKey = `${KEYS.CACHE}_${key}`;
  const data = await chrome.storage.local.get(storageKey);
  const entry = data[storageKey] as CacheEntry<T> | undefined;
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.data;
}

export async function setCache<T>(key: string, data: T, ttlMs: number = 5 * 60 * 1000): Promise<void> {
  const storageKey = `${KEYS.CACHE}_${key}`;
  const entry: CacheEntry<T> = { data, expiresAt: Date.now() + ttlMs };
  await chrome.storage.local.set({ [storageKey]: entry });
}

export async function clearCache(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const cacheKeys = Object.keys(all).filter(k => k.startsWith(KEYS.CACHE));
  if (cacheKeys.length > 0) await chrome.storage.local.remove(cacheKeys);
}

// ── Utility type ──────────────────────────────────────────────────────────────

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
