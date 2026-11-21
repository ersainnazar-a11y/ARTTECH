// Видео воспоминания 720×1280.
// Основной путь: canvas.captureStream(30) + аудио через MediaStreamDestination → MediaRecorder (VP9/Opus, .webm).
// Если при записи fps падает ниже 24 — запись прерывается и включается покадровый офлайн-рендер
// через WebCodecs + Mediabunny (.mp4): каждый кадр рисуется в точный момент t = i/30, поэтому склейки на битах не плывут.

import type { DayEntry } from '../types';
import { MemoryPlayer } from '../render/player';
import { AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, QUALITY_MEDIUM, WebMOutputFormat, canEncodeAudio, canEncodeVideo } from 'mediabunny';

const FPS = 30, FADE = 1.2, MIN_FPS = 24;
export type VideoProgress = (p: number, note: string) => void;
export interface VideoResult { blob: Blob; ext: 'webm' | 'mp4'; mode: 'realtime' | 'offline'; fps: number }

/** фрагмент песни [start, start+duration] с фейдами в начале и в конце */
async function fadedClip(e: DayEntry, start: number, duration: number): Promise<AudioBuffer | null> {
  const blob = e.song?.blob ?? e.song?.previewBlob;
  if (!blob) return null;
  const ac = new AudioContext();
  try {
    const full = await ac.decodeAudioData(await blob.arrayBuffer());
    const sr = full.sampleRate;
    const off = new OfflineAudioContext(Math.min(2, full.numberOfChannels), Math.ceil(duration * sr), sr);
    const src = off.createBufferSource();
    src.buffer = full;
    const g = off.createGain();
    g.gain.setValueAtTime(0, 0);
    g.gain.linearRampToValueAtTime(1, FADE);
    g.gain.setValueAtTime(1, Math.max(FADE, duration - FADE));
    g.gain.linearRampToValueAtTime(0, duration);
    src.connect(g).connect(off.destination);
    src.start(0, start, duration);
    return await off.startRendering();
  } finally { ac.close(); }
}

export async function recordVideo(e: DayEntry, progress: VideoProgress = () => {}, force?: 'offline'): Promise<VideoResult> {
  progress(0, 'Готовлю кадры');
  const player = new MemoryPlayer(e, false);
  await player.load(false);
  try {
    const clip = await fadedClip(e, player.start, player.duration);
    if (force !== 'offline' && typeof MediaRecorder !== 'undefined') {
      const r = await realtime(player, clip, progress);
      if (r) return r;
      progress(0, `fps упал ниже ${MIN_FPS} — переключаюсь на покадровый рендер`);
    }
    return await offline(player, clip, progress);
  } finally {
    player.destroy();
  }
}

async function realtime(player: MemoryPlayer, clip: AudioBuffer | null, progress: VideoProgress): Promise<VideoResult | null> {
  const canvas = player.canvas;
  const stream = canvas.captureStream(FPS);
  const ac = new AudioContext();
  let src: AudioBufferSourceNode | null = null;
  if (clip) {
    src = ac.createBufferSource();
    src.buffer = clip;
    const dest = ac.createMediaStreamDestination();
    src.connect(dest);
    dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  }
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mimeType = types.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 160_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = ev => ev.data.size && chunks.push(ev.data);
  const stopped = new Promise<void>(r => (rec.onstop = () => r()));

  const dur = player.duration;
  await ac.resume().catch(() => {});
  // если браузер не дал запустить звук без жеста — AudioContext стоит на паузе, его часы не идут:
  // не записываем немое видео, а уходим в покадровый рендер (ему воспроизведение не нужно)
  if (clip && ac.state !== 'running') {
    stream.getTracks().forEach(t => t.stop());
    ac.close();
    return null;
  }
  player.drawAt(0);
  rec.start(250);
  const t0 = ac.currentTime + 0.05;
  src?.start(t0);
  const p0 = performance.now();
  let frames = 0, aborted = false, fps = 0;
  await new Promise<void>(done => {
    const loop = () => {
      // часы — AudioContext (с песней) или performance.now (без неё): кадр строго по времени, а не по счётчику
      const t = clip ? ac.currentTime - t0 : (performance.now() - p0) / 1000;
      if (t >= dur) { done(); return; }
      player.drawAt(Math.max(0, t));
      frames++;
      const wall = (performance.now() - p0) / 1000;
      fps = frames / Math.max(wall, 1e-3);
      if (wall > 1.5 && fps < MIN_FPS) { aborted = true; done(); return; }
      progress(Math.min(1, t / dur), `Запись в реальном времени · ${fps.toFixed(0)} fps`);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  rec.stop();
  src?.stop();
  await stopped;
  stream.getTracks().forEach(t => t.stop());
  ac.close();
  if (aborted) return null;
  return { blob: new Blob(chunks, { type: 'video/webm' }), ext: 'webm', mode: 'realtime', fps };
}

async function offline(player: MemoryPlayer, clip: AudioBuffer | null, progress: VideoProgress): Promise<VideoResult> {
  const mp4 = await canEncodeVideo('avc');
  const vcodec = mp4 ? 'avc' : 'vp9';
  const acodec = mp4 ? ((await canEncodeAudio('aac')) ? 'aac' : 'opus') : 'opus';
  const out = new Output({ format: mp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target: new BufferTarget() });
  const vs = new CanvasSource(player.canvas, { codec: vcodec, bitrate: QUALITY_HIGH });
  out.addVideoTrack(vs, { frameRate: FPS });
  let as: AudioBufferSource | null = null;
  if (clip) { as = new AudioBufferSource({ codec: acodec, bitrate: QUALITY_MEDIUM }); out.addAudioTrack(as); }
  await out.start();
  const n = Math.round(player.duration * FPS);
  const p0 = performance.now();
  for (let i = 0; i < n; i++) {
    player.drawAt(i / FPS);
    await vs.add(i / FPS, 1 / FPS);
    if (i % 15 === 0) {
      progress(i / n, `Покадровый рендер · кадр ${i}/${n}`);
      await new Promise(r => setTimeout(r, 0)); // не блокировать интерфейс
    }
  }
  if (as && clip) await as.add(clip);
  await out.finalize();
  const fps = n / ((performance.now() - p0) / 1000);
  return { blob: new Blob([out.target.buffer!], { type: mp4 ? 'video/mp4' : 'video/webm' }), ext: mp4 ? 'mp4' : 'webm', mode: 'offline', fps };
}
