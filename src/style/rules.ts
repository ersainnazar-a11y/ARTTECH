// Mood → DayStyle + decisions. Каждый параметр рендера — непрерывная функция весов режимов и Mood.

import type { DayStyle, Decision, Mood, PhotoFeatures, RGB } from '../types';
import type { Conflict } from '../analysis/fuse';
import { modeWeights } from './modes';
import { buildPalette } from './palette';
import { typeStyle } from './typography';
import { clamp, f2, lerp, rng } from '../util/seed';
import { rgbHex } from '../analysis/photo';

const mixc = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function buildStyle(m: Mood, hero: PhotoFeatures | null, photoCount: number, conflict: Conflict, seed: number) {
  const rand = rng(seed ^ 0x5bd1e995);
  const decisions: Decision[] = [];
  const modes = modeWeights(m, photoCount, conflict);
  decisions.push(...modes.decisions);
  const w = modes.weights;

  const pal = buildPalette(m, hero);
  decisions.push(...pal.decisions);
  const P = pal.palette;
  const night = m.timeOfDay === 'ночь', evening = m.timeOfDay === 'вечер';
  const bitter = conflict === 'bittersweet';

  // — цветокоррекция
  const warmBias = (m.warmth - 0.5) * 0.09 + (bitter ? 0.03 : 0);
  const grade: DayStyle['grade'] = {
    exposure: m.valence * 0.14 - (night ? 0.18 : 0) + w.impressionism * 0.08,
    contrast: clamp(0.92 + m.arousal * 0.32 + w.geometry * 0.25 - w.impressionism * 0.12 - w.film * 0.1, 0.7, 1.45),
    saturation: clamp(0.78 + 0.32 * m.arousal + 0.14 * m.valence - w.film * 0.18 - w.minimal * 0.3 + w.collage * 0.1, 0.35, 1.35),
    lift: mixc([0, 0, 0], P.shadow, 0.25 + w.film * 0.5).map(c => c * (0.05 + w.film * 0.1 + w.minimal * 0.05)) as RGB,
    gamma: [1 + warmBias, 1, 1 - warmBias],
    gain: mixc([1, 1, 1], P.highlight, 0.35).map(c => c * (1.0 + m.valence * 0.03)) as RGB,
    splitShadow: P.shadow,
    splitHighlight: P.highlight,
    splitBalance: clamp(m.valence * 0.18, -0.2, 0.2),
  };
  decisions.push({
    source: 'текст',
    evidence: `valence ${f2(m.valence)}, arousal ${f2(m.arousal)}${night ? ', ночь' : ''}`,
    rule: 'lift/gamma/gain: валентность → экспозиция, возбуждение → контраст и насыщенность; плёнка поднимает чёрные',
    effect: `экспозиция ${f2(grade.exposure)}, контраст ×${f2(grade.contrast)}, насыщенность ×${f2(grade.saturation)}`,
  });

  // — живопись (Кувахара)
  const painterly = {
    radius: Math.round(clamp(3 + w.impressionism * 12 + w.film * 3 + w.collage * 2 - w.geometry * 2, 2, 14)),
    strength: clamp(0.3 + w.impressionism * 1.2 + w.film * 0.35 + w.minimal * 0.25 - w.geometry * 0.4),
    sharpness: lerp(6, 14, clamp(w.geometry * 1.5 + m.arousal * 0.4)),
  };
  decisions.push({
    source: 'текст',
    evidence: `импрессионизм ${Math.round(w.impressionism * 100)}%`,
    rule: 'анизотропный Кувахара: чем спокойнее и теплее день, тем шире мазок — память о свете, а не о деталях',
    effect: `радиус мазка ${painterly.radius}px, сила ${Math.round(painterly.strength * 100)}%`,
    key: w.impressionism > 0.2,
  });

  // — плёнка
  const leakHue: RGB = mixc(P.accent, [1, 0.45, 0.2], 0.35 + m.warmth * 0.4);
  const film = {
    grain: clamp(0.035 + w.film * 0.16 + m.nostalgia * 0.05 + (night ? 0.04 : 0)),
    halation: clamp(0.08 + w.film * 0.55 + (night ? 0.2 : evening ? 0.08 : 0)),
    vignette: clamp(0.12 + w.film * 0.4 + (night ? 0.15 : 0) - w.minimal * 0.08),
    leak: clamp(w.film * 0.75 + (bitter ? 0.2 : 0)) * (evening || night ? 1 : 0.65),
    leakColor: leakHue,
    leakAngle: rand() * Math.PI * 2,
    warmShadows: clamp(w.film * 0.6 + m.warmth * 0.25 + (bitter ? 0.25 : 0)),
  };
  decisions.push({
    source: 'текст',
    evidence: `плёнка ${Math.round(w.film * 100)}%, nostalgia ${f2(m.nostalgia)}, ${m.timeOfDay}`,
    rule: 'язык семейного архива: память и вечер → зерно, halation, засветка, тёплые тени',
    effect: `зерно ${Math.round(film.grain * 100)}%, halation ${Math.round(film.halation * 100)}%, засветка ${Math.round(film.leak * 100)}% ${rgbHex(film.leakColor)}`,
    key: w.film > 0.2,
  });

  // — раскладка: «воздух»
  const layout = {
    photoScale: clamp(0.9 - w.minimal * 0.5 - (bitter ? 0.08 : 0) + w.geometry * 0.08 - w.film * 0.04, 0.38, 1),
    centerY: clamp(0.5 - w.minimal * 0.12, 0.3, 0.55),
    rotation: (rand() < 0.5 ? -1 : 1) * (w.collage * 4.5 + w.film * 1.4 + 0.15) * Math.PI / 180,
    feather: clamp(w.impressionism * 0.9 - w.geometry * 0.4),
    deckle: clamp(w.collage * 0.9 + w.film * 0.35),
    border: clamp(w.film * 1.6 + w.collage * 0.6 - w.impressionism * 0.8),
    // насыщенный день заполняет лист (кадр тянется к 4:5), тихий сохраняет исходную пропорцию
    crop: clamp(0.85 - w.minimal * 1.3),
  };
  decisions.push({
    source: 'текст',
    evidence: `social ${f2(m.social)}, минимализм ${Math.round(w.minimal * 100)}%`,
    rule: 'пустота = тишина и дистанция: чем тише и одиноче день, тем меньше фото в кадре',
    effect: `фото занимает ${Math.round(layout.photoScale * 100)}% ширины${layout.feather > 0.3 ? ', края растворены' : ''}${layout.border > 0.3 ? ', белая рамка архивного отпечатка' : ''}`,
    key: w.minimal > 0.2 || layout.border > 0.3 || layout.feather > 0.3,
  });

  const ts = typeStyle(m, w, rand);
  decisions.push(...ts.decisions);

  const style: DayStyle = {
    modes: w,
    primaryMode: modes.primary,
    secondaryMode: modes.secondary,
    palette: { swatches: P.swatches, shadow: P.shadow, highlight: P.highlight, accent: P.accent, ink: P.ink, paper: P.paper },
    grade,
    painterly,
    film,
    paper: { intensity: clamp(0.55 + w.film * 0.35 + w.minimal * 0.2 + m.nostalgia * 0.15), tone: P.paper },
    layout,
    type: ts.type,
  };
  decisions.push({
    source: 'текст',
    evidence: 'константа дневника',
    rule: 'одна бумага на все дни; меняются только её тон и плотность',
    effect: `бумага ${rgbHex(P.paper)}, фактура ${Math.round(style.paper.intensity * 100)}%`,
  });
  // первая запись о режимах — ключевая
  decisions[0].key = true;
  return { style, decisions };
}
