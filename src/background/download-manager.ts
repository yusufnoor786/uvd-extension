import type { DownloadJob, DownloadStatus } from '../types';
import { createLogger } from '../utils/logger';
import { BackendService } from './backend-service';

const log = createLogger('DownloadManager');
const MAX_CONCURRENT = 3;

type ProgressCallback = (job: DownloadJob) => void;

export class DownloadManager {
  private queue: DownloadJob[] = [];
  private active = new Map<string, AbortController>();
  private paused = new Set<string>();
  private maxConcurrent = MAX_CONCURRENT;

  enqueue(
    job: DownloadJob,
    backend: BackendService,
    onProgress: ProgressCallback
  ): void {
    this.queue.push(job);
    this.processNext(backend, onProgress);
  }

  cancel(jobId: string): void {
    this.queue = this.queue.filter(j => j.id !== jobId);
    const ctrl = this.active.get(jobId);
    if (ctrl) {
      ctrl.abort();
      this.active.delete(jobId);
    }
    this.paused.delete(jobId);
    log.info('Download cancelled', { jobId });
  }

  pause(jobId: string): void {
    this.paused.add(jobId);
    const ctrl = this.active.get(jobId);
    if (ctrl) ctrl.abort();
    log.info('Download paused', { jobId });
  }

  resume(jobId: string): void {
    this.paused.delete(jobId);
    log.info('Download resumed', { jobId });
  }

  setMaxConcurrent(n: number): void {
    this.maxConcurrent = n;
  }

  private processNext(backend: BackendService, onProgress: ProgressCallback): void {
    while (this.active.size < this.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift()!;
      if (this.paused.has(job.id)) {
        this.queue.push(job); // put it back
        break;
      }
      this.executeJob(job, backend, onProgress);
    }
  }

  private async executeJob(
    job: DownloadJob,
    backend: BackendService,
    onProgress: ProgressCallback
  ): Promise<void> {
    const ctrl = new AbortController();
    this.active.set(job.id, ctrl);

    const update = (partial: Partial<DownloadJob>) => {
      Object.assign(job, partial);
      onProgress({ ...job });
    };

    update({ status: 'downloading', startedAt: Date.now(), progress: 0 });
    log.info('Executing download', { jobId: job.id, method: job.method, quality: job.stream.quality });

    try {
      if (job.method === 'backend') {
        await this.backendDownload(job, backend, ctrl.signal, update);
      } else if (
        job.method === 'idm' ||
        job.method === 'jdownloader' ||
        job.method === 'fdm' ||
        job.method === 'xdm' ||
        job.method === 'motrix' ||
        job.method === 'aria2'
      ) {
        await this.externalManagerDownload(job, update);
      } else {
        await this.browserDownload(job, ctrl.signal, update);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        update({ status: 'paused' });
      } else {
        log.error('Download failed', { jobId: job.id, error: String(err) });
        update({ status: 'failed', error: String(err) });
      }
    } finally {
      this.active.delete(job.id);
      this.processNext(backend, onProgress);
    }
  }

  // ── Browser download via chrome.downloads API ─────────────────────────────

  private async browserDownload(
    job: DownloadJob,
    signal: AbortSignal,
    update: (p: Partial<DownloadJob>) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const downloadOptions: chrome.downloads.DownloadOptions = {
        url: job.stream.url,
        filename: job.filename,
        saveAs: false,
        conflictAction: 'uniquify',
      };

      chrome.downloads.download(downloadOptions, (downloadId) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }

        job.chromeDownloadId = downloadId;
        update({ chromeDownloadId: downloadId, status: 'downloading' });

        const listener = (delta: chrome.downloads.DownloadDelta) => {
          if (delta.id !== downloadId) return;

          if (delta.state?.current === 'complete') {
            chrome.downloads.onChanged.removeListener(listener);
            update({ status: 'completed', progress: 100, completedAt: Date.now() });
            log.info('Browser download completed', { jobId: job.id });
            resolve();
          } else if (delta.state?.current === 'interrupted') {
            chrome.downloads.onChanged.removeListener(listener);
            reject(new Error(`Download interrupted: ${delta.error?.current}`));
          }

          if ((delta as any).bytesReceived !== undefined && delta.totalBytes?.current) {
            const received = (delta as any).bytesReceived?.current ?? 0;
            const progress = Math.round((received / delta.totalBytes.current) * 100);
            update({ progress, downloadedBytes: received });
          }
        };

        chrome.downloads.onChanged.addListener(listener);

        signal.addEventListener('abort', () => {
          chrome.downloads.cancel(downloadId);
          chrome.downloads.onChanged.removeListener(listener);
          reject(new Error('AbortError'));
        });
      });
    });
  }

  // ── Backend-assisted download ─────────────────────────────────────────────

  private async backendDownload(
    job: DownloadJob,
    backend: BackendService,
    signal: AbortSignal,
    update: (p: Partial<DownloadJob>) => void
  ): Promise<void> {
    update({ status: 'extracting' });

    const res = await backend.queueDownload({
      videoId: job.videoId,
      streamUrl: job.stream.url,
      audioUrl: job.audioStream?.url,
      title: job.title,
      format: job.stream.format,
      quality: job.stream.quality,
    });

    if (!res.success || !res.jobId) {
      throw new Error(res.error || 'Backend failed to queue download');
    }

    update({ status: 'processing' });

    const finalStatus = await backend.pollJob(res.jobId, (s) => {
      update({ progress: s.progress, speed: s.speed, eta: s.eta, status: s.status as any });
    });

    if (finalStatus.status !== 'completed') {
      throw new Error(finalStatus.error || 'Backend download failed');
    }

    // Backend returns a download URL — trigger browser download for the processed file
    if (res.downloadUrl) {
      update({ status: 'downloading' });
      await this.browserDownload(
        { ...job, stream: { ...job.stream, url: res.downloadUrl } },
        signal,
        update
      );
    } else {
      update({ status: 'completed', progress: 100, completedAt: Date.now() });
    }
  }

  // ── External download managers ────────────────────────────────────────────

  private async externalManagerDownload(
    job: DownloadJob,
    update: (p: Partial<DownloadJob>) => void
  ): Promise<void> {
    const url = job.stream.url;
    const filename = job.filename || `${job.title}.${job.stream.format}`;

    const schemes: Record<string, string> = {
      idm: `idm://open/?url=${encodeURIComponent(url)}&save=${encodeURIComponent(filename)}`,
      jdownloader: `jd2://add?source=${encodeURIComponent(url)}&name=${encodeURIComponent(filename)}`,
      fdm: `fdm://add?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`,
      xdm: `xdm://open/?url=${encodeURIComponent(url)}&name=${encodeURIComponent(filename)}`,
      motrix: `motrix://api/new?url=${encodeURIComponent(url)}`,
      aria2: `aria2rpc://add?url=${encodeURIComponent(url)}`,
    };

    const scheme = schemes[job.method];
    if (scheme) {
      await chrome.tabs.create({ url: scheme, active: false });
      log.info('Launched external download manager', { method: job.method, jobId: job.id });
    }

    update({ status: 'completed', progress: 100, completedAt: Date.now() });
  }
}
