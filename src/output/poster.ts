// Постер 1080×1920: типографика → раскладка → WebGL-пайплайн → PNG.

import type { DayStyle } from '../types';
import { Pipeline, photoRect } from '../render/gl/pipeline';
import { drawOverlay, ensureFonts } from '../render/overlay2d';
import { loadBitmap, rgbHex } from '../analysis/photo';
import { rng } from '../util/seed';

export const POSTER_W = 1080, POSTER_H = 1920;
let pipe: Pipeline | null = null;

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

export async function renderPoster(o: { hero: Blob | null; style: DayStyle; date: string; page: string; title: string; caption: string; seed: number }): Promise<Blob> {
  await ensureFonts();
  pipe ??= new Pipeline(POSTER_W, POSTER_H);
  const ov = drawOverlay({ W: POSTER_W, H: POSTER_H, date: o.date, page: o.page, title: o.title, caption: o.caption, style: o.style });
  let src: TexImageSource, aspect: number;
  if (o.hero) {
    const bmp = await loadBitmap(o.hero);
    // ограничиваем размер текстуры: длинная сторона ≤ 2048
    const sc = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
    if (sc < 1) {
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
      src = c;
    } else src = bmp;
    aspect = bmp.width / bmp.height;
  } else {
    src = lightField(o.style, o.seed);
    aspect = 0.8;
  }
  // кадрирование: пропорция рамки тянется от пропорции фото к 4:5 на долю layout.crop
  const crop = o.style.layout.crop ?? 0;
  const frameAspect = Math.exp(Math.log(aspect) * (1 - crop) + Math.log(0.8) * crop);
  const rect = photoRect(o.style.layout, frameAspect, POSTER_W, POSTER_H, ov.headerBottom, ov.textTop);
  const uvScale: [number, number] = frameAspect < aspect ? [frameAspect / aspect, 1] : [1, aspect / frameAspect];
  await pipe.render({ photo: src, rect, uvScale, style: o.style, type: ov.canvas, seed: o.seed, hasPhoto: true });
  if (src instanceof ImageBitmap) src.close();
  return pipe.toBlob();
}
