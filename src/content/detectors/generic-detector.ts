import type { DetectedVideo, VideoStream } from '../../types';
import type { BaseDetector } from '../detection-engine';
import { createLogger } from '../../utils/logger';
import { generateId, detectPlatform } from '../../utils/helpers';

const log = createLogger('GenericDetector');

const VIDEO_URL_PATTERNS = [
  /\.mp4(\?[^"']*)?/i,
  /\.webm(\?[^"']*)?/i,
  /\.m3u8(\?[^"']*)?/i,
  /\.mpd(\?[^"']*)?/i,
  /\.mkv(\?[^"']*)?/i,
  /\.flv(\?[^"']*)?/i,
  /\/video\//i,
  /\/stream\//i,
  /videoplayback/i,
];

export class GenericDetector implements BaseDetector {
  name = 'GenericDetector';

  canHandle(_url: string): boolean {
    return true; // always runs as final fallback
  }

  async detect(): Promise<DetectedVideo[]> {
    const results: DetectedVideo[] = [];
    const seen = new Set<string>();

    try {
      // 1. OG video tags
      const ogUrls = this.getOGVideoUrls();
      for (const url of ogUrls) {
        if (!seen.has(url)) { seen.add(url); results.push(this.buildVideo(url)); }
      }

      // 2. JSON-LD VideoObject
      const jsonLdUrls = this.getJSONLDVideoUrls();
      for (const url of jsonLdUrls) {
        if (!seen.has(url)) { seen.add(url); results.push(this.buildVideo(url)); }
      }

      // 3. Data attributes on any element
      const dataAttrUrls = this.getDataAttributeVideoUrls();
      for (const url of dataAttrUrls) {
        if (!seen.has(url)) { seen.add(url); results.push(this.buildVideo(url)); }
      }

      // 4. Inline script scan for video URLs
      const scriptUrls = this.getScriptVideoUrls();
      for (const url of scriptUrls) {
        if (!seen.has(url)) { seen.add(url); results.push(this.buildVideo(url)); }
      }

      // 5. iframes with video embeds
      const iframeUrls = this.getIframeEmbeds();
      for (const url of iframeUrls) {
        if (!seen.has(url)) { seen.add(url); results.push(this.buildVideo(url)); }
      }
    } catch (err) {
      log.error('Generic detection failed', { error: String(err) });
    }

    return results;
  }

  private getOGVideoUrls(): string[] {
    const selectors = [
      'meta[property="og:video"]',
      'meta[property="og:video:url"]',
      'meta[property="og:video:secure_url"]',
      'meta[name="twitter:player:stream"]',
    ];
    return selectors
      .map(s => document.querySelector<HTMLMetaElement>(s)?.content || '')
      .filter(Boolean)
      .filter(url => this.isVideoUrl(url));
  }

  private getJSONLDVideoUrls(): string[] {
    const urls: string[] = [];
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent || '');
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'VideoObject') {
            if (item.contentUrl) urls.push(item.contentUrl);
            if (item.embedUrl) urls.push(item.embedUrl);
            if (Array.isArray(item.encodings)) {
              for (const enc of item.encodings) {
                if (enc.contentUrl) urls.push(enc.contentUrl);
              }
            }
          }
        }
      } catch { continue; }
    }
    return urls.filter(url => this.isVideoUrl(url));
  }

  private getDataAttributeVideoUrls(): string[] {
    const attributes = ['data-src', 'data-video', 'data-video-src', 'data-url', 'data-mp4', 'data-stream'];
    const urls: string[] = [];
    for (const attr of attributes) {
      document.querySelectorAll(`[${attr}]`).forEach(el => {
        const url = el.getAttribute(attr) || '';
        if (url && this.isVideoUrl(url)) urls.push(url);
      });
    }
    return urls;
  }

  private getScriptVideoUrls(): string[] {
    const urls: string[] = [];
    const urlPattern = /["'`](https?:\/\/[^\s"'`]+\.(?:mp4|webm|m3u8|mpd|mkv|flv)[^\s"'`]*)["'`]/gi;
    const scripts = Array.from(document.querySelectorAll('script:not([src])'));
    for (const script of scripts) {
      const text = script.textContent || '';
      if (!VIDEO_URL_PATTERNS.some(p => p.test(text))) continue;
      const matches = text.matchAll(urlPattern);
      for (const m of matches) {
        const url = m[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
        if (!urls.includes(url)) urls.push(url);
      }
    }
    return urls;
  }

  private getIframeEmbeds(): string[] {
    const urls: string[] = [];
    const videoEmbedDomains = ['youtube.com/embed', 'vimeo.com/video', 'dailymotion.com/embed', 'twitch.tv/embed'];
    document.querySelectorAll('iframe[src]').forEach(iframe => {
      const src = iframe.getAttribute('src') || '';
      if (videoEmbedDomains.some(d => src.includes(d))) {
        urls.push(src);
      }
    });
    return urls;
  }

  private isVideoUrl(url: string): boolean {
    return VIDEO_URL_PATTERNS.some(p => p.test(url));
  }

  private buildVideo(url: string): DetectedVideo {
    const platform = detectPlatform(url) || detectPlatform(window.location.href);
    const isM3U8 = url.includes('.m3u8');
    const isMPD = url.includes('.mpd');
    const id = generateId();

    return {
      id: `gen-${id}`,
      url,
      platform,
      pageUrl: window.location.href,
      tabId: 0,
      detectedAt: Date.now(),
      isActive: true,
      metadata: {
        id,
        title:
          document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content ||
          document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]')?.content ||
          document.title,
        platform,
        pageUrl: window.location.href,
        thumbnail:
          document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content ||
          document.querySelector<HTMLMetaElement>('meta[name="twitter:image"]')?.content || '',
        videoStreams: [{
          url,
          quality: 'best',
          format: isM3U8 ? 'm3u8' : isMPD ? 'mpd' : 'mp4',
          isHLS: isM3U8,
          isDash: isMPD,
          requiresMerge: isM3U8 || isMPD,
        }],
        audioStreams: [],
        hasDRM: false,
        extractedAt: Date.now(),
      },
    };
  }

  stop(): void { }
}
