import { describe, it, expect, beforeEach } from 'vitest';
import {
  formatSeconds,
  extractPlaylistId,
  extractYouTubeId,
  QueueManager,
  HistoryManager,
  Track,
} from '../../client/src/utils';

describe('client/utils - formatSeconds', () => {
  it('formats zero seconds', () => {
    expect(formatSeconds(0)).toBe('0:00');
  });

  it('formats seconds with leading zero for single digit', () => {
    expect(formatSeconds(7)).toBe('0:07');
    expect(formatSeconds(59)).toBe('0:59');
  });

  it('formats minutes and seconds', () => {
    expect(formatSeconds(60)).toBe('1:00');
    expect(formatSeconds(125)).toBe('2:05');
  });

  it('handles negative or invalid inputs', () => {
    expect(formatSeconds(-1)).toBe('0:00');
    expect(formatSeconds(NaN)).toBe('0:00');
    expect(formatSeconds(null as any)).toBe('0:00');
  });
});

describe('client/utils - extractPlaylistId', () => {
  it('extracts playlist id from playlist URL', () => {
    const url = 'https://www.youtube.com/playlist?list=PL4fGSIFgk8Uk7n216h0rK46Wq_q8U';
    expect(extractPlaylistId(url)).toBe('PL4fGSIFgk8Uk7n216h0rK46Wq_q8U');
  });

  it('extracts playlist id from watch URL with list param', () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDCLAK5uy_k';
    expect(extractPlaylistId(url)).toBe('RDCLAK5uy_k');
  });

  it('returns null when no list param is present', () => {
    expect(extractPlaylistId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(extractPlaylistId('https://example.com')).toBeNull();
    expect(extractPlaylistId('')).toBeNull();
    expect(extractPlaylistId(null as any)).toBeNull();
  });
});

describe('client/utils - extractYouTubeId', () => {
  const validId = 'dQw4w9WgXcQ';

  it('accepts raw 11-character video ID', () => {
    expect(extractYouTubeId(validId)).toBe(validId);
  });

  it('extracts ID from standard youtube.com/watch URL', () => {
    expect(extractYouTubeId(`https://www.youtube.com/watch?v=${validId}`)).toBe(validId);
    expect(extractYouTubeId(`https://www.youtube.com/watch?v=${validId}&feature=emb_title&t=15s`)).toBe(validId);
  });

  it('extracts ID from youtu.be short URL', () => {
    expect(extractYouTubeId(`https://youtu.be/${validId}`)).toBe(validId);
    expect(extractYouTubeId(`https://youtu.be/${validId}?t=10`)).toBe(validId);
  });

  it('extracts ID from music.youtube.com', () => {
    expect(extractYouTubeId(`https://music.youtube.com/watch?v=${validId}`)).toBe(validId);
    expect(extractYouTubeId(`https://music.youtube.com/watch?v=${validId}&list=RDAMVM`)).toBe(validId);
  });

  it('extracts ID from embed and v paths', () => {
    expect(extractYouTubeId(`https://www.youtube.com/embed/${validId}`)).toBe(validId);
    expect(extractYouTubeId(`https://www.youtube.com/v/${validId}`)).toBe(validId);
  });

  it('extracts ID from shorts and live paths', () => {
    expect(extractYouTubeId(`https://www.youtube.com/shorts/${validId}`)).toBe(validId);
    expect(extractYouTubeId(`https://www.youtube.com/live/${validId}`)).toBe(validId);
  });

  it('extracts ID from URLs without protocol scheme', () => {
    expect(extractYouTubeId(`www.youtube.com/watch?v=${validId}`)).toBe(validId);
    expect(extractYouTubeId(`youtu.be/${validId}`)).toBe(validId);
  });

  it('returns null for invalid strings or non-matching URLs', () => {
    expect(extractYouTubeId('')).toBeNull();
    expect(extractYouTubeId(null as any)).toBeNull();
    expect(extractYouTubeId('https://vimeo.com/12345678')).toBeNull();
    expect(extractYouTubeId('not_an_id')).toBeNull();
    expect(extractYouTubeId('12345')).toBeNull();
  });

  it('falls back to regex when URL parsing throws', () => {
    // Malformed URL port causes new URL() to throw TypeError, executing catch fallback
    const malformedUrl = 'https://www.youtube.com:99999999/watch?v=dQw4w9WgXcQ';
    expect(extractYouTubeId(malformedUrl)).toBe('dQw4w9WgXcQ');
  });
});

describe('client/utils - QueueManager', () => {
  const sampleTracks: Track[] = [
    { id: '1', title: 'Song 1', artist: 'Artist 1', duration: 180, durationText: '3:00', thumbnail: 't1.jpg' },
    { id: '2', title: 'Song 2', artist: 'Artist 2', duration: 200, durationText: '3:20', thumbnail: 't2.jpg' },
    { id: '3', title: 'Song 3', artist: 'Artist 3', duration: 240, durationText: '4:00', thumbnail: 't3.jpg' },
  ];

  let qm: QueueManager;

  beforeEach(() => {
    qm = new QueueManager(3);
  });

  it('initializes with empty state', () => {
    expect(qm.length).toBe(0);
    expect(qm.index).toBe(-1);
    expect(qm.getCurrent()).toBeNull();
    expect(qm.next()).toBeNull();
    expect(qm.prev()).toBeNull();
  });

  it('returns null from getCurrent when index is out of bounds', () => {
    qm.setQueue(sampleTracks);
    // Force index out of bounds to test edge check
    (qm as any).currentIndex = 99;
    expect(qm.getCurrent()).toBeNull();
  });

  it('sets queue and clamps starting index', () => {
    const first = qm.setQueue(sampleTracks, 1);
    expect(first?.id).toBe('2');
    expect(qm.length).toBe(3);
    expect(qm.index).toBe(1);
    expect(qm.tracks.length).toBe(3);
    expect(qm.getCurrent()?.id).toBe('2');

    // Clamping past end
    qm.setQueue(sampleTracks, 99);
    expect(qm.index).toBe(2);
    expect(qm.getCurrent()?.id).toBe('3');

    // Empty array
    const emptyResult = qm.setQueue([]);
    expect(emptyResult).toBeNull();
    expect(qm.length).toBe(0);
    expect(qm.index).toBe(-1);
  });

  it('selects valid track index and handles invalid index', () => {
    qm.setQueue(sampleTracks);
    expect(qm.select(2)?.id).toBe('3');
    expect(qm.index).toBe(2);

    expect(qm.select(5)).toBeNull();
    expect(qm.select(-1)).toBeNull();
  });

  it('navigates next and prev cyclically', () => {
    qm.setQueue(sampleTracks, 0);

    expect(qm.next()?.id).toBe('2');
    expect(qm.next()?.id).toBe('3');
    // Wrap around to start
    expect(qm.next()?.id).toBe('1');

    // Prev wrap around to end
    expect(qm.prev()?.id).toBe('3');
    expect(qm.prev()?.id).toBe('2');
  });

  it('prevents infinite loops when tracks fail', () => {
    // 1. Single track in queue fails -> must stop immediately (canContinue: false)
    qm.setQueue([sampleTracks[0]]);
    const res1 = qm.handlePlaybackError();
    expect(res1.canContinue).toBe(false);
    expect(res1.nextTrack).toBeNull();

    // 2. Empty queue error handling
    qm.setQueue([]);
    const resEmpty = qm.handlePlaybackError();
    expect(resEmpty.canContinue).toBe(false);

    // 3. Multi-track queue stops after max consecutive errors
    qm.setQueue(sampleTracks, 0);
    expect(qm.errorCount).toBe(0);

    const err1 = qm.handlePlaybackError();
    expect(err1.canContinue).toBe(true);
    expect(err1.nextTrack?.id).toBe('2');
    expect(qm.errorCount).toBe(1);

    const err2 = qm.handlePlaybackError();
    expect(err2.canContinue).toBe(true);
    expect(err2.nextTrack?.id).toBe('3');
    expect(qm.errorCount).toBe(2);

    // Reaching threshold (3) -> stops infinite recursion
    const err3 = qm.handlePlaybackError();
    expect(err3.canContinue).toBe(false);
    expect(err3.nextTrack).toBeNull();

    // Reset error count restores behavior
    qm.resetErrorCount();
    expect(qm.errorCount).toBe(0);
  });

  it('appends unique tracks and checks hasNext', () => {
    qm.setQueue([sampleTracks[0]]);
    expect(qm.length).toBe(1);
    expect(qm.hasNext()).toBe(false);

    // Appending a duplicate track is ignored
    const addedDup = qm.append(sampleTracks[0]);
    expect(addedDup).toBe(false);
    expect(qm.length).toBe(1);

    // Appending a new track succeeds
    const addedNew = qm.append(sampleTracks[1]);
    expect(addedNew).toBe(true);
    expect(qm.length).toBe(2);
    expect(qm.hasNext()).toBe(true);

    // Appending invalid track
    expect(qm.append({} as any)).toBe(false);

    // appendTracks adds multiple
    const count = qm.appendTracks([sampleTracks[1], sampleTracks[2]]);
    expect(count).toBe(1); // Only sampleTracks[2] was new
    expect(qm.length).toBe(3);

    // Non-looping next(false) returns null at end of queue
    expect(qm.next(false)?.id).toBe('2');
    expect(qm.next(false)?.id).toBe('3');
    expect(qm.next(false)).toBeNull(); // Reached end of queue without looping
    expect(qm.hasNext()).toBe(false);
  });
});

describe('client/utils - HistoryManager', () => {
  const sampleTracks: Track[] = [
    { id: 'track1', title: 'Song 1', artist: 'Artist 1', duration: 180, durationText: '3:00', thumbnail: 'thumb1.jpg' },
    { id: 'track2', title: 'Song 2', artist: 'Artist 2', duration: 200, durationText: '3:20', thumbnail: 'thumb2.jpg' },
    { id: 'track3', title: 'Song 3', artist: 'Artist 3', duration: 240, durationText: '4:00', thumbnail: 'thumb3.jpg' },
  ];

  it('initializes empty or with initial items', () => {
    const hm = new HistoryManager(10);
    expect(hm.length).toBe(0);
    expect(hm.items).toEqual([]);
    expect(hm.getMostRecent()).toBeNull();

    const hmInit = new HistoryManager(10, [{ ...sampleTracks[0], playedAt: 12345 }]);
    expect(hmInit.length).toBe(1);
    expect(hmInit.getMostRecent()?.id).toBe('track1');
  });

  it('adds tracks, moves duplicate to front, and limits max items', () => {
    const hm = new HistoryManager(2);
    hm.add(sampleTracks[0]);
    expect(hm.length).toBe(1);
    expect(hm.getMostRecent()?.id).toBe('track1');

    hm.add(sampleTracks[1]);
    expect(hm.length).toBe(2);
    expect(hm.getMostRecent()?.id).toBe('track2');

    // Adding track1 again should move track1 to the front without duplicates
    hm.add(sampleTracks[0]);
    expect(hm.length).toBe(2);
    expect(hm.getMostRecent()?.id).toBe('track1');
    expect(hm.items[1].id).toBe('track2');

    // Adding track3 should exceed maxItems (2), so oldest (track2) is evicted
    hm.add(sampleTracks[2]);
    expect(hm.length).toBe(2);
    expect(hm.items.map((i) => i.id)).toEqual(['track3', 'track1']);
  });

  it('throws on invalid track addition', () => {
    const hm = new HistoryManager();
    expect(() => hm.add({} as any)).toThrow('Invalid track');
    expect(() => hm.add(null as any)).toThrow('Invalid track');
  });

  it('removes tracks and clears history', () => {
    const hm = new HistoryManager();
    hm.add(sampleTracks[0]);
    hm.add(sampleTracks[1]);

    expect(hm.remove('non-existent')).toBe(false);
    expect(hm.remove('track1')).toBe(true);
    expect(hm.length).toBe(1);
    expect(hm.items[0].id).toBe('track2');

    hm.clear();
    expect(hm.length).toBe(0);
    expect(hm.getMostRecent()).toBeNull();
  });

  it('serializes to and from JSON', () => {
    const hm = new HistoryManager(10);
    hm.add(sampleTracks[0]);
    const json = hm.toJSON();
    expect(typeof json).toBe('string');

    const restored = HistoryManager.fromJSON(json);
    expect(restored.length).toBe(1);
    expect(restored.getMostRecent()?.id).toBe('track1');

    // Handles corrupt JSON safely
    const fallback = HistoryManager.fromJSON('invalid json{}');
    expect(fallback.length).toBe(0);
  });
});
