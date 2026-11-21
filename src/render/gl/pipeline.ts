// Процедурный WebGL2-пайплайн. Все параметры — из DayStyle.
// Подготовка (один раз на фото): 2) цветокоррекция → структурный тензор → 3) анизотропный Кувахара.
// Каждый кадр: 1) раскладка + Ken Burns + переходы → halation → 6) плёнка + 7) бумага и типографика.
// 4) геометрия (SDF) и 5) частицы мотивов добавляются в фазе 3.

import type { DayStyle } from '../../types';
import { createGL, pass, program, target, texture, type Prog, type Target } from './helper';
import VS from './shaders/fullscreen.vert.glsl?raw';
import GRADE from './shaders/grade.frag.glsl?raw';
import TENSOR from './shaders/tensor.frag.glsl?raw';
import BLUR from './shaders/blur.frag.glsl?raw';
import KUWA from './shaders/kuwahara.frag.glsl?raw';
import LAYOUT from './shaders/layout.frag.glsl?raw';
import COMP from './shaders/composite.frag.glsl?raw';

export interface Rect { cx: number; cy: number; hw: number; hh: number } // px, y сверху

/** раскладка фото: «воздух» = масштаб внутри свободной зоны между шапкой и текстом */
export function photoRect(L: DayStyle['layout'], aspect: number, W: number, _H: number, top: number, bottom: number): Rect {
  const M = W * 0.06;
  const availW = W - 2 * M;
  const availH = Math.max(100, bottom - top);
  let w = availW * L.photoScale;
  let h = w / aspect;
  const maxH = availH * Math.min(1, L.photoScale + 0.08);
  if (h > maxH) { h = maxH; w = h * aspect; }
  const cy = top + (availH - h) * L.centerY + h / 2;
  return { cx: W / 2, cy, hw: w / 2, hh: h / 2 };
}

/** пропорция рамки: от пропорции фото к 4:5 на долю layout.crop */
export const frameAspectOf = (photoAspect: number, crop: number) => Math.exp(Math.log(photoAspect) * (1 - crop) + Math.log(0.8) * crop);
export const coverScale = (frameAspect: number, photoAspect: number): [number, number] =>
  frameAspect < photoAspect ? [frameAspect / photoAspect, 1] : [1, photoAspect / frameAspect];

/** фото, уже «написанное» стилем дня */
export interface Painted { tex: WebGLTexture; w: number; h: number; aspect: number }

export interface FrameParams {
  a: Painted; b?: Painted; mix: number;
  zoomA: number; panA: [number, number]; zoomB: number; panB: [number, number];
  rect: Rect; frameAspect: number;
  pulse: number; seed: number; jitter?: [number, number];
}

const raf = () => new Promise<void>(r => requestAnimationFrame(() => r()));

export class Pipeline {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private progs: Record<'grade' | 'tensor' | 'blur' | 'kuwa' | 'layout' | 'comp', Prog>;
  private t: Record<'photo' | 'haloA' | 'haloB', Target>;
  private vao: WebGLVertexArrayObject;
  private typeTex: WebGLTexture | null = null;

  constructor(readonly W: number, readonly H: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    const gl = (this.gl = createGL(this.canvas));
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.progs = {
      grade: program(gl, VS, GRADE), tensor: program(gl, VS, TENSOR), blur: program(gl, VS, BLUR),
      kuwa: program(gl, VS, KUWA), layout: program(gl, VS, LAYOUT), comp: program(gl, VS, COMP),
    };
    this.t = { photo: target(gl, W, H), haloA: target(gl, W >> 2, H >> 2), haloB: target(gl, W >> 2, H >> 2) };
  }

  /** цветокоррекция + Кувахара в пространстве фото. Радиус мазка задан для постера 1080 и пересчитывается под плотность пикселей. */
  async paint(src: TexImageSource, srcW: number, srcH: number, style: DayStyle, rectW: number, frameAspect: number): Promise<Painted> {
    const { gl, progs } = this;
    gl.bindVertexArray(this.vao);
    const aspect = srcW / srcH;
    const sc = coverScale(frameAspect, aspect);
    // видимая часть фото ≈ ширина рамки × 1.2 (запас под Ken Burns)
    const targetW = Math.min(2048, Math.max(256, Math.round((rectW * 1.2) / sc[0])));
    const w = Math.min(targetW, srcW), h = Math.max(8, Math.round(w / aspect));
    const pxPerPoster = (w * sc[0]) / (rectW * (1080 / this.W)); // пикселей фото на пиксель постера
    const photoTex = texture(gl, src);
    const S = style;
    const tmp = { g: target(gl, w, h), t: target(gl, w, h, true), b1: target(gl, w, h, true), b2: target(gl, w, h, true) };
    const out = target(gl, w, h);
    pass(gl, progs.grade, tmp.g, w, h, {
      uPhoto: photoTex,
      uExposure: S.grade.exposure, uContrast: S.grade.contrast, uSat: S.grade.saturation,
      uSplitBal: S.grade.splitBalance, uWarmShadows: S.film.warmShadows,
      uLift: S.grade.lift, uGamma: S.grade.gamma, uGain: S.grade.gain,
      uSplitS: S.grade.splitShadow, uSplitH: S.grade.splitHighlight,
    });
    const texel = [1 / w, 1 / h];
    const sig = 2.0 * Math.max(0.5, pxPerPoster) + 0.5;
    pass(gl, progs.tensor, tmp.t, w, h, { uSrc: tmp.g.tex, uTexel: texel });
    pass(gl, progs.blur, tmp.b1, w, h, { uSrc: tmp.t.tex, uDir: [1 / w, 0], uSigma: sig, uBright: 0 });
    pass(gl, progs.blur, tmp.b2, w, h, { uSrc: tmp.b1.tex, uDir: [0, 1 / h], uSigma: sig, uBright: 0 });
    await raf();
    pass(gl, progs.kuwa, out, w, h, {
      uSrc: tmp.g.tex, uTensor: tmp.b2.tex, uTexel: texel,
      uRadius: Math.min(20, Math.max(1, S.painterly.radius * pxPerPoster)), uSharpness: S.painterly.sharpness, uHardness: 8,
      uStrength: S.painterly.strength,
    }, Math.max(1, Math.round((w * h) / 300000)));
    gl.finish();
    for (const x of Object.values(tmp)) { gl.deleteFramebuffer(x.fbo); gl.deleteTexture(x.tex); }
    gl.deleteTexture(photoTex);
    gl.deleteFramebuffer(out.fbo);
    await raf();
    return { tex: out.tex, w, h, aspect };
  }

  setOverlay(type: HTMLCanvasElement) {
    const { gl } = this;
    if (this.typeTex) gl.deleteTexture(this.typeTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    this.typeTex = texture(gl, type);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  release(p: Painted) { this.gl.deleteTexture(p.tex); }

  /** один кадр воспоминания */
  frame(S: DayStyle, f: FrameParams) {
    const { gl, W, H, t, progs } = this;
    gl.bindVertexArray(this.vao);
    const j = f.jitter ?? [0, 0];
    const rect = [f.rect.cx + j[0], H - f.rect.cy + j[1], f.rect.hw, f.rect.hh];
    const b = f.b ?? f.a;
    pass(gl, progs.layout, t.photo, W, H, {
      uA: f.a.tex, uB: b.tex, uRes: [W, H], uRect: rect, uRot: S.layout.rotation,
      uScaleA: coverScale(f.frameAspect, f.a.aspect), uScaleB: coverScale(f.frameAspect, b.aspect),
      uZoomA: f.zoomA, uZoomB: f.zoomB, uPanA: f.panA, uPanB: f.panB,
      uMix: f.b ? f.mix : 0, uPulse: f.pulse,
    });
    const hw = t.haloA.w, hh = t.haloA.h;
    pass(gl, progs.blur, t.haloA, hw, hh, { uSrc: t.photo.tex, uDir: [1 / hw, 0], uSigma: 6, uBright: 0.62 });
    pass(gl, progs.blur, t.haloB, hw, hh, { uSrc: t.haloA.tex, uDir: [0, 1 / hh], uSigma: 6, uBright: 0 });
    pass(gl, progs.comp, null, W, H, {
      uImg: t.photo.tex, uHalo: t.haloB.tex, uType: this.typeTex!,
      uRes: [W, H], uSeed: f.seed, uHasPhoto: 1,
      uRect: rect, uRot: S.layout.rotation, uFeather: S.layout.feather, uDeckle: S.layout.deckle, uBorder: S.layout.border,
      uPaper: S.paper.tone, uInk: S.palette.ink, uHigh: S.palette.highlight, uPaperInt: S.paper.intensity,
      uGrain: S.film.grain, uHalation: S.film.halation, uVignette: S.film.vignette,
      uLeak: S.film.leak, uLeakAngle: S.film.leakAngle, uLeakColor: S.film.leakColor,
    });
  }

  toBlob(): Promise<Blob> {
    this.gl.finish();
    return new Promise((res, rej) => this.canvas.toBlob(b => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
  }
}
