// 5) мотивы дня — процедурные слои поверх фото (до трёх одновременно).
// Вывод премультиплицированный: свет — альфа 0 (аддитивно), тени и предметы — с альфой.
in vec2 vUv;
out vec4 outColor;

uniform vec2 uRes;
uniform vec2 uBand; // свободная зона между шапкой и текстом (px, y сверху)
uniform vec4 uRect;
uniform float uRot, uFeather, uDeckle;
uniform float uTime, uBeat, uSeed;
uniform vec4 uM[3];    // shader id, intensity, density, speed
uniform vec4 uM2[3];   // sharpness, spill
uniform int uCount;
uniform vec3 uPal[6];  // 0 акцент, 1 чернила, 2..5 палитра дня
uniform vec3 uHigh;

vec4 over(vec4 top, vec4 bot) { return top + bot * (1.0 - top.a); }
vec3 palC(float h) { return uPal[2 + int(mod(floor(h * 7.0), 4.0))]; }

// 1 листья: линзы (пересечение двух кругов), вращаются и падают
vec4 mLeaves(vec2 q, float t, float den, float spd, float sh) {
  vec4 acc = vec4(0.0);
  for (int L = 0; L < 3; L++) {
    float s = 4.0 + float(L) * 2.5;
    vec2 uv = q * s;
    uv.y += t * spd * (0.35 + 0.15 * float(L));
    uv.x += sin(t * 0.6 + uv.y * 0.9 + float(L)) * 0.25;
    vec2 id = floor(uv), f = fract(uv) - 0.5;
    vec2 h = hash2(id + float(L) * 13.1 + uSeed);
    if (h.x > den) continue;
    vec2 p = rot2(t * (h.y - 0.5) * 2.5 + h.x * 6.28) * (f - (h - 0.5) * 0.45);
    p.x *= 1.0 + 0.7 * abs(sin(t * 1.3 + h.y * 9.0)); // кувыркается
    float r = 0.15 + 0.08 * h.y;
    float d = max(length(p - vec2(r * 0.6, 0.0)), length(p + vec2(r * 0.6, 0.0))) - r;
    float aa = mix(0.05, 0.008, sh);
    float m = 1.0 - smoothstep(-aa, aa, d);
    vec3 col = mix(palC(h.y), vec3(0.78, 0.38, 0.1), 0.55);
    col *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.01, abs(p.x))); // прожилка вдоль листа
    float a = m * (0.7 + 0.15 * float(L));
    acc = over(vec4(col * a, a), acc);
  }
  return acc;
}

// 2 дождь: косые полосы в три слоя + капли на «стекле»
vec4 mRain(vec2 q, float t, float den, float spd, float sh) {
  vec3 L = vec3(0.0);
  for (int l = 0; l < 3; l++) {
    float s = 38.0 + float(l) * 26.0;
    vec2 uv = vec2(q.x + q.y * 0.14, q.y) * vec2(s, s * 0.07);
    uv.y += t * spd * (1.6 + float(l) * 0.8);
    vec2 id = floor(uv), f = fract(uv);
    float h = hash0(id + float(l) * 7.0);
    if (h > den) continue;
    float xo = hash0(id + 3.1) * 0.8 + 0.1;
    float w = mix(0.09, 0.035, sh);
    float st = (1.0 - smoothstep(0.0, w, abs(f.x - xo))) * smoothstep(0.0, 0.3, f.y) * (1.0 - smoothstep(0.55, 1.0, f.y));
    L += uHigh * st * (0.22 + 0.12 * float(l));
  }
  vec4 acc = vec4(L, 0.0);
  vec2 uv = q * 8.0;
  uv.y += t * 0.03 * spd;
  vec2 id = floor(uv), f = fract(uv) - 0.5;
  vec2 h = hash2(id + 5.0 + uSeed);
  if (h.x < den * 0.85) {
    // капля на стекле: линза (светлее внутри, как преломлённое небо), тонкий тёмный край снизу, светлая дуга сверху
    vec2 p = f - (h - 0.5) * 0.55;
    p.y *= 0.8 + 0.15 * h.y; // слегка вытянута вниз
    float r = 0.035 + 0.07 * h.y;
    float d = length(p) - r;
    float body = 1.0 - smoothstep(-0.006, 0.006, d);
    float edge = 1.0 - smoothstep(0.0, 0.012, abs(d));
    float lower = smoothstep(r * 0.2, -r, p.y), upper = smoothstep(-r * 0.2, r, p.y);
    acc = over(vec4(vec3(0.0), edge * lower * 0.35), acc);
    acc.rgb += uHigh * (body * 0.10 + edge * upper * 0.35);
  }
  return acc;
}

// 3 снег: мягкие хлопья, ближний слой крупнее и размытее
vec4 mSnow(vec2 q, float t, float den, float spd, float sh) {
  vec4 acc = vec4(0.0);
  for (int l = 0; l < 3; l++) {
    float s = 5.0 + float(l) * 5.0;
    vec2 uv = q * s;
    uv.y += t * spd * (0.8 + 0.3 * float(l));
    uv.x += sin(t * 0.5 + uv.y * 0.6 + float(l) * 2.0) * 0.3;
    vec2 id = floor(uv), f = fract(uv) - 0.5;
    vec2 h = hash2(id + float(l) * 31.0 + uSeed);
    if (h.x > den) continue;
    float r = (0.05 + 0.06 * h.y) * (1.6 - 0.35 * float(l));
    float m = 1.0 - smoothstep(r * mix(0.1, 0.6, sh), r, length(f - (h - 0.5) * 0.6));
    float a = m * (0.85 - 0.15 * float(l));
    acc = over(vec4(vec3(1.0) * a, a), acc);
  }
  return acc;
}

// 4 туман: дрейфующий fbm, гуще внизу
vec4 mFog(vec2 q, float t, float den, float spd) {
  float n = fbm(q * 2.2 + vec2(t * 0.05 * spd, t * 0.01));
  n = fbm(q * 1.4 + n * 1.5 + vec2(-t * 0.03 * spd, 0.0));
  float a = clamp(smoothstep(0.25, 0.75, n) * (1.0 - 0.45 * vUv.y) * den * 1.25, 0.0, 0.85);
  return vec4(mix(uHigh, vec3(0.92), 0.4) * a, a);
}

// 5 боке огней: диски с кольцом, вспыхивают на долю
vec4 mBokeh(vec2 q, float t, float den, float spd, float sh) {
  vec3 L = vec3(0.0);
  for (int l = 0; l < 2; l++) {
    float s = 3.0 + float(l) * 2.5;
    vec2 uv = q * s + vec2(0.0, -t * spd * 0.12);
    vec2 id = floor(uv), f = fract(uv) - 0.5;
    vec2 h = hash2(id + float(l) * 9.0 + uSeed);
    if (h.x > den) continue;
    float r = 0.14 + 0.16 * h.y;
    float d = length(f - (h - 0.5) * 0.5) - r;
    float soft = mix(0.08, 0.012, sh);
    float disk = 1.0 - smoothstep(-soft, soft, d);
    float ring = 1.0 - smoothstep(0.0, soft * 2.0, abs(d + soft));
    vec3 c = mix(palC(h.y), vec3(1.0, 0.85, 0.6), 0.4);
    L += c * (disk * 0.28 + ring * 0.22) * (0.8 + 0.5 * uBeat);
  }
  return vec4(L, 0.0);
}

// 6 свеча: тёплый мерцающий свет снизу кадра
vec4 mCandle(vec2 r, float t, float den) {
  vec2 c = vec2(-0.3 + 0.6 * fract(uSeed * 7.3), -0.62);
  float fl = 0.8 + 0.25 * (vnoise(vec2(t * 7.0, 1.3)) - 0.5) + 0.1 * vnoise(vec2(t * 19.0, 4.0));
  float g = exp(-dot(r - c, r - c) * 2.4) * 0.55 + exp(-dot(r - c, r - c) * 40.0) * 0.6;
  vec2 fp = (r - c - vec2(0.0, 0.05)) * vec2(1.0, 0.45);
  float flame = 1.0 - smoothstep(0.0, 0.025, length(fp) - 0.02);
  return vec4(vec3(1.0, 0.58, 0.24) * (g * fl * den * 1.2) + vec3(1.0, 0.9, 0.7) * flame * fl, 0.0);
}

// 7 звёзды: мерцающие точки в верхней половине
vec4 mStars(vec2 q, vec2 r, float t, float den, float spd) {
  vec2 uv = q * 46.0;
  vec2 id = floor(uv), f = fract(uv) - 0.5;
  vec2 h = hash2(id + uSeed);
  if (h.x > den * 0.6) return vec4(0.0);
  vec2 p = f - (h - 0.5) * 0.7;
  float tw = 0.45 + 0.55 * sin(t * spd * 2.5 + h.y * 40.0);
  float s = (1.0 - smoothstep(0.0, 0.06 + 0.05 * h.y, length(p)));
  s += (1.0 - smoothstep(0.0, 0.012, min(abs(p.x), abs(p.y)))) * (1.0 - smoothstep(0.0, 0.3, length(p))) * step(0.8, h.y) * 0.6;
  return vec4(vec3(1.0, 0.97, 0.9) * s * tw * smoothstep(-0.1, 0.5, r.y), 0.0);
}

// 8 солнечные блики: источник, призраки по линии через центр, анаморфная полоса
vec4 mSun(vec2 r, float t, float den) {
  vec2 S = vec2(fract(uSeed * 3.1) < 0.5 ? -0.62 : 0.62, 0.7) + vec2(sin(t * 0.05), cos(t * 0.04)) * 0.03;
  vec3 L = vec3(1.0, 0.85, 0.6) * (exp(-length(r - S) * 5.0) * 0.6);
  L += vec3(1.0, 0.8, 0.55) * exp(-abs(r.y - S.y) * 45.0) * exp(-abs(r.x - S.x) * 1.6) * 0.35;
  for (int i = 1; i < 6; i++) {
    float k = float(i) / 5.0;
    vec2 g = S * mix(1.0, -1.25, k);
    float rad = 0.05 + 0.09 * fract(k * 7.7);
    float disk = 1.0 - smoothstep(rad * 0.7, rad, length(r - g));
    L += mix(uPal[0], vec3(0.6, 0.9, 1.0), k) * disk * 0.09;
  }
  return vec4(L * den * 1.4, 0.0);
}

// 9 пар: поднимающиеся струйки
vec4 mSteam(vec2 r, float t, float den, float spd) {
  vec2 o = vec2(-0.25 + 0.5 * fract(uSeed * 5.7), -0.7);
  vec2 v = r - o;
  if (v.y < 0.0) return vec4(0.0);
  float w = 0.12 + v.y * 0.35;
  float wisp = fbm(vec2(v.x * 3.0 + sin(v.y * 4.0 - t * spd * 1.5) * 0.35, v.y * 2.2 - t * spd * 0.7));
  float m = exp(-pow(v.x / w, 2.0)) * smoothstep(0.0, 0.12, v.y) * (1.0 - smoothstep(0.5, 1.4, v.y));
  float a = smoothstep(0.42, 0.78, wisp) * m * den * 0.9;
  return vec4(vec3(0.97) * a, a);
}

// 10 волны: блики на воде (дисплейсмент — в проходе раскладки)
vec4 mWaves(vec2 q, vec2 r, float t, float den, float spd) {
  float g = pow(vnoise(vec2(q.x * 55.0 + t * spd * 1.5, q.y * 160.0 + sin(q.x * 8.0 + t) * 3.0)), 14.0);
  return vec4(uHigh * g * 3.0 * den * smoothstep(0.2, -0.4, r.y), 0.0);
}

// 11 ветер: тонкие быстрые линии
vec4 mWind(vec2 q, float t, float den, float spd) {
  vec3 L = vec3(0.0);
  for (int l = 0; l < 2; l++) {
    vec2 uv = q * vec2(2.5, 55.0 + float(l) * 30.0);
    uv.x -= t * spd * (1.0 + float(l) * 0.5);
    uv.y += sin(q.x * 6.0 + t) * 0.6;
    vec2 id = floor(uv), f = fract(uv);
    float h = hash0(id + float(l) * 3.0);
    if (h > den * 0.55) continue;
    float line = (1.0 - smoothstep(0.0, 0.07, abs(f.y - 0.5))) * smoothstep(0.0, 0.35, f.x) * (1.0 - smoothstep(0.45, 1.0, f.x));
    L += uHigh * line * 0.3;
  }
  return vec4(L, 0.0);
}

// 12 конфетти: кувыркающиеся прямоугольники
vec4 mConfetti(vec2 q, float t, float den, float spd, float sh) {
  vec4 acc = vec4(0.0);
  vec3 VIV[4] = vec3[4](vec3(0.95, 0.3, 0.42), vec3(0.22, 0.58, 0.95), vec3(1.0, 0.8, 0.22), vec3(0.35, 0.82, 0.52));
  for (int l = 0; l < 3; l++) {
    float s = 8.0 + float(l) * 5.0;
    vec2 uv = q * s;
    uv.y += t * spd * (0.9 + 0.3 * float(l));
    uv.x += sin(t * 1.1 + uv.y * 1.3) * 0.2;
    vec2 id = floor(uv), f = fract(uv) - 0.5;
    vec2 h = hash2(id + float(l) * 17.0 + uSeed);
    if (h.x > den) continue;
    vec2 p = rot2(t * (h.y - 0.5) * 5.0 + h.x * 6.0) * (f - (h - 0.5) * 0.5);
    vec2 b = vec2(0.13, 0.055) * vec2(abs(cos(t * 3.0 + h.y * 9.0)) * 0.85 + 0.15, 1.0);
    float aa = mix(0.03, 0.006, sh);
    float m = 1.0 - smoothstep(-aa, aa, sdBox(p, b));
    vec3 c = mix(VIV[int(mod(floor(h.y * 13.0), 4.0))], palC(h.x), 0.3);
    acc = over(vec4(c * m, m), acc);
  }
  return acc;
}

// 13 пыль в луче: косой луч и плавающие пылинки
vec4 mDust(vec2 q, vec2 r, float t, float den, float spd) {
  vec2 dir = normalize(vec2(0.55, -1.0));
  vec2 o = vec2(fract(uSeed * 2.3) < 0.5 ? -0.5 : 0.5, 1.0);
  float dist = abs(dot(r - o, vec2(-dir.y, dir.x)));
  float beam = exp(-pow(dist / 0.28, 2.0));
  vec3 L = vec3(1.0, 0.9, 0.7) * beam * 0.12;
  vec2 uv = q * 32.0;
  vec2 id = floor(uv), f = fract(uv) - 0.5;
  vec2 h = hash2(id + uSeed);
  if (h.x < den) {
    vec2 c = (h - 0.5) * 0.5 + vec2(sin(t * 0.4 * spd + h.y * 6.0), cos(t * 0.33 * spd + h.x * 5.0)) * 0.2;
    float m = 1.0 - smoothstep(0.0, 0.07 + 0.06 * h.y, length(f - c));
    L += vec3(1.0, 0.95, 0.85) * m * beam * 0.9;
  }
  return vec4(L, 0.0);
}

// 14 тени листвы: пятнистая тень, колышется
vec4 mLeafShadow(vec2 q, float t, float den, float spd, float sh) {
  vec2 sway = vec2(sin(t * 0.5 * spd), cos(t * 0.37 * spd)) * 0.04;
  float n = fbm(q * 4.5 + sway + fbm(q * 2.0 + t * 0.03) * 0.6);
  float w = mix(0.12, 0.03, sh);
  float s = smoothstep(0.5 - w, 0.5 + w, n);
  float a = s * 0.42 * den;
  vec4 shade = vec4(uPal[1] * 0.25 * a, a);
  shade.rgb += vec3(1.0, 0.9, 0.7) * (1.0 - s) * 0.05 * den;
  return shade;
}

// 15 неон: светящиеся трубки по краю кадра, мигают на долю
vec4 mNeon(vec2 r, float t, float den) {
  vec2 asp = vec2(uRect.z / uRect.w, 1.0);
  float d1 = abs(sdBox(r * asp, vec2(0.86, 0.86) * asp)) ;
  float d2 = abs(dot(r * asp - vec2(-0.2, 0.1), normalize(vec2(1.0, -1.6))));
  d2 = max(d2, sdBox(r * asp, vec2(0.6) * asp));
  vec3 cA = mix(vec3(1.0, 0.18, 0.62), uPal[0], 0.3), cB = vec3(0.2, 0.9, 1.0);
  float fl = 0.82 + 0.18 * step(0.12, vnoise(vec2(t * 9.0, 2.0))) + 0.25 * uBeat;
  vec3 L = cA * (exp(-d1 * 38.0) * 0.55 + (1.0 - smoothstep(0.0, 0.008, d1)) * 0.8);
  L += cB * (exp(-d2 * 38.0) * 0.45 + (1.0 - smoothstep(0.0, 0.007, d2)) * 0.7);
  return vec4(L * fl * den * 1.2, 0.0);
}

void main() {
  vec2 px = vUv * uRes;
  float k = uRes.x / 1080.0;
  Print P = printMask(px, uRect, uRot, uFeather, uDeckle, 0.0, k);
  vec2 r = P.lp / uRect.zw;      // -1..1 внутри фото
  vec2 q = px / uRes.y;          // единицы высоты кадра
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 3; i++) {
    if (i >= uCount) break;
    int id = int(uM[i].x);
    float I = uM[i].y, den = uM[i].z, spd = uM[i].w, sh = uM2[i].x, spill = uM2[i].y;
    float t = uTime;
    vec4 c;
    if (id == 1) c = mLeaves(q, t, den, spd, sh);
    else if (id == 2) c = mRain(q, t, den, spd, sh);
    else if (id == 3) c = mSnow(q, t, den, spd, sh);
    else if (id == 4) c = mFog(q, t, den, spd);
    else if (id == 5) c = mBokeh(q, t, den, spd, sh);
    else if (id == 6) c = mCandle(r, t, den);
    else if (id == 7) c = mStars(q, r, t, den, spd);
    else if (id == 8) c = mSun(r, t, den);
    else if (id == 9) c = mSteam(r, t, den, spd);
    else if (id == 10) c = mWaves(q, r, t, den, spd);
    else if (id == 11) c = mWind(q, t, den, spd);
    else if (id == 12) c = mConfetti(q, t, den, spd, sh);
    else if (id == 13) c = mDust(q, r, t, den, spd);
    else if (id == 14) c = mLeafShadow(q, t, den, spd, sh);
    else c = mNeon(r, t, den);
    float yd = uRes.y - px.y;
    float band = smoothstep(uBand.x - 12.0, uBand.x + 30.0, yd) * (1.0 - smoothstep(uBand.y - 30.0, uBand.y + 12.0, yd));
    float mask = mix(P.photo, band, spill);
    acc = over(c * I * mask, acc);
  }
  outColor = acc;
}
