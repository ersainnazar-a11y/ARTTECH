// Бит-синхронный монтаж. Чистая функция: (стиль, биты, число фото, seed, t) → параметры кадра.
// Склейки стоят на РЕАЛЬНЫХ битах из beats[]; растворения центрированы на доле; жёсткие склейки — точно на доле.

import type { DayStyle } from '../types';
import { clamp, rng, smooth } from '../util/seed';

export interface Segment { start: number; end: number; photo: number; z0: number; z1: number; p0: [number, number]; p1: [number, number] }
export interface Timeline { start: number; duration: number; beats: number[]; segments: Segment[]; beat: number; transition: number; pulse: number; jitter: number }

export function buildTimeline(style: DayStyle, beatsAbs: number[] | undefined, photoCount: number, seed: number): Timeline {
  const M = style.motion;
  const beat = 60 / M.bpm;
  const duration = M.duration;
  let beats = (beatsAbs ?? []).filter(b => b >= M.start - 1e-3 && b <= M.start + duration + 1e-3).map(b => b - M.start);
  if (beats.length < 4) beats = Array.from({ length: Math.ceil(duration / beat) + 1 }, (_, i) => i * beat);

  // точки склеек: каждые beatsPerCut долей (только если фото больше одного)
  const cutTimes = [0];
  if (photoCount > 1) for (let i = M.beatsPerCut; i < beats.length; i += M.beatsPerCut) if (beats[i] < duration - beat) cutTimes.push(beats[i]);
  const r = rng(seed ^ 0x9e3779b9);
  const segments: Segment[] = cutTimes.map((s, i) => {
    const end = cutTimes[i + 1] ?? duration;
    const zin = r() < 0.5 + (i % 2 ? 0.2 : -0.2); // наезд/отъезд чередуются, но не строго
    const span = M.camera * (photoCount > 1 ? 1 : Math.max(1, (end - s) / (beat * 8)) ** 0.5);
    const z0 = zin ? 1.02 : 1.02 + span, z1 = zin ? 1.02 + span : 1.02;
    const zmax = Math.max(z0, z1), room = 0.5 - 0.5 / zmax;
    const ang = r() * Math.PI * 2, amp = room * 0.8;
    return {
      start: s, end, photo: i % Math.max(1, photoCount), z0, z1,
      p0: [Math.cos(ang) * amp, Math.sin(ang) * amp], p1: [-Math.cos(ang) * amp * 0.6, -Math.sin(ang) * amp * 0.6],
    };
  });
  return {
    start: M.start, duration, beats, segments, beat,
    transition: M.transitionBeats * beat,
    pulse: M.pulse,
    jitter: style.modes.film * 1.6 + style.modes.collage * 0.6,
  };
}

const ease = (x: number) => x * x * (3 - 2 * x);

function kb(s: Segment, t: number): { z: number; p: [number, number] } {
  const u = ease(clamp((t - s.start) / Math.max(0.001, s.end - s.start)));
  return { z: s.z0 + (s.z1 - s.z0) * u, p: [s.p0[0] + (s.p1[0] - s.p0[0]) * u, s.p0[1] + (s.p1[1] - s.p0[1]) * u] };
}

const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export interface FrameState { a: number; b: number; mix: number; zoomA: number; panA: [number, number]; zoomB: number; panB: [number, number]; pulse: number; jitter: [number, number]; grainSeed: number; beatIndex: number }

export function frameAt(tl: Timeline, t: number): FrameState {
  const segs = tl.segments;
  let i = segs.findIndex(s => t < s.end);
  if (i < 0) i = segs.length - 1;
  const cur = segs[i];
  const next = segs[i + 1];
  const prev = segs[i - 1];

  // переход вокруг склейки: растворение [T − td/2, T + td/2], или жёсткая склейка ровно на доле
  let a = cur, b: Segment | null = null, mix = 0;
  const td = tl.transition;
  if (td > 0 && next && t > cur.end - td / 2) { a = cur; b = next; mix = smooth(cur.end - td / 2, cur.end + td / 2, t); }
  else if (td > 0 && prev && t < cur.start + td / 2) { a = prev; b = cur; mix = smooth(cur.start - td / 2, cur.start + td / 2, t); }
  const ka = kb(a, t), kbb = b ? kb(b, t) : ka;

  // пульсация: затухающий импульс на каждую долю, сильная доля (каждая 4-я) — ярче
  let pulse = 0, bi = 0;
  for (let k = 0; k < tl.beats.length; k++) {
    const bt = tl.beats[k];
    if (bt > t) break;
    bi = k;
    const dt = t - bt;
    if (dt < 0.5) pulse += Math.exp(-dt / 0.11) * (k % 4 === 0 ? 1.6 : 1);
  }
  pulse *= tl.pulse;
  // сильные доли «приклеивают» кадр: небольшой толчок масштаба
  const punch = 1 + pulse * 0.6;

  const fi = Math.floor(t * 12); // дрожание плёнки ~12 раз в секунду
  const jitter: [number, number] = [(hash(fi) - 0.5) * 2 * tl.jitter, (hash(fi + 77) - 0.5) * 2 * tl.jitter];

  return {
    a: a.photo, b: b ? b.photo : a.photo, mix: b ? mix : 0,
    zoomA: ka.z * punch, panA: ka.p, zoomB: kbb.z * punch, panB: kbb.p,
    pulse: pulse * 0.5, jitter, grainSeed: hash(Math.floor(t * 24) + 3.3), beatIndex: bi,
  };
}
