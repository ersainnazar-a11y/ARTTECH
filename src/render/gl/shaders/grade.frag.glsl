#version 300 es
// 2) цветокоррекция в пространстве фото: exposure → lift/gamma/gain → контраст → насыщенность → split-toning
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uPhoto;
uniform float uExposure, uContrast, uSat, uSplitBal, uWarmShadows;
uniform vec3 uLift, uGamma, uGain, uSplitS, uSplitH;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 softLight(vec3 a, vec3 b) {
  return mix(2.0 * a * b + a * a * (1.0 - 2.0 * b), sqrt(a) * (2.0 * b - 1.0) + 2.0 * a * (1.0 - b), step(0.5, b));
}

void main() {
  vec3 col = texture(uPhoto, vUv).rgb;

  // экспозиция в линейном свете
  vec3 lin = pow(col, vec3(2.2)) * exp2(uExposure);
  col = pow(lin, vec3(1.0 / 2.2));

  // lift / gamma / gain
  col = uGain * (col + uLift * (1.0 - col));
  col = pow(max(col, 0.0), 1.0 / uGamma);

  // контраст вокруг средне-серого
  col = (col - 0.45) * uContrast + 0.45;

  // насыщенность
  float l = luma(clamp(col, 0.0, 1.0));
  col = mix(vec3(l), col, uSat);
  col = clamp(col, 0.0, 1.0);

  // split-toning: тени → тон теней дня, света → тон светов
  float sh = 1.0 - smoothstep(0.0, 0.55 + uSplitBal, l);
  float hi = smoothstep(0.45 + uSplitBal, 1.0, l);
  col = mix(col, softLight(col, uSplitS), sh * 0.55);
  col = mix(col, softLight(col, uSplitH), hi * 0.45);

  // тёплые тени плёнки
  col.r += uWarmShadows * pow(1.0 - l, 2.0) * 0.05;
  col.b -= uWarmShadows * pow(1.0 - l, 2.0) * 0.04;

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
