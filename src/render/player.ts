// Проигрывание воспоминания 720×1280 с музыкой. Часы — currentTime аудио (кадры точно на битах);
// без песни — собственные часы. Фейд звука в начале и в конце.

import type { DayEntry } from '../types';
import { Pipeline } from './gl/pipeline';
import { buildScene, releaseScene, type Scene } from './scene';
import { buildTimeline, frameAt, type Timeline } from './timeline';
import { dateLine, pageLabel } from '../style/typography';

export const VIDEO_W = 720, VIDEO_H = 1280;
let shared: Pipeline | null = null;
const FADE = 1.2;

export class MemoryPlayer {
  private pipe: Pipeline;
  private scene: Scene | null = null;
  private tl: Timeline | null = null;
  private audio: HTMLAudioElement | null = null;
  private url: string | null = null;
  private raf = 0;
  private t0 = 0;
  onEnd: () => void = () => {};
  onTick: (t: number, beat: number) => void = () => {};

  constructor(private entry: DayEntry) {
    this.pipe = shared ??= new Pipeline(VIDEO_W, VIDEO_H);
  }

  get canvas() { return this.pipe.canvas; }
  get duration() { return this.tl?.duration ?? 0; }

  async load() {
    const e = this.entry;
    this.scene = await buildScene(this.pipe, {
      photos: e.photos, heroIndex: Math.max(0, e.heroIndex), style: e.style,
      date: dateLine(e.date, e.mood.timeOfDay), page: pageLabel(e.page), title: e.title, caption: e.caption, seed: e.seed,
    }, true);
    this.tl = buildTimeline(e.style, e.song?.features?.beats, this.scene.painted.length, e.seed);
    const blob = e.song?.blob ?? e.song?.previewBlob;
    const src = blob ? (this.url = URL.createObjectURL(blob)) : e.song?.previewUrl;
    if (src) {
      this.audio = new Audio(src);
      this.audio.preload = 'auto';
      await new Promise<void>(res => {
        const done = () => res();
        this.audio!.addEventListener('canplaythrough', done, { once: true });
        this.audio!.addEventListener('error', () => { this.audio = null; res(); }, { once: true });
        setTimeout(done, 6000);
      });
    }
    this.draw(0);
  }

  private draw(t: number) {
    const f = frameAt(this.tl!, t);
    const P = this.scene!.painted;
    this.pipe.frame(this.entry.style, {
      a: P[f.a], b: f.mix > 0 ? P[f.b] : undefined, mix: f.mix,
      zoomA: f.zoomA, panA: f.panA, zoomB: f.zoomB, panB: f.panB,
      rect: this.scene!.rect, frameAspect: this.scene!.frameAspect,
      pulse: f.pulse, seed: f.grainSeed, jitter: f.jitter,
    });
    this.onTick(t, f.beatIndex);
  }

  /** текущее время воспоминания (с) */
  private now(): number {
    if (this.audio) return this.audio.currentTime - this.tl!.start;
    return (performance.now() - this.t0) / 1000;
  }

  async play() {
    this.stop(false);
    const tl = this.tl!;
    if (this.audio) {
      this.audio.currentTime = tl.start;
      this.audio.volume = 0;
      try { await this.audio.play(); } catch { this.audio = null; }
    }
    this.t0 = performance.now();
    const loop = () => {
      const t = this.now();
      if (t >= tl.duration) { this.stop(true); return; }
      if (this.audio) {
        const v = Math.min(1, Math.max(0, t / FADE), Math.max(0, (tl.duration - t) / FADE));
        this.audio.volume = v;
      }
      this.draw(Math.max(0, t));
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(ended = false) {
    cancelAnimationFrame(this.raf);
    this.audio?.pause();
    if (ended) { this.draw(this.tl!.duration - 0.001); this.onEnd(); }
  }

  /** статичный кадр в момент t (для превью и проверки) */
  seek(t: number) { this.draw(Math.max(0, Math.min(t, this.duration))); }

  destroy() {
    this.stop(false);
    if (this.scene) releaseScene(this.pipe, this.scene);
    if (this.url) URL.revokeObjectURL(this.url);
    this.audio = null;
  }
}
