// Сцена дня: типографика + рамка + «написанные» фото. Общая для постера (1080) и воспоминания (720).

import type { DayStyle } from '../types';
import { Pipeline, frameAspectOf, photoRect, type CardFrame, type FrameParams, type Painted, type Rect } from './gl/pipeline';
import type { FrameState } from './timeline';
import { drawOverlay, ensureFonts } from './overlay2d';
import { loadBitmap, rgbHex } from '../analysis/photo';
import { rng } from '../util/seed';

export interface SceneInput { photos: Blob[]; heroIndex: number; style: DayStyle; date: string; page: string; title: string; caption: string; seed: number }
export interface Scene { painted: Painted[]; rect: Rect; frameAspect: number; cardRects: { rect: Rect; rot: number; photo: number }[]; band: [number, number] }

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

  const cards = s.style.cards ?? [];
  const order = photoOrder(s.photos.length, s.heroIndex).slice(0, all ? 12 : 1 + cards.length);
  const sources = order.length ? await Promise.all(order.map(i => source(s.photos[i]))) : [{ src: lightField(s.style, s.seed) as TexImageSource, w: 800, h: 1000 }];
  // рамка задаётся главным фото и общая для всех кадров воспоминания
  const heroAspect = sources[0].w / sources[0].h;
  const frameAspect = frameAspectOf(heroAspect, s.style.layout.crop ?? 0);
  let rect = photoRect(s.style.layout, frameAspect, pipe.W, pipe.H, ov.headerBottom, ov.textTop);
  // коллаж: главный кадр чуть меньше, чтобы карточкам было куда «наклеиться»
  if (cards.length) rect = { ...rect, hw: rect.hw * 0.86, hh: rect.hh * 0.86 };

  const M = pipe.W * 0.06;
  const cardRects = cards.slice(0, Math.max(0, sources.length - 1)).map((c, i) => {
    const a = frameAspectOf(sources[1 + i].w / sources[1 + i].h, 0.5);
    const hw = rect.hw * c.scale * 1.15, hh = hw / a;
    const cx = Math.min(pipe.W - M - hw * 0.92, Math.max(M + hw * 0.92, rect.cx + c.dx * rect.hw));
    const cy = Math.min(ov.textTop - hh * 0.3, Math.max(ov.headerBottom + hh * 0.5, rect.cy + c.dy * rect.hh));
    return { rect: { cx, cy, hw, hh }, rot: s.style.layout.rotation + c.rot, photo: 1 + i };
  });

  const painted: Painted[] = [];
  for (let i = 0; i < sources.length; i++) {
    const x = sources[i];
    const cr = cardRects.find(c => c.photo === i);
    painted.push(await pipe.paint(x.src, x.w, x.h, s.style, (cr ? cr.rect.hw : rect.hw) * 2, cr ? cr.rect.hw / cr.rect.hh : frameAspect));
    'close' in x && x.close?.();
  }
  return { painted, rect, frameAspect, cardRects, band: [ov.headerBottom - 20 * (pipe.W / 1080), ov.textTop + 10 * (pipe.W / 1080)] };
}

/** параметры кадра из состояния таймлайна. Без состояния — статичный кадр постера (все карточки наклеены). */
export function frameParams(sc: Scene, cycle: number[], f: FrameState | null, t: number): FrameParams {
  const P = sc.painted;
  const cards: CardFrame[] = sc.cardRects.map((c, i) => {
    const st = f ? f.cards[i] : { alpha: 1, scale: 1 };
    return { p: P[c.photo], rect: { ...c.rect, hw: c.rect.hw * st.scale, hh: c.rect.hh * st.scale }, rot: c.rot, alpha: st.alpha };
  });
  if (!f) {
    return {
      a: P[0], mix: 0, zoomA: 1, panA: [0, 0], zoomB: 1, panB: [0, 0], rect: sc.rect, frameAspect: sc.frameAspect,
      pulse: 0, seed: 0.37, time: t, beatIdx: 0, beatDt: 1, flash: 0, cards, band: sc.band,
    };
  }
  return {
    a: P[cycle[f.a % cycle.length]], b: f.mix > 0 ? P[cycle[f.b % cycle.length]] : undefined, mix: f.mix,
    zoomA: f.zoomA, panA: f.panA, zoomB: f.zoomB, panB: f.panB,
    rect: sc.rect, frameAspect: sc.frameAspect,
    pulse: f.pulse, seed: f.grainSeed, jitter: f.jitter,
    time: t, beatIdx: f.beatIndex, beatDt: f.beatDt, flash: f.flash, cards, band: sc.band,
  };
}

/** какие фото крутятся в главной рамке: все, кроме наклеенных карточками */
export const mainCycle = (sc: Scene) => sc.painted.map((_, i) => i).filter(i => !sc.cardRects.some(c => c.photo === i));

export function releaseScene(pipe: Pipeline, sc: Scene) { sc.painted.forEach(p => pipe.release(p)); }
