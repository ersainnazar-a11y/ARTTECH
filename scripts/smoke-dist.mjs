// Дымовая проверка СОБРАННОЙ версии (dist/, как на хостинге): создание дня с аудио (воркер + WASM), постер, воспоминание.
import { preview } from 'vite';
import { chromium } from 'playwright';

const server = await preview({ preview: { port: 5194, strictPort: true }, logLevel: 'error' });
// BASE_PATH=/ARTTECH/ — проверка ровно в том виде, как на GitHub Pages
const base = 'http://localhost:5194' + (process.env.BASE_PATH ?? '/');
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.goto(base);
await page.goto(base + '#/new');
await page.fill('textarea[name=text]', 'Вечером шёл снег, пили какао с друзьями и смеялись.');
await page.fill('input[name=artist]', 'Тест'); await page.fill('input[name=title]', 'Медленный');
await page.setInputFiles('input[name=audio]', 'shots/audio/slow-70-Amin.wav');
await page.click('button.primary');
await page.waitForURL(/#\/day\//, { timeout: 90000 });
console.log('dist ok:', await page.textContent('.side h1'), '|', (await page.textContent('.song-line'))?.replace(/\s+/g, ' '));
await page.click('button.play');
await page.waitForSelector('canvas.memory', { timeout: 30000 });
console.log('memory canvas ok; errors:', errors.length ? errors : 'нет');
await browser.close();
server.httpServer.close();
