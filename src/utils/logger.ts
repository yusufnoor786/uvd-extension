import type { LogEntry, LogLevel } from '../types';

const MAX_LOGS = 1000;
const LOG_STORAGE_KEY = 'uvd_logs';

class Logger {
  private module: string;
  private static buffer: LogEntry[] = [];
  private static listeners: Array<(entry: LogEntry) => void> = [];

  constructor(module: string) {
    this.module = module;
  }

  private createEntry(level: LogLevel, message: string, context?: Record<string, unknown>): LogEntry {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      level,
      module: this.module,
      message,
      context,
      timestamp: Date.now(),
    };
  }

  private emit(entry: LogEntry): void {
    // Console output
    const prefix = `[${new Date(entry.timestamp).toISOString()}] [${entry.level.toUpperCase().padEnd(5)}] [${entry.module}]`;
    const args = entry.context ? [prefix, entry.message, entry.context] : [prefix, entry.message];

    switch (entry.level) {
      case 'error': console.error(...args); break;
      case 'warn':  console.warn(...args);  break;
      case 'debug': console.debug(...args); break;
      case 'trace': console.debug(...args); break;
      default:      console.log(...args);   break;
    }

    // Buffer
    Logger.buffer.push(entry);
    if (Logger.buffer.length > MAX_LOGS) {
      Logger.buffer.shift();
    }

    // Notify listeners
    Logger.listeners.forEach(fn => fn(entry));

    // Persist (async, fire-and-forget)
    Logger.persist(entry);
  }

  private static async persist(entry: LogEntry): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const data = await chrome.storage.local.get(LOG_STORAGE_KEY);
        const logs: LogEntry[] = data[LOG_STORAGE_KEY] || [];
        logs.push(entry);
        if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
        await chrome.storage.local.set({ [LOG_STORAGE_KEY]: logs });
      }
    } catch {
      // Storage unavailable in some contexts
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.emit(this.createEntry('info', message, context));
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.emit(this.createEntry('warn', message, context));
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.emit(this.createEntry('error', message, context));
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.emit(this.createEntry('debug', message, context));
  }

  trace(message: string, context?: Record<string, unknown>): void {
    this.emit(this.createEntry('trace', message, context));
  }

  static getAll(): LogEntry[] {
    return [...Logger.buffer];
  }

  static async loadFromStorage(): Promise<LogEntry[]> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const data = await chrome.storage.local.get(LOG_STORAGE_KEY);
        return data[LOG_STORAGE_KEY] || [];
      }
    } catch { /* ignore */ }
    return [];
  }

  static async clearStorage(): Promise<void> {
    Logger.buffer = [];
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.remove(LOG_STORAGE_KEY);
      }
    } catch { /* ignore */ }
  }

  static addListener(fn: (entry: LogEntry) => void): () => void {
    Logger.listeners.push(fn);
    return () => {
      Logger.listeners = Logger.listeners.filter(l => l !== fn);
    };
  }

  static export(): string {
    return Logger.buffer
      .map(e => `[${new Date(e.timestamp).toISOString()}] [${e.level.toUpperCase()}] [${e.module}] ${e.message}${e.context ? ' ' + JSON.stringify(e.context) : ''}`)
      .join('\n');
  }
}

export function createLogger(module: string): Logger {
  return new Logger(module);
}

export default Logger;
