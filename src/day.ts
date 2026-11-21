// Оркестрация: ввод → анализ → слияние → стиль → название → постер → запись в архив.

import type { DayEntry, Decision, PhotoFeatures, Song } from './types';
import { analyzeTextRules, pickCaption } from './analysis/text-rules';
import { analyzePhoto, pickHero } from './analysis/photo';
import { fuse } from './analysis/fuse';
import { buildStyle } from './style/rules';
import { makeTitle } from './style/title';
import { dateLine, pageLabel } from './style/typography';
import { renderPoster } from './output/poster';
import { allDays, nextPage, saveDay } from './archive/db';
import { hashString } from './util/seed';

export interface DayInput { date: string; text: string; photos: File[]; song: Song | null }
export type Progress = (step: string) => void;

export async function createDay(input: DayInput, progress: Progress = () => {}): Promise<DayEntry> {
  progress('Читаю слова дня');
  const text = analyzeTextRules(input.text);

  progress('Раскладываю фото на цвета');
  const feats: PhotoFeatures[] = [];
  for (const p of input.photos) feats.push(await analyzePhoto(p));
  const hero = feats.length ? pickHero(feats) : -1;

  const seed = hashString(
    [input.date, input.text.trim(), feats.map(f => f.hash).join(','), input.song ? `${input.song.artist}—${input.song.title}` : ''].join('|'),
  );

  progress('Сплетаю настроение');
  const fz = fuse(text, feats, hero, input.date);
  const decisions: Decision[] = [...fz.decisions];
  if (hero >= 0 && feats.length > 1) {
    decisions.push({
      source: 'фото',
      evidence: `фото №${hero + 1}: резкость ${feats[hero].sharpness.toFixed(2)}, контраст ${feats[hero].contrast.toFixed(2)}`,
      rule: 'hero-фото = максимум (резкость × 0.6 + контраст × 0.4)',
      effect: 'это фото становится главным кадром постера',
    });
  }

  progress('Выбираю художественный язык');
  const st = buildStyle(fz.mood, hero >= 0 ? feats[hero] : null, feats.length, fz.conflict, seed);
  decisions.push(...st.decisions);

  const existing = (await allDays()).map(d => d.title);
  const tt = makeTitle(input.text, fz.mood, input.date, existing);
  decisions.push(...tt.decisions);
  const caption = pickCaption(input.text);
  if (caption) decisions.push({ source: 'текст', evidence: `«${caption}»`, rule: 'подпись = самое эмоционально нагруженное предложение автора, его же словами', effect: 'рукописная строка над названием' });

  progress('Печатаю воспоминание');
  const page = await nextPage();
  const poster = await renderPoster({
    hero: hero >= 0 ? input.photos[hero] : null,
    style: st.style,
    date: dateLine(input.date, fz.mood.timeOfDay),
    page: pageLabel(page),
    title: tt.title,
    caption,
    seed,
  });

  const entry: DayEntry = {
    id: `${input.date}-${seed.toString(36)}`,
    date: input.date,
    page,
    text: input.text,
    photos: input.photos,
    heroIndex: hero,
    song: input.song,
    mood: fz.mood,
    style: st.style,
    title: tt.title,
    caption,
    decisions,
    outputs: { poster },
    seed,
    createdAt: Date.now(),
  };
  progress('Кладу в дневник');
  await saveDay(entry);
  return entry;
}
