import type { DetectedVideo, VideoStream } from '../../types';
import type { BaseDetector } from '../detection-engine';
import { createLogger } from '../../utils/logger';
import { generateId, detectPlatform } from '../../utils/helpers';

const log = createLogger('M3U8Detector');

export class M3U8Detector implements BaseDetector {
  name = 'M3U8Detector';
  private capturedUrls = new Set<string>();

  canHandle(_url: string): boolean {
    return true;
  }

  async detect(): Promise<DetectedVideo[]> {
    const results: DetectedVideo[] = [];

    try {
      // Scan all scripts for embedded M3U8 / MPD URLs
      const scriptUrls = this.scanScriptsForMediaUrls();

      for (const url of scriptUrls) {
        if (!this.capturedUrls.has(url)) {
          this.capturedUrls.add(url);
          const v = this.buildFromUrl(url);
          if (v) results.push(v);
        }
      }

      // Check any network-captured URLs (set by content-main via XHR/fetch interception)
      const networkCaptured = (window as any).__uvd_captured_urls as Set<string> | undefined;
      if (networkCaptured) {
        for (const url of networkCaptured) {
          if (!this.capturedUrls.has(url)) {
            this.capturedUrls.add(url);
            const v = this.buildFromUrl(url);
            if (v) results.push(v);
          }
        }
      }
    } catch (err) {
      log.error('M3U8 detection failed', { error: String(err) });
    }

    return results;
  }

  private scanScriptsForMediaUrls(): string[] {
    const urls: string[] = [];
    const patterns = [
      /['"]((https?:\/\/[^'"]+\.m3u8[^'"]*))['"]/, // HLS
      /['"]((https?:\/\/[^'"]+\.mpd[^'"]*))['"]/, // DASH
      /['"]((https?:\/\/[^'"]+video[^'"]+\.mp4[^'"]*))['"]/, // Direct MP4
      /src:\s*['"]((https?:\/\/[^'"]+\.(?:m3u8|mpd|mp4)[^'"]*))['"]/, // src: property
      /url:\s*['"]((https?:\/\/[^'"]+\.(?:m3u8|mpd)[^'"]*))['"]/, // url: property
    ];

    const scripts = Array.from(document.querySelectorAll('script:not([src])'));
    for (const script of scripts) {
      const text = script.textContent || '';
      if (!text.includes('m3u8') && !text.includes('.mpd') && !text.includes('videoplayback')) continue;
      for (const pattern of patterns) {
        const matches = text.matchAll(new RegExp(pattern.source, 'g'));
        for (const match of matches) {
          const url = match[1]?.replace(/\\u0026/g, '&').replace(/\\\//g, '/');
          if (url && !urls.includes(url)) urls.push(url);
        }
      }
    }

    // Also check link elements for manifest files
    document.querySelectorAll('link[rel="prefetch"], link[rel="preload"]').forEach(link => {
      const href = link.getAttribute('href') || '';
      if (href.includes('.m3u8') || href.includes('.mpd')) urls.push(href);
    });

    return urls;
  }

  private buildFromUrl(url: string): DetectedVideo | null {
    const isM3U8 = url.includes('.m3u8');
    const isMPD = url.includes('.mpd');
    if (!isM3U8 && !isMPD && !url.includes('videoplayback') && !url.includes('/video/')) {
      return null;
    }

    const platform = detectPlatform(window.location.href);
    const id = generateId();

    return {
      id: `m3u8-${id}`,
      url,
      platform,
      pageUrl: window.location.href,
      tabId: 0,
      detectedAt: Date.now(),
      isActive: true,
      metadata: {
        id,
        title: document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content || document.title,
        platform,
        pageUrl: window.location.href,
        thumbnail: document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content || '',
        videoStreams: [{
          url,
          quality: 'best',
          format: isM3U8 ? 'm3u8' : isMPD ? 'mpd' : 'mp4',
          isHLS: isM3U8,
          isDash: isMPD,
          requiresMerge: isM3U8 || isMPD,
          label: isM3U8 ? 'HLS Stream' : isMPD ? 'DASH Stream' : 'Video',
        }],
        audioStreams: [],
        hasDRM: false,
        extractedAt: Date.now(),
      },
    };
  }

  stop(): void {
    this.capturedUrls.clear();
  }
}
