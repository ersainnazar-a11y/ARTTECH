// LLM-анализ текста через OpenAI-совместимый endpoint (провайдер, модель и ключ задаются в Настройках,
// хранятся только в localStorage этого браузера). Строгий JSON по схеме → валидация → 1 повтор с ошибками → fallback на правила.
// Детерминированность: temperature 0 + кэш ответа по хэшу (модель + текст), поэтому одинаковый ввод даёт одинаковый результат.

import type { MotifId, Season, Sensory, TimeOfDay, Weather } from '../types';
import { MOTIF_TRIGGERS, normalize, tokenize, type Axis, type TextAnalysis, type TextHit } from './text-rules';
import { clamp, hashString } from '../util/seed';

export interface LlmConfig { enabled: boolean; baseUrl: string; model: string; apiKey: string }
const CFG_KEY = 'diary.llm';
const CACHE_PREFIX = 'diary.llmcache.';

export function loadLlmConfig(): LlmConfig {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) return { enabled: false, baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '', ...JSON.parse(raw) };
  } catch { /* приватный режим — работаем на правилах */ }
  return { enabled: false, baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '' };
}
export function saveLlmConfig(c: LlmConfig) { try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch { /* ignore */ } }
export const llmReady = (c: LlmConfig) => c.enabled && !!c.apiKey && !!c.baseUrl && !!c.model;

const MOTIF_IDS = MOTIF_TRIGGERS.map(([id]) => id);
const TIMES: TimeOfDay[] = ['утро', 'день', 'вечер', 'ночь'];
const SEASONS: Season[] = ['зима', 'весна', 'лето', 'осень'];
const WEATHERS: Weather[] = ['дождь', 'снег', 'туман', 'солнце', 'ветер', 'гроза', 'пасмурно'];
const AXES: Axis[] = ['v', 'a', 'w', 'n', 's', 'i'];
const BANNED = /незабываем|волшебн|невероятн|потрясающ|самый лучший|магическ|сказочн|чудесн/i;
const EMOJI = /\p{Extended_Pictographic}/u;

const SYSTEM = `Ты анализируешь запись личного дневника на русском и возвращаешь ТОЛЬКО JSON без пояснений.
Схема:
{
 "valence": число -1..1 (настроение: -1 тяжело, 1 светло),
 "arousal": 0..1 (возбуждение: 0 покой, 1 суета/драйв),
 "warmth": 0..1 (тактильное тепло дня: холод/уют),
 "nostalgia": 0..1, "social": 0..1 (сколько людей), "intimacy": 0..1 (близость),
 "timeOfDay": "утро"|"день"|"вечер"|"ночь"|null,
 "season": "зима"|"весна"|"лето"|"осень"|null,
 "weather": "дождь"|"снег"|"туман"|"солнце"|"ветер"|"гроза"|"пасмурно"|null,
 "motifs": [{"id": один из ${JSON.stringify(MOTIF_IDS)}, "word": "слово ровно как в тексте"}] — только то, что ПРЯМО названо в тексте, максимум 4, по порядку появления,
 "evidence": [{"word": "слово ровно как в тексте", "axis": "v"|"a"|"w"|"n"|"s"|"i", "sign": 1|-1}] — 3–8 слов, которые сильнее всего определили оси,
 "sensory": {"light": [], "sounds": [], "smells": [], "textures": []} — слова из текста,
 "title": "название дня, 3–7 слов: конкретная деталь + время или место, тепло и просто, без пафоса и штампов (незабываемый, волшебный), без эмодзи, без точки. Примеры: Осенний парк и какао; Ночь в офисе перед сдачей; Дождливое утро без будильника",
 "caption": "одна строка для рукописной подписи, до 60 символов, голосом автора (можно его собственные слова), со строчной буквы, без кавычек",
 "confidence": 0..1
}
Не придумывай того, чего нет в тексте. Не путай грусть с холодом: warmth — про ощущение тепла, а не про настроение.`;

interface Raw {
  valence: number; arousal: number; warmth: number; nostalgia: number; social: number; intimacy: number;
  timeOfDay: TimeOfDay | null; season: Season | null; weather: Weather | null;
  motifs: { id: MotifId; word: string }[];
  evidence: { word: string; axis: Axis; sign: number }[];
  sensory: Sensory; title: string; caption: string; confidence: number;
}

/** проверка ответа: числа в диапазонах, перечисления, мотивы только из библиотеки и только со словами из текста, правила названия */
export function validate(j: unknown, text: string, takenTitles: string[]): { ok: true; v: Raw } | { ok: false; errors: string[] } {
  const e: string[] = [];
  if (!j || typeof j !== 'object') return { ok: false, errors: ['ответ не является JSON-объектом'] };
  const o = j as Record<string, unknown>;
  const num = (k: string, lo: number, hi: number) => { const v = o[k]; if (typeof v !== 'number' || !isFinite(v) || v < lo || v > hi) e.push(`${k} должно быть числом ${lo}..${hi}`); };
  num('valence', -1, 1); for (const k of ['arousal', 'warmth', 'nostalgia', 'social', 'intimacy', 'confidence']) num(k, 0, 1);
  const en = (k: string, list: readonly string[]) => { if (o[k] !== null && o[k] !== undefined && !list.includes(o[k] as string)) e.push(`${k} должно быть одним из ${list.join(', ')} или null`); };
  en('timeOfDay', TIMES); en('season', SEASONS); en('weather', WEATHERS);
  const norm = normalize(text);
  const inText = (w: unknown) => typeof w === 'string' && w.trim().length > 1 && norm.includes(normalize(w.trim()));
  if (!Array.isArray(o.motifs)) e.push('motifs должно быть массивом');
  else for (const m of o.motifs as { id: string; word: string }[]) {
    if (!MOTIF_IDS.includes(m?.id as MotifId)) e.push(`мотив «${m?.id}» не из библиотеки`);
    else if (!inText(m.word)) e.push(`слово мотива «${m?.word}» не найдено в тексте`);
  }
  if (!Array.isArray(o.evidence)) e.push('evidence должно быть массивом');
  else for (const x of o.evidence as { word: string; axis: string; sign: number }[]) {
    if (!AXES.includes(x?.axis as Axis) || (x?.sign !== 1 && x?.sign !== -1)) e.push('evidence: axis из v,a,w,n,s,i и sign 1/-1');
    else if (!inText(x.word)) e.push(`слово «${x?.word}» из evidence не найдено в тексте`);
  }
  const s = o.sensory as Record<string, unknown> | undefined;
  if (!s || typeof s !== 'object' || !['light', 'sounds', 'smells', 'textures'].every(k => Array.isArray(s[k]))) e.push('sensory должен содержать 4 массива');
  const title = typeof o.title === 'string' ? o.title.trim().replace(/[.!]+$/, '') : '';
  const words = title.split(/\s+/).filter(Boolean).length;
  if (words < 3 || words > 7) e.push('title: 3–7 слов');
  if (BANNED.test(title) || EMOJI.test(title)) e.push('title: без пафоса, штампов и эмодзи');
  if (takenTitles.some(t => normalize(t) === normalize(title))) e.push('title уже есть в архиве — нужен другой');
  const cap = typeof o.caption === 'string' ? o.caption.trim() : '';
  if (!cap || cap.length > 70 || EMOJI.test(cap)) e.push('caption: одна строка до 60 символов без эмодзи');
  if (e.length) return { ok: false, errors: e.slice(0, 8) };
  return { ok: true, v: { ...(o as unknown as Raw), title, caption: cap.replace(/^["«]|["»]$/g, '') } };
}

async function chat(cfg: LlmConfig, messages: { role: string; content: string }[], signal?: AbortSignal): Promise<string> {
  const r = await fetch(cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model: cfg.model, temperature: 0, seed: 7, response_format: { type: 'json_object' }, messages }),
    signal: signal ?? AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? '';
}

const parse = (s: string): unknown => { try { return JSON.parse(s.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { return null; } };

export async function testLlm(cfg: LlmConfig): Promise<string> {
  const out = await chat(cfg, [{ role: 'user', content: 'Ответь JSON {"ok": true}' }], AbortSignal.timeout(15000));
  return parse(out) ? 'связь есть' : `ответ не JSON: ${out.slice(0, 80)}`;
}

export interface LlmTextResult { analysis: TextAnalysis | null; attempts: number; errors: string[]; cached: boolean }

/** анализ текста LLM → TextAnalysis (та же форма, что у правил, поэтому слияние не меняется) */
export async function analyzeTextLLM(text: string, cfg: LlmConfig, takenTitles: string[]): Promise<LlmTextResult> {
  const key = CACHE_PREFIX + hashString(cfg.model + '|' + cfg.baseUrl + '|' + text.trim()).toString(36);
  let raw: Raw | null = null, attempts = 0, cached = false;
  const errors: string[] = [];
  try {
    const c = localStorage.getItem(key);
    if (c) { const v = validate(JSON.parse(c), text, takenTitles); if (v.ok) { raw = v.v; cached = true; } }
  } catch { /* ignore */ }

  const messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content: text }];
  while (!raw && attempts < 2) {
    attempts++;
    let content: string;
    try { content = await chat(cfg, messages); } catch (err) { errors.push(String(err instanceof Error ? err.message : err)); break; }
    const v = validate(parse(content), text, takenTitles);
    if (v.ok) { raw = v.v; try { localStorage.setItem(key, JSON.stringify(raw)); } catch { /* ignore */ } break; }
    errors.push(...v.errors);
    // один повтор: показываем модели её ошибки
    messages.push({ role: 'assistant', content }, { role: 'user', content: `Исправь ответ. Ошибки: ${v.errors.join('; ')}. Верни только JSON по схеме.` });
  }
  if (!raw) return { analysis: null, attempts, errors, cached };

  const tokens = tokenize(text);
  const hits: TextHit[] = raw.evidence.map(x => ({ word: x.word.trim(), axes: { [x.axis]: 0.8 * x.sign }, negated: false, boosted: false }));
  const findAt = (w: string) => { const n = normalize(w).split(/\s+/)[0]; const i = tokens.findIndex(t => t.startsWith(n.slice(0, Math.max(3, n.length - 2)))); return i < 0 ? 999 : i; };
  const wordFor = (pred: (t: string) => boolean) => tokens.find(pred) ?? null;
  return {
    attempts, errors, cached,
    analysis: {
      valence: raw.valence, arousal: raw.arousal, warmth: raw.warmth, nostalgia: raw.nostalgia, social: raw.social, intimacy: raw.intimacy,
      timeOfDay: raw.timeOfDay ?? null, timeWord: raw.timeOfDay ? (wordFor(t => t.startsWith(raw!.timeOfDay!.slice(0, 3))) ?? raw.timeOfDay) : null,
      season: raw.season ?? null, seasonWord: raw.season ? (wordFor(t => t.startsWith(raw!.season!.slice(0, 3))) ?? raw.season) : null,
      weather: raw.weather ?? null, weatherWord: raw.weather,
      motifs: raw.motifs.slice(0, 4).map(m => ({ id: m.id, word: m.word.trim(), at: findAt(m.word) })).sort((a, b) => a.at - b.at),
      sensory: raw.sensory, hits,
      confidence: clamp(0.55 + 0.4 * raw.confidence),
      tokens, source: 'llm', model: cfg.model, title: raw.title, caption: raw.caption,
    },
  };
}

// — песня только по названию: LLM оценивает признаки по исполнителю/названию/году (featuresFrom: 'description')
export interface SongGuess { bpm: number; energy: number; brightness: number; danceability: number; scale: 'major' | 'minor'; year?: number; genre?: string; confidence: number }

export async function describeSongLLM(cfg: LlmConfig, artist: string, title: string): Promise<SongGuess | null> {
  const key = CACHE_PREFIX + 'song.' + hashString(cfg.model + '|' + normalize(`${artist}—${title}`)).toString(36);
  try { const c = localStorage.getItem(key); if (c) return JSON.parse(c); } catch { /* ignore */ }
  const sys = `Оцени музыкальные признаки песни по исполнителю и названию. Верни ТОЛЬКО JSON:
{"bpm": 40..220, "energy": 0..1, "brightness": 0..1 (яркость тембра), "danceability": 0..1, "scale": "major"|"minor", "year": число|null, "genre": строка|null, "confidence": 0..1}
Если песню не знаешь — confidence ниже 0.3.`;
  try {
    const out = parse(await chat(cfg, [{ role: 'system', content: sys }, { role: 'user', content: `${artist} — ${title}` }]));
    const o = out as Record<string, unknown> | null;
    if (!o) return null;
    const n = (k: string, lo: number, hi: number) => typeof o[k] === 'number' && (o[k] as number) >= lo && (o[k] as number) <= hi;
    if (!n('bpm', 40, 220) || !n('energy', 0, 1) || !n('brightness', 0, 1) || !n('danceability', 0, 1) || !['major', 'minor'].includes(o.scale as string) || !n('confidence', 0, 1)) return null;
    const g: SongGuess = { bpm: o.bpm as number, energy: o.energy as number, brightness: o.brightness as number, danceability: o.danceability as number, scale: o.scale as 'major' | 'minor', year: typeof o.year === 'number' ? o.year : undefined, genre: typeof o.genre === 'string' ? o.genre : undefined, confidence: o.confidence as number };
    try { localStorage.setItem(key, JSON.stringify(g)); } catch { /* ignore */ }
    return g;
  } catch { return null; }
}
