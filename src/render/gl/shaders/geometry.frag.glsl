// 4) геометрический слой (Кандинский): SDF-фигуры, пульсирующие на свою долю такта, и жёсткая сетка 12 колонок
in vec2 vUv;
out vec4 outColor;

uniform vec2 uRes;
uniform vec2 uBand; // свободная зона между шапкой и текстом (px, y сверху) — константа дневника: текст всегда чистый
uniform float uOpacity, uGrid;
uniform vec4 uA[13];   // x, y (доли кадра, y сверху), size (доля ширины), rot
uniform vec4 uB[13];   // type, colorIdx, beat (0..3), fill
uniform int uCount;
uniform vec3 uPal[6];
uniform float uBeatIdx, uBeatDt, uTime;

float sdTri(vec2 p, float r) {
  const float k = 1.7320508;
  p.x = abs(p.x) - r; p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}
float sdSeg(vec2 p, float len) { p.x -= clamp(p.x, -len, len); return length(p); }
float sdArc(vec2 p, float r, float ang) {
  p.x = abs(p.x);
  vec2 sc = vec2(sin(ang), cos(ang));
  return (sc.y * p.x > sc.x * p.y) ? length(p - sc * r) : abs(length(p) - r);
}

void main() {
  vec2 px = vUv * uRes;
  px.y = uRes.y - px.y; // y сверху, как в раскладке
  float W = uRes.x;
  float aa = 1.2 * W / 1080.0;
  vec4 acc = vec4(0.0);

  // жёсткая сетка: поля 6%, 12 колонок
  if (uGrid > 0.0) {
    float M = W * 0.06, col = (W - 2.0 * M) / 12.0;
    float gx = abs(fract((px.x - M) / col + 0.5) - 0.5) * col;
    float line = (1.0 - smoothstep(0.0, aa, gx)) * step(M - 1.0, px.x) * step(px.x, W - M + 1.0);
    acc = vec4(uPal[1], 1.0) * line * uGrid * 0.22;
  }

  for (int i = 0; i < 13; i++) {
    if (i >= uCount) break;
    vec4 A = uA[i], B = uB[i];
    float onBeat = (mod(uBeatIdx, 4.0) == B.z) ? exp(-uBeatDt / 0.16) : 0.0;
    float sz = A.z * W * (1.0 + 0.18 * onBeat);
    vec2 p = rot2(-(A.w + uTime * 0.03 * (B.z - 1.5))) * (px - A.xy * uRes);
    int t = int(B.x);
    float d;
    if (t == 0) d = length(p) - sz;
    else if (t == 1) d = abs(length(p) - sz) - sz * 0.12;
    else if (t == 2) d = sdTri(p, sz);
    else if (t == 3) d = sdSeg(p, sz) - W * 0.006;
    else d = sdArc(p, sz, 1.9) - W * 0.004;
    float fill = (B.w > 0.5 || t >= 3) ? 1.0 - smoothstep(-aa, aa, d) : 1.0 - smoothstep(0.0, aa * 1.5, abs(d) - W * 0.002);
    vec3 c = uPal[int(B.y)];
    float a = fill * (0.75 + 0.25 * onBeat);
    // наложение как у Кандинского: новые фигуры перекрывают старые, но просвечивают
    acc = vec4(c * a, a) * 0.85 + acc * (1.0 - a * 0.85);
  }
  float band = smoothstep(uBand.x - 12.0, uBand.x + 24.0, px.y) * (1.0 - smoothstep(uBand.y - 24.0, uBand.y + 12.0, px.y));
  outColor = acc * uOpacity * band;
}
