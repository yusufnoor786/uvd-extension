// ============================================================
// CORE TYPES — Ultimate Video Downloader Extension
// ============================================================

export type Platform =
  | 'youtube'
  | 'facebook'
  | 'instagram'
  | 'twitter'
  | 'tiktok'
  | 'vimeo'
  | 'dailymotion'
  | 'twitch'
  | 'pinterest'
  | 'reddit'
  | 'html5'
  | 'generic';

export type VideoFormat = 'mp4' | 'webm' | 'mkv' | 'ts' | 'm3u8' | 'mpd' | 'flv' | 'avi' | 'mov';
export type AudioFormat = 'mp3' | 'm4a' | 'aac' | 'opus' | 'webm';
export type Quality = '144p' | '240p' | '360p' | '480p' | '720p' | '1080p' | '1440p' | '2160p' | 'best' | 'audio';

export interface VideoStream {
  url: string;
  quality: Quality;
  format: VideoFormat;
  codec?: string;
  fps?: number;
  bitrate?: number;
  fileSize?: number;
  width?: number;
  height?: number;
  isDash?: boolean;
  isHLS?: boolean;
  requiresMerge?: boolean;
  audioStreamUrl?: string;
  mimeType?: string;
  itag?: number;
  label?: string;
}

export interface AudioStream {
  url: string;
  format: AudioFormat;
  bitrate?: number;
  fileSize?: number;
  codec?: string;
  sampleRate?: number;
  channels?: number;
  mimeType?: string;
  label?: string;
}

export interface VideoMetadata {
  id: string;
  title: string;
  description?: string;
  thumbnail?: string;
  author?: string;
  authorUrl?: string;
  platform: Platform;
  pageUrl: string;
  duration?: number;
  uploadDate?: string;
  viewCount?: number;
  likeCount?: number;
  videoStreams: VideoStream[];
  audioStreams: AudioStream[];
  hasDRM: boolean;
  drmType?: string;
  isLive?: boolean;
  embedUrl?: string;
  extractedAt: number;
  tabId?: number;
}

export interface DetectedVideo {
  id: string;
  url: string;
  platform: Platform;
  pageUrl: string;
  tabId: number;
  metadata?: VideoMetadata;
  detectedAt: number;
  isActive: boolean;
}

export type DownloadStatus =
  | 'queued'
  | 'analyzing'
  | 'extracting'
  | 'downloading'
  | 'processing'
  | 'merging'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused';

export type DownloadMethod = 'browser' | 'backend' | 'idm' | 'jdownloader' | 'fdm' | 'xdm' | 'motrix' | 'aria2';

export interface DownloadJob {
  id: string;
  videoId: string;
  title: string;
  platform: Platform;
  pageUrl: string;
  stream: VideoStream;
  audioStream?: AudioStream;
  method: DownloadMethod;
  status: DownloadStatus;
  progress: number;
  speed?: number;
  eta?: number;
  fileSize?: number;
  downloadedBytes?: number;
  outputPath?: string;
  filename?: string;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  chromeDownloadId?: number;
}

export interface QueueStats {
  total: number;
  queued: number;
  downloading: number;
  completed: number;
  failed: number;
  paused: number;
}

// ============================================================
// MESSAGES — Extension ↔ Content ↔ Background
// ============================================================

export type MessageType =
  | 'VIDEO_DETECTED'
  | 'VIDEO_CHANGED'
  | 'VIDEO_REMOVED'
  | 'GET_VIDEOS'
  | 'GET_ACTIVE_VIDEO'
  | 'ANALYZE_VIDEO'
  | 'START_DOWNLOAD'
  | 'CANCEL_DOWNLOAD'
  | 'PAUSE_DOWNLOAD'
  | 'RESUME_DOWNLOAD'
  | 'GET_DOWNLOADS'
  | 'GET_SETTINGS'
  | 'SET_SETTINGS'
  | 'BACKEND_STATUS'
  | 'LOG_ENTRY'
  | 'RESCAN_PAGE'
  | 'OPEN_DEBUG'
  | 'DOWNLOAD_PROGRESS'
  | 'METADATA_UPDATE'
  | 'CLEAR_VIDEOS';

export interface ExtensionMessage<T = unknown> {
  type: MessageType;
  payload?: T;
  tabId?: number;
  timestamp: number;
}

export interface VideoDetectedPayload {
  video: DetectedVideo;
}

export interface VideoChangedPayload {
  previousId?: string;
  video: DetectedVideo;
}

export interface AnalyzeVideoPayload {
  videoId: string;
  url: string;
  platform: Platform;
  pageUrl: string;
}

export interface StartDownloadPayload {
  videoId: string;
  streamIndex: number;
  method: DownloadMethod;
  audioStreamIndex?: number;
}

// ============================================================
// SETTINGS
// ============================================================

export interface DownloadSettings {
  defaultQuality: Quality;
  preferredFormat: VideoFormat;
  downloadLocation: string;
  namingTemplate: string;
  autoDownload: boolean;
  concurrentDownloads: number;
  defaultMethod: DownloadMethod;
}

export interface DetectionSettings {
  autoScan: boolean;
  deepScan: boolean;
  backgroundScan: boolean;
  embeddedVideoScan: boolean;
  scanInterval: number;
}

export interface UISettings {
  theme: 'light' | 'dark' | 'system';
  compactMode: boolean;
  showThumbnails: boolean;
  animations: boolean;
  popupWidth: number;
  popupHeight: number;
}

export interface AdvancedSettings {
  developerMode: boolean;
  debugLogs: boolean;
  experimentalFeatures: boolean;
  backendUrl: string;
  backendApiKey: string;
  backendEnabled: boolean;
  maxLogEntries: number;
}

export interface AppSettings {
  download: DownloadSettings;
  detection: DetectionSettings;
  ui: UISettings;
  advanced: AdvancedSettings;
  version: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  download: {
    defaultQuality: 'best',
    preferredFormat: 'mp4',
    downloadLocation: '',
    namingTemplate: '{title}',
    autoDownload: false,
    concurrentDownloads: 3,
    defaultMethod: 'browser',
  },
  detection: {
    autoScan: true,
    deepScan: true,
    backgroundScan: true,
    embeddedVideoScan: true,
    scanInterval: 2000,
  },
  ui: {
    theme: 'system',
    compactMode: false,
    showThumbnails: true,
    animations: true,
    popupWidth: 420,
    popupHeight: 600,
  },
  advanced: {
    developerMode: false,
    debugLogs: false,
    experimentalFeatures: false,
    backendUrl: 'http://localhost:3001',
    backendApiKey: '',
    backendEnabled: false,
    maxLogEntries: 1000,
  },
  version: '1.0.0',
};

// ============================================================
// LOGGING
// ============================================================

export type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'trace';

export interface LogEntry {
  id: string;
  level: LogLevel;
  module: string;
  message: string;
  context?: Record<string, unknown>;
  timestamp: number;
}

// ============================================================
// BACKEND API TYPES
// ============================================================

export interface BackendStatus {
  connected: boolean;
  version?: string;
  url: string;
  latency?: number;
  lastChecked: number;
}

export interface BackendAnalyzeRequest {
  url: string;
  platform: Platform;
  pageUrl: string;
  cookies?: string;
  userAgent?: string;
}

export interface BackendAnalyzeResponse {
  success: boolean;
  metadata?: VideoMetadata;
  error?: string;
  jobId?: string;
}

export interface BackendDownloadRequest {
  videoId: string;
  streamUrl: string;
  audioUrl?: string;
  title: string;
  format: VideoFormat;
  quality: Quality;
}

export interface BackendDownloadResponse {
  success: boolean;
  jobId?: string;
  downloadUrl?: string;
  error?: string;
}

export interface BackendQueueStatus {
  jobId: string;
  status: DownloadStatus;
  progress: number;
  speed?: number;
  eta?: number;
  error?: string;
}
