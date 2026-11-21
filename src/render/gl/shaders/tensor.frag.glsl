#version 300 es
// структурный тензор (Собель) — направление мазков для анизотропного Кувахары
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform vec2 uTexel;

void main() {
  vec3 a = texture(uSrc, vUv + uTexel * vec2(-1, -1)).rgb;
  vec3 b = texture(uSrc, vUv + uTexel * vec2( 0, -1)).rgb;
  vec3 c = texture(uSrc, vUv + uTexel * vec2( 1, -1)).rgb;
  vec3 d = texture(uSrc, vUv + uTexel * vec2(-1,  0)).rgb;
  vec3 f = texture(uSrc, vUv + uTexel * vec2( 1,  0)).rgb;
  vec3 g = texture(uSrc, vUv + uTexel * vec2(-1,  1)).rgb;
  vec3 h = texture(uSrc, vUv + uTexel * vec2( 0,  1)).rgb;
  vec3 i = texture(uSrc, vUv + uTexel * vec2( 1,  1)).rgb;
  vec3 sx = (-a - 2.0 * d - g + c + 2.0 * f + i) / 4.0;
  vec3 sy = (-a - 2.0 * b - c + g + 2.0 * h + i) / 4.0;
  outColor = vec4(dot(sx, sx), dot(sy, sy), dot(sx, sy), 1.0);
}
