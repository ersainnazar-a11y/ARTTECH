// Постер 1080×1920: сцена дня → один статичный кадр (все карточки коллажа наклеены, мотивы в момент t) → PNG.

import { Pipeline } from '../render/gl/pipeline';
import { buildScene, frameParams, releaseScene, type SceneInput } from '../render/scene';

export const POSTER_W = 1080, POSTER_H = 1920;
let pipe: Pipeline | null = null;

export async function renderPoster(s: SceneInput): Promise<Blob> {
  pipe ??= new Pipeline(POSTER_W, POSTER_H);
  const sc = await buildScene(pipe, s, false);
  // момент «стоп-кадра» для мотивов детерминирован seed
  const t = 3 + (s.seed % 1000) / 250;
  const fp = frameParams(sc, [0], null, t);
  fp.seed = (s.seed % 1000) / 1000;
  pipe.frame(s.style, fp);
  const blob = await pipe.toBlob();
  releaseScene(pipe, sc);
  return blob;
}
