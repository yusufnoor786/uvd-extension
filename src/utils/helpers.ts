import type { Platform, VideoFormat, Quality } from '../types';

/**
 * Sanitise a video title for use as a filename.
 */
export function sanitizeFilename(title: string): string {
  return title
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200) || 'video';
}

/**
 * Format bytes → human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format seconds → MM:SS or HH:MM:SS.
 */
export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Format bit/s → human-readable bitrate.
 */
export function formatBitrate(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} kbps`;
  return `${bps} bps`;
}

/**
 * Format download speed.
 */
export function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

/**
 * Format ETA in seconds to human-readable string.
 */
export function formatEta(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return '—';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

/**
 * Detect platform from URL.
 */
export function detectPlatform(url: string): Platform {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host.includes('youtube.com') || host === 'youtu.be') return 'youtube';
    if (host.includes('facebook.com') || host.includes('fb.com') || host.includes('fb.watch')) return 'facebook';
    if (host.includes('instagram.com')) return 'instagram';
    if (host.includes('twitter.com') || host.includes('x.com') || host.includes('t.co')) return 'twitter';
    if (host.includes('tiktok.com')) return 'tiktok';
    if (host.includes('vimeo.com')) return 'vimeo';
    if (host.includes('dailymotion.com')) return 'dailymotion';
    if (host.includes('twitch.tv')) return 'twitch';
    if (host.includes('pinterest.com') || host.includes('pin.it')) return 'pinterest';
    if (host.includes('reddit.com') || host.includes('redd.it')) return 'reddit';
  } catch { /* ignore */ }
  return 'generic';
}

/**
 * Build filename from template.
 */
export function buildFilename(template: string, meta: Record<string, string>, ext: string): string {
  let name = template;
  for (const [key, value] of Object.entries(meta)) {
    name = name.replace(new RegExp(`\\{${key}\\}`, 'g'), sanitizeFilename(value));
  }
  return `${name}.${ext}`;
}

/**
 * Extract video ID from YouTube URL.
 */
export function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('?')[0];
    return u.searchParams.get('v');
  } catch { return null; }
}

/**
 * Debounce a function.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle a function.
 */
export function throttle<T extends (...args: unknown[]) => unknown>(fn: T, limit: number): (...args: Parameters<T>) => void {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      fn(...args);
    }
  };
}

/**
 * Generate a random ID.
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Check if a URL is a valid media URL.
 */
export function isMediaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    return (
      path.endsWith('.mp4') ||
      path.endsWith('.webm') ||
      path.endsWith('.m3u8') ||
      path.endsWith('.mpd') ||
      path.endsWith('.ts') ||
      path.endsWith('.mkv') ||
      path.endsWith('.flv') ||
      url.includes('video') ||
      url.includes('stream') ||
      url.includes('media')
    );
  } catch { return false; }
}

/**
 * Parse resolution string like "1920x1080" → { width, height }.
 */
export function parseResolution(res: string): { width: number; height: number } | null {
  const match = res.match(/(\d+)x(\d+)/i);
  if (!match) return null;
  return { width: parseInt(match[1]), height: parseInt(match[2]) };
}

/**
 * Get Quality label from height.
 */
export function heightToQuality(height: number): Quality {
  if (height >= 2160) return '2160p';
  if (height >= 1440) return '1440p';
  if (height >= 1080) return '1080p';
  if (height >= 720) return '720p';
  if (height >= 480) return '480p';
  if (height >= 360) return '360p';
  if (height >= 240) return '240p';
  return '144p';
}

/**
 * Check if content is DRM-protected based on common indicators.
 */
export function isDRMContent(url: string, mimeType?: string): boolean {
  const drmIndicators = ['widevine', 'playready', 'fairplay', 'eme', 'drm', 'encrypted', 'protected'];
  const combined = (url + (mimeType || '')).toLowerCase();
  return drmIndicators.some(d => combined.includes(d));
}

/**
 * Platform display names.
 */
export const PLATFORM_NAMES: Record<Platform, string> = {
  youtube: 'YouTube',
  facebook: 'Facebook',
  instagram: 'Instagram',
  twitter: 'Twitter / X',
  tiktok: 'TikTok',
  vimeo: 'Vimeo',
  dailymotion: 'Dailymotion',
  twitch: 'Twitch',
  pinterest: 'Pinterest',
  reddit: 'Reddit',
  html5: 'HTML5 Video',
  generic: 'Web Video',
};

/**
 * Platform brand colors (Material Design compatible).
 */
export const PLATFORM_COLORS: Record<Platform, string> = {
  youtube: '#FF0000',
  facebook: '#1877F2',
  instagram: '#E1306C',
  twitter: '#1DA1F2',
  tiktok: '#010101',
  vimeo: '#1AB7EA',
  dailymotion: '#00AAFF',
  twitch: '#9146FF',
  pinterest: '#E60023',
  reddit: '#FF4500',
  html5: '#E44D26',
  generic: '#6750A4',
};

/**
 * Sleep helper.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry an async function with exponential backoff.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelay = 500
): Promise<T> {
  let lastError: Error = new Error('Unknown error');
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (i < maxAttempts - 1) await sleep(baseDelay * Math.pow(2, i));
    }
  }
  throw lastError;
}

/**
 * Clamp a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Format a video quality label with format.
 */
export function formatQualityLabel(quality: Quality, format?: VideoFormat): string {
  if (quality === 'best') return `Best Quality${format ? ` (${format.toUpperCase()})` : ''}`;
  if (quality === 'audio') return `Audio Only${format ? ` (${format.toUpperCase()})` : ''}`;
  return `${quality}${format ? ` · ${format.toUpperCase()}` : ''}`;
}
