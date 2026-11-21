// Проигрывание воспоминания 720×1280 с музыкой. Часы — currentTime аудио (кадры точно на битах);
// без песни — собственные часы. Фейд звука в начале и в конце.

import type { DayEntry } from '../types';
import { Pipeline } from './gl/pipeline';
import { buildScene, frameParams, mainCycle, releaseScene, type Scene } from './scene';
import { buildTimeline, frameAt, type Timeline } from './timeline';
import { dateLine, pageLabel } from '../style/typography';

export const VIDEO_W = 720, VIDEO_H = 1280;
let shared: Pipeline | null = null;
const FADE = 1.2;

export class MemoryPlayer {
  private pipe: Pipeline;
  private scene: Scene | null = null;
  private tl: Timeline | null = null;
  private cycle: number[] = [0];
  private audio: HTMLAudioElement | null = null;
  private url: string | null = null;
  private raf = 0;
  private t0 = 0;
  onEnd: () => void = () => {};
  onTick: (t: number, beat: number) => void = () => {};

  /** что со звуком — показывается пользователю, а не глушится молча */
  audioState: 'none' | 'ok' | 'blocked' | 'error' = 'none';
  onAudioIssue: (message: string) => void = () => {};

  constructor(private entry: DayEntry, withAudio = true) {
    this.pipe = shared ??= new Pipeline(VIDEO_W, VIDEO_H);
    // аудиоэлемент создаётся СИНХРОННО в обработчике клика: браузеры разрешают звук только по жесту пользователя
    if (withAudio) this.audio = this.makeAudio();
  }

  /** источник звука: свой файл → кэш фрагмента (тип исправлен) → ссылка на фрагмент */
  private makeAudio(): HTMLAudioElement | null {
    const s = this.entry.song;
    if (!s) return null;
    let blob = s.blob ?? s.previewBlob;
    // iTunes отдаёт фрагменты как audio/x-m4p — Firefox и Safari такой тип не проигрывают, хотя внутри обычный AAC
    if (blob && (!blob.type || /x-m4p|octet-stream/.test(blob.type))) blob = new Blob([blob], { type: 'audio/mp4' });
    const src = blob ? (this.url = URL.createObjectURL(blob)) : s.previewUrl;
    if (!src) return null;
    const a = new Audio();
    a.preload = 'auto';
    a.src = src;
    // запасной путь: если кэш не играет, пробуем официальную ссылку
    a.addEventListener('error', () => {
      if (s.previewUrl && a.src !== s.previewUrl) { a.src = s.previewUrl; return; }
      this.audioState = 'error';
      this.onAudioIssue('Браузер не смог проиграть файл песни — воспоминание идёт без звука.');
    });
    return a;
  }

  /** вызвать синхронно в обработчике клика, до любых await: «разблокирует» звук для этого элемента */
  unlock() {
    const a = this.audio;
    if (!a) return;
    a.muted = true;
    a.play().then(() => { a.pause(); a.muted = false; }).catch(() => { a.muted = false; });
  }

  get canvas() { return this.pipe.canvas; }
  get duration() { return this.tl?.duration ?? 0; }

  /** время начала фрагмента в аудио (с) */
  get start() { return this.tl?.start ?? 0; }
  /** нарисовать кадр в момент t — для записи видео */
  drawAt(t: number) { this.draw(Math.max(0, Math.min(t, this.duration - 1e-3))); }

  async load(withAudio = true) {
    const e = this.entry;
    this.scene = await buildScene(this.pipe, {
      photos: e.photos, heroIndex: Math.max(0, e.heroIndex), style: e.style,
      date: dateLine(e.date, e.mood.timeOfDay), page: pageLabel(e.page), title: e.title, caption: e.caption, seed: e.seed,
    }, true);
    this.cycle = mainCycle(this.scene);
    this.tl = buildTimeline(e.style, e.song?.features?.beats, this.cycle.length, e.seed, this.scene.cardRects.length);
    if (!withAudio) { this.audio = null; }
    const a = this.audio;
    if (a && a.readyState < 4) {
      await new Promise<void>(res => {
        a.addEventListener('canplaythrough', () => res(), { once: true });
        setTimeout(res, 6000);
      });
    }
    this.draw(0);
  }

  private draw(t: number) {
    const f = frameAt(this.tl!, t);
    this.pipe.frame(this.entry.style, frameParams(this.scene!, this.cycle, f, t));
    this.onTick(t, f.beatIndex);
  }

  /** текущее время воспоминания (с) */
  private now(): number {
    if (this.audio && this.audioState === 'ok') return this.audio.currentTime - this.tl!.start;
    return (performance.now() - this.t0) / 1000;
  }

  async play() {
    this.stop(false);
    const tl = this.tl!;
    if (this.audio && this.audioState !== 'error') {
      this.audio.currentTime = tl.start;
      this.audio.volume = 0;
      try {
        await this.audio.play();
        this.audioState = 'ok';
      } catch (err) {
        // звук заблокирован политикой автозапуска: не молчим, а говорим, что делать
        this.audioState = 'blocked';
        this.onAudioIssue((err as DOMException)?.name === 'NotAllowedError'
          ? 'Браузер заблокировал звук. Нажмите «Воспроизвести» ещё раз — теперь звук разрешится.'
          : 'Звук не запустился: ' + String((err as Error)?.message ?? err));
      }
    }
    this.t0 = performance.now();
    const loop = () => {
      const t = this.now();
      if (t >= tl.duration) { this.stop(true); return; }
      if (this.audio && this.audioState === 'ok') {
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
