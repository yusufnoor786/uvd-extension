import type { DetectedVideo, VideoStream } from '../../types';
import type { BaseDetector } from '../detection-engine';
import { createLogger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';

const log = createLogger('TikTokDetector');

export class TikTokDetector implements BaseDetector {
  name = 'TikTokDetector';

  canHandle(url: string): boolean {
    return url.includes('tiktok.com');
  }

  async detect(): Promise<DetectedVideo[]> {
    try {
      const fromSSR = this.extractFromSSRData();
      if (fromSSR.length > 0) return fromSSR;

      return this.extractFromVideoElements();
    } catch (err) {
      log.error('TikTok detection failed', { error: String(err) });
      return [];
    }
  }

  private extractFromSSRData(): DetectedVideo[] {
    try {
      // TikTok embeds initial data as a JSON script tag with id SIGI_STATE
      const sigiEl = document.getElementById('SIGI_STATE');
      if (sigiEl?.textContent) {
        const data = JSON.parse(sigiEl.textContent);
        return this.parseSSRData(data);
      }

      // Also try __NEXT_DATA__
      const nextData = document.getElementById('__NEXT_DATA__');
      if (nextData?.textContent) {
        const data = JSON.parse(nextData.textContent);
        return this.parseNextData(data);
      }
    } catch (err) {
      log.debug('SSR data parse failed', { error: String(err) });
    }
    return [];
  }

  private parseSSRData(data: any): DetectedVideo[] {
    const results: DetectedVideo[] = [];
    try {
      const itemModule = data?.ItemModule || {};
      for (const [videoId, item] of Object.entries(itemModule)) {
        const itemData = item as any;
        const video = itemData?.video;
        if (!video) continue;

        const streams: VideoStream[] = [];

        // TikTok provides multiple download URLs
        if (video.playAddr) streams.push({ url: video.playAddr, quality: 'best', format: 'mp4', requiresMerge: false });
        if (video.downloadAddr) streams.push({ url: video.downloadAddr, quality: 'best', format: 'mp4', requiresMerge: false, label: 'No Watermark' });
        if (video.bitrateInfo) {
          for (const b of video.bitrateInfo) {
            if (b.PlayAddr?.UrlList?.[0]) {
              streams.push({
                url: b.PlayAddr.UrlList[0],
                quality: b.QualityType <= 2 ? '1080p' : b.QualityType <= 4 ? '720p' : '480p',
                format: 'mp4',
                bitrate: b.Bitrate,
                width: b.CodecInfo?.encodedWidth,
                height: b.CodecInfo?.encodedHeight,
                requiresMerge: false,
                label: b.GearName,
              });
            }
          }
        }

        if (streams.length === 0) continue;

        results.push({
          id: `tt-${videoId}`,
          url: streams[0].url,
          platform: 'tiktok',
          pageUrl: window.location.href,
          tabId: 0,
          detectedAt: Date.now(),
          isActive: true,
          metadata: {
            id: String(videoId),
            title: itemData.desc || 'TikTok Video',
            author: itemData.author?.nickname || itemData.authorId || '',
            platform: 'tiktok',
            pageUrl: window.location.href,
            thumbnail: video.cover || video.originCover || '',
            duration: video.duration,
            videoStreams: streams,
            audioStreams: [],
            hasDRM: false,
            extractedAt: Date.now(),
          },
        });
      }
    } catch (err) {
      log.debug('SIGI_STATE parse failed', { error: String(err) });
    }
    return results;
  }

  private parseNextData(data: any): DetectedVideo[] {
    try {
      const videoData = data?.props?.pageProps?.itemInfo?.itemStruct;
      if (!videoData?.video) return [];

      const video = videoData.video;
      const streams: VideoStream[] = [];

      if (video.playAddr) streams.push({ url: video.playAddr, quality: 'best', format: 'mp4', requiresMerge: false });

      if (streams.length === 0) return [];

      return [{
        id: `tt-${videoData.id}`,
        url: streams[0].url,
        platform: 'tiktok',
        pageUrl: window.location.href,
        tabId: 0,
        detectedAt: Date.now(),
        isActive: true,
        metadata: {
          id: videoData.id,
          title: videoData.desc || 'TikTok Video',
          author: videoData.author?.nickname || '',
          platform: 'tiktok',
          pageUrl: window.location.href,
          thumbnail: video.cover || '',
          duration: video.duration,
          videoStreams: streams,
          audioStreams: [],
          hasDRM: false,
          extractedAt: Date.now(),
        },
      }];
    } catch { return []; }
  }

  private extractFromVideoElements(): DetectedVideo[] {
    return Array.from(document.querySelectorAll<HTMLVideoElement>('video'))
      .filter(v => v.src && !v.src.startsWith('blob:'))
      .map(v => ({
        id: `tt-${generateId()}`,
        url: v.src,
        platform: 'tiktok' as const,
        pageUrl: window.location.href,
        tabId: 0,
        detectedAt: Date.now(),
        isActive: true,
        metadata: {
          id: generateId(),
          title: document.title.replace(' | TikTok', ''),
          platform: 'tiktok' as const,
          pageUrl: window.location.href,
          thumbnail: document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content || '',
          videoStreams: [{ url: v.src, quality: 'best' as const, format: 'mp4' as const, requiresMerge: false }],
          audioStreams: [],
          hasDRM: false,
          extractedAt: Date.now(),
        },
      }));
  }

  stop(): void { }
}
