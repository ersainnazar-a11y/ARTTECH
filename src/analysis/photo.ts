// Анализ фото: k-means (5 цветов) в LAB по копии 96px, яркость, насыщенность,
// контраст, цветовая температура, плотность краёв, резкость (для выбора hero).

import type { PhotoFeatures, RGB } from '../types';
import { clamp, hashBytes, rng } from '../util/seed';

const SIZE = 96;

const srgbToLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linToSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

export function rgbToLab([r, g, b]: RGB): RGB {
  const R = srgbToLin(r), G = srgbToLin(g), B = srgbToLin(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToRgb([L, a, b]: RGB): RGB {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const fi = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const x = fi(fx) * 0.95047, y = fi(fy), z = fi(fz) * 1.08883;
  const R = x * 3.2406 + y * -1.5372 + z * -0.4986;
  const G = x * -0.9689 + y * 1.8758 + z * 0.0415;
  const B = x * 0.0557 + y * -0.204 + z * 1.057;
  return [clamp(linToSrgb(R)), clamp(linToSrgb(G)), clamp(linToSrgb(B))];
}

export async function loadBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions);
}

export async function analyzePhoto(blob: Blob): Promise<PhotoFeatures> {
  const bmp = await loadBitmap(blob);
  const aspect = bmp.width / bmp.height;
  const w = aspect >= 1 ? SIZE : Math.max(8, Math.round(SIZE * aspect));
  const h = aspect >= 1 ? Math.max(8, Math.round(SIZE / aspect)) : SIZE;
  const cv = new OffscreenCanvas(w, h);
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const px = ctx.getImageData(0, 0, w, h).data;
  const n = w * h;

  const labs: RGB[] = new Array(n);
  const L = new Float32Array(n);
  let sumL = 0, sumC = 0, sumA = 0, sumB = 0;
  for (let i = 0; i < n; i++) {
    const lab = rgbToLab([px[i * 4] / 255, px[i * 4 + 1] / 255, px[i * 4 + 2] / 255]);
    labs[i] = lab;
    L[i] = lab[0];
    sumL += lab[0]; sumA += lab[1]; sumB += lab[2];
    sumC += Math.hypot(lab[1], lab[2]);
  }
  const meanL = sumL / n;
  let varL = 0;
  for (let i = 0; i < n; i++) varL += (L[i] - meanL) ** 2;
  const stdL = Math.sqrt(varL / n);

  // края (Собель) и резкость (дисперсия лапласиана) по L
  let edges = 0, lapSum = 0, lapSq = 0, cnt = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = -L[i - w - 1] - 2 * L[i - 1] - L[i + w - 1] + L[i - w + 1] + 2 * L[i + 1] + L[i + w + 1];
    const gy = -L[i - w - 1] - 2 * L[i - w] - L[i - w + 1] + L[i + w - 1] + 2 * L[i + w] + L[i + w + 1];
    if (Math.hypot(gx, gy) > 40) edges++;
    const lap = L[i - 1] + L[i + 1] + L[i - w] + L[i + w] - 4 * L[i];
    lapSum += lap; lapSq += lap * lap; cnt++;
  }
  const lapVar = lapSq / cnt - (lapSum / cnt) ** 2;

  const hash = hashBytes(px);
  const palette = kmeansLab(labs, 5, hash);

  const meanA = sumA / n, meanB = sumB / n;
  return {
    palette,
    brightness: clamp(meanL / 100),
    saturation: clamp(sumC / n / 60),
    contrast: clamp(stdL / 32),
    // тёплое = жёлтое (b*) + красное (a*); нейтраль ≈ 0.5
    temperature: clamp(0.5 + (meanB * 0.8 + meanA * 0.35) / 50),
    edgeDensity: clamp((edges / cnt) / 0.35),
    sharpness: clamp(Math.sqrt(Math.max(0, lapVar)) / 30),
    aspect,
    hash,
  };
}

/** k-means++ с детерминированным seed из пикселей фото */
function kmeansLab(pts: RGB[], k: number, seed: number) {
  const rand = rng(seed);
  const d2 = (p: RGB, q: RGB) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  const centers: RGB[] = [pts[Math.floor(rand() * pts.length)].slice() as RGB];
  const dist = new Float64Array(pts.length);
  while (centers.length < k) {
    let total = 0;
    for (let i = 0; i < pts.length; i++) {
      let m = Infinity;
      for (const c of centers) m = Math.min(m, d2(pts[i], c));
      dist[i] = m; total += m;
    }
    let r = rand() * total, idx = 0;
    while (idx < pts.length - 1 && (r -= dist[idx]) > 0) idx++;
    centers.push(pts[idx].slice() as RGB);
  }
  const assign = new Int32Array(pts.length);
  for (let iter = 0; iter < 12; iter++) {
    const acc = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < pts.length; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) { const d = d2(pts[i], centers[c]); if (d < bd) { bd = d; best = c; } }
      assign[i] = best;
      const a = acc[best]; a[0] += pts[i][0]; a[1] += pts[i][1]; a[2] += pts[i][2]; a[3]++;
    }
    for (let c = 0; c < k; c++) if (acc[c][3]) centers[c] = [acc[c][0] / acc[c][3], acc[c][1] / acc[c][3], acc[c][2] / acc[c][3]];
  }
  const counts = new Array(k).fill(0);
  for (let i = 0; i < pts.length; i++) counts[assign[i]]++;
  return centers
    .map((lab, i) => ({ lab, rgb: labToRgb(lab), weight: counts[i] / pts.length }))
    .filter(c => c.weight > 0)
    .sort((a, b) => b.weight - a.weight);
}

/** hero = резкость + контраст */
export function pickHero(feats: PhotoFeatures[]): number {
  let best = 0, bs = -1;
  feats.forEach((f, i) => { const s = f.sharpness * 0.6 + f.contrast * 0.4; if (s > bs) { bs = s; best = i; } });
  return best;
}

export const rgbHex = (c: RGB) => '#' + c.map(v => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('');
