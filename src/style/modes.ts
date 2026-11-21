// Пять художественных режимов смешиваются ВЕСАМИ, а не if/else.
// Каждый вес — непрерывная функция параметров Mood; итог нормируется (сумма = 1).

import type { Decision, ModeId, ModeWeights, Mood } from '../types';
import type { Conflict } from '../analysis/fuse';
import { clamp, f2 } from '../util/seed';

export const MODE_NAMES: Record<ModeId, string> = {
  impressionism: 'импрессионизм',
  geometry: 'геометрия',
  film: 'плёнка',
  minimal: 'минимализм',
  collage: 'коллаж',
};

export function modeWeights(m: Mood, photoCount: number, conflict: Conflict) {
  const pos = clamp(0.5 + m.valence * 0.8);
  const calm = 1 - m.arousal;
  const evening = m.timeOfDay === 'вечер' ? 0.22 : m.timeOfDay === 'ночь' ? 0.3 : 0;
  const many = clamp((photoCount - 1) / 3);

  const raw: ModeWeights = {
    // спокойно, тепло, valence > 0
    impressionism: pos * calm ** 1.2 * (0.35 + 0.65 * m.warmth),
    // высокий arousal, напряжение
    geometry: m.arousal ** 2 * (0.55 + 0.45 * Math.abs(m.valence)) * (1 - 0.5 * m.intimacy),
    // воспоминания, вечер, минор
    film: 0.85 * m.nostalgia + evening + 0.35 * Math.max(0, -m.valence) + (conflict === 'bittersweet' ? 0.3 : 0),
    // тихо, одиноко, мало людей
    minimal: (1 - m.social) ** 1.6 * calm * (0.6 + 0.4 * (1 - m.warmth)) * 1.2,
    // много людей и фото, праздник
    collage: m.social * (0.35 + 0.65 * m.arousal) * (0.4 + 0.6 * many) * pos,
  };
  // квадрат усиливает различие между днями, затем нормировка
  const sq = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Math.max(0.0001, v) ** 2])) as unknown as ModeWeights;
  const total = Object.values(sq).reduce((a, b) => a + b, 0);
  const w = Object.fromEntries(Object.entries(sq).map(([k, v]) => [k, v / total])) as unknown as ModeWeights;
  const order = (Object.keys(w) as ModeId[]).sort((a, b) => w[b] - w[a]);

  const decisions: Decision[] = [{
    source: 'текст',
    evidence: `valence ${f2(m.valence)}, arousal ${f2(m.arousal)}, warmth ${f2(m.warmth)}, nostalgia ${f2(m.nostalgia)}, social ${f2(m.social)}${photoCount > 1 ? `, ${photoCount} фото` : ''}`,
    rule: 'режимы — непрерывные функции настроения; веса возводятся в квадрат и нормируются',
    effect: `основной: ${MODE_NAMES[order[0]]} ${Math.round(w[order[0]] * 100)}%, второй: ${MODE_NAMES[order[1]]} ${Math.round(w[order[1]] * 100)}%`,
  }];
  return { weights: w, primary: order[0], secondary: order[1], decisions };
}
