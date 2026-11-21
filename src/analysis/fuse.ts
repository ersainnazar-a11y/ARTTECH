// Слияние источников: непрерывные веса (текст 0.45, музыка 0.35, фото 0.2),
// умноженные на confidence каждого источника. Конфликты не усредняются, а помечаются как приём.

import type { Decision, Mood, PhotoFeatures, Season, Song, TimeOfDay } from '../types';
import type { TextAnalysis } from './text-rules';
import { clamp, f2 } from '../util/seed';

export type Conflict = 'bittersweet' | 'bright-tension' | null;

export interface FuseResult { mood: Mood; decisions: Decision[]; conflict: Conflict; photoMood: PhotoMood | null; musicMood: MusicMood | null }

export interface PhotoMood { valence: number; arousal: number; warmth: number; nostalgia: number; social: number; brightness: number }

const BASE = { text: 0.45, music: 0.35, photo: 0.2 };

export function photoMood(feats: PhotoFeatures[], hero: number): PhotoMood | null {
  if (!feats.length) return null;
  // hero весит вдвое больше остальных фото
  const ws = feats.map((_, i) => (i === hero ? 2 : 1));
  const W = ws.reduce((a, b) => a + b, 0);
  const avg = (fn: (f: PhotoFeatures) => number) => feats.reduce((a, f, i) => a + fn(f) * ws[i], 0) / W;
  const br = avg(f => f.brightness), sat = avg(f => f.saturation), con = avg(f => f.contrast);
  const edge = avg(f => f.edgeDensity), temp = avg(f => f.temperature);
  return {
    valence: clamp((br - 0.48) * 1.1 + (sat - 0.3) * 0.7, -1, 1),
    arousal: clamp(0.15 + edge * 0.5 + sat * 0.25 + con * 0.2),
    warmth: temp,
    nostalgia: clamp((0.42 - sat) * 1.4) * clamp(temp * 1.4),
    social: clamp((feats.length - 1) / 5),
    brightness: br,
  };
}

const MONTH_SEASON: Season[] = ['зима', 'зима', 'весна', 'весна', 'весна', 'лето', 'лето', 'лето', 'осень', 'осень', 'осень', 'зима'];

export interface MusicMood { valence: number; arousal: number; warmth: number; nostalgia: number; age: number | null }

/** музыка → оси настроения: мажор/минор → valence, энергия + темп → arousal, тёмный тембр → тепло, возраст песни → ностальгия */
export function musicMood(song: Song | null, nowYear: number): MusicMood | null {
  const f = song?.features;
  if (!f) return null;
  const modeSign = f.scale === 'minor' ? -1 : 1;
  const ks = f.keyStrength ?? 0.6;
  const age = song!.year ? Math.max(0, nowYear - song!.year) : null;
  return {
    valence: clamp(modeSign * (0.22 + 0.25 * ks) + (f.brightness - 0.5) * 0.3 + (f.danceability - 0.5) * 0.3, -1, 1),
    arousal: clamp(0.7 * f.energy + 0.3 * clamp((f.bpm - 60) / 110)),
    warmth: clamp(0.5 + (0.5 - f.brightness) * 0.45),
    nostalgia: age === null ? 0 : clamp((age - 4) / 30),
    age,
  };
}

export function fuse(text: TextAnalysis, feats: PhotoFeatures[], hero: number, dateISO: string, song: Song | null = null): FuseResult {
  const decisions: Decision[] = [];
  const pm = photoMood(feats, hero);
  const mm = musicMood(song, Number(dateISO.slice(0, 4)));
  const conf = {
    text: text.confidence,
    photo: pm ? clamp(0.6 + 0.15 * feats.length, 0, 1) : 0,
    music: mm ? song!.confidence ?? 0.5 : 0,
  };
  const wt = BASE.text * conf.text, wp = BASE.photo * conf.photo, wm = BASE.music * conf.music;
  const W = wt + wp + wm || 1;
  const mix = (t: number, p: number | undefined, m: number | undefined, neutral: number) =>
    (wt + wp + wm === 0) ? neutral : (t * wt + (p ?? neutral) * wp + (m ?? neutral) * wm) / W;

  const mood: Mood = {
    valence: mix(text.valence, pm?.valence, mm?.valence, 0),
    arousal: mix(text.arousal, pm?.arousal, mm?.arousal, 0.4),
    warmth: mix(text.warmth, pm?.warmth, mm?.warmth, 0.5),
    // ностальгия не усредняется: старая песня или слова памяти поднимают её сами по себе
    // слова памяти не усредняются вниз; возраст песни входит через вес музыки (и отдельно усиливает плёнку в rules)
    nostalgia: clamp(Math.max(text.nostalgia, mix(text.nostalgia, pm?.nostalgia, mm?.nostalgia, 0))),
    social: mix(text.social, pm ? Math.max(pm.social, text.social * 0.8) : undefined, undefined, 0.35),
    intimacy: text.intimacy,
    timeOfDay: 'вечер',
    season: MONTH_SEASON[Number(dateISO.slice(5, 7)) - 1] ?? 'осень',
    weather: text.weather ?? undefined,
    sensory: text.sensory,
    motifs: text.motifs.map(m => m.id),
    confidence: conf,
  };

  decisions.push({
    source: 'текст',
    evidence: `${text.hits.length} слов-триггеров из ${text.tokens.length}`,
    rule: `вес источника = базовый × уверенность: текст ${f2(BASE.text)}×${f2(conf.text)}, фото ${f2(BASE.photo)}×${f2(conf.photo)}, музыка ${f2(BASE.music)}×${f2(conf.music)}`,
    effect: `доля текста ${Math.round((wt / W) * 100)}%, фото ${Math.round((wp / W) * 100)}%, музыки ${Math.round((wm / W) * 100)}%`,
  });

  // — главные слова по осям
  const top = (ax: 'v' | 'a' | 'w' | 'n' | 's' | 'i', sign: 1 | -1) =>
    text.hits.filter(h => (h.axes[ax] ?? 0) * sign > 0).sort((a, b) => Math.abs(b.axes[ax]!) - Math.abs(a.axes[ax]!)).slice(0, 3).map(h => `«${h.negated ? 'не ' : ''}${h.word}»`);
  const vw = top('v', mood.valence >= 0 ? 1 : -1);
  if (vw.length) decisions.push({ source: 'текст', evidence: vw.join(', '), rule: 'словарь основ: эмоциональные слова → валентность (отрицание «не» переворачивает знак)', effect: `valence ${f2(mood.valence)}`, key: true });
  const aw = top('a', mood.arousal >= 0.42 ? 1 : -1);
  if (aw.length) decisions.push({ source: 'текст', evidence: aw.join(', '), rule: mood.arousal >= 0.42 ? 'слова действия и спешки → возбуждение' : 'слова покоя → низкое возбуждение', effect: `arousal ${f2(mood.arousal)}`, key: Math.abs(mood.arousal - 0.42) > 0.15 });
  const ww = top('w', mood.warmth >= 0.5 ? 1 : -1);
  if (ww.length) decisions.push({ source: 'текст', evidence: ww.join(', '), rule: 'тактильное тепло/холод в словах → температура дня', effect: `warmth ${f2(mood.warmth)}` });
  const nw = top('n', 1);
  if (nw.length) decisions.push({ source: 'текст', evidence: nw.join(', '), rule: 'слова памяти и прошлого → ностальгия', effect: `nostalgia ${f2(mood.nostalgia)}` });
  const sw = top('s', mood.social >= 0.35 ? 1 : -1);
  if (sw.length) decisions.push({ source: 'текст', evidence: sw.join(', '), rule: mood.social >= 0.35 ? 'люди в тексте → социальность' : 'одиночество в тексте → низкая социальность', effect: `social ${f2(mood.social)}` });

  if (pm) {
    decisions.push({
      source: 'фото',
      evidence: `яркость ${f2(pm.brightness)}, температура ${f2(pm.warmth)}, ${feats.length} фото`,
      rule: 'светлое и насыщенное фото → +valence; тёплый баланс (b*, a* в LAB) → warmth; много фото → social',
      effect: `фото-голос: valence ${f2(pm.valence)}, warmth ${f2(pm.warmth)}, arousal ${f2(pm.arousal)}`,
    });
  }

  // — время суток: текст → яркость фото → правило «дневник пишут вечером»
  let tod: TimeOfDay = 'вечер';
  if (text.timeOfDay) {
    tod = text.timeOfDay;
    decisions.push({ source: 'текст', evidence: `«${text.timeWord}»`, rule: 'время суток названо в тексте', effect: `время: ${tod}` });
  } else if (pm && pm.brightness < 0.24) {
    tod = 'ночь';
    decisions.push({ source: 'фото', evidence: `яркость ${f2(pm.brightness)}`, rule: 'очень тёмный кадр без указания времени → ночь', effect: 'время: ночь' });
  } else if (pm && pm.brightness > 0.62) {
    tod = 'день';
    decisions.push({ source: 'фото', evidence: `яркость ${f2(pm.brightness)}`, rule: 'светлый кадр без указания времени → день', effect: 'время: день' });
  } else {
    decisions.push({ source: 'текст', evidence: 'время не названо', rule: 'по умолчанию дневник пишется вечером', effect: 'время: вечер' });
  }
  mood.timeOfDay = tod;

  if (text.season) {
    mood.season = text.season;
    decisions.push({ source: 'текст', evidence: `«${text.seasonWord}»`, rule: 'сезон из текста важнее календаря', effect: `сезон: ${mood.season}` });
  }

  if (mm && song?.features) {
    const f = song.features;
    const how = song.featuresFrom === 'audio' ? 'анализ аудио (essentia.js)' : `оценка по описанию: жанр «${song.genre ?? '?'}»`;
    decisions.push({
      source: 'музыка',
      evidence: `${how}: ${Math.round(f.bpm)} BPM, ${f.key !== '—' ? `${f.key} ` : ''}${f.scale === 'minor' ? 'минор' : 'мажор'}, энергия ${f2(f.energy)}`,
      rule: 'мажор → светлее, минор → темнее; энергия и темп → возбуждение; вес музыки 0.35 × уверенность',
      effect: `музыка: valence ${f2(mm.valence)}, arousal ${f2(mm.arousal)} (доля ${Math.round((wm / W) * 100)}%)`,
      key: true,
    });
    if (mm.age !== null && mm.age >= 8) {
      decisions.push({
        source: 'музыка',
        evidence: `песня ${song.year} года (${mm.age} лет)`,
        rule: 'чем старше песня, тем сильнее язык плёнки',
        effect: `музыкальная ностальгия ${f2(mm.nostalgia)} (через вес музыки), зерно и halation плёнки сильнее`,
        key: mm.age >= 15,
      });
    }
  }

  // — конфликты как приём
  let conflict: Conflict = null;
  // весёлый текст + минорная/медленная песня = «светлая грусть»
  if (mm && conf.text > 0.2 && text.valence > 0.2 && mm.valence < -0.12) {
    conflict = 'bittersweet';
    decisions.push({
      source: 'музыка',
      evidence: `текст valence ${f2(text.valence)} ↔ песня ${song!.features!.scale === 'minor' ? 'в миноре' : ''} valence ${f2(mm.valence)}`,
      rule: 'конфликт не усредняется в серость, а становится приёмом',
      effect: '«светлая грусть»: тёплая палитра + замедление + плёнка',
      key: true,
    });
  }
  if (!conflict && pm && conf.text > 0.25) {
    // тёмный кадр вечером/ночью — это время суток, а не грусть
    const darkExplained = tod === 'вечер' || tod === 'ночь';
    if (text.valence > 0.25 && pm.valence < -0.12 && !darkExplained) conflict = 'bittersweet';
    else if (text.valence < -0.25 && pm.valence > 0.18) conflict = 'bittersweet';
    else if (text.arousal > 0.7 && pm.arousal < 0.35) conflict = 'bright-tension';
    if (conflict) {
      decisions.push({
        source: 'фото',
        evidence: `текст valence ${f2(text.valence)} ↔ фото valence ${f2(pm.valence)}`,
        rule: 'конфликт слов и кадра не усредняется в серость, а становится приёмом',
        effect: conflict === 'bittersweet' ? '«светлая грусть»: тёплая палитра + плёнка + больше воздуха' : '«тихое напряжение»: спокойный кадр, жёсткая типографика',
      });
    }
  }

  return { mood, decisions, conflict, photoMood: pm, musicMood: mm };
}
