import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { Innertube } from 'youtubei.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { LRUCache, parseDuration, formatSeconds } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

export async function buildApp(options = {}) {
  const fastify = Fastify({
    logger: options.logger ?? false,
  });

  const allowedOrigins = options.allowedOrigins || [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ];

  await fastify.register(cors, {
    origin: (origin, cb) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        origin.startsWith('http://192.168.') ||
        origin.startsWith('http://10.') ||
        origin.startsWith('http://172.')
      ) {
        cb(null, true);
        return;
      }
      cb(new Error('Not allowed by CORS'), false);
    },
  });

  let ytInstance = options.ytInstance || null;
  let ytInitPromise = null;
  const createClient = options.createClient || (() => Innertube.create());

  async function getYt() {
    if (ytInstance) return ytInstance;
    if (ytInitPromise) return ytInitPromise;

    ytInitPromise = (async () => {
      try {
        ytInstance = await createClient();
        return ytInstance;
      } catch (err) {
        console.error('[ERROR] Failed to initialize Innertube client:', err.message);
        ytInitPromise = null;
        throw err;
      }
    })();

    return ytInitPromise;
  }

  const searchCache = new LRUCache(options.cacheSize ?? 50, options.cacheTtl ?? 10 * 60 * 1000);
  const infoCache = new LRUCache(options.cacheSize ?? 50, options.cacheTtl ?? 10 * 60 * 1000);
  const playlistCache = new LRUCache(options.cacheSize ?? 30, options.cacheTtl ?? 10 * 60 * 1000);
  const relatedCache = new LRUCache(options.cacheSize ?? 50, options.cacheTtl ?? 10 * 60 * 1000);

  fastify.get('/api/health', async () => {
    return {
      status: 'ok',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  });

  fastify.get('/api/suggestions', async (req) => {
    const query = (req.query.q || '').trim();
    if (!query) return [];

    const cacheKey = `sug:${query}`;
    const cached = searchCache.get(cacheKey);
    if (cached) return cached;

    try {
      const yt = await getYt();
      const suggestions = await yt.getSearchSuggestions(query);
      searchCache.set(cacheKey, suggestions);
      return suggestions;
    } catch (err) {
      console.error('[ERROR] suggestions failed:', err.message);
      return [];
    }
  });

  fastify.get('/api/search', async (req, reply) => {
    const query = (req.query.q || '').trim();
    const type = req.query.type || 'songs';

    if (!query) {
      return { results: [] };
    }

    const cacheKey = `search:${type}:${query}`;
    const cached = searchCache.get(cacheKey);
    if (cached) return cached;

    try {
      const yt = await getYt();
      const results = [];

      try {
        const musicSearch = await yt.music?.search(query, { type: 'song' });
        const items = musicSearch?.contents || [];

        for (const item of items) {
          if (!item.id) continue;
          const dur = parseDuration(item.duration);
          const artist = Array.isArray(item.artists)
            ? item.artists.map((a) => a.name).filter(Boolean).join(', ')
            : (item.author?.name || 'Unknown Artist');
          const album = item.album?.name || '';
          const thumb = item.thumbnail?.[0]?.url ||
            `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`;

          results.push({
            id: item.id,
            title: item.title || 'Untitled',
            artist,
            album,
            duration: dur.seconds,
            durationText: dur.text,
            thumbnail: thumb,
            source: 'ytmusic',
          });
        }
      } catch (e) {
        console.warn('[WARNING] Music search warning:', e.message);
      }

      if (results.length < 5 && yt.search) {
        const generalSearch = await yt.search(query);
        const videos = generalSearch?.videos || [];

        for (const v of videos) {
          if (!v.id || results.some((r) => r.id === v.id)) continue;
          const dur = parseDuration(v.duration);
          const thumb = v.thumbnails?.[0]?.url ||
            `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;

          results.push({
            id: v.id,
            title: v.title?.text || v.title || 'Untitled',
            artist: v.author?.name || 'Unknown Artist',
            album: '',
            duration: dur.seconds,
            durationText: dur.text,
            thumbnail: thumb,
            source: 'youtube',
          });
        }
      }

      const payload = { results };
      searchCache.set(cacheKey, payload);
      return payload;
    } catch (err) {
      console.error('[ERROR] Search failed:', err.message);
      return reply.status(500).send({ error: 'Search failed', message: err.message });
    }
  });

  fastify.get('/api/info/:id', async (req, reply) => {
    const { id } = req.params;
    if (!id) {
      return reply.status(400).send({ error: 'Missing video id' });
    }

    const cacheKey = `info:${id}`;
    const cached = infoCache.get(cacheKey);
    if (cached) return cached;

    try {
      const yt = await getYt();
      const info = await yt.getBasicInfo(id);
      const basic = info?.basic_info;

      const durSeconds = typeof basic?.duration === 'number' ? basic.duration : parseDuration(basic?.duration).seconds;

      const payload = {
        id,
        title: basic?.title || 'Unknown Title',
        artist: basic?.author || 'Unknown Artist',
        duration: durSeconds,
        durationText: formatSeconds(durSeconds),
        thumbnail: basic?.thumbnail?.[0]?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        viewCount: basic?.view_count || 0,
      };

      infoCache.set(cacheKey, payload);
      return payload;
    } catch (err) {
      console.error(`[ERROR] Info failed for ${id}:`, err.message);
      return {
        id,
        title: 'YouTube Track',
        artist: 'Unknown Artist',
        duration: 0,
        durationText: '0:00',
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      };
    }
  });

  fastify.get('/api/playlist/:id', async (req, reply) => {
    const { id } = req.params;
    if (!id) {
      return reply.status(400).send({ error: 'Missing playlist id' });
    }

    const cacheKey = `pl:${id}`;
    const cached = playlistCache.get(cacheKey);
    if (cached) return cached;

    try {
      const yt = await getYt();
      const playlist = await yt.getPlaylist(id);
      const videos = [];

      for (const v of playlist?.videos || []) {
        const vid = v.id || v.content_id;
        if (!vid) continue;
        const title = v.title?.text || v.title || v.metadata?.title?.text || 'Untitled Track';
        const artist = v.author?.name || v.metadata?.metadata?.metadata_rows?.[0]?.metadata_parts?.[0]?.text?.text || playlist.info?.author?.name || 'YouTube';
        const dur = parseDuration(v.duration);
        const thumb = v.thumbnails?.[0]?.url || v.content_image?.image?.[0]?.url || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;

        videos.push({
          id: vid,
          title,
          artist,
          duration: dur.seconds,
          durationText: dur.text,
          thumbnail: thumb,
        });
      }

      const payload = {
        id,
        title: playlist?.info?.title || 'Playlist',
        author: playlist?.info?.author?.name || 'YouTube',
        totalVideos: videos.length,
        videos,
      };

      playlistCache.set(cacheKey, payload);
      return payload;
    } catch (err) {
      console.error(`[ERROR] Playlist ${id} fetch error:`, err.message);
      return reply.status(500).send({ error: 'Failed to fetch playlist', message: err.message });
    }
  });

  fastify.get('/api/related/:id', async (req, reply) => {
    const { id } = req.params;
    if (!id) {
      return reply.status(400).send({ error: 'Missing video id' });
    }

    const cacheKey = `rel:${id}`;
    const cached = relatedCache.get(cacheKey);
    if (cached) return cached;

    try {
      const yt = await getYt();
      const info = await yt.getInfo(id);
      const results = [];

      for (const v of info?.watch_next_feed || []) {
        const vid = v.id || v.content_id;
        if (!vid || vid === id) continue;

        const title = v.title?.text || v.title || v.metadata?.title?.text || 'Untitled Track';
        const artist = v.author?.name || v.metadata?.metadata?.metadata_rows?.[0]?.metadata_parts?.[0]?.text?.text || v.short_byline_text?.text || 'YouTube';
        const durSeconds = typeof v.duration?.seconds === 'number' ? v.duration.seconds : parseDuration(v.duration).seconds;
        const durText = v.duration?.text || formatSeconds(durSeconds);
        const thumb = v.thumbnails?.[0]?.url || v.content_image?.image?.[0]?.url || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;

        results.push({
          id: vid,
          title,
          artist,
          duration: durSeconds,
          durationText: durText,
          thumbnail: thumb,
        });
      }

      const payload = { id, results };
      relatedCache.set(cacheKey, payload);
      return payload;
    } catch (err) {
      console.error(`[ERROR] Related fetch error for ${id}:`, err.message);
      return { id, results: [] };
    }
  });

  let pendingAuth = null;

  fastify.get('/api/auth/status', async () => {
    try {
      const yt = await getYt();
      return {
        loggedIn: !!yt?.session?.logged_in,
        pending: !!pendingAuth,
      };
    } catch (e) {
      return { loggedIn: false, pending: false };
    }
  });

  fastify.post('/api/auth/start', async (req, reply) => {
    try {
      const yt = await getYt();
      if (!yt?.session) {
        return reply.status(500).send({ error: 'No YouTube session available' });
      }
      if (yt.session.logged_in) {
        return { loggedIn: true, message: 'Already logged in' };
      }

      pendingAuth = null;

      return new Promise((resolve) => {
        let timer = null;

        const onPending = (data) => {
          pendingAuth = data;
          cleanupListeners();
          resolve({
            userCode: data.user_code,
            verificationUrl: data.verification_url,
            expiresIn: data.expires_in,
          });
        };

        const onAuth = () => {
          pendingAuth = null;
          cleanupListeners();
          console.log('[INFO] Successfully authenticated with Google account');
        };

        function cleanupListeners() {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          if (typeof yt.session?.off === 'function') {
            yt.session.off('auth-pending', onPending);
            yt.session.off('auth', onAuth);
          }
        }

        yt.session.once('auth-pending', onPending);
        yt.session.once('auth', onAuth);

        yt.session.signIn?.().catch((err) => {
          console.warn('[WARNING] signIn catch:', err.message);
        });

        const authTimeoutMs = options.authTimeoutMs ?? 5000;
        timer = setTimeout(() => {
          cleanupListeners();
          resolve({ error: 'Timeout waiting for device code' });
        }, authTimeoutMs);
      });
    } catch (err) {
      console.error('[ERROR] Auth start error:', err.message);
      return reply.status(500).send({ error: err.message });
    }
  });

  // Mobile Web Remote Control API
  let remotePlayerState = {
    isPlaying: false,
    currentTrack: null,
    currentTime: 0,
    duration: 0,
    volume: 80,
    isMuted: false,
    autoplay: true,
  };
  let pendingRemoteCommands = [];

  fastify.get('/remote', async (req, reply) => {
    const distPath = path.resolve(__dirname, '../dist/client/remote.html');
    const srcPath = path.resolve(__dirname, '../client/remote.html');
    const remotePath = fs.existsSync(distPath) ? distPath : srcPath;
    if (fs.existsSync(remotePath)) {
      return reply.type('text/html').send(fs.readFileSync(remotePath, 'utf8'));
    }
    return reply.status(404).send({ error: 'Remote interface not found' });
  });

  fastify.get('/api/remote/info', async () => {
    const ip = getLocalIp();
    const port = options.port || 3000;
    return {
      ip,
      port,
      url: `http://${ip}:${port}/remote`,
    };
  });

  fastify.get('/api/remote/state', async () => {
    return remotePlayerState;
  });

  fastify.post('/api/remote/state', async (req) => {
    if (req.body && typeof req.body === 'object') {
      remotePlayerState = {
        ...remotePlayerState,
        ...req.body,
      };
    }
    return { success: true };
  });

  fastify.post('/api/remote/command', async (req, reply) => {
    const { action, data } = req.body || {};
    if (!action) {
      return reply.status(400).send({ error: 'Missing action' });
    }
    const cmd = { id: Date.now() + Math.random(), action, data };
    pendingRemoteCommands.push(cmd);
    if (pendingRemoteCommands.length > 20) {
      pendingRemoteCommands.shift();
    }
    return { success: true, commandId: cmd.id };
  });

  fastify.get('/api/remote/commands', async () => {
    const cmds = [...pendingRemoteCommands];
    pendingRemoteCommands = [];
    return { commands: cmds };
  });

  const distPath = path.resolve(__dirname, '../dist/client');
  if (fs.existsSync(distPath) && !options.skipStatic) {
    fastify.register(fastifyStatic, {
      root: distPath,
      prefix: '/',
    });
  }

  fastify.setNotFoundHandler((req, reply) => {
    if (req.raw.url && req.raw.url.startsWith('/api')) {
      return reply.status(404).send({ error: 'Endpoint not found' });
    }
    if (fs.existsSync(distPath) && !options.skipStatic) {
      return reply.sendFile('index.html');
    }
    return reply.status(404).send({ error: 'Not found' });
  });

  return { fastify, searchCache, infoCache, playlistCache, relatedCache, getYt };
}
