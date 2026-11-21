// Оркестрация: ввод → анализ (текст, фото, музыка) → слияние → стиль → название → постер → запись в архив.

import type { DayEntry, Decision, PhotoFeatures, Song } from './types';
import { analyzeTextRules, pickCaption } from './analysis/text-rules';
import { analyzeTextLLM, describeSongLLM, llmReady, loadLlmConfig } from './analysis/text-llm';
import { analyzePhoto, pickHero } from './analysis/photo';
import { fuse } from './analysis/fuse';
import { analyzeAudio, describeFeatures, searchItunes, yearOf, type ItunesHit } from './analysis/song-meta';
import { buildStyle } from './style/rules';
import { makeTitle } from './style/title';
import { dateLine, pageLabel } from './style/typography';
import { renderPoster } from './output/poster';
import { allDays, nextPage, saveDay } from './archive/db';
import { hashString } from './util/seed';

export interface SongInput { file?: File; artist: string; title: string; link?: string; hit?: ItunesHit }
export interface DayInput { date: string; text: string; photos: File[]; song: SongInput | null }
export type Progress = (step: string) => void;

/** приоритет: свой файл → официальный фрагмент (анализ) → оценка по описанию → только название */
export async function resolveSong(inp: SongInput, progress: Progress): Promise<{ song: Song; decision: Decision }> {
  const base = { title: inp.title, artist: inp.artist, link: inp.link || undefined };
  let hit = inp.hit;
  const lookup = async () => {
    if (hit || !(inp.artist || inp.title)) return;
    try { hit = (await searchItunes(`${inp.artist} ${inp.title}`.trim(), 1))[0]; } catch { /* офлайн — идём дальше */ }
  };

  if (inp.file) {
    progress('Слушаю песню: биты, тональность, энергия');
    const a = await analyzeAudio(await inp.file.arrayBuffer());
    await lookup();
    return {
      song: { ...base, source: 'file', blob: inp.file, year: yearOf(hit?.releaseDate), genre: hit?.primaryGenreName, duration: a.duration, features: a.features, featuresFrom: 'audio', confidence: a.confidence, title: inp.title || inp.file.name.replace(/\.[^.]+$/, '') },
      decision: { source: 'музыка', evidence: `свой файл «${inp.file.name}»`, rule: 'приоритет 1: полный анализ своего аудио в воркере', effect: `признаки из аудио, уверенность ${a.confidence.toFixed(2)}`, key: false },
    };
  }

  progress('Ищу официальный фрагмент песни');
  await lookup();
  const meta = hit ? { title: hit.trackName, artist: hit.artistName, year: yearOf(hit.releaseDate), genre: hit.primaryGenreName, artwork: hit.artworkUrl100, link: inp.link || hit.trackViewUrl } : {};
  if (hit?.previewUrl) {
    try {
      progress('Слушаю 30-секундный фрагмент');
      const r = await fetch(hit.previewUrl, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(String(r.status));
      const blob = await r.blob();
      const a = await analyzeAudio(await blob.arrayBuffer());
      return {
        song: { ...base, ...meta, source: 'preview', previewUrl: hit.previewUrl, previewBlob: blob, duration: a.duration, features: a.features, featuresFrom: 'audio', confidence: a.confidence * 0.95 },
        decision: { source: 'музыка', evidence: `iTunes: ${hit.artistName} — ${hit.trackName}${meta.year ? `, ${meta.year}` : ''}`, rule: 'приоритет 2: официальный 30-с фрагмент, CORS открыт → полный анализ', effect: 'признаки из аудио фрагмента' },
      };
    } catch (err) {
      console.warn('preview analysis failed', err);
    }
  }
  // приоритет 3а: LLM оценивает признаки по исполнителю/названию/году (честно помечается как «по описанию»)
  const cfg = loadLlmConfig();
  const who = meta.artist ?? inp.artist, what = meta.title ?? inp.title;
  if (llmReady(cfg) && (who || what)) {
    progress('Спрашиваю модель о песне');
    const g = await describeSongLLM(cfg, who ?? '', what ?? '');
    if (g && g.confidence >= 0.3) {
      const period = 60 / g.bpm;
      const year = meta.year ?? g.year;
      return {
        song: {
          ...base, ...meta, year, genre: meta.genre ?? g.genre, source: hit?.previewUrl ? 'preview' : 'link', previewUrl: hit?.previewUrl,
          features: { bpm: g.bpm, beats: Array.from({ length: Math.ceil(40 / period) }, (_, i) => i * period), key: '—', scale: g.scale, energy: g.energy, brightness: g.brightness, danceability: g.danceability },
          featuresFrom: 'description', describedBy: 'llm', confidence: 0.25 + 0.25 * g.confidence,
        },
        decision: { source: 'музыка', evidence: `${who} — ${what}${year ? `, ${year}` : ''}`, rule: `приоритет 3: аудио недоступно → признаки оценила модель ${cfg.model} по описанию (не по звуку)`, effect: `featuresFrom: description, уверенность ${(0.25 + 0.25 * g.confidence).toFixed(2)}`, key: 6 },
      };
    }
  }
  const d = describeFeatures(hit?.primaryGenreName);
  if (d) {
    return {
      song: { ...base, ...meta, source: hit?.previewUrl ? 'preview' : 'link', previewUrl: hit?.previewUrl, features: d.features, featuresFrom: 'description', describedBy: 'genre', confidence: d.confidence },
      decision: { source: 'музыка', evidence: `жанр «${hit!.primaryGenreName}»${meta.year ? `, ${meta.year} год` : ''}`, rule: 'приоритет 3: аудио недоступно → признаки оценены по описанию (таблица жанров)', effect: 'featuresFrom: description, низкая уверенность 0.35' },
    };
  }
  return {
    song: { ...base, ...meta, source: 'link', featuresFrom: 'none' },
    decision: { source: 'музыка', evidence: `«${[inp.artist, inp.title].filter(Boolean).join(' — ')}»`, rule: 'песню не удалось найти или послушать', effect: 'музыка не влияет на форму, сохранена только ссылка' },
  };
}

export async function createDay(input: DayInput, progress: Progress = () => {}): Promise<DayEntry> {
  progress('Читаю слова дня');
  const existingTitles = (await allDays()).map(d => d.title);
  const rules = analyzeTextRules(input.text);
  let text = rules;
  const textDecisions: Decision[] = [];
  const cfg = loadLlmConfig();
  if (llmReady(cfg) && input.text.trim().length > 3) {
    progress(`Читаю текст вместе с моделью ${cfg.model}`);
    const r = await analyzeTextLLM(input.text, cfg, existingTitles);
    if (r.analysis) {
      text = r.analysis;
      textDecisions.push({
        source: 'текст', evidence: `модель ${cfg.model}${r.cached ? ' (из кэша)' : r.attempts > 1 ? ', со 2-й попытки' : ''}`,
        rule: 'LLM: строгий JSON по схеме Mood, мотивы только из библиотеки и только со словами из текста, валидация + 1 повтор, temperature 0 + кэш → одинаковый ввод = одинаковый результат',
        effect: `анализ текста — LLM (уверенность ${text.confidence.toFixed(2)})`,
      });
      // перекрёстная проверка с правилами: если знаки валентности расходятся при уверенных правилах — честно отмечаем
      if (rules.confidence > 0.25 && Math.sign(rules.valence) !== Math.sign(text.valence) && Math.abs(rules.valence - text.valence) > 0.5) {
        textDecisions.push({ source: 'текст', evidence: `правила valence ${rules.valence.toFixed(2)} ↔ модель ${text.valence.toFixed(2)}`, rule: 'расхождение со словарём: модель видит контекст (ирония, «не»), словарь — отдельные слова', effect: 'берём модель, но отмечаем расхождение' });
      }
    } else {
      textDecisions.push({ source: 'текст', evidence: r.errors.slice(0, 2).join('; ') || 'нет ответа', rule: 'LLM не прошла валидацию за 2 попытки или недоступна → fallback на словарь правил', effect: 'анализ текста — правила (офлайн)', key: 7 });
    }
  } else {
    textDecisions.push({ source: 'текст', evidence: 'ключ модели не задан', rule: 'работа без ключей и без сети: словарь русских основ', effect: 'анализ текста — правила (офлайн)' });
  }

  progress('Раскладываю фото на цвета');
  const feats: PhotoFeatures[] = [];
  for (const p of input.photos) feats.push(await analyzePhoto(p));
  const hero = feats.length ? pickHero(feats) : -1;

  let song: Song | null = null;
  const songDecisions: Decision[] = [];
  if (input.song && (input.song.file || input.song.artist || input.song.title || input.song.hit)) {
    const r = await resolveSong(input.song, progress);
    song = r.song;
    songDecisions.push(r.decision);
  }

  const seed = hashString(
    [input.date, input.text.trim(), feats.map(f => f.hash).join(','), song ? `${song.artist}—${song.title}|${song.features?.bpm ?? ''}` : ''].join('|'),
  );

  progress('Сплетаю настроение');
  const fz = fuse(text, feats, hero, input.date, song);
  const decisions: Decision[] = [...textDecisions, ...fz.decisions, ...songDecisions];
  if (hero >= 0 && feats.length > 1) {
    decisions.push({
      source: 'фото',
      evidence: `фото №${hero + 1}: резкость ${feats[hero].sharpness.toFixed(2)}, контраст ${feats[hero].contrast.toFixed(2)}`,
      rule: 'hero-фото = максимум (резкость × 0.6 + контраст × 0.4)',
      effect: 'это фото становится главным кадром постера и открывает воспоминание',
    });
  }

  progress('Выбираю художественный язык');
  const st = buildStyle(fz.mood, hero >= 0 ? feats[hero] : null, feats.length, fz.conflict, seed, song, Number(input.date.slice(0, 4)), text.motifs);
  decisions.push(...st.decisions);
  if (feats.length > 1) {
    decisions.push({ source: 'фото', evidence: `${feats.length} фото`, rule: 'число фото → ритм монтажа: каждое фото получает свой отрезок между склейками', effect: `${feats.length} кадров по кругу, склейка каждые ${st.style.motion.beatsPerCut} долей` });
  }

  // название и подпись: от модели (если прошли валидацию: 3–7 слов, без штампов, без повторов в архиве), иначе по правилам
  let title: string;
  if (text.title) {
    title = text.title;
    decisions.push({ source: 'текст', evidence: `модель ${text.model}`, rule: 'название от LLM: деталь + время/место, 3–7 слов, без пафоса и эмодзи, без повторов в архиве (проверено валидатором)', effect: `«${title}»` });
  } else {
    const tt = makeTitle(input.text, fz.mood, input.date, existingTitles);
    title = tt.title;
    decisions.push(...tt.decisions);
  }
  const caption = text.caption || pickCaption(input.text);
  if (caption) decisions.push({ source: 'текст', evidence: `«${caption}»`, rule: text.caption ? 'подпись от LLM голосом автора, одна строка до 60 символов' : 'подпись = самое эмоционально нагруженное предложение автора, его же словами', effect: 'рукописная строка над названием' });

  progress('Печатаю воспоминание');
  const page = await nextPage();
  const poster = await renderPoster({
    photos: input.photos, heroIndex: hero, style: st.style,
    date: dateLine(input.date, fz.mood.timeOfDay), page: pageLabel(page),
    title, caption, seed,
  });

  const entry: DayEntry = {
    id: `${input.date}-${seed.toString(36)}`,
    date: input.date,
    page,
    text: input.text,
    photos: input.photos,
    heroIndex: hero,
    song,
    mood: fz.mood,
    style: st.style,
    title,
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
