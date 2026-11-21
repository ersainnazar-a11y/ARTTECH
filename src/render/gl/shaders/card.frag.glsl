// коллаж: одна карточка-отпечаток (фото + белая рамка + рваный край + тень), премультиплицированный вывод
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uPhoto;
uniform vec2 uRes, uScale;
uniform vec4 uRect;
uniform float uRot, uDeckle, uAlpha, uPaperInt, uGrain, uSeed;
uniform vec3 uHigh;

void main() {
  vec2 px = vUv * uRes;
  float k = uRes.x / 1080.0;
  Print P = printMask(px, uRect, uRot, 0.0, max(uDeckle, 0.5), 0.7, k);
  vec2 q = P.lp / (2.0 * uRect.zw);
  vec3 ph = texture(uPhoto, clamp(q * uScale + 0.5, 0.0, 1.0)).rgb;
  float tex = paperTex(px / k, uRes / k);
  ph *= mix(1.0, tex, 0.35 * uPaperInt);
  ph += (hash0(floor(px / (1.4 * k)) + uSeed) - 0.5) * uGrain;
  vec3 frameCol = mix(vec3(0.97, 0.955, 0.93), uHigh, 0.25) * mix(1.0, tex, 0.5 * uPaperInt);
  vec3 c = mix(frameCol, ph, P.photo);
  float a = max(P.frame, P.photo);
  // тень: тёмная, с альфой; карточка поверх
  float sa = P.shadow * 1.4 * (1.0 - a);
  outColor = vec4(c * a, a + sa) * uAlpha;
}
