#version 300 es
// 6) плёнка (halation, засветка, виньетка, зерно) + 7) бумага + типографика.
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uImg;    // фото после Кувахары (в координатах кадра)
uniform sampler2D uHalo;   // размытые света
uniform sampler2D uType;   // типографика (2D canvas)
uniform vec2 uRes;
uniform float uSeed;
uniform float uHasPhoto;

uniform vec4 uRect;
uniform float uRot, uFeather, uDeckle, uBorder;

uniform vec3 uPaper, uInk, uHigh;
uniform float uPaperInt;

uniform float uGrain, uHalation, uVignette, uLeak, uLeakAngle;
uniform vec3 uLeakColor;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32 + uSeed); return fract(p.x * p.y); }
float hash0(vec2 p) { p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash0(i), hash0(i + vec2(1, 0)), u.x), mix(hash0(i + vec2(0, 1)), hash0(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }

float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }

// бумага — общая для всех дней (фактура не зависит от seed дня)
float paperTex(vec2 px) {
  vec2 q = px / uRes.y;
  float blotch = fbm(q * 3.0);
  float fiber = fbm(vec2(q.x * 90.0, q.y * 14.0) + fbm(q * 8.0) * 2.0);
  float fine = vnoise(px * 0.6);
  return 1.0 - (blotch - 0.5) * 0.10 - (fiber - 0.5) * 0.07 - (fine - 0.5) * 0.04;
}

void main() {
  vec2 px = vUv * uRes;
  float k = uRes.x / 1080.0; // масштаб относительно постера
  float tex = paperTex(px / k);
  float tFactor = mix(1.0, tex, uPaperInt);
  vec3 paper = uPaper * tFactor;

  // виньетка бумаги (мягкая)
  vec2 vc = vUv - 0.5;
  float vig = smoothstep(0.85, 0.2, length(vc * vec2(1.0, uRes.y / uRes.x) * 0.62));
  vec3 col = paper * mix(1.0, vig, uVignette * 0.35);

  if (uHasPhoto > 0.5) {
    vec2 d = px - uRect.xy;
    float c = cos(-uRot), s = sin(-uRot);
    vec2 lp = mat2(c, s, -s, c) * d;

    // рваный край: шум вдоль периметра
    float edgeN = (fbm(lp / k * 0.045) - 0.5) * 2.0 + (vnoise(lp / k * 0.4) - 0.5) * 0.6;
    float deck = uDeckle * 9.0 * k * edgeN;

    float borderW = uBorder * 34.0 * k;
    float sdPhoto = sdBox(lp, uRect.zw) + deck;
    float sdFrame = sdBox(lp, uRect.zw + borderW) + deck * 1.3;

    float feather = 1.5 * k + uFeather * 90.0 * k;
    float photoMask = 1.0 - smoothstep(-feather, 0.0, sdPhoto);
    float frameMask = 1.0 - smoothstep(-1.2 * k, 0.8 * k, sdFrame);

    // тень от отпечатка (меньше, если края растворены)
    float sdShadow = sdBox(mat2(c, s, -s, c) * (d - vec2(5.0, -8.0) * k), uRect.zw + borderW);
    float shadow = (1.0 - smoothstep(-6.0 * k, 22.0 * k, sdShadow)) * (1.0 - uFeather) * 0.16;
    col *= 1.0 - shadow;

    // белая рамка архивного отпечатка
    vec3 frameCol = mix(vec3(0.97, 0.955, 0.93), uHigh, 0.25) * mix(1.0, tex, 0.5 * uPaperInt);
    col = mix(col, frameCol, frameMask * step(0.01, uBorder));

    // фото + плёнка
    vec3 ph = texture(uImg, vUv).rgb;
    vec3 halo = texture(uHalo, vUv).rgb;
    ph += halo * uHalation * vec3(1.0, 0.55, 0.35) * 1.6;
    // засветка (light leak): тёплое пятно с края по направлению uLeakAngle
    vec2 ld = vec2(cos(uLeakAngle), sin(uLeakAngle));
    vec2 ruv = lp / uRect.zw; // -1..1
    float leakG = smoothstep(-0.1, 1.3, dot(ruv, ld)) * (0.6 + 0.4 * fbm(ruv * 1.7 + uSeed));
    ph = 1.0 - (1.0 - ph) * (1.0 - uLeakColor * leakG * uLeak * 0.85);
    // виньетка фото
    float pv = 1.0 - smoothstep(0.55, 1.45, length(ruv * vec2(0.9, 1.0)));
    ph *= mix(1.0, pv, uVignette);
    // печать на бумаге: фактура слегка проступает
    ph *= mix(1.0, tex, 0.35 * uPaperInt);
    float pg = hash(floor(px / (1.4 * k)) + 0.37);
    ph += (pg - 0.5) * uGrain * (0.6 + 0.4 * (1.0 - dot(ph, vec3(0.33))));

    col = mix(col, ph, photoMask);
  }

  // типографика: чернила впитываются в бумагу
  vec4 ty = texture(uType, vUv);
  vec3 ink = ty.rgb / max(ty.a, 1e-4);
  float inkA = ty.a * mix(1.0, smoothstep(0.82, 1.05, tex) * 0.25 + 0.8, uPaperInt);
  col = mix(col, ink * mix(1.0, tex, 0.4), clamp(inkA, 0.0, 1.0));

  // общее зерно — склеивает слои в один отпечаток
  float g = hash(px + 11.1) - 0.5;
  col += g * (0.018 + uGrain * 0.12);

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
