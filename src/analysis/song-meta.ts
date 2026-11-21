// Песня дня. Приоритет источников:
// 1) свой файл → полный анализ; 2) официальный 30-с фрагмент iTunes → полный анализ (CORS открыт);
// 3) только название/метаданные → оценка по описанию (жанр, год), помечается featuresFrom: 'description'.

import type { Song } from '../types';
import type { AudioRequest, AudioResult } from './audio.worker';
import { clamp } from '../util/seed';

export interface ItunesHit {
  trackName: string; artistName: string; previewUrl?: string; releaseDate?: string;
  primaryGenreName?: string; artworkUrl100?: string; trackViewUrl?: string;
}

export async function searchItunes(query: string, limit = 6): Promise<ItunesHit[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=${limit}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`iTunes ${r.status}`);
  const j = await r.json();
  return (j.results ?? []) as ItunesHit[];
}

// — декодирование в основном потоке (AudioContext недоступен в воркере), моно, 44.1 кГц
const SR = 44100;
export async function decodeMono(buf: ArrayBuffer, pickStart: (dur: number) => number = () => 0, maxDur = Infinity): Promise<{ samples: Float32Array; duration: number; offset: number }> {
  const ac = new AudioContext();
  try {
    const audio = await ac.decodeAudioData(buf);
    const duration = audio.duration;
    const offset = Math.max(0, Math.min(pickStart(duration), duration - 1));
    const len = Math.min(duration - offset, maxDur);
    const off = new OfflineAudioContext(1, Math.ceil(len * SR), SR);
    const src = off.createBufferSource();
    src.buffer = audio;
    src.connect(off.destination);
    src.start(0, offset, len);
    const rendered = await off.startRendering();
    return { samples: rendered.getChannelData(0).slice(), duration, offset };
  } finally {
    ac.close();
  }
}

let worker: Worker | null = null;
let reqId = 0;
function analyzeInWorker(samples: Float32Array, offset: number): Promise<AudioResult> {
  worker ??= new Worker(new URL('./audio.worker.ts', import.meta.url), { type: 'module' });
  const id = ++reqId;
  return new Promise((resolve, reject) => {
    const onMsg = (e: MessageEvent<AudioResult>) => {
      if (e.data.id !== id) return;
      worker!.removeEventListener('message', onMsg);
      e.data.ok ? resolve(e.data) : reject(new Error(e.data.error));
    };
    worker!.addEventListener('message', onMsg);
    worker!.addEventListener('error', ev => reject(new Error(ev.message)), { once: true });
    const msg: AudioRequest = { id, samples, sampleRate: SR, offset };
    worker!.postMessage(msg, [samples.buffer]);
  });
}

/** длинный трек: анализируем 60 с начиная с ~25% (обычно там уже идёт основная часть) */
export async function analyzeAudio(buf: ArrayBuffer): Promise<{ features: NonNullable<Song['features']>; confidence: number; duration: number }> {
  const { samples, offset, duration: dur } = await decodeMono(buf, d => (d > 75 ? Math.round(d * 0.25) : 0), 60);
  const r = await analyzeInWorker(samples, offset);
  return {
    duration: dur,
    confidence: clamp(0.55 + 0.4 * (r.rhythmConfidence ?? 0.5)),
    features: {
      bpm: r.bpm!, beats: r.beats!, key: r.key!, scale: r.scale!,
      energy: r.energy!, brightness: r.brightness!, danceability: r.danceability!,
      keyStrength: r.keyStrength, loudnessDb: r.loudnessDb, centroidHz: r.centroidHz,
    },
  };
}

// — оценка «по описанию»: таблица жанров (без сети и без LLM). Честно помечается.
const GENRE: [RegExp, { bpm: number; energy: number; brightness: number; danceability: number; scale: 'major' | 'minor' }][] = [
  [/metal|hard rock|punk/i, { bpm: 140, energy: 0.9, brightness: 0.75, danceability: 0.4, scale: 'minor' }],
  [/dance|house|techno|edm|electro/i, { bpm: 124, energy: 0.85, brightness: 0.7, danceability: 0.9, scale: 'minor' }],
  [/hip-hop|rap|trap/i, { bpm: 92, energy: 0.72, brightness: 0.55, danceability: 0.8, scale: 'minor' }],
  [/k-pop|pop/i, { bpm: 114, energy: 0.68, brightness: 0.62, danceability: 0.72, scale: 'major' }],
  [/r&b|soul|funk/i, { bpm: 96, energy: 0.55, brightness: 0.48, danceability: 0.75, scale: 'minor' }],
  [/rock|alternative|indie/i, { bpm: 122, energy: 0.7, brightness: 0.6, danceability: 0.5, scale: 'major' }],
  [/jazz|blues/i, { bpm: 100, energy: 0.42, brightness: 0.42, danceability: 0.55, scale: 'minor' }],
  [/classical|piano|instrumental|soundtrack|score/i, { bpm: 80, energy: 0.3, brightness: 0.4, danceability: 0.2, scale: 'minor' }],
  [/ambient|new age|lo-?fi|chill/i, { bpm: 78, energy: 0.22, brightness: 0.3, danceability: 0.35, scale: 'major' }],
  [/singer|songwriter|folk|acoustic|country/i, { bpm: 96, energy: 0.38, brightness: 0.45, danceability: 0.4, scale: 'major' }],
  [/reggae|latin|afro/i, { bpm: 98, energy: 0.65, brightness: 0.55, danceability: 0.85, scale: 'major' }],
];

export function describeFeatures(genre?: string): { features: NonNullable<Song['features']>; confidence: number } | null {
  if (!genre) return null;
  const g = GENRE.find(([re]) => re.test(genre));
  if (!g) return null;
  const f = g[1];
  const period = 60 / f.bpm;
  return {
    confidence: 0.35,
    features: { bpm: f.bpm, beats: Array.from({ length: Math.ceil(40 / period) }, (_, i) => i * period), key: '—', scale: f.scale, energy: f.energy, brightness: f.brightness, danceability: f.danceability },
  };
}

export const yearOf = (iso?: string) => (iso ? Number(iso.slice(0, 4)) || undefined : undefined);
