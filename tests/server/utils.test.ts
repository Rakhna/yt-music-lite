import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LRUCache, formatSeconds, parseDuration } from '../../server/utils.js';

describe('server/utils - LRUCache', () => {
  let cache;

  beforeEach(() => {
    cache = new LRUCache(3, 1000); // 3 items, 1 second TTL
  });

  it('sets and gets items correctly', () => {
    cache.set('k1', 'val1');
    expect(cache.get('k1')).toBe('val1');
    expect(cache.has('k1')).toBe(true);
    expect(cache.size).toBe(1);
  });

  it('returns null for missing key', () => {
    expect(cache.get('nonexistent')).toBeNull();
    expect(cache.has('nonexistent')).toBe(false);
  });

  it('updates value and refreshes position on set with same key', () => {
    cache.set('k1', 'val1');
    cache.set('k1', 'val1-updated');
    expect(cache.get('k1')).toBe('val1-updated');
    expect(cache.size).toBe(1);
  });

  it('evicts oldest accessed item when capacity is exceeded', () => {
    cache.set('k1', 'val1');
    cache.set('k2', 'val2');
    cache.set('k3', 'val3');

    // Access k1 so k2 becomes the oldest
    expect(cache.get('k1')).toBe('val1');

    // Add k4 -> should evict k2
    cache.set('k4', 'val4');

    expect(cache.get('k2')).toBeNull();
    expect(cache.get('k1')).toBe('val1');
    expect(cache.get('k3')).toBe('val3');
    expect(cache.get('k4')).toBe('val4');
    expect(cache.size).toBe(3);
  });

  it('expires items when TTL elapsed', () => {
    vi.useFakeTimers();
    try {
      cache.set('k1', 'val1');
      expect(cache.get('k1')).toBe('val1');

      // Advance time beyond TTL (1000ms)
      vi.advanceTimersByTime(1100);

      expect(cache.get('k1')).toBeNull();
      expect(cache.has('k1')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears all items', () => {
    cache.set('k1', 'val1');
    cache.set('k2', 'val2');
    expect(cache.size).toBe(2);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('k1')).toBeNull();
  });
});

describe('server/utils - formatSeconds', () => {
  it('formats 0 seconds', () => {
    expect(formatSeconds(0)).toBe('0:00');
  });

  it('formats seconds under one minute with zero padding', () => {
    expect(formatSeconds(5)).toBe('0:05');
    expect(formatSeconds(35)).toBe('0:35');
  });

  it('formats minutes and seconds correctly', () => {
    expect(formatSeconds(65)).toBe('1:05');
    expect(formatSeconds(215)).toBe('3:35');
    expect(formatSeconds(3600)).toBe('60:00');
  });

  it('handles invalid or non-numeric inputs gracefully', () => {
    expect(formatSeconds(null)).toBe('0:00');
    expect(formatSeconds(undefined)).toBe('0:00');
    expect(formatSeconds(-10)).toBe('0:00');
    expect(formatSeconds(NaN)).toBe('0:00');
    expect(formatSeconds('120')).toBe('0:00');
  });
});

describe('server/utils - parseDuration', () => {
  it('parses empty or null duration', () => {
    expect(parseDuration(null)).toEqual({ seconds: 0, text: '0:00' });
    expect(parseDuration(undefined)).toEqual({ seconds: 0, text: '0:00' });
    expect(parseDuration(0)).toEqual({ seconds: 0, text: '0:00' });
  });

  it('parses duration object with seconds and text', () => {
    const dur = { seconds: 130, text: '2:10' };
    expect(parseDuration(dur)).toEqual({ seconds: 130, text: '2:10' });
  });

  it('parses duration object with seconds only', () => {
    const dur = { seconds: 75 };
    expect(parseDuration(dur)).toEqual({ seconds: 75, text: '1:15' });
  });

  it('parses duration object with text only', () => {
    const dur = { text: '2:10' };
    expect(parseDuration(dur)).toEqual({ seconds: 0, text: '2:10' });
  });

  it('parses numeric seconds', () => {
    expect(parseDuration(200)).toEqual({ seconds: 200, text: '3:20' });
  });

  it('parses string duration mm:ss', () => {
    expect(parseDuration('04:15')).toEqual({ seconds: 255, text: '04:15' });
    expect(parseDuration(' 1:30 ')).toEqual({ seconds: 90, text: ' 1:30 ' });
  });

  it('parses string duration hh:mm:ss', () => {
    expect(parseDuration('1:02:15')).toEqual({ seconds: 3735, text: '1:02:15' });
  });

  it('handles single-part numeric strings and 4-part strings', () => {
    expect(parseDuration('45')).toEqual({ seconds: 0, text: '45' });
    expect(parseDuration('1:2:3:4')).toEqual({ seconds: 0, text: '1:2:3:4' });
  });

  it('handles LRUCache with 0 max capacity', () => {
    const zeroCache = new LRUCache(0);
    zeroCache.set('k', 'v');
    expect(zeroCache.get('k')).toBe('v');
  });

  it('handles invalid duration strings gracefully', () => {
    expect(parseDuration('invalid:duration')).toEqual({ seconds: 0, text: 'invalid:duration' });
  });

  it('handles non-standard types', () => {
    expect(parseDuration(true)).toEqual({ seconds: 0, text: '0:00' });
  });
});
