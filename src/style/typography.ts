// Типографика — константа дневника (места, шрифты) + переменные (интервал, вес, насыщенность чернил).

import type { Decision, ModeWeights, Mood, TimeOfDay } from '../types';
import { clamp, f2 } from '../util/seed';

export const FONTS = {
  title: '"Cormorant Garamond", Georgia, serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
  hand: '"Caveat", "Segoe Script", cursive',
  ui: '"Inter", system-ui, sans-serif',
};

const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export function dateLine(dateISO: string, tod: TimeOfDay) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const wd = WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y} · ${wd} · ${tod}`;
}

export const pageLabel = (n: number) => `№ ${String(n).padStart(3, '0')}`;

export function typeStyle(m: Mood, w: ModeWeights, seedRand: () => number) {
  const tracking = clamp(0.005 + w.minimal * 0.16 + w.impressionism * 0.03 + w.film * 0.02 - w.geometry * 0.035 - m.arousal * 0.015, -0.03, 0.18);
  const weightRaw = 400 + w.geometry * 260 + m.arousal * 80 - w.minimal * 80;
  const titleWeight = weightRaw > 540 ? 600 : weightRaw > 450 ? 500 : 400;
  const italic = w.film + w.impressionism * 0.7 > 0.45;
  const inkSaturation = clamp(0.25 + 0.6 * m.arousal);
  const captionTilt = (seedRand() * 2 - 1) * (1.5 + 2.5 * w.collage) - 1;
  const rule = w.minimal > 0.22 || w.geometry > 0.3;
  const decisions: Decision[] = [{
    source: 'текст',
    evidence: `минимализм ${Math.round(w.minimal * 100)}%, геометрия ${Math.round(w.geometry * 100)}%, arousal ${f2(m.arousal)}`,
    rule: 'тишина разрежает буквы, напряжение сжимает и утяжеляет; память и свет дают курсив',
    effect: `трекинг ${f2(tracking)}em, вес ${titleWeight}${italic ? ', курсив' : ''}${rule ? ', тонкая линия' : ''}`,
  }];
  return { type: { tracking, titleWeight, italic, inkSaturation, captionTilt, rule }, decisions };
}
