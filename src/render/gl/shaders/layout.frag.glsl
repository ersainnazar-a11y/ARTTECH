#version 300 es
// 1) раскладка в кадре: два «написанных» фото (A → B), Ken Burns (масштаб + сдвиг), переход, пульсация на долю
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uA, uB;
uniform vec2 uRes;
uniform vec4 uRect;              // центр, полуразмеры (px, y снизу)
uniform float uRot;
uniform vec2 uScaleA, uScaleB;   // кадрирование cover
uniform float uZoomA, uZoomB;
uniform vec2 uPanA, uPanB;
uniform float uMix;              // 0 = A, 1 = B
uniform float uPulse;            // вспышка экспозиции на сильной доле

vec3 samplePhoto(sampler2D t, vec2 q, vec2 sc, float zoom, vec2 pan) {
  vec2 uv = q * sc / zoom + 0.5 + pan;
  return texture(t, clamp(uv, 0.0, 1.0)).rgb;
}

void main() {
  vec2 d = vUv * uRes - uRect.xy;
  float c = cos(-uRot), s = sin(-uRot);
  d = mat2(c, s, -s, c) * d;
  vec2 q = d / (2.0 * uRect.zw); // -0.5..0.5 внутри рамки
  vec3 a = samplePhoto(uA, q, uScaleA, uZoomA, uPanA);
  vec3 col = a;
  if (uMix > 0.0) {
    vec3 b = samplePhoto(uB, q, uScaleB, uZoomB, uPanB);
    col = mix(a, b, uMix);
  }
  col *= 1.0 + uPulse;
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
