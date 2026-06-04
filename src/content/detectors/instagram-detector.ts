import type { DetectedVideo, VideoStream } from '../../types';
import type { BaseDetector } from '../detection-engine';
import { createLogger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';

const log = createLogger('InstagramDetector');

export class InstagramDetector implements BaseDetector {
  name = 'InstagramDetector';

  canHandle(url: string): boolean {
    return url.includes('instagram.com');
  }

  async detect(): Promise<DetectedVideo[]> {
    try {
      const fromSharedData = this.extractFromSharedData();
      if (fromSharedData.length > 0) return fromSharedData;

      const fromGraphQL = this.extractFromGraphQLResponse();
      if (fromGraphQL.length > 0) return fromGraphQL;

      return this.extractFromDOM();
    } catch (err) {
      log.error('Instagram detection failed', { error: String(err) });
      return [];
    }
  }

  private extractFromSharedData(): DetectedVideo[] {
    try {
      const sharedData =
        (window as any)._sharedData ||
        (window as any).__additionalDataLoaded?.[''] ||
        this.parseSharedDataScript();

      if (!sharedData) return [];

      const media = this.findMediaInSharedData(sharedData);
      return media.map(m => this.buildVideo(m)).filter(Boolean) as DetectedVideo[];
    } catch (err) {
      log.debug('SharedData extraction failed', { error: String(err) });
      return [];
    }
  }

  private parseSharedDataScript(): any {
    const scripts = Array.from(document.querySelectorAll('script:not([src])'));
    for (const script of scripts) {
      const text = script.textContent || '';
      const match = text.match(/window\._sharedData\s*=\s*(\{.+?\});/s);
      if (match) {
        try { return JSON.parse(match[1]); } catch { continue; }
      }
    }
    return null;
  }

  private findMediaInSharedData(data: any): any[] {
    const results: any[] = [];
    try {
      const items =
        data?.entry_data?.PostPage?.[0]?.graphql?.shortcode_media ||
        data?.entry_data?.ReelsPage?.[0]?.data ||
        data?.graphql?.shortcode_media;
      if (items) results.push(items);

      // Handle carousel
      if (items?.edge_sidecar_to_children?.edges) {
        for (const edge of items.edge_sidecar_to_children.edges) {
          if (edge.node?.is_video) results.push(edge.node);
        }
      }
    } catch { /* ignore */ }
    return results;
  }

  private extractFromGraphQLResponse(): DetectedVideo[] {
    const results: DetectedVideo[] = [];
    try {
      const scripts = Array.from(document.querySelectorAll('script[type="application/json"]'));
      for (const script of scripts) {
        const text = script.textContent || '';
        if (!text.includes('video_url') && !text.includes('video_versions')) continue;
        try {
          const data = JSON.parse(text);
          const vids = this.deepFindVideos(data);
          results.push(...vids.map(v => this.buildVideo(v)).filter(Boolean) as DetectedVideo[]);
        } catch { continue; }
      }
    } catch { }
    return results;
  }

  private deepFindVideos(obj: any, depth = 0): any[] {
    if (depth > 12 || !obj || typeof obj !== 'object') return [];
    const results: any[] = [];

    if (obj.is_video && (obj.video_url || obj.video_versions)) {
      results.push(obj);
    }

    for (const val of Object.values(obj)) {
      if (val && typeof val === 'object') {
        results.push(...this.deepFindVideos(val, depth + 1));
      }
    }
    return results;
  }

  private buildVideo(media: any): DetectedVideo | null {
    const videoId = media.id || media.shortcode || generateId();
    const streams: VideoStream[] = [];

    // video_versions is array of {type, width, height, url}
    if (Array.isArray(media.video_versions)) {
      for (const v of media.video_versions) {
        streams.push({
          url: v.url,
          quality: v.height >= 720 ? '720p' : v.height >= 480 ? '480p' : '360p',
          format: 'mp4',
          width: v.width,
          height: v.height,
          requiresMerge: false,
        });
      }
    } else if (media.video_url) {
      streams.push({ url: media.video_url, quality: 'best', format: 'mp4', requiresMerge: false });
    }

    if (streams.length === 0) return null;

    const thumbnail =
      media.display_url ||
      media.thumbnail_src ||
      media.thumbnail_resources?.slice(-1)[0]?.src || '';

    const title =
      media.edge_media_to_caption?.edges?.[0]?.node?.text?.slice(0, 100) ||
      media.accessibility_caption ||
      'Instagram Video';

    const author =
      media.owner?.username ||
      media.user?.username || '';

    return {
      id: `ig-${videoId}`,
      url: streams[0].url,
      platform: 'instagram',
      pageUrl: window.location.href,
      tabId: 0,
      detectedAt: Date.now(),
      isActive: true,
      metadata: {
        id: String(videoId),
        title,
        author,
        platform: 'instagram',
        pageUrl: window.location.href,
        thumbnail,
        duration: media.video_duration,
        viewCount: media.video_view_count,
        videoStreams: streams,
        audioStreams: [],
        hasDRM: false,
        extractedAt: Date.now(),
      },
    };
  }

  private extractFromDOM(): DetectedVideo[] {
    const results: DetectedVideo[] = [];

    // OG meta tags
    const ogVideo = document.querySelector<HTMLMetaElement>('meta[property="og:video"]')?.content;
    if (ogVideo) {
      results.push({
        id: `ig-${generateId()}`,
        url: ogVideo,
        platform: 'instagram',
        pageUrl: window.location.href,
        tabId: 0,
        detectedAt: Date.now(),
        isActive: true,
        metadata: {
          id: generateId(),
          title: document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content || 'Instagram Video',
          platform: 'instagram',
          pageUrl: window.location.href,
          thumbnail: document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content || '',
          videoStreams: [{ url: ogVideo, quality: 'best', format: 'mp4', requiresMerge: false }],
          audioStreams: [],
          hasDRM: false,
          extractedAt: Date.now(),
        },
      });
    }

    return results;
  }

  stop(): void { }
}
