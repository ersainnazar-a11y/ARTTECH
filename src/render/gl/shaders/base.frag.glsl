// 6) плёнка + бумага + главный отпечаток. Типографика и общее зерно — в final.
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uImg;    // фото после раскладки (в координатах кадра)
uniform sampler2D uHalo;   // размытые света
uniform vec2 uRes;
uniform float uSeed, uTime;

uniform vec4 uRect;
uniform float uRot, uFeather, uDeckle, uBorder;
uniform vec3 uPaper, uInk, uHigh;
uniform float uPaperInt;
uniform float uGrain, uHalation, uVignette, uLeak, uLeakAngle;
uniform vec3 uLeakColor;
uniform float uShimmer, uFlash, uHairline;

float hashS(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32 + uSeed); return fract(p.x * p.y); }

void main() {
  vec2 px = vUv * uRes;
  float k = uRes.x / 1080.0;
  float tex = paperTex(px / k, uRes / k);
  vec3 paper = uPaper * mix(1.0, tex, uPaperInt);

  vec2 vc = vUv - 0.5;
  float vig = smoothstep(0.85, 0.2, length(vc * vec2(1.0, uRes.y / uRes.x) * 0.62));
  vec3 col = paper * mix(1.0, vig, uVignette * 0.35);

  // тонкая линия минимализма под фото
  if (uHairline > 0.0) {
    float ly = uRect.y - uRect.w - 46.0 * k;
    float line = (1.0 - smoothstep(0.0, 1.2 * k, abs(px.y - ly))) * step(uRes.x * 0.06, px.x) * step(px.x, uRes.x * 0.94);
    col = mix(col, uInk, line * uHairline * 0.55);
  }

  Print P = printMask(px, uRect, uRot, uFeather, uDeckle, uBorder, k);
  col *= 1.0 - P.shadow;
  vec3 frameCol = mix(vec3(0.97, 0.955, 0.93), uHigh, 0.25) * mix(1.0, tex, 0.5 * uPaperInt);
  col = mix(col, frameCol, P.frame);

  vec3 ph = texture(uImg, vUv).rgb;
  vec3 halo = texture(uHalo, vUv).rgb;
  ph += halo * uHalation * vec3(1.0, 0.55, 0.35) * 1.6;
  vec2 ruv = P.lp / uRect.zw; // -1..1
  // дрожание света (импрессионизм): медленная волна яркости
  if (uShimmer > 0.0) {
    float sh = fbm(ruv * 1.4 + vec2(uTime * 0.07, -uTime * 0.05)) - 0.5;
    ph *= 1.0 + sh * uShimmer * 0.22;
  }
  // засветка (light leak) + вспышка на склейке
  vec2 ld = vec2(cos(uLeakAngle), sin(uLeakAngle));
  float leakG = smoothstep(-0.1, 1.3, dot(ruv, ld)) * (0.6 + 0.4 * fbm(ruv * 1.7 + uSeed));
  float leak = uLeak * 0.85 + uFlash;
  ph = 1.0 - (1.0 - ph) * (1.0 - uLeakColor * clamp(leakG * leak + uFlash * 0.35, 0.0, 1.0));
  float pv = 1.0 - smoothstep(0.55, 1.45, length(ruv * vec2(0.9, 1.0)));
  ph *= mix(1.0, pv, uVignette);
  ph *= mix(1.0, tex, 0.35 * uPaperInt);
  float pg = hashS(floor(px / (1.4 * k)) + 0.37);
  ph += (pg - 0.5) * uGrain * (0.6 + 0.4 * (1.0 - dot(ph, vec3(0.33))));

  col = mix(col, ph, P.photo);
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
