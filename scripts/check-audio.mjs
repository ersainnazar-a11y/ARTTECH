// Проверка звука воспоминания в СТРОГОМ режиме автозапуска (звук только по жесту пользователя, как Firefox/Safari).
import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({ server: { port: 5193, strictPort: true }, logLevel: 'error' });
await server.listen();
const base = 'http://localhost:5193/';
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--autoplay-policy=document-user-activation-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.addInitScript(() => {
  window.__aud = [];
  const op = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { if (!window.__aud.includes(this)) window.__aud.push(this); const p = op.call(this); p.catch(e => (this.__err = e.name)); return p; };
});
await page.goto(base);
await page.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('atmosphere-diary'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));

for (const d of [
  { name: 'iTunes', artist: 'Кино', title: 'Группа крови' },
  { name: 'свой файл', artist: 'Тест', title: 'Бодрый', file: 'shots/audio/upbeat-128-Cmaj.wav' },
]) {
  await page.goto(base + '#/new');
  await page.fill('textarea[name=text]', 'Вечером гуляли по городу, слушали музыку, было тепло.');
  await page.fill('input[name=artist]', d.artist); await page.fill('input[name=title]', d.title);
  if (d.file) await page.setInputFiles('input[name=audio]', d.file);
  await page.click('button.primary');
  await page.waitForURL(/#\/day\//, { timeout: 90000 });
  await page.waitForTimeout(300);
  await page.click('button.play'); // настоящий клик = жест пользователя
  await page.waitForSelector('canvas.memory', { timeout: 60000 });
  await page.waitForTimeout(3000);
  const s = await page.evaluate(() => { const a = window.__aud[window.__aud.length - 1]; return a ? { type: a.src.startsWith('blob:') ? 'blob' : 'url', paused: a.paused, t: +a.currentTime.toFixed(2), vol: +a.volume.toFixed(2), muted: a.muted, err: a.__err ?? null } : null; });
  console.log(d.name, '→', JSON.stringify(s), '| подпись:', (await page.textContent('.pinfo'))?.trim());
  await page.click('button.play');
}
await browser.close();
await server.close();
