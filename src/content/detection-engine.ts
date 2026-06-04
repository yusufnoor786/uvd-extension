/**
 * VideoDetectionEngine — orchestrates all platform-specific detectors.
 * Uses MutationObserver + network interception + DOM scanning.
 */
import type { DetectedVideo, Platform } from '../types';
import { createLogger } from '../utils/logger';
import { generateId, debounce } from '../utils/helpers';
import { YouTubeDetector } from './detectors/youtube-detector';
import { FacebookDetector } from './detectors/facebook-detector';
import { InstagramDetector } from './detectors/instagram-detector';
import { TwitterDetector } from './detectors/twitter-detector';
import { TikTokDetector } from './detectors/tiktok-detector';
import { VimeoDetector } from './detectors/vimeo-detector';
import { HTML5Detector } from './detectors/html5-detector';
import { M3U8Detector } from './detectors/m3u8-detector';
import { GenericDetector } from './detectors/generic-detector';
import { PinterestDetector } from './detectors/pinterest-detector';

const log = createLogger('DetectionEngine');

export interface BaseDetector {
  name: string;
  canHandle(url: string): boolean;
  detect(): Promise<DetectedVideo[]>;
  stop(): void;
}

type DetectedCallback = (video: DetectedVideo) => void;
type ChangedCallback = (video: DetectedVideo, previousId?: string) => void;
type RemovedCallback = (videoId: string) => void;

export class VideoDetectionEngine {
  private platform: Platform;
  private detectors: BaseDetector[] = [];
  private observer: MutationObserver | null = null;
  private networkInterceptor: NetworkInterceptor | null = null;
  private detectedVideos = new Map<string, DetectedVideo>();
  private onDetected: DetectedCallback;
  private onChanged: ChangedCallback;
  private onRemoved: RemovedCallback;
  private scanDebounced: () => void;

  constructor(
    platform: Platform,
    onDetected: DetectedCallback,
    onChanged: ChangedCallback,
    onRemoved: RemovedCallback
  ) {
    this.platform = platform;
    this.onDetected = onDetected;
    this.onChanged = onChanged;
    this.onRemoved = onRemoved;

    this.scanDebounced = debounce(() => this.scan(), 500);

    this.initDetectors();
  }

  private initDetectors(): void {
    const url = window.location.href;

    // Platform-specific detectors first (higher priority)
    const allDetectors: BaseDetector[] = [
      new YouTubeDetector(),
      new FacebookDetector(),
      new InstagramDetector(),
      new TwitterDetector(),
      new TikTokDetector(),
      new VimeoDetector(),
      new PinterestDetector(),
      new M3U8Detector(),
      new HTML5Detector(),
      new GenericDetector(),
    ];

    // Use all that can handle current URL, sorted by specificity
    this.detectors = allDetectors.filter(d => d.canHandle(url));
    if (this.detectors.length === 0) {
      this.detectors = [new HTML5Detector(), new GenericDetector()];
    }

    log.debug('Active detectors', { detectors: this.detectors.map(d => d.name) });
  }

  async start(): Promise<void> {
    log.info('Detection engine starting', { platform: this.platform });

    // Set up network interception
    this.networkInterceptor = new NetworkInterceptor(url => this.onNetworkRequest(url));
    this.networkInterceptor.start();

    // Set up MutationObserver for DOM changes
    this.setupMutationObserver();

    // Initial scan
    await this.scan();
  }

  private setupMutationObserver(): void {
    this.observer = new MutationObserver(this.scanDebounced);
    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'data-src', 'href'],
    });
  }

  private onNetworkRequest(url: string): void {
    if (url.includes('.m3u8') || url.includes('.mpd') || url.includes('videoplayback')) {
      log.debug('Media network request intercepted', { url: url.slice(0, 100) });
      this.scanDebounced();
    }
  }

  async scan(): Promise<void> {
    try {
      const allVideos: DetectedVideo[] = [];

      for (const detector of this.detectors) {
        try {
          const videos = await detector.detect();
          allVideos.push(...videos);
        } catch (err) {
          log.warn(`Detector ${detector.name} failed`, { error: String(err) });
        }
      }

      this.reconcile(allVideos);
    } catch (err) {
      log.error('Scan failed', { error: String(err) });
    }
  }

  private reconcile(freshVideos: DetectedVideo[]): void {
    const freshIds = new Set(freshVideos.map(v => v.id));

    // Detect new/changed
    for (const video of freshVideos) {
      const existing = this.detectedVideos.get(video.id);
      if (!existing) {
        this.detectedVideos.set(video.id, video);
        this.onDetected(video);
      } else if (existing.url !== video.url) {
        const prevId = existing.id;
        this.detectedVideos.set(video.id, video);
        this.onChanged(video, prevId);
      }
    }

    // Detect removed
    for (const [id] of this.detectedVideos.entries()) {
      if (!freshIds.has(id)) {
        this.detectedVideos.delete(id);
        this.onRemoved(id);
      }
    }
  }

  handleNavigation(newUrl: string): void {
    log.info('Navigation handled', { url: newUrl });
    // Reinitialize detectors for new URL
    this.detectors.forEach(d => d.stop());
    this.initDetectors();
    // Clear old videos
    for (const [id] of this.detectedVideos.entries()) {
      this.onRemoved(id);
    }
    this.detectedVideos.clear();
    // Re-scan after a delay (give page time to render)
    setTimeout(() => this.scan(), 1000);
  }

  rescan(): void {
    log.info('Manual rescan triggered');
    this.detectedVideos.clear();
    this.scan();
  }

  stop(): void {
    this.observer?.disconnect();
    this.networkInterceptor?.stop();
    this.detectors.forEach(d => d.stop());
    log.info('Detection engine stopped');
  }
}

// ── Network request interceptor ───────────────────────────────────────────────

class NetworkInterceptor {
  private originalXhrOpen: typeof XMLHttpRequest.prototype.open;
  private originalFetch: typeof window.fetch;
  private callback: (url: string) => void;

  constructor(callback: (url: string) => void) {
    this.callback = callback;
    this.originalXhrOpen = XMLHttpRequest.prototype.open;
    this.originalFetch = window.fetch;
  }

  start(): void {
    const cb = this.callback;

    // XHR interception
    const origOpen = this.originalXhrOpen;
    XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
      cb(String(url));
      return origOpen.apply(this, [method, url, ...rest] as any);
    };

    // Fetch interception
    const origFetch = this.originalFetch;
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      cb(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      return origFetch.apply(window, [input, init]);
    };
  }

  stop(): void {
    XMLHttpRequest.prototype.open = this.originalXhrOpen;
    window.fetch = this.originalFetch;
  }
}
