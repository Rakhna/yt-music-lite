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

  next(): Track | null {
    if (this.queue.length === 0) return null;
    this.currentIndex = (this.currentIndex + 1) % this.queue.length;
    return this.queue[this.currentIndex];
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

  resetErrorCount(): void {
    this.consecutiveErrors = 0;
  }
}
