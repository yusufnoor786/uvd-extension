import type { DetectedVideo, VideoStream } from '../../types';
import type { BaseDetector } from '../detection-engine';
import { createLogger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';

const log = createLogger('VimeoDetector');

export class VimeoDetector implements BaseDetector {
  name = 'VimeoDetector';

  canHandle(url: string): boolean {
    return url.includes('vimeo.com');
  }

  async detect(): Promise<DetectedVideo[]> {
    try {
      const fromConfig = await this.extractFromVimeoConfig();
      if (fromConfig.length > 0) return fromConfig;

      return this.extractFromDOM();
    } catch (err) {
      log.error('Vimeo detection failed', { error: String(err) });
      return [];
    }
  }

  private async extractFromVimeoConfig(): Promise<DetectedVideo[]> {
    try {
      // Vimeo embeds config as window.vimeo.clip_page_config or similar
      const config =
        (window as any).__PLAYER_CONFIG__ ||
        (window as any).vimeo?.clip_page_config ||
        this.parseVimeoScript();

      if (!config) {
        // For embed pages, fetch the config via API
        const videoId = this.extractVideoId(window.location.href);
        if (videoId) return await this.fetchVimeoConfig(videoId);
        return [];
      }

      return this.parseConfig(config);
    } catch (err) {
      log.debug('Config extraction failed', { error: String(err) });
      return [];
    }
  }

  private parseVimeoScript(): any {
    const scripts = Array.from(document.querySelectorAll('script:not([src])'));
    for (const script of scripts) {
      const text = script.textContent || '';
      // Try JSON-LD
      if (text.includes('"@type":"VideoObject"')) {
        try {
          const data = JSON.parse(text);
          if (data.contentUrl) return { contentUrl: data.contentUrl, data };
        } catch { continue; }
      }
      // Try clip_page_config
      const match = text.match(/clip_page_config\s*=\s*(\{.+?\});/s);
      if (match) {
        try { return JSON.parse(match[1]); } catch { continue; }
      }
    }
    return null;
  }

  private async fetchVimeoConfig(videoId: string): Promise<DetectedVideo[]> {
    try {
      const res = await fetch(`https://player.vimeo.com/video/${videoId}/config`, {
        headers: { 'Referer': window.location.href }
      });
      if (!res.ok) return [];
      const config = await res.json();
      return this.parseConfig(config);
    } catch { return []; }
  }

  private parseConfig(config: any): DetectedVideo[] {
    const video = config?.video || config?.clip;
    const request = config?.request;
    if (!video) return [];

    const streams: VideoStream[] = [];

    // Progressive files (direct MP4 downloads)
    const progressive = request?.files?.progressive || video.files?.progressive || [];
    for (const file of progressive) {
      if (file.url) {
        streams.push({
          url: file.url,
          quality: file.quality as any || `${file.height}p`,
          format: 'mp4',
          width: file.width,
          height: file.height,
          fps: file.fps,
          requiresMerge: false,
          label: `${file.quality} (${file.height}p)`,
        });
      }
    }

    // HLS stream
    const hls = request?.files?.hls?.cdns;
    if (hls) {
      const cdnKeys = Object.keys(hls);
      if (cdnKeys.length > 0) {
        const m3u8Url = hls[cdnKeys[0]]?.url || hls[cdnKeys[0]]?.avc_url;
        if (m3u8Url) {
          streams.push({
            url: m3u8Url,
            quality: 'best',
            format: 'm3u8',
            isHLS: true,
            requiresMerge: false,
            label: 'HLS Stream',
          });
        }
      }
    }

    if (streams.length === 0) return [];

    const videoId = String(video.id || generateId());

    return [{
      id: `vi-${videoId}`,
      url: streams[0].url,
      platform: 'vimeo',
      pageUrl: window.location.href,
      tabId: 0,
      detectedAt: Date.now(),
      isActive: true,
      metadata: {
        id: videoId,
        title: video.title || 'Vimeo Video',
        author: video.owner?.name || video.owner?.display_name || '',
        platform: 'vimeo',
        pageUrl: window.location.href,
        thumbnail: video.thumbs?.['1280'] || video.thumbs?.['640'] || video.thumbs?.['base'] || '',
        duration: video.duration,
        videoStreams: streams.sort((a, b) => (b.height || 0) - (a.height || 0)),
        audioStreams: [],
        hasDRM: false,
        extractedAt: Date.now(),
      },
    }];
  }

  private extractFromDOM(): DetectedVideo[] {
    const ogVideo = document.querySelector<HTMLMetaElement>('meta[property="og:video"]')?.content;
    if (!ogVideo) return [];

    return [{
      id: `vi-${generateId()}`,
      url: ogVideo,
      platform: 'vimeo',
      pageUrl: window.location.href,
      tabId: 0,
      detectedAt: Date.now(),
      isActive: true,
      metadata: {
        id: generateId(),
        title: document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content || 'Vimeo Video',
        platform: 'vimeo',
        pageUrl: window.location.href,
        thumbnail: document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content || '',
        videoStreams: [{ url: ogVideo, quality: 'best', format: 'mp4', requiresMerge: false }],
        audioStreams: [],
        hasDRM: false,
        extractedAt: Date.now(),
      },
    }];
  }

  private extractVideoId(url: string): string | null {
    const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    return match ? match[1] : null;
  }

  stop(): void { }
}
