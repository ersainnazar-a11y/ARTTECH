// 7) типографика (чернила впитываются в бумагу) + общее зерно, склеивающее слои в один отпечаток
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uBase;
uniform sampler2D uType;
uniform vec2 uRes;
uniform float uSeed, uGrain, uPaperInt;

float hashS(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32 + uSeed); return fract(p.x * p.y); }

void main() {
  vec2 px = vUv * uRes;
  float k = uRes.x / 1080.0;
  float tex = paperTex(px / k, uRes / k);
  vec3 col = texture(uBase, vUv).rgb;
  vec4 ty = texture(uType, vUv);
  vec3 ink = ty.rgb / max(ty.a, 1e-4);
  float inkA = ty.a * mix(1.0, smoothstep(0.82, 1.05, tex) * 0.25 + 0.8, uPaperInt);
  col = mix(col, ink * mix(1.0, tex, 0.4), clamp(inkA, 0.0, 1.0));
  col += (hashS(px + 11.1) - 0.5) * (0.018 + uGrain * 0.12);
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
