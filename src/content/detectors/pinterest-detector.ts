import type { DetectedVideo } from '../../types';
import type { BaseDetector } from '../detection-engine';
import { createLogger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';

const log = createLogger('PinterestDetector');

export class PinterestDetector implements BaseDetector {
  name = 'PinterestDetector';

  canHandle(url: string): boolean {
    return url.includes('pinterest.com') || url.includes('pin.it');
  }

  async detect(): Promise<DetectedVideo[]> {
    try {
      const fromRedux = this.extractFromReduxStore();
      if (fromRedux.length > 0) return fromRedux;

      return this.extractFromDOM();
    } catch (err) {
      log.error('Pinterest detection failed', { error: String(err) });
      return [];
    }
  }

  private extractFromReduxStore(): DetectedVideo[] {
    try {
      const reduxStore =
        (window as any).__PWS_INITIAL_REDUX_STATE__ ||
        (window as any).__INITIAL_REDUX_STATE__;

      if (!reduxStore) return [];

      const pins = reduxStore?.pins?.pins || {};
      const results: DetectedVideo[] = [];

      for (const [pinId, pin] of Object.entries(pins)) {
        const p = pin as any;
        if (!p.videos && !p.story_pin_data) continue;

        const videoData = p.videos?.video_list || p.story_pin_data?.pages?.[0]?.blocks?.[0]?.video;
        if (!videoData) continue;

        const streams = this.extractStreamsFromVideoList(videoData);
        if (streams.length === 0) continue;

        results.push({
          id: `pt-${pinId}`,
          url: streams[0].url,
          platform: 'pinterest',
          pageUrl: window.location.href,
          tabId: 0,
          detectedAt: Date.now(),
          isActive: true,
          metadata: {
            id: String(pinId),
            title: p.title || p.description?.slice(0, 100) || 'Pinterest Video',
            author: p.pinner?.username || '',
            platform: 'pinterest',
            pageUrl: window.location.href,
            thumbnail: p.images?.orig?.url || p.image_signature || '',
            videoStreams: streams,
            audioStreams: [],
            hasDRM: false,
            extractedAt: Date.now(),
          },
        });
      }

      return results;
    } catch (err) {
      log.debug('Redux extraction failed', { error: String(err) });
      return [];
    }
  }

  private extractStreamsFromVideoList(videoList: any): any[] {
    const streams: any[] = [];
    if (Array.isArray(videoList)) {
      for (const item of videoList) {
        if (item.url || item.V_720P?.url || item.V_480P?.url) {
          const url = item.url || item.V_720P?.url || item.V_480P?.url;
          streams.push({ url, quality: 'best' as const, format: 'mp4' as const, requiresMerge: false });
        }
      }
    } else if (typeof videoList === 'object') {
      const qualityMap: Record<string, string> = {
        V_720P: '720p', V_480P: '480p', V_360P: '360p', V_240P: '240p', V_HLSV4: 'best',
      };
      for (const [key, qual] of Object.entries(qualityMap)) {
        if (videoList[key]?.url) {
          streams.push({
            url: videoList[key].url,
            quality: qual as any,
            format: key === 'V_HLSV4' ? 'm3u8' as const : 'mp4' as const,
            isHLS: key === 'V_HLSV4',
            requiresMerge: false,
          });
        }
      }
    }
    return streams;
  }

  private extractFromDOM(): DetectedVideo[] {
    const ogVideo = document.querySelector<HTMLMetaElement>('meta[property="og:video"]')?.content ||
                    document.querySelector<HTMLMetaElement>('meta[property="og:video:secure_url"]')?.content;
    if (!ogVideo) return [];

    return [{
      id: `pt-${generateId()}`,
      url: ogVideo,
      platform: 'pinterest',
      pageUrl: window.location.href,
      tabId: 0,
      detectedAt: Date.now(),
      isActive: true,
      metadata: {
        id: generateId(),
        title: document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content || 'Pinterest Video',
        platform: 'pinterest',
        pageUrl: window.location.href,
        thumbnail: document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content || '',
        videoStreams: [{ url: ogVideo, quality: 'best', format: 'mp4', requiresMerge: false }],
        audioStreams: [],
        hasDRM: false,
        extractedAt: Date.now(),
      },
    }];
  }

  stop(): void { }
}
