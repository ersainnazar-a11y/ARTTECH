// Палитра дня рождается из цветов САМОГО фото (k-means в LAB), а настроение лишь
// сдвигает температуру, светлоту и насыщенность. Грусть не красит день в синий —
// она убирает насыщенность и добавляет воздуха. Без фото — базовые палитры сезона × времени суток.

import type { Decision, Mood, PhotoFeatures, RGB, Season, TimeOfDay } from '../types';
import { labToRgb, rgbHex, rgbToLab } from '../analysis/photo';
import { clamp, f2 } from '../util/seed';

export interface Palette { swatches: RGB[]; shadow: RGB; highlight: RGB; accent: RGB; ink: RGB; paper: RGB; labs: RGB[] }

// LAB-триады (тень, середина, свет) — «как выглядит воздух» в это время года и суток
const SEASON_BASE: Record<Season, RGB[]> = {
  осень: [[32, 14, 26], [58, 18, 42], [78, 6, 34], [46, 4, 18], [86, 2, 14]],
  зима: [[30, 0, -6], [62, -2, -8], [88, 0, -3], [48, 4, 6], [94, 0, 2]],
  весна: [[36, -14, 18], [66, -18, 30], [84, 6, 18], [74, 16, 8], [92, -2, 10]],
  лето: [[38, 10, 30], [64, 24, 50], [86, 2, 46], [56, -24, 20], [94, 0, 16]],
};
const TIME_SHIFT: Record<TimeOfDay, RGB> = { утро: [6, -2, 6], день: [4, 0, 0], вечер: [-6, 8, 12], ночь: [-18, 2, -10] };

const chroma = (l: RGB) => Math.hypot(l[1], l[2]);

export function buildPalette(m: Mood, hero: PhotoFeatures | null): { palette: Palette; decisions: Decision[] } {
  const decisions: Decision[] = [];
  let labs: RGB[];
  if (hero) {
    labs = hero.palette.map(p => p.lab.slice() as RGB);
    decisions.push({
      source: 'фото',
      evidence: hero.palette.map(p => `${rgbHex(p.rgb)} ${Math.round(p.weight * 100)}%`).join(' '),
      rule: 'k-means на 5 цветов в LAB по hero-фото → основа палитры',
      effect: 'оттенки дня взяты из его собственного кадра',
      key: true,
    });
  } else {
    const t = TIME_SHIFT[m.timeOfDay];
    labs = SEASON_BASE[m.season].map(l => [l[0] + t[0], l[1] + t[1], l[2] + t[2]] as RGB);
    decisions.push({ source: 'текст', evidence: `${m.season}, ${m.timeOfDay}`, rule: 'нет фото → базовая палитра сезона × сдвиг времени суток', effect: 'палитра из таблицы сезонов' });
  }

  // сдвиг настроением: тепло → b*/a*, валентность → светлота, возбуждение → насыщенность
  const dw = m.warmth - 0.5;
  const chromaK = clamp(0.7 + 0.45 * m.arousal + 0.15 * m.valence, 0.45, 1.35);
  const shifted = labs.map(([L, a, b]) => {
    const L2 = clamp(L + m.valence * 6, 4, 97);
    return [L2, (a + dw * 10) * chromaK, (b + dw * 34) * chromaK] as RGB;
  });
  decisions.push({
    source: 'текст',
    evidence: `warmth ${f2(m.warmth)}, arousal ${f2(m.arousal)}`,
    rule: 'тепло сдвигает b* (жёлто-оранжевое), возбуждение множит хрому; валентность — только светлоту, не оттенок',
    effect: `b* ${dw >= 0 ? '+' : ''}${Math.round(dw * 34)}, насыщенность ×${f2(chromaK)}`,
  });

  const byL = [...shifted].sort((x, y) => x[0] - y[0]);
  const dark = byL[0], light = byL[byL.length - 1];
  const accentLab = [...shifted].sort((x, y) => chroma(y) - chroma(x))[0];

  // split-toning: тени — тёмный кластер, подкрашенный теплом (умбра ↔ чернильно-зелёный, не «грустный синий»)
  const shadowLab: RGB = [14 + 6 * m.nostalgia, dark[1] * 0.6 + dw * 16, dark[2] * 0.6 + dw * 30 - 4 * (1 - m.warmth)];
  const highLab: RGB = [93, light[1] * 0.35 + dw * 4, light[2] * 0.35 + dw * 14];
  const inkSat = 0.25 + 0.6 * m.arousal;
  const inkLab: RGB = [16 + 4 * (1 - m.arousal), shadowLab[1] * inkSat * 1.4, shadowLab[2] * inkSat * 1.4];
  // бумага одна на весь дневник: кремовая база, лишь 18% тона берётся у света дня
  const paperBase: RGB = [93.5, 1.2, 7.5];
  const paperLab: RGB = [paperBase[0] - 2 * m.nostalgia, paperBase[1] * 0.82 + highLab[1] * 0.18, paperBase[2] * 0.82 + highLab[2] * 0.18];

  const palette: Palette = {
    labs: shifted,
    swatches: shifted.map(labToRgb),
    shadow: labToRgb(shadowLab),
    highlight: labToRgb(highLab),
    accent: labToRgb(accentLab),
    ink: labToRgb(inkLab),
    paper: labToRgb(paperLab),
  };
  decisions.push({
    source: hero ? 'фото' : 'текст',
    evidence: `тени ${rgbHex(palette.shadow)}, света ${rgbHex(palette.highlight)}`,
    rule: 'split-toning: тени из тёмного кластера, света из светлого, оба подкрашены теплом дня',
    effect: `тонировка теней ${rgbHex(palette.shadow)} / светов ${rgbHex(palette.highlight)}`,
  });
  return { palette, decisions };
}

export const labOf = rgbToLab;
