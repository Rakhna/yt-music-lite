import { buildApp } from './app.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1';

async function start() {
  const { fastify, getYt } = await buildApp();
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`[INFO] Server running at http://${HOST}:${PORT}`);
    getYt().catch((err) => console.error('[ERROR] Background Innertube init failed:', err));
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
