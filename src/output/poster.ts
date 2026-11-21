// Постер 1080×1920: сцена дня (только hero) → один статичный кадр → PNG.

import { Pipeline } from '../render/gl/pipeline';
import { buildScene, releaseScene, type SceneInput } from '../render/scene';

export const POSTER_W = 1080, POSTER_H = 1920;
let pipe: Pipeline | null = null;

export async function renderPoster(s: SceneInput): Promise<Blob> {
  pipe ??= new Pipeline(POSTER_W, POSTER_H);
  const sc = await buildScene(pipe, s, false);
  pipe.frame(s.style, {
    a: sc.painted[0], mix: 0, zoomA: 1, panA: [0, 0], zoomB: 1, panB: [0, 0],
    rect: sc.rect, frameAspect: sc.frameAspect, pulse: 0, seed: (s.seed % 1000) / 1000,
  });
  const blob = await pipe.toBlob();
  releaseScene(pipe, sc);
  return blob;
}
