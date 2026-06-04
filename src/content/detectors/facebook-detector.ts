import type { DetectedVideo, VideoStream } from '../../types';
import type { BaseDetector } from '../detection-engine';
import { createLogger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';

const log = createLogger('FacebookDetector');

export class FacebookDetector implements BaseDetector {
  name = 'FacebookDetector';

  canHandle(url: string): boolean {
    return url.includes('facebook.com') || url.includes('fb.com') || url.includes('fb.watch');
  }

  async detect(): Promise<DetectedVideo[]> {
    const videos: DetectedVideo[] = [];
    try {
      // 1. Try relay store data
      const fromRelay = this.extractFromRelayData();
      if (fromRelay.length > 0) return fromRelay;

      // 2. Try __bbox patterns (Facebook's internal data)
      const fromBbox = this.extractFromBbox();
      if (fromBbox.length > 0) return fromBbox;

      // 3. Fall back to video elements / og:video
      const fromDOM = this.extractFromDOM();
      return fromDOM;
    } catch (err) {
      log.error('Facebook detection failed', { error: String(err) });
    }
    return videos;
  }

  private extractFromRelayData(): DetectedVideo[] {
    const results: DetectedVideo[] = [];
    try {
      const scripts = Array.from(document.querySelectorAll('script[type="application/json"]'));
      for (const script of scripts) {
        const text = script.textContent || '';
        if (!text.includes('video') && !text.includes('VideoPlayer')) continue;
        try {
          const data = JSON.parse(text);
          const videos = this.findVideoObjects(data);
          results.push(...videos);
        } catch { continue; }
      }
    } catch (err) {
      log.debug('Relay extraction failed', { error: String(err) });
    }
    return results;
  }

  private findVideoObjects(obj: any, depth = 0): DetectedVideo[] {
    if (depth > 10 || !obj || typeof obj !== 'object') return [];
    const results: DetectedVideo[] = [];

    // Check if current object is a video
    if (obj.video_id && (obj.playable_url || obj.browser_native_hd_url || obj.browser_native_sd_url)) {
      const v = this.buildFromFBVideoObject(obj);
      if (v) results.push(v);
    }

    // Recurse
    for (const val of Object.values(obj)) {
      if (val && typeof val === 'object') {
        results.push(...this.findVideoObjects(val, depth + 1));
      }
    }

    return results;
  }

  private buildFromFBVideoObject(obj: any): DetectedVideo | null {
    const videoId = obj.video_id || obj.id || generateId();
    const streams: VideoStream[] = [];

    const hdUrl = obj.browser_native_hd_url || obj.playable_url_quality_hd;
    const sdUrl = obj.browser_native_sd_url || obj.playable_url;

    if (hdUrl) streams.push({ url: hdUrl, quality: '720p', format: 'mp4', requiresMerge: false });
    if (sdUrl) streams.push({ url: sdUrl, quality: '360p', format: 'mp4', requiresMerge: false });

    if (streams.length === 0) return null;

    // Get thumbnail
    const thumbnail =
      obj.preferred_thumbnail?.image?.uri ||
      obj.thumbnailImage?.uri ||
      obj.thumbnail_url || '';

    // Get title
    const title =
      obj.name ||
      obj.title?.text ||
      obj.message?.text?.slice(0, 100) ||
      'Facebook Video';

    return {
      id: `fb-${videoId}`,
      url: streams[0].url,
      platform: 'facebook',
      pageUrl: window.location.href,
      tabId: 0,
      detectedAt: Date.now(),
      isActive: true,
      metadata: {
        id: String(videoId),
        title,
        platform: 'facebook',
        pageUrl: window.location.href,
        thumbnail,
        duration: obj.length_in_second || obj.playable_duration_in_ms ? obj.playable_duration_in_ms / 1000 : undefined,
        videoStreams: streams,
        audioStreams: [],
        hasDRM: false,
        extractedAt: Date.now(),
      },
    };
  }

  private extractFromBbox(): DetectedVideo[] {
    const results: DetectedVideo[] = [];
    try {
      const scripts = Array.from(document.querySelectorAll('script:not([src])'));
      for (const script of scripts) {
        const text = script.textContent || '';
        // Look for __bbox patterns used in Facebook's data format
        const matches = text.matchAll(/"browser_native_(?:hd|sd)_url":"(https?:[^"]+)"/g);
        for (const match of matches) {
          const url = match[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
          if (url && !results.some(v => v.url === url)) {
            results.push({
              id: `fb-${generateId()}`,
              url,
              platform: 'facebook',
              pageUrl: window.location.href,
              tabId: 0,
              detectedAt: Date.now(),
              isActive: true,
              metadata: {
                id: generateId(),
                title: document.title.replace(' | Facebook', '').replace(' - Facebook', ''),
                platform: 'facebook',
                pageUrl: window.location.href,
                thumbnail: document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content || '',
                videoStreams: [{ url, quality: 'best', format: 'mp4', requiresMerge: false }],
                audioStreams: [],
                hasDRM: false,
                extractedAt: Date.now(),
              },
            });
          }
        }
      }
    } catch (err) {
      log.debug('Bbox extraction failed', { error: String(err) });
    }
    return results;
  }

  private extractFromDOM(): DetectedVideo[] {
    const results: DetectedVideo[] = [];

    // Check og:video
    const ogVideo = document.querySelector<HTMLMetaElement>('meta[property="og:video"]')?.content ||
                    document.querySelector<HTMLMetaElement>('meta[property="og:video:secure_url"]')?.content;

    if (ogVideo) {
      results.push({
        id: `fb-${generateId()}`,
        url: ogVideo,
        platform: 'facebook',
        pageUrl: window.location.href,
        tabId: 0,
        detectedAt: Date.now(),
        isActive: true,
        metadata: {
          id: generateId(),
          title: document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content || 'Facebook Video',
          platform: 'facebook',
          pageUrl: window.location.href,
          thumbnail: document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content || '',
          videoStreams: [{ url: ogVideo, quality: 'best', format: 'mp4', requiresMerge: false }],
          audioStreams: [],
          hasDRM: false,
          extractedAt: Date.now(),
        },
      });
    }

    // Check video elements
    const videoEls = Array.from(document.querySelectorAll<HTMLVideoElement>('video[src]'));
    for (const vid of videoEls) {
      if (vid.src && !vid.src.startsWith('blob:') && !results.some(v => v.url === vid.src)) {
        results.push({
          id: `fb-${generateId()}`,
          url: vid.src,
          platform: 'facebook',
          pageUrl: window.location.href,
          tabId: 0,
          detectedAt: Date.now(),
          isActive: true,
          metadata: {
            id: generateId(),
            title: document.title.replace(' | Facebook', ''),
            platform: 'facebook',
            pageUrl: window.location.href,
            thumbnail: '',
            videoStreams: [{ url: vid.src, quality: 'best', format: 'mp4', requiresMerge: false }],
            audioStreams: [],
            hasDRM: false,
            extractedAt: Date.now(),
          },
        });
      }
    }

    return results;
  }

  stop(): void { }
}
