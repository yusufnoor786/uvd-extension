import type {
  BackendStatus,
  BackendAnalyzeRequest,
  BackendAnalyzeResponse,
  BackendDownloadRequest,
  BackendDownloadResponse,
  BackendQueueStatus,
  Platform,
} from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger('BackendService');

export class BackendService {
  private baseUrl: string = 'https://zabukazuzu-uvd-backend.hf.space';
  private apiKey: string = '';
  private requestTimeout: number = 30_000;

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, '');
  }

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Extension-Version': chrome.runtime.getManifest().version,
    };
    if (this.apiKey) headers['X-API-Key'] = this.apiKey;
    return headers;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

    try {
      const res = await fetch(url, {
        method,
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || `HTTP ${res.status}`);
      }

      return await res.json() as T;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  async checkHealth(): Promise<BackendStatus> {
    const start = Date.now();
    try {
      const data = await this.request<{ status: string; version: string }>('GET', '/api/health');
      return {
        connected: data.status === 'ok',
        version: data.version,
        url: this.baseUrl,
        latency: Date.now() - start,
        lastChecked: Date.now(),
      };
    } catch (err) {
      log.warn('Backend health check failed', { error: String(err) });
      return { connected: false, url: this.baseUrl, lastChecked: Date.now() };
    }
  }

  async analyzeVideo(req: BackendAnalyzeRequest): Promise<BackendAnalyzeResponse> {
    try {
      return await this.request<BackendAnalyzeResponse>('POST', '/api/analyze', req);
    } catch (err) {
      log.error('Analyze request failed', { error: String(err) });
      return { success: false, error: String(err) };
    }
  }

  async extractVideo(url: string, platform: Platform, pageUrl: string): Promise<BackendAnalyzeResponse> {
    try {
      return await this.request<BackendAnalyzeResponse>('POST', '/api/extract', { url, platform, pageUrl });
    } catch (err) {
      log.error('Extract request failed', { error: String(err) });
      return { success: false, error: String(err) };
    }
  }

  async queueDownload(req: BackendDownloadRequest): Promise<BackendDownloadResponse> {
    try {
      return await this.request<BackendDownloadResponse>('POST', '/api/download', req);
    } catch (err) {
      log.error('Download queue request failed', { error: String(err) });
      return { success: false, error: String(err) };
    }
  }

  async getJobStatus(jobId: string): Promise<BackendQueueStatus> {
    return this.request<BackendQueueStatus>('GET', `/api/queue/${jobId}`);
  }

  async cancelJob(jobId: string): Promise<void> {
    await this.request('DELETE', `/api/queue/${jobId}`);
  }

  async getVersion(): Promise<{ version: string; features: string[] }> {
    return this.request('GET', '/api/version');
  }

  /**
   * Poll a backend job until it reaches a terminal state.
   */
  async pollJob(
    jobId: string,
    onProgress: (status: BackendQueueStatus) => void,
    intervalMs = 1000
  ): Promise<BackendQueueStatus> {
    return new Promise((resolve, reject) => {
      const timer = setInterval(async () => {
        try {
          const status = await this.getJobStatus(jobId);
          onProgress(status);
          if (
            status.status === 'completed' ||
            status.status === 'failed' ||
            status.status === 'cancelled'
          ) {
            clearInterval(timer);
            resolve(status);
          }
        } catch (err) {
          clearInterval(timer);
          reject(err);
        }
      }, intervalMs);
    });
  }
}
