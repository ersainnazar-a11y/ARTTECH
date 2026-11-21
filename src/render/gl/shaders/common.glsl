// общие функции: шум, SDF, бумага, маска отпечатка. Подставляется перед телом шейдера.
precision highp float;

float hash0(vec2 p) { p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
vec2 hash2(vec2 p) { return vec2(hash0(p), hash0(p + 17.31)); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash0(i), hash0(i + vec2(1, 0)), u.x), mix(hash0(i + vec2(0, 1)), hash0(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

// бумага — общая для всех дней (фактура не зависит от seed дня)
float paperTex(vec2 px, vec2 res) {
  vec2 q = px / res.y;
  float blotch = fbm(q * 3.0);
  float fiber = fbm(vec2(q.x * 90.0, q.y * 14.0) + fbm(q * 8.0) * 2.0);
  float fine = vnoise(px * 0.6);
  return 1.0 - (blotch - 0.5) * 0.10 - (fiber - 0.5) * 0.07 - (fine - 0.5) * 0.04;
}

// отпечаток: локальные координаты, маска фото и маска рамки с рваным краем
struct Print { vec2 lp; float photo; float frame; float shadow; };
Print printMask(vec2 px, vec4 rect, float rot, float feather, float deckle, float border, float k) {
  Print o;
  vec2 d = px - rect.xy;
  o.lp = rot2(-rot) * d;
  float edgeN = (fbm(o.lp / k * 0.045 + rect.xy * 0.01) - 0.5) * 2.0 + (vnoise(o.lp / k * 0.4) - 0.5) * 0.6;
  float deck = deckle * 9.0 * k * edgeN;
  float borderW = border * 34.0 * k;
  float sdPhoto = sdBox(o.lp, rect.zw) + deck;
  float sdFrame = sdBox(o.lp, rect.zw + borderW) + deck * 1.3;
  float fe = 1.5 * k + feather * 90.0 * k;
  o.photo = 1.0 - smoothstep(-fe, 0.0, sdPhoto);
  o.frame = (1.0 - smoothstep(-1.2 * k, 0.8 * k, sdFrame)) * step(0.01, border);
  float sdShadow = sdBox(rot2(-rot) * (d - vec2(5.0, -8.0) * k), rect.zw + borderW);
  o.shadow = (1.0 - smoothstep(-6.0 * k, 22.0 * k, sdShadow)) * (1.0 - feather) * 0.16;
  return o;
}
