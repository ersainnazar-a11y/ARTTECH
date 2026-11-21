// Проверка фазы 5: видео (реальное время и офлайн MP4), папка дня (через OPFS — тот же File System API), ZIP, голос.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import JSZip from 'jszip';
import { Input, BufferSource, ALL_FORMATS } from 'mediabunny';

const W = 'C:/Windows/Web/Wallpaper';
const pick = f => (existsSync(f) ? f : null);
const server = await createServer({ server: { port: 5195, strictPort: true }, logLevel: 'error' });
await server.listen();
const base = 'http://localhost:5195/';
await mkdir('shots/out', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => m.type() === 'error' && console.log('[console]', m.text()));
await page.goto(base);
await page.evaluate(() => new Promise(r => { localStorage.clear(); const q = indexedDB.deleteDatabase('atmosphere-diary'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));

async function inspect(path) {
  const input = new Input({ source: new BufferSource(await readFile(path)), formats: ALL_FORMATS });
  const v = await input.getPrimaryVideoTrack(), a = await input.getPrimaryAudioTrack();
  return { format: (await input.getFormat()).name, duration: +(await input.computeDuration()).toFixed(2), video: v ? `${v.codec} ${v.displayWidth}×${v.displayHeight}` : null, audio: a ? `${a.codec} ${a.sampleRate}Hz` : null };
}
const b64 = 'async b => { const u = new Uint8Array(await b.arrayBuffer()); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }';

// день с музыкой и тремя фото
await page.goto(base + '#/new');
await page.fill('input[name=date]', '2026-11-14');
await page.fill('textarea[name=text]', 'День рождения Даны! Собрались всей компанией, танцевали до ночи. Конфетти, торт со свечами. Очень весело с друзьями.');
await page.setInputFiles('input[name=photos]', [`${W}/ThemeB/img24.jpg`, `${W}/ThemeC/img28.jpg`, `${W}/ThemeA/img20.jpg`].map(pick).filter(Boolean));
await page.fill('input[name=artist]', 'Тест'); await page.fill('input[name=title]', 'Бодрый до мажор');
await page.setInputFiles('input[name=audio]', 'shots/audio/upbeat-128-Cmaj.wav');
await page.click('button.primary');
try { await page.waitForURL(/#\/day\//, { timeout: 60000 }); }
catch (e) { console.log('FAILED', await page.evaluate(() => [...document.querySelectorAll('.progress li')].map(l => l.textContent).join(' → ') + ' | err: ' + document.querySelector('.err')?.textContent)); throw e; }
const id = decodeURIComponent(page.url().split('#/day/')[1]);
console.log('day:', id, '| voice decision:', await page.evaluate(() => [...document.querySelectorAll('.chain tbody tr')].map(t => t.textContent).find(s => s.includes('голос: спокойный'))));

// 1) запись в реальном времени через UI
const t0 = Date.now();
await page.click('button.rec');
await page.waitForFunction(() => /Видео готово|не записалось/.test(document.querySelector('.out-status')?.textContent ?? ''), null, { timeout: 180000 });
console.log('realtime:', await page.textContent('.out-status'), `(${((Date.now() - t0) / 1000).toFixed(1)} с)`);
const rt = await page.evaluate(async ([id, b64]) => { const { getDay } = await import('/src/archive/db.ts'); const d = await getDay(id); return { type: d.outputs.video.type, data: await eval(b64)(d.outputs.video) }; }, [id, b64]);
await writeFile('shots/out/memory-realtime.webm', Buffer.from(rt.data, 'base64'));
console.log('  file:', JSON.stringify(await inspect('shots/out/memory-realtime.webm')));

// 2) принудительный офлайн-рендер (WebCodecs + Mediabunny)
const t1 = Date.now();
const off = await page.evaluate(async ([id, b64]) => {
  const { getDay } = await import('/src/archive/db.ts');
  const { recordVideo } = await import('/src/output/video.ts');
  const r = await recordVideo(await getDay(id), () => {}, 'offline');
  return { mode: r.mode, ext: r.ext, fps: r.fps, size: r.blob.size, data: await eval(b64)(r.blob) };
}, [id, b64]);
await writeFile(`shots/out/memory-offline.${off.ext}`, Buffer.from(off.data, 'base64'));
console.log(`offline: ${off.mode} ${off.ext} ${(off.size / 1e6).toFixed(1)} МБ, ${off.fps.toFixed(0)} кадров/с рендера (${((Date.now() - t1) / 1000).toFixed(1)} с)`);
console.log('  file:', JSON.stringify(await inspect(`shots/out/memory-offline.${off.ext}`)));

// 3) папка дня через OPFS
const tree = await page.evaluate(async id => {
  const { getDay } = await import('/src/archive/db.ts');
  const { writeDayFolder } = await import('/src/output/folder.ts');
  const root = await navigator.storage.getDirectory();
  const name = await writeDayFolder(root, await getDay(id));
  const list = [];
  const walk = async (dir, p) => { for await (const [n, h] of dir.entries()) { if (h.kind === 'directory') await walk(h, p + n + '/'); else list.push(`${p}${n} ${(await h.getFile()).size}`); } };
  await walk(await root.getDirectoryHandle(name), '');
  return { name, list: list.sort() };
}, id);
console.log('folder:', tree.name);
tree.list.forEach(l => console.log('   ', l));

// 4) ZIP
const zip = await page.evaluate(async ([id, b64]) => { const { getDay } = await import('/src/archive/db.ts'); const { dayZip } = await import('/src/output/folder.ts'); return eval(b64)(await dayZip(await getDay(id))); }, [id, b64]);
const zbuf = Buffer.from(zip, 'base64');
await writeFile('shots/out/day.zip', zbuf);
const z = await JSZip.loadAsync(zbuf);
console.log('zip:', (zbuf.length / 1e6).toFixed(1), 'МБ', Object.keys(z.files).filter(f => !f.endsWith('/')).length, 'файлов');
const dj = JSON.parse(await z.file(new RegExp('day\\.json$'))[0].async('string'));
console.log('  day.json: mood.valence', dj.mood.valence.toFixed(2), '| decisions', dj.decisions.length, '| voice', JSON.stringify(dj.style.voice));
console.log('  песня.txt:\n' + (await z.file(/песня\.txt$/)[0].async('string')).replace(/^/gm, '    '));

await page.screenshot({ path: 'shots/out/day-page.png' });
await browser.close();
await server.close();
console.log('done');
