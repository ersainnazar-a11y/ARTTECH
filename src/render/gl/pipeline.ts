// Процедурный WebGL2-пайплайн. Все параметры — из DayStyle.
// 1) раскладка + 2) цветокоррекция → тензор → 3) анизотропный Кувахара → halation → 6) плёнка + 7) бумага и типографика.
// 4) геометрия (SDF) и 5) частицы мотивов добавляются в фазе 3.

import type { DayStyle } from '../../types';
import { createGL, pass, program, target, texture, type Prog, type Target } from './helper';
import VS from './shaders/fullscreen.vert.glsl?raw';
import GRADE from './shaders/grade.frag.glsl?raw';
import TENSOR from './shaders/tensor.frag.glsl?raw';
import BLUR from './shaders/blur.frag.glsl?raw';
import KUWA from './shaders/kuwahara.frag.glsl?raw';
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

const raf = () => new Promise<void>(r => requestAnimationFrame(() => r()));

export class Pipeline {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private progs: Record<'grade' | 'tensor' | 'blur' | 'kuwa' | 'comp', Prog>;
  private t: Record<'graded' | 'tensor' | 'tblur' | 'tblur2' | 'paint' | 'haloA' | 'haloB', Target>;
  private vao: WebGLVertexArrayObject;

  constructor(readonly W: number, readonly H: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    const gl = (this.gl = createGL(this.canvas));
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.progs = {
      grade: program(gl, VS, GRADE), tensor: program(gl, VS, TENSOR), blur: program(gl, VS, BLUR),
      kuwa: program(gl, VS, KUWA), comp: program(gl, VS, COMP),
    };
    const hw = W >> 2, hh = H >> 2;
    this.t = {
      graded: target(gl, W, H), tensor: target(gl, W, H, true), tblur: target(gl, W, H, true), tblur2: target(gl, W, H, true),
      paint: target(gl, W, H), haloA: target(gl, hw, hh), haloB: target(gl, hw, hh),
    };
  }

  async render(o: { photo: TexImageSource; rect: Rect; uvScale: [number, number]; style: DayStyle; type: HTMLCanvasElement; seed: number; hasPhoto: boolean }) {
    const { gl, W, H, t, progs } = this;
    const S = o.style;
    gl.bindVertexArray(this.vao);
    const photoTex = texture(gl, o.photo);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    const typeTex = texture(gl, o.type);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    const k = W / 1080;
    const rect = [o.rect.cx, H - o.rect.cy, o.rect.hw, o.rect.hh];

    pass(gl, progs.grade, t.graded, W, H, {
      uPhoto: photoTex, uRes: [W, H], uRect: rect, uRot: S.layout.rotation, uUvScale: o.uvScale,
      uExposure: S.grade.exposure, uContrast: S.grade.contrast, uSat: S.grade.saturation,
      uSplitBal: S.grade.splitBalance, uWarmShadows: S.film.warmShadows,
      uLift: S.grade.lift, uGamma: S.grade.gamma, uGain: S.grade.gain,
      uSplitS: S.grade.splitShadow, uSplitH: S.grade.splitHighlight,
    });

    const texel = [1 / W, 1 / H];
    pass(gl, progs.tensor, t.tensor, W, H, { uSrc: t.graded.tex, uTexel: texel });
    pass(gl, progs.blur, t.tblur, W, H, { uSrc: t.tensor.tex, uDir: [1 / W, 0], uSigma: 2.0 * k + 0.5, uBright: 0 });
    pass(gl, progs.blur, t.tblur2, W, H, { uSrc: t.tblur.tex, uDir: [0, 1 / H], uSigma: 2.0 * k + 0.5, uBright: 0 });
    await raf();

    pass(gl, progs.kuwa, t.paint, W, H, {
      uSrc: t.graded.tex, uTensor: t.tblur2.tex, uTexel: texel,
      uRadius: Math.max(1, S.painterly.radius * k), uSharpness: S.painterly.sharpness, uHardness: 8,
      uStrength: S.painterly.strength,
    }, Math.max(1, Math.round(16 * k)));
    gl.finish();
    await raf();

    const hw = t.haloA.w, hh = t.haloA.h;
    pass(gl, progs.blur, t.haloA, hw, hh, { uSrc: t.paint.tex, uDir: [1 / hw, 0], uSigma: 6, uBright: 0.62 });
    pass(gl, progs.blur, t.haloB, hw, hh, { uSrc: t.haloA.tex, uDir: [0, 1 / hh], uSigma: 6, uBright: 0 });

    pass(gl, progs.comp, null, W, H, {
      uImg: t.paint.tex, uHalo: t.haloB.tex, uType: typeTex,
      uRes: [W, H], uSeed: (o.seed % 1000) / 1000, uHasPhoto: o.hasPhoto ? 1 : 0,
      uRect: rect, uRot: S.layout.rotation, uFeather: S.layout.feather, uDeckle: S.layout.deckle, uBorder: S.layout.border,
      uPaper: S.paper.tone, uInk: S.palette.ink, uHigh: S.palette.highlight, uPaperInt: S.paper.intensity,
      uGrain: S.film.grain, uHalation: S.film.halation, uVignette: S.film.vignette,
      uLeak: S.film.leak, uLeakAngle: S.film.leakAngle, uLeakColor: S.film.leakColor,
    });
    gl.finish();
    gl.deleteTexture(photoTex);
    gl.deleteTexture(typeTex);
  }

  toBlob(): Promise<Blob> {
    return new Promise((res, rej) => this.canvas.toBlob(b => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
  }
}
