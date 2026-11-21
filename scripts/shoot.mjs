// Самопроверка фазы: поднимает dev-сервер, создаёт несколько дней с разным настроением,
// сохраняет постеры и скриншоты в ./shots. Браузер: установленный Edge/Chrome (без скачивания).
// Фото для дней задаются через переменные окружения SHOT_PHOTO_1..3 или берутся из обоев Windows.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const W = 'C:/Windows/Web/Wallpaper';
const pick = (env, fallback) => process.env[env] || (existsSync(fallback) ? fallback : null);

const DAYS = [
  {
    name: 'calm',
    date: '2026-11-08',
    text: 'Тихое утро у озера. Проснулась без будильника, долго сидела одна на берегу с термосом чая. Вода совсем неподвижная, туман над водой. Никуда не спешила, было спокойно и немного пусто.',
    photos: [pick('SHOT_PHOTO_1', `${W}/ThemeC/img28.jpg`)],
  },
  {
    name: 'party',
    date: '2026-11-14',
    text: 'День рождения Даны! Собрались всей компанией, танцевали до ночи, смеялись так, что болели щёки. Конфетти, громкая музыка, торт со свечами. Очень весело и тепло с друзьями.',
    photos: [pick('SHOT_PHOTO_2', `${W}/ThemeB/img24.jpg`), pick('SHOT_PHOTO_1', `${W}/ThemeC/img28.jpg`), pick('SHOT_PHOTO_3', `${W}/ThemeA/img20.jpg`)],
  },
  {
    name: 'deadline',
    date: '2026-11-18',
    text: 'Ночь в офисе перед сдачей проекта. Дедлайн, нервничаю, бесконечные созвоны, кофе уже не помогает. Устал и злюсь на себя, но надо успеть.',
    photos: [pick('SHOT_PHOTO_3', `${W}/ThemeA/img20.jpg`)],
  },
  {
    name: 'warm',
    date: '2026-11-11',
    text: 'Солнечный тёплый день. Медленно гуляли вдвоём по набережной, грелись на солнце, было спокойно и хорошо. Пили кофе и улыбались.',
    photos: [pick('SHOT_PHOTO_4', `${W}/ThemeC/img29.jpg`)],
  },
  {
    name: 'nophoto',
    date: '2026-11-21',
    text: 'Вечером гуляли с мамой по осеннему парку, листья шуршали под ногами. Вспоминали, как я в детстве собирала каштаны. Потом дома пили какао под пледом. Уютно.',
    photos: [],
  },
];

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const base = 'http://localhost:5199/';
await mkdir('shots', { recursive: true });

let browser;
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel, args: ['--use-angle=d3d11', '--enable-gpu'] }); break; } catch {}
}
if (!browser) browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));

await page.goto(base);
await page.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('atmosphere-diary'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));

for (const d of DAYS) {
  await page.goto(base + '#/new');
  await page.fill('input[name=date]', d.date);
  await page.fill('textarea[name=text]', d.text);
  const files = d.photos.filter(Boolean);
  if (files.length) await page.setInputFiles('input[type=file]', files);
  const t0 = Date.now();
  await page.click('button.primary');
  await page.waitForURL(/#\/day\//, { timeout: 120000 });
  await page.waitForSelector('.poster img');
  console.log(`${d.name}: ${Date.now() - t0} ms`);
  const info = await page.evaluate(() => ({ title: document.querySelector('.side h1')?.textContent, modes: [...document.querySelectorAll('.mode')].map(m => m.textContent.replace(/\s+/g, ' ').trim()) }));
  console.log('  ', info.title, '|', info.modes.join(' · '));
  const png = await page.evaluate(async () => {
    const img = document.querySelector('.poster img');
    const b = await (await fetch(img.src)).blob();
    const buf = new Uint8Array(await b.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  });
  await writeFile(`shots/poster-${d.name}.png`, Buffer.from(png, 'base64'));
  await page.screenshot({ path: `shots/day-${d.name}.png`, fullPage: false });
}

await page.goto(base + '#/archive');
await page.waitForSelector('.card img');
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/feed.png', fullPage: true });

await browser.close();
await server.close();
console.log('done');
