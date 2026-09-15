import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { LRUCache } from '../server/utils.js';

const SERVER_URL = 'http://127.0.0.1:3000';

async function measureEndpoint(url, iterations = 200) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    const res = await fetch(url);
    await res.text();
    const t1 = performance.now();
    times.push(t1 - t0);
  }

  times.sort((a, b) => a - b);
  const avg = times.reduce((s, x) => s + x, 0) / times.length;
  const p50 = times[Math.floor(times.length * 0.50)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];
  const min = times[0];
  const max = times[times.length - 1];

  return { iterations, avg, p50, p95, p99, min, max };
}

function benchmarkLRU() {
  const cache = new LRUCache(1000, 60000);
  const totalOps = 100000;

  const t0 = performance.now();
  for (let i = 0; i < totalOps; i++) {
    cache.set(`key_${i % 2000}`, { id: i, data: 'sample' });
    cache.get(`key_${(i * 3) % 2000}`);
  }
  const t1 = performance.now();
  const elapsedSec = (t1 - t0) / 1000;
  const opsPerSec = Math.floor((totalOps * 2) / elapsedSec);

  return { totalOps: totalOps * 2, elapsedMs: t1 - t0, opsPerSec };
}

function analyzeBundle() {
  const distDir = path.resolve('dist/client/assets');
  if (!fs.existsSync(distDir)) return [];

  const files = fs.readdirSync(distDir);
  const stats = [];

  for (const file of files) {
    const fullPath = path.join(distDir, file);
    const content = fs.readFileSync(fullPath);
    const rawBytes = content.length;
    const gzipped = zlib.gzipSync(content).length;

    stats.push({
      file,
      rawKb: (rawBytes / 1024).toFixed(2),
      gzipKb: (gzipped / 1024).toFixed(2),
    });
  }

  const htmlPath = path.resolve('dist/client/index.html');
  if (fs.existsSync(htmlPath)) {
    const content = fs.readFileSync(htmlPath);
    stats.unshift({
      file: 'index.html',
      rawKb: (content.length / 1024).toFixed(2),
      gzipKb: (zlib.gzipSync(content).length / 1024).toFixed(2),
    });
  }

  return stats;
}

async function run() {
  console.log('--- 1. BENCHMARK DE MEMORIA DE SERVIDOR ---');
  try {
    const healthRes = await fetch(`${SERVER_URL}/api/health`);
    const health = await healthRes.json();
    console.log(`Uptime: ${health.uptime.toFixed(1)}s`);
    console.log(`RSS: ${(health.memory.rss / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Heap Total: ${(health.memory.heapTotal / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Heap Used: ${(health.memory.heapUsed / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`External: ${(health.memory.external / (1024 * 1024)).toFixed(2)} MB`);
  } catch (err) {
    console.log('[WARNING] Servidor no disponible en puerto 3000');
  }

  console.log('\n--- 2. BENCHMARK DE LATENCIA DE RED LOCAL (200 reqs) ---');
  try {
    const healthStats = await measureEndpoint(`${SERVER_URL}/api/health`, 200);
    console.log(`GET /api/health:`);
    console.log(`  Promedio: ${healthStats.avg.toFixed(2)} ms`);
    console.log(`  p50 (Mediana): ${healthStats.p50.toFixed(2)} ms`);
    console.log(`  p95: ${healthStats.p95.toFixed(2)} ms`);
    console.log(`  p99: ${healthStats.p99.toFixed(2)} ms`);
    console.log(`  Throughput aprox: ${(1000 / healthStats.avg).toFixed(0)} req/sec (serial)`);
  } catch (e) {
    console.log('Error midiendo health:', e.message);
  }

  console.log('\n--- 3. RENDIMIENTO DE LA CACHÉ LRU (100k ciclos set/get) ---');
  const lruStats = benchmarkLRU();
  console.log(`Operaciones totales: ${lruStats.totalOps}`);
  console.log(`Tiempo total: ${lruStats.elapsedMs.toFixed(2)} ms`);
  console.log(`Rendimiento: ${lruStats.opsPerSec.toLocaleString()} ops/seg`);

  console.log('\n--- 4. TAMAÑO DE PAQUETE COMPILADO (PRODUCCIÓN) ---');
  const bundle = analyzeBundle();
  for (const b of bundle) {
    console.log(`- ${b.file}: ${b.rawKb} KB (Gzip: ${b.gzipKb} KB)`);
  }
}

run();
