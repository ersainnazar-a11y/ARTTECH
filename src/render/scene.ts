// Сцена дня: типографика + рамка + «написанные» фото. Общая для постера (1080) и воспоминания (720).

import type { DayStyle } from '../types';
import { Pipeline, frameAspectOf, photoRect, type Painted, type Rect } from './gl/pipeline';
import { drawOverlay, ensureFonts } from './overlay2d';
import { loadBitmap, rgbHex } from '../analysis/photo';
import { rng } from '../util/seed';

export interface SceneInput { photos: Blob[]; heroIndex: number; style: DayStyle; date: string; page: string; title: string; caption: string; seed: number }
export interface Scene { painted: Painted[]; rect: Rect; frameAspect: number }

/** без фото: «световое поле» из палитры дня (детерминированно от seed) */
function lightField(style: DayStyle, seed: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 800; cv.height = 1000;
  const ctx = cv.getContext('2d')!;
  const r = rng(seed);
  const sw = style.palette.swatches;
  const g = ctx.createLinearGradient(0, 0, 0, cv.height);
  g.addColorStop(0, rgbHex(sw[sw.length - 1]));
  g.addColorStop(1, rgbHex(sw[0]));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < 14; i++) {
    const c = sw[Math.floor(r() * sw.length)];
    const x = r() * cv.width, y = r() * cv.height, rad = 120 + r() * 380;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, rad);
    rg.addColorStop(0, rgbHex(c) + 'cc');
    rg.addColorStop(1, rgbHex(c) + '00');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, cv.width, cv.height);
  }
  return cv;
}

async function source(blob: Blob): Promise<{ src: TexImageSource; w: number; h: number; close?: () => void }> {
  const bmp = await loadBitmap(blob);
  const sc = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
  if (sc < 1) {
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return { src: c, w: c.width, h: c.height };
  }
  return { src: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
}

/** порядок фото в воспоминании: hero первым, остальные — как загружены */
export const photoOrder = (n: number, hero: number) => (n ? [hero, ...Array.from({ length: n }, (_, i) => i).filter(i => i !== hero)] : []);

export async function buildScene(pipe: Pipeline, s: SceneInput, all: boolean): Promise<Scene> {
  await ensureFonts();
  const ov = drawOverlay({ W: pipe.W, H: pipe.H, date: s.date, page: s.page, title: s.title, caption: s.caption, style: s.style });
  pipe.setOverlay(ov.canvas);

  const order = photoOrder(s.photos.length, s.heroIndex).slice(0, all ? 12 : 1);
  const sources = order.length ? await Promise.all(order.map(i => source(s.photos[i]))) : [{ src: lightField(s.style, s.seed) as TexImageSource, w: 800, h: 1000 }];
  // рамка задаётся главным фото и общая для всех кадров воспоминания
  const heroAspect = sources[0].w / sources[0].h;
  const frameAspect = frameAspectOf(heroAspect, s.style.layout.crop ?? 0);
  const rect = photoRect(s.style.layout, frameAspect, pipe.W, pipe.H, ov.headerBottom, ov.textTop);
  const painted: Painted[] = [];
  for (const x of sources) {
    painted.push(await pipe.paint(x.src, x.w, x.h, s.style, rect.hw * 2, frameAspect));
    'close' in x && x.close?.();
  }
  return { painted, rect, frameAspect };
}

export function releaseScene(pipe: Pipeline, sc: Scene) { sc.painted.forEach(p => pipe.release(p)); }
