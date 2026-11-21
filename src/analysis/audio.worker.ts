/// <reference lib="webworker" />
// Аудиоанализ в Web Worker (essentia.js, WASM): BPM + позиции битов, тональность, энергия,
// спектральная яркость, danceability. Вход — моно Float32Array 44.1 кГц (декодируется в основном потоке,
// потому что decodeAudioData в воркере недоступен).

import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js';
import Essentia from 'essentia.js/dist/essentia.js-core.es.js';

export interface AudioRequest { id: number; samples: Float32Array; sampleRate: number; offset: number }
export interface AudioResult {
  id: number;
  ok: boolean;
  error?: string;
  bpm?: number; beats?: number[]; rhythmConfidence?: number;
  key?: string; scale?: 'major' | 'minor'; keyStrength?: number;
  energy?: number; loudnessDb?: number; brightness?: number; centroidHz?: number; danceability?: number;
}

let essentia: any = null;
async function getEssentia() {
  if (essentia) return essentia;
  const M: any = EssentiaWASM;
  if (!M.calledRun) await new Promise<void>(r => { const prev = M.onRuntimeInitialized; M.onRuntimeInitialized = () => { prev?.(); r(); }; });
  essentia = new (Essentia as any)(M);
  return essentia;
}

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));

self.onmessage = async (e: MessageEvent<AudioRequest>) => {
  const { id, samples, sampleRate, offset } = e.data;
  try {
    const es = await getEssentia();
    const sig = es.arrayToVector(samples);

    // ритм: degara быстрее multifeature и достаточно точен для монтажа
    const rh = es.RhythmExtractor2013(sig, 208, 'degara', 40);
    const bpm: number = rh.bpm;
    const beats = Array.from(es.vectorToArray(rh.ticks) as Float32Array).map(t => t + offset);

    const k = es.KeyExtractor(sig, true, 4096, 4096, 12, 3500, 60, 25, 0.2, 'bgate', sampleRate);

    // громкость (RMS → дБ) и спектральный центроид по кадрам
    let sq = 0;
    for (let i = 0; i < samples.length; i++) sq += samples[i] * samples[i];
    const rms = Math.sqrt(sq / samples.length);
    const loudnessDb = 20 * Math.log10(rms + 1e-9);

    let cSum = 0, cN = 0;
    const frame = 2048, hop = 2048 * 4;
    for (let s = 0; s + frame < samples.length; s += hop) {
      const fr = es.arrayToVector(samples.subarray(s, s + frame));
      const w = es.Windowing(fr, true, frame, 'hann');
      const sp = es.Spectrum(w.frame, frame);
      const c = es.Centroid(sp.spectrum, sampleRate / 2).centroid;
      if (isFinite(c) && c > 0) { cSum += c; cN++; }
      fr.delete?.(); w.frame.delete?.(); sp.spectrum.delete?.();
    }
    const centroidHz = cN ? cSum / cN : 1500;

    const dn = es.Danceability(sig, 8800, 310, sampleRate);
    const danceability = clamp(dn.danceability / 3);

    const loud = clamp((loudnessDb + 26) / 16);
    const bpmN = clamp((bpm - 60) / 110);
    const energy = clamp(0.55 * loud + 0.25 * bpmN + 0.2 * danceability);
    const brightness = clamp((centroidHz - 700) / 2600);

    sig.delete?.();
    // degara не считает confidence → уверенность = регулярность межбитовых интервалов
    const ibi = beats.slice(1).map((b, i) => b - beats[i]);
    const mean = ibi.reduce((a, b) => a + b, 0) / Math.max(1, ibi.length);
    const cv = ibi.length > 3 ? Math.sqrt(ibi.reduce((a, b) => a + (b - mean) ** 2, 0) / ibi.length) / mean : 1;
    const res: AudioResult = {
      id, ok: true, bpm, beats, rhythmConfidence: clamp(1 - cv * 5),
      key: k.key, scale: k.scale === 'minor' ? 'minor' : 'major', keyStrength: k.strength,
      energy, loudnessDb, brightness, centroidHz, danceability,
    };
    (self as unknown as Worker).postMessage(res);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: String(err) } satisfies AudioResult);
  }
};
