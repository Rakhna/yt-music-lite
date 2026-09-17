export interface Track {
  id: string;
  title: string;
  artist: string;
  duration: number;
  durationText: string;
  thumbnail: string;
  source?: string;
  album?: string;
}

export function formatSeconds(secs: number): string {
  if (typeof secs !== 'number' || isNaN(secs) || secs < 0) return '0:00';
  const total = Math.floor(secs);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function extractPlaylistId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  const match = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
  return match ? match[1] : null;
}

export function extractYouTubeId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname.includes('youtube.com') || hostname.includes('youtube-nocookie.com')) {
      if (parsed.searchParams.has('v')) {
        const id = parsed.searchParams.get('v');
        if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
      }

      const pathSegments = parsed.pathname.split('/').filter(Boolean);
      if (['embed', 'v', 'shorts', 'live'].includes(pathSegments[0]) && pathSegments[1]) {
        const candidate = pathSegments[1];
        if (/^[a-zA-Z0-9_-]{11}$/.test(candidate)) return candidate;
      }
    } else if (hostname === 'youtu.be') {
      const candidate = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      if (candidate && /^[a-zA-Z0-9_-]{11}$/.test(candidate)) return candidate;
    }
  } catch (_) {
    // Fallback regex
    const match = trimmed.match(/(?:youtube\.com(?::\d+)?\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    if (match && /^[a-zA-Z0-9_-]{11}$/.test(match[1])) return match[1];
  }

  return null;
}

export class QueueManager {
  private queue: Track[] = [];
  private currentIndex: number = -1;
  private consecutiveErrors: number = 0;
  private maxConsecutiveErrors: number = 3;

  constructor(maxErrors = 3) {
    this.maxConsecutiveErrors = maxErrors;
  }

  get tracks(): Track[] {
    return [...this.queue];
  }

  get length(): number {
    return this.queue.length;
  }

  get index(): number {
    return this.currentIndex;
  }

  get errorCount(): number {
    return this.consecutiveErrors;
  }

  setQueue(tracks: Track[], startIndex = 0): Track | null {
    this.queue = tracks;
    this.consecutiveErrors = 0;
    if (tracks.length === 0) {
      this.currentIndex = -1;
      return null;
    }
    this.currentIndex = Math.max(0, Math.min(startIndex, tracks.length - 1));
    return this.queue[this.currentIndex];
  }

  getCurrent(): Track | null {
    if (this.currentIndex >= 0 && this.currentIndex < this.queue.length) {
      return this.queue[this.currentIndex];
    }
    return null;
  }

  select(index: number): Track | null {
    if (index >= 0 && index < this.queue.length) {
      this.currentIndex = index;
      this.consecutiveErrors = 0;
      return this.queue[this.currentIndex];
    }
    return null;
  }

  next(loop = true): Track | null {
    if (this.queue.length === 0) return null;
    if (this.currentIndex < this.queue.length - 1) {
      this.currentIndex++;
      return this.queue[this.currentIndex];
    }
    if (loop) {
      this.currentIndex = 0;
      return this.queue[0];
    }
    return null;
  }

  prev(): Track | null {
    if (this.queue.length === 0) return null;
    this.currentIndex = (this.currentIndex - 1 + this.queue.length) % this.queue.length;
    return this.queue[this.currentIndex];
  }

  handlePlaybackError(): { canContinue: boolean; nextTrack: Track | null } {
    if (this.queue.length === 0) {
      return { canContinue: false, nextTrack: null };
    }

    this.consecutiveErrors++;

    // Prevent infinite loop on single item or when multiple consecutive items fail
    if (this.queue.length <= 1 || this.consecutiveErrors >= Math.min(this.maxConsecutiveErrors, this.queue.length)) {
      return { canContinue: false, nextTrack: null };
    }

    const nextTrack = this.next();
    return { canContinue: true, nextTrack };
  }

  append(track: Track): boolean {
    if (!track || !track.id) return false;
    if (this.queue.some((t) => t.id === track.id)) return false;
    this.queue.push(track);
    if (this.currentIndex === -1) {
      this.currentIndex = 0;
    }
    return true;
  }

  appendTracks(tracks: Track[]): number {
    let added = 0;
    for (const t of tracks) {
      if (this.append(t)) added++;
    }
    return added;
  }

  hasNext(): boolean {
    return this.queue.length > 0 && this.currentIndex < this.queue.length - 1;
  }

  resetErrorCount(): void {
    this.consecutiveErrors = 0;
  }
}

export interface HistoryItem extends Track {
  playedAt: number;
}

export class HistoryManager {
  private history: HistoryItem[] = [];
  private maxItems: number;

  constructor(maxItems = 50, initialHistory: HistoryItem[] = []) {
    this.maxItems = maxItems;
    this.history = [...initialHistory];
  }

  get items(): HistoryItem[] {
    return [...this.history];
  }

  get length(): number {
    return this.history.length;
  }

  add(track: Track): HistoryItem {
    if (!track || !track.id) {
      throw new Error('Invalid track');
    }
    // Remove duplicate so it moves to position 0 (most recent)
    this.history = this.history.filter((item) => item.id !== track.id);
    const item: HistoryItem = {
      ...track,
      playedAt: Date.now(),
    };
    this.history.unshift(item);
    if (this.history.length > this.maxItems) {
      this.history = this.history.slice(0, this.maxItems);
    }
    return item;
  }

  remove(trackId: string): boolean {
    const prevLen = this.history.length;
    this.history = this.history.filter((item) => item.id !== trackId);
    return this.history.length < prevLen;
  }

  clear(): void {
    this.history = [];
  }

  getMostRecent(): HistoryItem | null {
    return this.history.length > 0 ? this.history[0] : null;
  }

  toJSON(): string {
    return JSON.stringify(this.history);
  }

  static fromJSON(json: string, maxItems = 50): HistoryManager {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) {
        return new HistoryManager(maxItems, parsed);
      }
    } catch (_) {}
    return new HistoryManager(maxItems);
  }
}

