// Библиотека мотивов: конкретные слова дня → конкретные визуальные элементы.
// Это главный аргумент против «грустно = синий»: дождь рисуется дождём, пар — паром, а не цветом.
// Музыка модулирует каждый мотив: энергия → плотность, BPM → скорость, спектральная яркость → резкость.

import type { Decision, MotifId, Mood, Song } from '../types';
import { clamp, f2 } from '../util/seed';

export interface MotifDef {
  id: MotifId; shader: number; name: string; look: string;
  density: number; speed: number; spill: number; // spill: доля, на которую мотив выходит за фото на бумагу
}

// shader — номер ветки в motifs.frag.glsl
export const MOTIFS: Record<MotifId, MotifDef> = {
  leaves:     { id: 'leaves', shader: 1, name: 'листья', look: 'падающие листья, вращаются, цвета из палитры', density: 0.5, speed: 0.6, spill: 0.45 },
  rain:       { id: 'rain', shader: 2, name: 'дождь', look: 'косые полосы + капли на «стекле»', density: 0.65, speed: 1.6, spill: 0 },
  snow:       { id: 'snow', shader: 3, name: 'снег', look: 'мягкие хлопья в три слоя глубины', density: 0.6, speed: 0.35, spill: 0.3 },
  fog:        { id: 'fog', shader: 4, name: 'туман', look: 'дрейфующий fbm-туман, съедает контраст', density: 0.6, speed: 0.25, spill: 0 },
  bokeh:      { id: 'bokeh', shader: 5, name: 'огни', look: 'боке городских огней: мягкие диски с кольцом', density: 0.45, speed: 0.2, spill: 0 },
  candle:     { id: 'candle', shader: 6, name: 'свеча', look: 'тёплое мерцающее пятно света снизу', density: 0.6, speed: 1.0, spill: 0 },
  stars:      { id: 'stars', shader: 7, name: 'звёзды', look: 'мерцающие точки в верхней части кадра', density: 0.55, speed: 0.6, spill: 0 },
  sunflare:   { id: 'sunflare', shader: 8, name: 'солнечные блики', look: 'блики-призраки по линии от источника + анаморфная полоса', density: 0.6, speed: 0.2, spill: 0 },
  steam:      { id: 'steam', shader: 9, name: 'пар', look: 'поднимающиеся струйки пара', density: 0.55, speed: 0.5, spill: 0 },
  waves:      { id: 'waves', shader: 10, name: 'волны', look: 'дисплейсмент кадра + блики на воде', density: 0.5, speed: 0.6, spill: 0 },
  wind:       { id: 'wind', shader: 11, name: 'ветер', look: 'тонкие быстрые горизонтальные линии', density: 0.5, speed: 2.0, spill: 0.25 },
  confetti:   { id: 'confetti', shader: 12, name: 'конфетти', look: 'кувыркающиеся прямоугольники, выпадают за край фото', density: 0.6, speed: 0.8, spill: 0.6 },
  dust:       { id: 'dust', shader: 13, name: 'пыль в луче', look: 'косой луч и плавающие пылинки', density: 0.55, speed: 0.15, spill: 0 },
  leafShadow: { id: 'leafShadow', shader: 14, name: 'тени листвы', look: 'пятнистая тень, медленно колышется', density: 0.55, speed: 0.2, spill: 0 },
  neon:       { id: 'neon', shader: 15, name: 'неон', look: 'светящиеся трубки по краю кадра, мигают на долю', density: 0.6, speed: 1.0, spill: 0.15 },
};

export interface MotifStyle { id: MotifId; shader: number; intensity: number; density: number; speed: number; sharpness: number; spill: number }

// погода важнее предметов: она задаёт воздух всего кадра
const WEATHER_FIRST: MotifId[] = ['rain', 'snow', 'fog', 'wind'];

export function pickMotifs(found: { id: MotifId; word: string }[], m: Mood, song: Song | null): { motifs: MotifStyle[]; decisions: Decision[] } {
  const f = song?.features;
  const energy = f?.energy ?? m.arousal;
  const bpm = f?.bpm ?? 60 + m.arousal * 60;
  const bright = f?.brightness ?? 0.5;
  const ordered = [...found].sort((a, b) => (WEATHER_FIRST.includes(b.id) ? 1 : 0) - (WEATHER_FIRST.includes(a.id) ? 1 : 0));
  const top = ordered.slice(0, 3);
  const INT = [1, 0.75, 0.55];
  const decisions: Decision[] = [];
  const motifs = top.map((x, i) => {
    const d = MOTIFS[x.id];
    const st: MotifStyle = {
      id: x.id, shader: d.shader, intensity: INT[i], spill: d.spill,
      density: clamp(d.density * (0.55 + energy * 0.9)),
      speed: d.speed * clamp(bpm / 100, 0.6, 1.6),
      sharpness: clamp(0.25 + bright * 0.75),
    };
    decisions.push({
      source: 'текст',
      evidence: `«${x.word}»`,
      rule: `библиотека мотивов: слово → ${d.name} (${d.look})${f ? '; энергия → плотность, BPM → скорость, яркость звука → резкость' : ''}`,
      effect: `${d.name}: плотность ${Math.round(st.density * 100)}%, скорость ×${f2(st.speed / d.speed)}, резкость ${Math.round(st.sharpness * 100)}%${i ? '' : ' (главный мотив)'}`,
      key: i === 0 ? 2 : false,
    });
    return st;
  });
  if (found.length > 3) decisions.push({ source: 'текст', evidence: found.slice(3).map(x => `«${x.word}»`).join(', '), rule: 'не больше трёх мотивов: погода первой, остальные по порядку в тексте', effect: 'остальные мотивы не рисуются, чтобы не было шума' });
  return { motifs, decisions };
}
