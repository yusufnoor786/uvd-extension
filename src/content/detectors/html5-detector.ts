import type { DetectedVideo, VideoStream } from '../../types';
import type { BaseDetector } from '../detection-engine';
import { createLogger } from '../../utils/logger';
import { generateId, detectPlatform } from '../../utils/helpers';

const log = createLogger('HTML5Detector');

export class HTML5Detector implements BaseDetector {
  name = 'HTML5Detector';

  canHandle(_url: string): boolean {
    return true; // runs everywhere as fallback
  }

  async detect(): Promise<DetectedVideo[]> {
    const results: DetectedVideo[] = [];
    try {
      const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video'));
      for (const video of videos) {
        const v = this.processVideoElement(video);
        if (v) results.push(v);
      }

      // Also scan shadow roots
      this.scanShadowRoots(document.body, results);
    } catch (err) {
      log.error('HTML5 detection failed', { error: String(err) });
    }
    return results;
  }

  private processVideoElement(video: HTMLVideoElement): DetectedVideo | null {
    const streams: VideoStream[] = [];

    // Direct src
    if (video.src && !video.src.startsWith('blob:')) {
      streams.push(this.buildStream(video.src));
    }

    // <source> children
    const sources = Array.from(video.querySelectorAll<HTMLSourceElement>('source'));
    for (const source of sources) {
      const url = source.src || source.getAttribute('data-src') || '';
      if (url && !url.startsWith('blob:') && !streams.some(s => s.url === url)) {
        streams.push(this.buildStream(url, source.type));
      }
    }

    // data-src fallback
    const dataSrc = video.getAttribute('data-src') || video.getAttribute('data-video-src');
    if (dataSrc && !dataSrc.startsWith('blob:') && !streams.some(s => s.url === dataSrc)) {
      streams.push(this.buildStream(dataSrc));
    }

    if (streams.length === 0) return null;

    const title =
      video.getAttribute('title') ||
      video.closest('[data-title]')?.getAttribute('data-title') ||
      document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content ||
      document.title;

    const thumbnail =
      video.poster ||
      document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content || '';

    const id = video.id || generateId();

    return {
      id: `h5-${id}`,
      url: streams[0].url,
      platform: detectPlatform(window.location.href),
      pageUrl: window.location.href,
      tabId: 0,
      detectedAt: Date.now(),
      isActive: true,
      metadata: {
        id,
        title,
        platform: detectPlatform(window.location.href),
        pageUrl: window.location.href,
        thumbnail,
        duration: isNaN(video.duration) ? undefined : video.duration,
        videoStreams: streams,
        audioStreams: [],
        hasDRM: this.detectDRM(video),
        extractedAt: Date.now(),
      },
    };
  }

  private buildStream(url: string, mimeType?: string): VideoStream {
    const isM3U8 = url.includes('.m3u8') || (mimeType || '').includes('mpegurl');
    const isMPD = url.includes('.mpd') || (mimeType || '').includes('dash+xml');

    return {
      url,
      quality: 'best',
      format: isM3U8 ? 'm3u8' : isMPD ? 'mpd' : 'mp4',
      isHLS: isM3U8,
      isDash: isMPD,
      mimeType,
      requiresMerge: false,
    };
  }

  private detectDRM(video: HTMLVideoElement): boolean {
    // Check for encrypted media event or EME usage
    try {
      const hasEME = typeof (window as any).MediaKeys !== 'undefined';
      const hasDRMAttribute = video.hasAttribute('x-webkit-airplay') ||
        video.className.includes('drm') ||
        video.getAttribute('data-drm') !== null;
      return hasDRMAttribute; // hasEME alone isn't enough, could be unused
    } catch { return false; }
  }

  private scanShadowRoots(root: Element, results: DetectedVideo[]): void {
    // Scan all elements for shadow roots
    const all = root.querySelectorAll('*');
    for (const el of all) {
      if (el.shadowRoot) {
        const shadowVideos = el.shadowRoot.querySelectorAll<HTMLVideoElement>('video');
        for (const video of shadowVideos) {
          const v = this.processVideoElement(video);
          if (v) results.push(v);
        }
        this.scanShadowRoots(el.shadowRoot as unknown as Element, results);
      }
    }
  }

  stop(): void { }
}
