// Геометрия (Кандинский) и коллаж: композиции, порождённые seed + весами режимов.

import type { Decision, ModeWeights } from '../types';
import { clamp, rng, smooth } from '../util/seed';

/** фигура SDF. Координаты в долях кадра (x 0..1 слева, y 0..1 сверху), size — доля ширины */
export interface Shape { type: 0 | 1 | 2 | 3 | 4; x: number; y: number; size: number; rot: number; color: number; beat: number; fill: number }
// 0 круг, 1 кольцо, 2 треугольник, 3 полоса (линия), 4 дуга

export interface GeometryStyle { opacity: number; grid: number; shapes: Shape[] }

export function buildGeometry(w: ModeWeights, arousal: number, seed: number): { geometry: GeometryStyle; decisions: Decision[] } {
  const r = rng(seed ^ 0x2545f491);
  const opacity = smooth(0.06, 0.45, w.geometry);
  const n = opacity > 0 ? Math.round(3 + w.geometry * 10) : 0;
  const shapes: Shape[] = [];
  // большой круг — «солнце» композиции Кандинского, у трети кадра
  if (n) shapes.push({ type: 0, x: r() < 0.5 ? 0.3 : 0.7, y: 0.22 + r() * 0.12, size: 0.16 + r() * 0.08, rot: 0, color: 0, beat: 0, fill: 1 });
  const types: Shape['type'][] = [3, 2, 1, 3, 4, 0, 2, 3, 1, 4, 0, 3];
  for (let i = 1; i < n; i++) {
    const t = types[(i - 1) % types.length];
    shapes.push({
      type: t,
      x: 0.1 + r() * 0.8, y: 0.12 + r() * 0.62,
      size: t === 3 ? 0.25 + r() * 0.35 : 0.025 + r() * 0.07,
      rot: (r() - 0.5) * Math.PI * (t === 3 ? 0.9 : 2),
      color: 1 + Math.floor(r() * 5), beat: i % 4,
      fill: r() < 0.55 ? 1 : 0,
    });
  }
  const grid = clamp(w.geometry * 0.9 + arousal * 0.1) * opacity;
  const decisions: Decision[] = n ? [{
    source: 'текст',
    evidence: `геометрия ${Math.round(w.geometry * 100)}%, arousal ${arousal.toFixed(2)}`,
    rule: 'ритм и форма вместо предмета = внутреннее напряжение: SDF-круги, треугольники, полосы, пульсируют на свою долю такта',
    effect: `${n} фигур, непрозрачность ${Math.round(opacity * 100)}%, жёсткая сетка 12 колонок ${Math.round(grid * 100)}%`,
    key: w.geometry > 0.25,
  }] : [];
  return { geometry: { opacity, grid, shapes }, decisions };
}

/** карточка коллажа относительно главной рамки: смещение в долях полуразмера, масштаб, поворот */
export interface Card { dx: number; dy: number; scale: number; rot: number }

export function buildCollage(w: ModeWeights, photoCount: number, seed: number): { cards: Card[]; decisions: Decision[] } {
  if (photoCount < 2 || w.collage < 0.15) return { cards: [], decisions: [] };
  const r = rng(seed ^ 0x68e31da4);
  const n = Math.min(photoCount - 1, Math.max(1, Math.round(w.collage * 7)));
  const cards: Card[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + r() * 0.9;
    const rad = 0.55 + r() * 0.35;
    cards.push({ dx: Math.cos(ang) * rad, dy: Math.sin(ang) * rad * 0.9, scale: 0.42 + r() * 0.16, rot: (r() - 0.5) * 0.3 });
  }
  return {
    cards,
    decisions: [{
      source: 'фото',
      evidence: `${photoCount} фото, коллаж ${Math.round(w.collage * 100)}%`,
      rule: 'теснота и наложения = шум и тепло компании: фото наклеиваются поверх главного на сильные доли',
      effect: `${n} карточек с рваным краем вокруг главного кадра`,
      key: true,
    }],
  };
}
