import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { buildApp } from '../../server/app.js';

describe('server/app - Fastify API routes', () => {
  let mockYt;
  let authEmitter;

  beforeEach(() => {
    authEmitter = new EventEmitter();
    authEmitter.logged_in = false;
    authEmitter.signIn = vi.fn().mockResolvedValue({});

    mockYt = {
      session: authEmitter,
      getSearchSuggestions: vi.fn().mockResolvedValue(['bohemian rhapsody', 'queen']),
      music: {
        search: vi.fn().mockResolvedValue({
          contents: [
            {
              id: 'fJ9rUzIMcZQ',
              title: 'Bohemian Rhapsody',
              artists: [{ name: 'Queen' }],
              album: { name: 'A Night at the Opera' },
              duration: { seconds: 355, text: '5:55' },
              thumbnail: [{ url: 'https://i.ytimg.com/thumb.jpg' }],
            },
            {
              // Track without artists array but with author
              id: 'solo1',
              title: 'Solo Performance',
              author: { name: 'Solo Artist' },
              duration: 120,
            },
            {
              // Track without id (should be ignored)
              title: 'Invalid No ID',
            },
          ],
        }),
      },
      search: vi.fn().mockResolvedValue({
        videos: [
          {
            id: 'general1',
            title: { text: 'Bohemian Rhapsody Live' },
            author: { name: 'Queen Official' },
            duration: 360,
            thumbnails: [{ url: 'https://i.ytimg.com/live.jpg' }],
          },
          {
            // Video without author or title object
            id: 'general2',
            duration: '02:30',
          },
        ],
      }),
      getBasicInfo: vi.fn().mockResolvedValue({
        basic_info: {
          title: 'Track Title',
          author: 'Artist Name',
          duration: 210,
          thumbnail: [{ url: 'https://i.ytimg.com/track.jpg' }],
          view_count: 1000000,
        },
      }),
      getPlaylist: vi.fn().mockResolvedValue({
        info: {
          title: 'Top Hits',
          author: { name: 'Curator' },
        },
        videos: [
          {
            id: 'v1',
            title: 'Song One',
            author: { name: 'Artist One' },
            duration: { seconds: 180, text: '3:00' },
            thumbnails: [{ url: 'https://i.ytimg.com/v1.jpg' }],
          },
          {
            // Content ID instead of id
            content_id: 'v2',
            title: { text: 'Song Two' },
            duration: 150,
          },
          {
            // Video without id
            title: 'Invalid Video',
          },
        ],
      }),
      getInfo: vi.fn().mockResolvedValue({
        watch_next_feed: [
          {
            id: 'rel1',
            title: { text: 'Related Song 1' },
            author: { name: 'Related Artist 1' },
            duration: { seconds: 200, text: '3:20' },
            thumbnails: [{ url: 'https://i.ytimg.com/rel1.jpg' }],
          },
          {
            content_id: 'rel2',
            title: 'Related Song 2',
            duration: 180,
          },
          {
            // Invalid item without id
            title: 'No ID Item',
          },
          {
            // Current song itself (should be skipped)
            id: 'testVid',
            title: 'Current Song',
          },
        ],
      }),
    };
  });

  it('initializes YouTube client lazily with createClient', async () => {
    const createClientMock = vi.fn().mockResolvedValue(mockYt);
    const { fastify } = await buildApp({
      createClient: createClientMock,
      skipStatic: true,
    });

    const res = await fastify.inject({ method: 'GET', url: '/api/suggestions?q=rock' });
    expect(res.statusCode).toBe(200);
    expect(createClientMock).toHaveBeenCalledTimes(1);

    // Second call reuses the instance
    await fastify.inject({ method: 'GET', url: '/api/suggestions?q=pop' });
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });

  it('handles client initialization failure', async () => {
    const failingCreate = vi.fn().mockRejectedValue(new Error('Innertube failure'));
    const { fastify } = await buildApp({
      createClient: failingCreate,
      skipStatic: true,
    });

    const res = await fastify.inject({ method: 'GET', url: '/api/suggestions?q=fail' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  it('verifies CORS protection', async () => {
    const { fastify } = await buildApp({
      ytInstance: mockYt,
      skipStatic: true,
      allowedOrigins: ['http://localhost:3000'],
    });

    // Forbidden origin
    const forbiddenRes = await fastify.inject({
      method: 'GET',
      url: '/api/health',
      headers: {
        origin: 'http://malicious-website.com',
      },
    });
    expect(forbiddenRes.statusCode).toBe(500);

    // Permitted origin
    const allowedRes = await fastify.inject({
      method: 'GET',
      url: '/api/health',
      headers: {
        origin: 'http://localhost:3000',
      },
    });
    expect(allowedRes.statusCode).toBe(200);

    // Direct request without origin
    const directRes = await fastify.inject({
      method: 'GET',
      url: '/api/health',
    });
    expect(directRes.statusCode).toBe(200);
  });

  it('GET /api/health returns system health', async () => {
    const { fastify } = await buildApp({ ytInstance: mockYt, skipStatic: true });
    const res = await fastify.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
  });

  it('GET /api/suggestions returns search suggestions and handles errors', async () => {
    const { fastify } = await buildApp({ ytInstance: mockYt, skipStatic: true });

    const emptyRes = await fastify.inject({ method: 'GET', url: '/api/suggestions?q=' });
    expect(JSON.parse(emptyRes.body)).toEqual([]);

    const res = await fastify.inject({ method: 'GET', url: '/api/suggestions?q=bohemian' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(['bohemian rhapsody', 'queen']);

    // Second call hits cache
    const cachedRes = await fastify.inject({ method: 'GET', url: '/api/suggestions?q=bohemian' });
    expect(JSON.parse(cachedRes.body)).toEqual(['bohemian rhapsody', 'queen']);

    // Error returns []
    mockYt.getSearchSuggestions.mockRejectedValueOnce(new Error('Network error'));
    const errRes = await fastify.inject({ method: 'GET', url: '/api/suggestions?q=error' });
    expect(JSON.parse(errRes.body)).toEqual([]);
  });

  it('GET /api/search parses results and backfills', async () => {
    const { fastify } = await buildApp({ ytInstance: mockYt, skipStatic: true });

    const emptyRes = await fastify.inject({ method: 'GET', url: '/api/search?q=' });
    expect(JSON.parse(emptyRes.body)).toEqual({ results: [] });

    const res = await fastify.inject({ method: 'GET', url: '/api/search?q=queen' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results.length).toBe(4);
    expect(body.results[0].id).toBe('fJ9rUzIMcZQ');
    expect(body.results[0].source).toBe('ytmusic');
    expect(body.results[1].id).toBe('solo1');
    expect(body.results[1].artist).toBe('Solo Artist');

    // Cached search hit
    const cachedRes = await fastify.inject({ method: 'GET', url: '/api/search?q=queen' });
    expect(JSON.parse(cachedRes.body).results.length).toBe(4);

    // Search failure handler
    mockYt.music.search.mockRejectedValueOnce(new Error('YT Music down'));
    mockYt.search.mockRejectedValueOnce(new Error('YT API down'));
    const failRes = await fastify.inject({ method: 'GET', url: '/api/search?q=crash' });
    expect(failRes.statusCode).toBe(500);
  });

  it('GET /api/info/:id returns track information and fallback on error', async () => {
    const { fastify } = await buildApp({ ytInstance: mockYt, skipStatic: true });

    const res = await fastify.inject({ method: 'GET', url: '/api/info/fJ9rUzIMcZQ' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe('fJ9rUzIMcZQ');
    expect(body.title).toBe('Track Title');

    // Fallback on error
    mockYt.getBasicInfo.mockRejectedValueOnce(new Error('Video unavailable'));
    const errRes = await fastify.inject({ method: 'GET', url: '/api/info/unavailable12' });
    expect(errRes.statusCode).toBe(200);
    const errBody = JSON.parse(errRes.body);
    expect(errBody.id).toBe('unavailable12');
    expect(errBody.title).toBe('YouTube Track');
  });

  it('GET /api/playlist/:id returns playlist data and handles errors', async () => {
    const { fastify } = await buildApp({ ytInstance: mockYt, skipStatic: true });

    const res = await fastify.inject({ method: 'GET', url: '/api/playlist/PL123' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe('PL123');
    expect(body.title).toBe('Top Hits');
    expect(body.videos.length).toBe(2);
    expect(body.videos[0].title).toBe('Song One');
    expect(body.videos[1].id).toBe('v2');

    // Playlist error
    mockYt.getPlaylist.mockRejectedValueOnce(new Error('Playlist not found'));
    const errRes = await fastify.inject({ method: 'GET', url: '/api/playlist/PL_notfound' });
    expect(errRes.statusCode).toBe(500);
  });

  it('GET /api/related/:id returns related tracks and handles errors and caching', async () => {
    const { fastify } = await buildApp({
      ytInstance: mockYt,
      skipStatic: true,
    });

    const res = await fastify.inject({ method: 'GET', url: '/api/related/testVid' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.id).toBe('testVid');
    expect(body.results.length).toBe(2);
    expect(body.results[0].id).toBe('rel1');
    expect(body.results[0].title).toBe('Related Song 1');
    expect(body.results[1].id).toBe('rel2');

    // Caching check
    const cachedRes = await fastify.inject({ method: 'GET', url: '/api/related/testVid' });
    expect(cachedRes.statusCode).toBe(200);
    expect(mockYt.getInfo).toHaveBeenCalledTimes(1);

    // Error fallback
    mockYt.getInfo.mockRejectedValueOnce(new Error('Related failed'));
    const errRes = await fastify.inject({ method: 'GET', url: '/api/related/errorVid' });
    expect(errRes.statusCode).toBe(200);
    const errBody = JSON.parse(errRes.body);
    expect(errBody.results).toEqual([]);
  });

  it('GET /api/auth/status and POST /api/auth/start flows', async () => {
    const { fastify } = await buildApp({
      ytInstance: mockYt,
      skipStatic: true,
      authTimeoutMs: 100,
    });

    const st1 = await fastify.inject({ method: 'GET', url: '/api/auth/status' });
    expect(JSON.parse(st1.body)).toEqual({ loggedIn: false, pending: false });

    // Already logged in case
    authEmitter.logged_in = true;
    const authAlready = await fastify.inject({ method: 'POST', url: '/api/auth/start' });
    expect(JSON.parse(authAlready.body)).toEqual({ loggedIn: true, message: 'Already logged in' });

    // Normal device code flow
    authEmitter.logged_in = false;
    const startPromise = fastify.inject({ method: 'POST', url: '/api/auth/start' });

    setTimeout(() => {
      authEmitter.emit('auth-pending', {
        user_code: 'ABCD-1234',
        verification_url: 'https://www.google.com/device',
        expires_in: 300,
      });
    }, 20);

    const startRes = await startPromise;
    expect(startRes.statusCode).toBe(200);
    expect(JSON.parse(startRes.body).userCode).toBe('ABCD-1234');

    // Emit auth success event to test onAuth listener
    authEmitter.emit('auth');

    // Timeout waiting for device code
    const timeoutPromise = fastify.inject({ method: 'POST', url: '/api/auth/start' });
    const timeoutRes = await timeoutPromise;
    expect(JSON.parse(timeoutRes.body)).toEqual({ error: 'Timeout waiting for device code' });
  });

  it('handles auth error when session is invalid', async () => {
    const brokenYt = { session: null };
    const { fastify } = await buildApp({ ytInstance: brokenYt, skipStatic: true });

    const statusRes = await fastify.inject({ method: 'GET', url: '/api/auth/status' });
    expect(JSON.parse(statusRes.body)).toEqual({ loggedIn: false, pending: false });

    const startRes = await fastify.inject({ method: 'POST', url: '/api/auth/start' });
    expect(startRes.statusCode).toBe(500);
    expect(JSON.parse(startRes.body)).toEqual({ error: 'No YouTube session available' });
  });

  it('handles signIn rejection and unexpected auth exceptions', async () => {
    // 1. signIn rejection handled gracefully
    authEmitter.signIn = vi.fn().mockRejectedValueOnce(new Error('Sign in failed'));
    const { fastify } = await buildApp({ ytInstance: mockYt, skipStatic: true, authTimeoutMs: 50 });
    const res = await fastify.inject({ method: 'POST', url: '/api/auth/start' });
    expect(res.statusCode).toBe(200);

    // 2. Exception in auth/start endpoint
    const throwingYt = {
      get session() {
        throw new Error('Fatal session error');
      },
    };
    const { fastify: throwingFastify } = await buildApp({ ytInstance: throwingYt, skipStatic: true });
    const crashRes = await throwingFastify.inject({ method: 'POST', url: '/api/auth/start' });
    expect(crashRes.statusCode).toBe(500);
    expect(JSON.parse(crashRes.body)).toEqual({ error: 'Fatal session error' });
  });

  it('returns 404 for unknown routes and serves static fallback if configured', async () => {
    const { fastify } = await buildApp({ ytInstance: mockYt, skipStatic: true });

    const api404 = await fastify.inject({ method: 'GET', url: '/api/nonexistent-route' });
    expect(api404.statusCode).toBe(404);
    expect(JSON.parse(api404.body)).toEqual({ error: 'Endpoint not found' });

    const generic404 = await fastify.inject({ method: 'GET', url: '/does-not-exist' });
    expect(generic404.statusCode).toBe(404);
  });

  it('handles static files when skipStatic is false', async () => {
    const { fastify } = await buildApp({ ytInstance: mockYt, skipStatic: false });

    // Requesting root index page
    const res = await fastify.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');

    // Unknown client route falls back to index.html (SPA)
    const spaRes = await fastify.inject({ method: 'GET', url: '/app/player' });
    expect(spaRes.statusCode).toBe(200);
    expect(spaRes.headers['content-type']).toContain('text/html');
  });

  it('handles remote TV control endpoints (/api/remote/* and /remote)', async () => {
    const { fastify } = await buildApp({ ytInstance: mockYt, skipStatic: true });

    // 1. Remote info
    const infoRes = await fastify.inject({ method: 'GET', url: '/api/remote/info' });
    expect(infoRes.statusCode).toBe(200);
    const infoBody = JSON.parse(infoRes.body);
    expect(infoBody.ip).toBeDefined();
    expect(infoBody.port).toBe(3000);
    expect(infoBody.url).toContain('/remote');

    // 2. Remote state (get and set)
    const initSt = await fastify.inject({ method: 'GET', url: '/api/remote/state' });
    expect(initSt.statusCode).toBe(200);
    expect(JSON.parse(initSt.body).isPlaying).toBe(false);

    const updateSt = await fastify.inject({
      method: 'POST',
      url: '/api/remote/state',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPlaying: true, volume: 90, currentTrack: { id: 'track1', title: 'Remote Song' } }),
    });
    expect(updateSt.statusCode).toBe(200);

    const checkSt = await fastify.inject({ method: 'GET', url: '/api/remote/state' });
    const checkBody = JSON.parse(checkSt.body);
    expect(checkBody.isPlaying).toBe(true);
    expect(checkBody.volume).toBe(90);
    expect(checkBody.currentTrack?.title).toBe('Remote Song');

    // 3. Remote command (send and consume)
    const cmdRes = await fastify.inject({
      method: 'POST',
      url: '/api/remote/command',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'next' }),
    });
    expect(cmdRes.statusCode).toBe(200);
    expect(JSON.parse(cmdRes.body).success).toBe(true);

    // Invalid command without action
    const badCmd = await fastify.inject({
      method: 'POST',
      url: '/api/remote/command',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(badCmd.statusCode).toBe(400);

    // Fetch and drain commands
    const cmdsRes = await fastify.inject({ method: 'GET', url: '/api/remote/commands' });
    expect(cmdsRes.statusCode).toBe(200);
    const cmdsBody = JSON.parse(cmdsRes.body);
    expect(cmdsBody.commands.length).toBe(1);
    expect(cmdsBody.commands[0].action).toBe('next');

    // Next fetch returns empty
    const cmdsEmpty = await fastify.inject({ method: 'GET', url: '/api/remote/commands' });
    expect(JSON.parse(cmdsEmpty.body).commands.length).toBe(0);

    // 4. GET /remote HTML interface
    const remotePage = await fastify.inject({ method: 'GET', url: '/remote' });
    expect(remotePage.statusCode).toBe(200);
    expect(remotePage.headers['content-type']).toContain('text/html');

    // 5. GET /api/cast/info
    const castInfoRes = await fastify.inject({ method: 'GET', url: '/api/cast/info' });
    expect(castInfoRes.statusCode).toBe(200);
    const castInfo = JSON.parse(castInfoRes.body);
    expect(castInfo.deviceName).toBe('YT Mini Player');
    expect(castInfo).toHaveProperty('enabled');
    expect(castInfo).toHaveProperty('pairingCode');
  });

  it('handles /api/update/check and /api/update/apply endpoints', async () => {
    const mockCheck = vi.fn().mockResolvedValue({
      updateAvailable: true,
      commitsBehind: 2,
      summary: 'feat: add auto updater',
    });
    const mockApply = vi.fn().mockResolvedValue({
      success: true,
      message: 'Actualizado con éxito',
    });

    const { fastify } = await buildApp({
      checkForUpdates: mockCheck,
      applyUpdate: mockApply,
      skipStatic: true,
      enableCast: false,
    });

    const checkRes = await fastify.inject({ method: 'GET', url: '/api/update/check' });
    expect(checkRes.statusCode).toBe(200);
    const checkData = JSON.parse(checkRes.body);
    expect(checkData.updateAvailable).toBe(true);
    expect(checkData.commitsBehind).toBe(2);
    expect(mockCheck).toHaveBeenCalled();

    const applyRes = await fastify.inject({ method: 'POST', url: '/api/update/apply' });
    expect(applyRes.statusCode).toBe(200);
    const applyData = JSON.parse(applyRes.body);
    expect(applyData.success).toBe(true);
    expect(applyData.message).toContain('Actualizado con éxito');
    expect(mockApply).toHaveBeenCalled();
  });
});


