import { buildApp } from './app.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  const { fastify, getYt } = await buildApp();
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`[INFO] Server running at http://${HOST}:${PORT}`);
    getYt().catch((err) => console.error('[ERROR] Background Innertube init failed:', err));
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[WARNING] Port ${PORT} is already in use by another instance. Exiting.`);
      process.exit(0);
    }
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
