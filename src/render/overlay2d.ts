// 7) Типографика на 2D canvas → текстура для финального прохода.
// Константы дневника: сетка 12 колонок, поля 6%, дата слева сверху, № страницы справа,
// рукописная подпись — одна строка над названием, название — внизу.

import type { DayStyle, ModeId } from '../types';
import { FONTS } from '../style/typography';
import { rgbHex } from '../analysis/photo';
import { MODE_NAMES } from '../style/modes';

export interface OverlayInput { W: number; H: number; date: string; page: string; title: string; caption: string; style: DayStyle }

export async function ensureFonts() {
  await Promise.all([
    document.fonts.load(`400 40px ${FONTS.title}`, 'Аа'),
    document.fonts.load(`500 40px ${FONTS.title}`, 'Аа'),
    document.fonts.load(`600 40px ${FONTS.title}`, 'Аа'),
    document.fonts.load(`italic 500 40px ${FONTS.title}`, 'Аа'),
    document.fonts.load(`400 30px ${FONTS.mono}`, 'Аа01'),
    document.fonts.load(`500 40px ${FONTS.hand}`, 'Аа'),
  ]);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

export function drawOverlay(o: OverlayInput) {
  const { W, H, style: S } = o;
  const k = W / 1080;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const M = W * 0.06;
  const col = (W - 2 * M) / 12;
  const ink = rgbHex(S.palette.ink);
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.textBaseline = 'alphabetic';

  // шапка
  ctx.font = `400 ${28 * k}px ${FONTS.mono}`;
  ctx.letterSpacing = `${0.06 * 28 * k}px`;
  const headY = M + 22 * k;
  ctx.textAlign = 'left';
  ctx.fillText(o.date, M, headY);
  ctx.textAlign = 'right';
  ctx.fillText(o.page, W - M, headY);
  let headerBottom = headY + 26 * k;
  if (S.type.rule) {
    ctx.globalAlpha = 0.55;
    ctx.fillRect(M, headY + 22 * k, W - 2 * M, Math.max(1, 1.5 * k));
    ctx.globalAlpha = 1;
    headerBottom += 10 * k;
  }

  // служебная строка внизу: из чего сложен день
  const mm = (Object.entries(S.modes) as [ModeId, number][]).sort((a, b) => b[1] - a[1]).slice(0, 2);
  ctx.font = `400 ${20 * k}px ${FONTS.mono}`;
  ctx.letterSpacing = `${0.08 * 20 * k}px`;
  ctx.textAlign = 'left';
  ctx.globalAlpha = 0.6;
  const baseY = H - M + 4 * k;
  ctx.fillText(mm.map(([id, v]) => `${MODE_NAMES[id]} ${Math.round(v * 100)}`).join(' · '), M, baseY);
  // палитра дня — пять точек справа
  S.palette.swatches.slice(0, 5).forEach((c, i) => {
    ctx.fillStyle = rgbHex(c);
    ctx.beginPath();
    ctx.arc(W - M - i * 22 * k - 7 * k, baseY - 7 * k, 7 * k, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.fillStyle = ink;

  // название (Cormorant Garamond) — снизу, до 2 строк, ширина 11 колонок
  const maxW = col * 11;
  let size = 118 * k;
  const tFont = (s: number) => `${S.type.italic ? 'italic ' : ''}${S.type.titleWeight} ${s}px ${FONTS.title}`;
  let lines: string[];
  for (;;) {
    ctx.font = tFont(size);
    ctx.letterSpacing = `${S.type.tracking * size}px`;
    lines = wrap(ctx, o.title, maxW);
    if ((lines.length <= 2 && lines.every(l => ctx.measureText(l).width <= maxW)) || size < 60 * k) break;
    size -= 4 * k;
  }
  const lh = size * 0.98;
  const titleBottom = baseY - 46 * k;
  ctx.textAlign = 'left';
  lines.forEach((l, i) => ctx.fillText(l, M - 4 * k, titleBottom - (lines.length - 1 - i) * lh));
  let textTop = titleBottom - (lines.length - 1) * lh - size * 0.8;

  // рукописная подпись — одна строка над названием
  if (o.caption) {
    let cs = 54 * k;
    ctx.font = `500 ${cs}px ${FONTS.hand}`;
    ctx.letterSpacing = '0px';
    while (ctx.measureText(o.caption).width > col * 11.5 && cs > 30 * k) { cs -= 2 * k; ctx.font = `500 ${cs}px ${FONTS.hand}`; }
    const cy = textTop - 18 * k;
    ctx.save();
    ctx.translate(M + col * 0.25, cy);
    ctx.rotate((S.type.captionTilt * Math.PI) / 180);
    ctx.globalAlpha = 0.88;
    ctx.fillText(o.caption, 0, 0);
    ctx.restore();
    textTop = cy - cs * 0.9;
  }

  return { canvas: cv, headerBottom: headerBottom + 34 * k, textTop: textTop - 34 * k };
}
