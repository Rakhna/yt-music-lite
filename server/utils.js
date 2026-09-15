export class LRUCache {
  constructor(maxSize = 200, ttlMs = 10 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() - item.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    // Refresh LRU position
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.data;
  }

  set(key, data) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, { timestamp: Date.now(), data });
  }

  has(key) {
    return this.get(key) !== null;
  }

  clear() {
    this.cache.clear();
  }

  get size() {
    return this.cache.size;
  }
}

export function formatSeconds(secs) {
  if (typeof secs !== 'number' || isNaN(secs) || secs < 0) return '0:00';
  const total = Math.floor(secs);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function parseDuration(duration) {
  if (!duration) return { seconds: 0, text: '0:00' };
  if (typeof duration === 'object') {
    const seconds = Number(duration.seconds) || 0;
    const text = duration.text || formatSeconds(seconds);
    return { seconds, text };
  }
  if (typeof duration === 'number') {
    return { seconds: duration, text: formatSeconds(duration) };
  }
  if (typeof duration === 'string') {
    // Parse formatted string like "3:45" or "1:02:15"
    const parts = duration.trim().split(':').map(Number);
    if (parts.some(isNaN)) return { seconds: 0, text: duration };
    let seconds = 0;
    if (parts.length === 2) {
      seconds = parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return { seconds, text: duration };
  }
  return { seconds: 0, text: '0:00' };
}
