import type { DetectedVideo, VideoStream } from '../../types';
import type { BaseDetector } from '../detection-engine';
import { createLogger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';

const log = createLogger('TwitterDetector');

export class TwitterDetector implements BaseDetector {
  name = 'TwitterDetector';

  canHandle(url: string): boolean {
    return url.includes('twitter.com') || url.includes('x.com');
  }

  async detect(): Promise<DetectedVideo[]> {
    try {
      const fromReact = this.extractFromReactFiber();
      if (fromReact.length > 0) return fromReact;

      const fromMeta = this.extractFromMeta();
      if (fromMeta.length > 0) return fromMeta;

      return this.extractFromVideoElements();
    } catch (err) {
      log.error('Twitter detection failed', { error: String(err) });
      return [];
    }
  }

  private extractFromReactFiber(): DetectedVideo[] {
    const results: DetectedVideo[] = [];
    try {
      // Twitter/X uses React — traverse fiber to find video data
      const videoEls = Array.from(document.querySelectorAll('video'));
      for (const videoEl of videoEls) {
        const fiber = this.getReactFiber(videoEl);
        if (!fiber) continue;

        const tweetData = this.findTweetDataInFiber(fiber);
        if (tweetData) {
          const v = this.buildFromTweetData(tweetData);
          if (v) results.push(v);
        } else if (videoEl.src && !videoEl.src.startsWith('blob:')) {
          results.push(this.buildFromVideoElement(videoEl));
        }
      }
    } catch (err) {
      log.debug('React fiber extraction failed', { error: String(err) });
    }
    return results;
  }

  private getReactFiber(el: Element): any {
    const key = Object.keys(el).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    return key ? (el as any)[key] : null;
  }

  private findTweetDataInFiber(fiber: any, depth = 0): any {
    if (depth > 20 || !fiber) return null;

    const props = fiber.memoizedProps || fiber.pendingProps;
    if (props?.tweet?.entities?.urls || props?.mediaPlaybackInfo?.src) {
      return props;
    }

    // Check for m3u8 URL in props
    if (typeof props?.src === 'string' && props.src.includes('.m3u8')) {
      return { m3u8Url: props.src };
    }

    return (
      this.findTweetDataInFiber(fiber.child, depth + 1) ||
      this.findTweetDataInFiber(fiber.sibling, depth + 1)
    );
  }

  private buildFromTweetData(data: any): DetectedVideo | null {
    if (data.m3u8Url) {
      return {
        id: `tw-${generateId()}`,
        url: data.m3u8Url,
        platform: 'twitter',
        pageUrl: window.location.href,
        tabId: 0,
        detectedAt: Date.now(),
        isActive: true,
        metadata: {
          id: generateId(),
          title: document.title.replace(' / X', '').replace(' / Twitter', ''),
          platform: 'twitter',
          pageUrl: window.location.href,
          thumbnail: document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content || '',
          videoStreams: [{ url: data.m3u8Url, quality: 'best', format: 'm3u8', isHLS: true, requiresMerge: false }],
          audioStreams: [],
          hasDRM: false,
          extractedAt: Date.now(),
        },
      };
    }
    return null;
  }

  private buildFromVideoElement(video: HTMLVideoElement): DetectedVideo {
    return {
      id: `tw-${generateId()}`,
      url: video.src,
      platform: 'twitter',
      pageUrl: window.location.href,
      tabId: 0,
      detectedAt: Date.now(),
      isActive: true,
      metadata: {
        id: generateId(),
        title: document.title.replace(' / X', '').replace(' / Twitter', ''),
        platform: 'twitter',
        pageUrl: window.location.href,
        thumbnail: document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content || '',
        videoStreams: [{
          url: video.src,
          quality: 'best',
          format: video.src.includes('.m3u8') ? 'm3u8' : 'mp4',
          isHLS: video.src.includes('.m3u8'),
          requiresMerge: false,
        }],
        audioStreams: [],
        hasDRM: false,
        extractedAt: Date.now(),
      },
    };
  }

  private extractFromMeta(): DetectedVideo[] {
    const twitterPlayerUrl = document.querySelector<HTMLMetaElement>('meta[name="twitter:player:stream"]')?.content;
    const ogVideo = document.querySelector<HTMLMetaElement>('meta[property="og:video:secure_url"]')?.content ||
                    document.querySelector<HTMLMetaElement>('meta[property="og:video"]')?.content;

    const url = twitterPlayerUrl || ogVideo;
    if (!url) return [];

    return [{
      id: `tw-${generateId()}`,
      url,
      platform: 'twitter',
      pageUrl: window.location.href,
      tabId: 0,
      detectedAt: Date.now(),
      isActive: true,
      metadata: {
        id: generateId(),
        title: document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content ||
               document.title.replace(' / X', ''),
        platform: 'twitter',
        pageUrl: window.location.href,
        thumbnail: document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content || '',
        videoStreams: [{
          url,
          quality: 'best',
          format: url.includes('.m3u8') ? 'm3u8' : 'mp4',
          isHLS: url.includes('.m3u8'),
          requiresMerge: false,
        }],
        audioStreams: [],
        hasDRM: false,
        extractedAt: Date.now(),
      },
    }];
  }

  private extractFromVideoElements(): DetectedVideo[] {
    return Array.from(document.querySelectorAll<HTMLVideoElement>('video'))
      .filter(v => v.src && !v.src.startsWith('blob:'))
      .map(v => this.buildFromVideoElement(v));
  }

  stop(): void { }
}
