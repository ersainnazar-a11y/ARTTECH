// Проверка фазы 4: LLM-путь (через mock), повтор после невалидного ответа, fallback на правила,
// ирония (модель против словаря), конфликт «держаться бодро», песня по описанию.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const mock = spawn(process.execPath, ['scripts/mock-llm.mjs'], { stdio: ['ignore', 'pipe', 'inherit'] });
mock.stdout.on('data', d => process.stdout.write(String(d)));
await new Promise(r => setTimeout(r, 600));

const server = await createServer({ server: { port: 5196, strictPort: true }, logLevel: 'error' });
await server.listen();
const base = 'http://localhost:5196/';
await mkdir('shots', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));

await page.goto(base);
await page.evaluate(() => new Promise(r => { localStorage.clear(); const q = indexedDB.deleteDatabase('atmosphere-diary'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));

// настройки через UI
await page.goto(base + '#/settings');
await page.check('input[name=enabled]');
await page.fill('input[name=baseUrl]', 'http://localhost:5197/v1');
await page.fill('input[name=model]', 'mock-1');
await page.fill('input[name=apiKey]', 'test-key-not-real');
await page.click('button.test');
await page.waitForFunction(() => document.querySelector('.status')?.textContent !== 'Проверяю…');
console.log('test connection:', await page.textContent('.status'));
await page.click('button.primary');
await page.screenshot({ path: 'shots/settings.png' });

const DAYS = [
  { name: 'irony', date: '2026-11-20', text: 'Ну просто отлично: проспала, опоздала, телефон разбился, под дождь попала. Обожаю такие дни.', file: 'shots/audio/upbeat-128-Cmaj.wav' },
  { name: 'llm-song', date: '2026-11-17', text: 'Вечером пили чай у окна, слушали старые песни.', artist: 'Несуществующая группа Х', title: 'Песня которой нет 1986' },
  { name: 'fallback', date: '2026-11-16', text: 'СЛОМАЙ модель. Гуляли по парку, было тепло и спокойно.' },
];
for (const d of DAYS) {
  await page.goto(base + '#/new');
  console.log(d.name, '| форма:', (await page.textContent('.mode-line'))?.trim());
  await page.fill('input[name=date]', d.date);
  await page.fill('textarea[name=text]', d.text);
  if (d.file) await page.setInputFiles('input[name=audio]', d.file);
  if (d.artist) { await page.fill('input[name=artist]', d.artist); await page.fill('input[name=title]', d.title); }
  await page.click('button.primary');
  await page.waitForURL(/#\/day\//, { timeout: 120000 });
  await page.waitForSelector('.poster img');
  const info = await page.evaluate(() => ({
    title: document.querySelector('.side h1')?.textContent,
    caption: document.querySelector('.caption')?.textContent,
    modes: [...document.querySelectorAll('.mode')].slice(0, 2).map(m => m.textContent.replace(/\s+/g, ' ').trim()).join(' · '),
    song: document.querySelector('.song-line')?.textContent?.replace(/\s+/g, ' '),
    chain: [...document.querySelectorAll('.chain tbody tr')].map(tr => [...tr.children].map(td => td.textContent).join(' | ')).filter(s => /LLM|модел|правил|конфликт|держаться|расхожд/i.test(s)),
  }));
  console.log(JSON.stringify(info, null, 1));
  await page.screenshot({ path: `shots/llm-${d.name}.png` });
}
await browser.close();
await server.close();
mock.kill();
console.log('done');
