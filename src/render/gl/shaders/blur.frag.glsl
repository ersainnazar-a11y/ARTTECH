#version 300 es
// раздельный гауссов блюр (для тензора и для halation)
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform vec2 uDir;     // шаг в UV
uniform float uSigma;  // в шагах
uniform float uBright; // >0: bright-pass порог (для halation)

vec4 tap(vec2 uv) {
  vec4 c = texture(uSrc, uv);
  if (uBright > 0.0) {
    float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
    c.rgb *= smoothstep(uBright, 1.0, l);
  }
  return c;
}

void main() {
  int r = int(ceil(uSigma * 2.5));
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int k = -24; k <= 24; k++) {
    if (k < -r || k > r) continue;
    float w = exp(-0.5 * float(k * k) / (uSigma * uSigma));
    acc += tap(vUv + uDir * float(k)) * w;
    wsum += w;
  }
  outColor = acc / wsum;
}
