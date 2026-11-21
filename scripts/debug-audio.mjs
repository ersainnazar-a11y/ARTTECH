// Отладка аудиоанализа: грузит wav в странице и вызывает analyzeAudio напрямую.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const server = await createServer({ server: { port: 5198, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
page.on('console', m => console.log('[console]', m.type(), m.text()));
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('worker', w => { console.log('[worker started]', w.url()); });
await page.goto('http://localhost:5198/');
for (const f of process.argv.slice(2)) {
  const b64 = (await readFile(f)).toString('base64');
  const t0 = Date.now();
  const res = await page.evaluate(async b64 => {
    try {
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const m = await import('/src/analysis/song-meta.ts');
      const r = await Promise.race([m.analyzeAudio(bin.buffer), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 60s')), 60000))]);
      const f = r.features;
      return { bpm: f.bpm, key: f.key, scale: f.scale, energy: f.energy, brightness: f.brightness, dance: f.danceability, beats: f.beats.length, first: f.beats.slice(0, 4), conf: r.confidence, dur: r.duration };
    } catch (e) { return { error: String(e && e.stack || e) }; }
  }, b64);
  console.log(f, Date.now() - t0, 'ms', JSON.stringify(res));
}
await browser.close();
await server.close();
