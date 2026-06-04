import type { DetectedVideo, VideoStream, AudioStream } from '../../types';
import type { BaseDetector } from '../detection-engine';
import { createLogger } from '../../utils/logger';
import { generateId, heightToQuality } from '../../utils/helpers';

const log = createLogger('YouTubeDetector');

export class YouTubeDetector implements BaseDetector {
  name = 'YouTubeDetector';

  canHandle(url: string): boolean {
    return url.includes('youtube.com') || url.includes('youtu.be');
  }

  async detect(): Promise<DetectedVideo[]> {
    const videos: DetectedVideo[] = [];

    try {
      // 1. Try ytInitialPlayerResponse (most reliable)
      const playerData = this.extractPlayerResponse();
      if (playerData) {
        const video = this.parsePlayerResponse(playerData);
        if (video) videos.push(video);
      }

      // 2. Try ytInitialData (shorts, playlist context)
      if (videos.length === 0) {
        const v = this.extractFromInitialData();
        if (v) videos.push(v);
      }

      // 3. Fall back to video element
      if (videos.length === 0) {
        const v = this.extractFromVideoElement();
        if (v) videos.push(v);
      }
    } catch (err) {
      log.error('YouTube detection failed', { error: String(err) });
    }

    return videos;
  }

  private extractPlayerResponse(): Record<string, any> | null {
    try {
      // Try window variable first
      if ((window as any).ytInitialPlayerResponse) {
        return (window as any).ytInitialPlayerResponse;
      }

      // Try parsing from page source
      const scripts = Array.from(document.querySelectorAll('script:not([src])'));
      for (const script of scripts) {
        const text = script.textContent || '';
        const match = text.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
        if (match) {
          return JSON.parse(match[1]);
        }
      }
    } catch (err) {
      log.debug('Failed to extract ytInitialPlayerResponse', { error: String(err) });
    }
    return null;
  }

  private extractFromInitialData(): DetectedVideo | null {
    try {
      const data: Record<string, any> =
        (window as any).ytInitialData ||
        this.parseScriptVar('ytInitialData');

      if (!data) return null;

      const videoId = this.getNestedValue<string>(data, [
        'currentVideoEndpoint', 'watchEndpoint', 'videoId'
      ]);

      const title = this.getNestedValue<string>(data, [
        'contents', 'twoColumnWatchNextResults', 'results', 'results', 'contents',
        '0', 'videoPrimaryInfoRenderer', 'title', 'runs', '0', 'text'
      ]);

      if (!videoId) return null;

      return {
        id: `yt-${videoId}`,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        platform: 'youtube',
        pageUrl: window.location.href,
        tabId: 0,
        detectedAt: Date.now(),
        isActive: true,
        metadata: {
          id: videoId,
          title: title || document.title.replace(' - YouTube', ''),
          platform: 'youtube',
          pageUrl: window.location.href,
          thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
          videoStreams: [],
          audioStreams: [],
          hasDRM: false,
          extractedAt: Date.now(),
        },
      };
    } catch { return null; }
  }

  private parsePlayerResponse(data: Record<string, any>): DetectedVideo | null {
    try {
      const videoDetails = data.videoDetails;
      if (!videoDetails?.videoId) return null;

      const videoId = videoDetails.videoId;
      const title = videoDetails.title || '';
      const author = videoDetails.author || '';
      const duration = parseInt(videoDetails.lengthSeconds || '0');
      const thumbnail = videoDetails.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';
      const isLive = videoDetails.isLiveContent || false;

      const streamingData = data.streamingData || {};
      const formats: any[] = streamingData.formats || [];
      const adaptiveFormats: any[] = streamingData.adaptiveFormats || [];

      const videoStreams: VideoStream[] = [];
      const audioStreams: AudioStream[] = [];

      // Parse combined formats (video+audio)
      for (const fmt of formats) {
        if (!fmt.url && !fmt.signatureCipher) continue;
        const url = fmt.url || this.decipher(fmt.signatureCipher);
        const height: number = fmt.height || 0;
        videoStreams.push({
          url,
          quality: heightToQuality(height),
          format: fmt.mimeType?.includes('webm') ? 'webm' : 'mp4',
          codec: fmt.mimeType?.split(';')[0],
          fps: fmt.fps,
          bitrate: fmt.bitrate,
          fileSize: fmt.contentLength ? parseInt(fmt.contentLength) : undefined,
          width: fmt.width,
          height,
          itag: fmt.itag,
          mimeType: fmt.mimeType,
          label: fmt.qualityLabel,
          requiresMerge: false,
        });
      }

      // Parse adaptive video streams (video-only, need merging)
      for (const fmt of adaptiveFormats) {
        if (!fmt.url && !fmt.signatureCipher) continue;
        const mimeType: string = fmt.mimeType || '';
        if (mimeType.startsWith('video/')) {
          const url = fmt.url || this.decipher(fmt.signatureCipher);
          const height: number = fmt.height || 0;
          videoStreams.push({
            url,
            quality: heightToQuality(height),
            format: mimeType.includes('webm') ? 'webm' : 'mp4',
            codec: mimeType,
            fps: fmt.fps,
            bitrate: fmt.bitrate,
            fileSize: fmt.contentLength ? parseInt(fmt.contentLength) : undefined,
            width: fmt.width,
            height,
            itag: fmt.itag,
            mimeType,
            label: fmt.qualityLabel,
            requiresMerge: true,
          });
        } else if (mimeType.startsWith('audio/')) {
          const url = fmt.url || this.decipher(fmt.signatureCipher);
          audioStreams.push({
            url,
            format: mimeType.includes('webm') ? 'webm' : 'm4a',
            bitrate: fmt.bitrate,
            fileSize: fmt.contentLength ? parseInt(fmt.contentLength) : undefined,
            codec: mimeType,
            mimeType,
            label: fmt.audioQuality,
          });
        }
      }

      // Check DRM
      const hasDRM = !!(data.streamingData?.licenseInfos?.length) || isLive;
      const drmType = hasDRM ? (data.streamingData?.licenseInfos?.[0]?.drmFamily || 'Widevine') : undefined;

      return {
        id: `yt-${videoId}`,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        platform: 'youtube',
        pageUrl: window.location.href,
        tabId: 0,
        detectedAt: Date.now(),
        isActive: true,
        metadata: {
          id: videoId,
          title,
          author,
          platform: 'youtube',
          pageUrl: window.location.href,
          thumbnail,
          duration,
          isLive,
          videoStreams: this.sortStreams(videoStreams),
          audioStreams,
          hasDRM,
          drmType,
          extractedAt: Date.now(),
        },
      };
    } catch (err) {
      log.error('Failed to parse player response', { error: String(err) });
      return null;
    }
  }

  private extractFromVideoElement(): DetectedVideo | null {
    const video = document.querySelector<HTMLVideoElement>('video');
    if (!video || !video.src) return null;

    const videoId = new URL(window.location.href).searchParams.get('v') || generateId();
    return {
      id: `yt-${videoId}`,
      url: video.src,
      platform: 'youtube',
      pageUrl: window.location.href,
      tabId: 0,
      detectedAt: Date.now(),
      isActive: true,
      metadata: {
        id: videoId,
        title: document.title.replace(' - YouTube', ''),
        platform: 'youtube',
        pageUrl: window.location.href,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        videoStreams: [{
          url: video.src,
          quality: 'best',
          format: 'mp4',
          requiresMerge: false,
        }],
        audioStreams: [],
        hasDRM: false,
        extractedAt: Date.now(),
      },
    };
  }

  private decipher(signatureCipher: string): string {
    try {
      const params = new URLSearchParams(signatureCipher);
      return decodeURIComponent(params.get('url') || '');
    } catch { return ''; }
  }

  private parseScriptVar(varName: string): any {
    const scripts = Array.from(document.querySelectorAll('script:not([src])'));
    for (const script of scripts) {
      const text = script.textContent || '';
      const match = text.match(new RegExp(`${varName}\\s*=\\s*(\\{.+?\\});`, 's'));
      if (match) {
        try { return JSON.parse(match[1]); } catch { continue; }
      }
    }
    return null;
  }

  private getNestedValue<T>(obj: any, path: string[]): T | undefined {
    let current = obj;
    for (const key of path) {
      if (current == null) return undefined;
      current = current[key];
    }
    return current as T;
  }

  private sortStreams(streams: VideoStream[]): VideoStream[] {
    const order: Record<string, number> = {
      '2160p': 0, '1440p': 1, '1080p': 2, '720p': 3,
      '480p': 4, '360p': 5, '240p': 6, '144p': 7, 'best': 8,
    };
    return streams.sort((a, b) => (order[a.quality] ?? 9) - (order[b.quality] ?? 9));
  }

  stop(): void { /* no persistent listeners */ }
}
