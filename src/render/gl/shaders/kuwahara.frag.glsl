#version 300 es
// 3) Анизотропный фильтр Кувахары (Kyprianidis et al., полиномиальные веса, 8 секторов).
// Эллиптическое ядро вытягивается вдоль структуры изображения → мазок по форме предмета.
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uSrc;
uniform sampler2D uTensor;
uniform vec2 uTexel;
uniform float uRadius;     // px
uniform float uSharpness;  // q
uniform float uHardness;
uniform float uStrength;   // смешивание с исходником

const float ALPHA = 1.0;
const float ZERO_CROSS = 0.58;

void main() {
  vec3 src = texture(uSrc, vUv).rgb;
  if (uStrength <= 0.001 || uRadius < 1.0) { outColor = vec4(src, 1.0); return; }

  vec3 t = texture(uTensor, vUv).xyz;
  float E = t.x, G = t.y, F = t.z;
  float disc = sqrt((E - G) * (E - G) + 4.0 * F * F);
  float l1 = 0.5 * (E + G + disc), l2 = 0.5 * (E + G - disc);
  vec2 v = vec2(l1 - E, -F);
  v = length(v) > 1e-6 ? normalize(v) : vec2(0.0, 1.0);
  float phi = -atan(v.y, v.x);
  float A = (l1 + l2 > 1e-6) ? (l1 - l2) / (l1 + l2) : 0.0;

  float a = uRadius * clamp((ALPHA + A) / ALPHA, 0.1, 2.0);
  float b = uRadius * clamp(ALPHA / (ALPHA + A), 0.1, 2.0);
  float cp = cos(phi), sp = sin(phi);
  mat2 R = mat2(cp, -sp, sp, cp);
  mat2 S = mat2(0.5 / a, 0.0, 0.0, 0.5 / b);
  mat2 SR = S * R;
  int maxX = int(sqrt(a * a * cp * cp + b * b * sp * sp));
  int maxY = int(sqrt(a * a * sp * sp + b * b * cp * cp));
  maxX = min(maxX, 20); maxY = min(maxY, 20);

  float zeta = 2.0 / uRadius;
  float sinZ = sin(ZERO_CROSS);
  float eta = (zeta + cos(ZERO_CROSS)) / (sinZ * sinZ);

  vec4 m[8];
  vec3 s[8];
  for (int k = 0; k < 8; k++) { m[k] = vec4(0.0); s[k] = vec3(0.0); }

  for (int y = -maxY; y <= maxY; y++) {
    for (int x = -maxX; x <= maxX; x++) {
      vec2 p = SR * vec2(float(x), float(y));
      if (dot(p, p) > 0.25) continue;
      vec3 c = texture(uSrc, vUv + vec2(float(x), float(y)) * uTexel).rgb;
      float w[8];
      float sum = 0.0, z, vxx, vyy;
      vxx = zeta - eta * p.x * p.x;
      vyy = zeta - eta * p.y * p.y;
      z = max(0.0, p.y + vxx);  w[0] = z * z; sum += w[0];
      z = max(0.0, -p.x + vyy); w[2] = z * z; sum += w[2];
      z = max(0.0, -p.y + vxx); w[4] = z * z; sum += w[4];
      z = max(0.0, p.x + vyy);  w[6] = z * z; sum += w[6];
      vec2 q = 0.70710678 * vec2(p.x - p.y, p.x + p.y);
      vxx = zeta - eta * q.x * q.x;
      vyy = zeta - eta * q.y * q.y;
      z = max(0.0, q.y + vxx);  w[1] = z * z; sum += w[1];
      z = max(0.0, -q.x + vyy); w[3] = z * z; sum += w[3];
      z = max(0.0, -q.y + vxx); w[5] = z * z; sum += w[5];
      z = max(0.0, q.x + vyy);  w[7] = z * z; sum += w[7];
      float g = exp(-3.125 * dot(q, q)) / max(sum, 1e-6);
      for (int k = 0; k < 8; k++) {
        float wk = w[k] * g;
        m[k] += vec4(c * wk, wk);
        s[k] += c * c * wk;
      }
    }
  }

  vec4 acc = vec4(0.0);
  for (int k = 0; k < 8; k++) {
    if (m[k].w <= 1e-6) continue;
    vec3 mean = m[k].rgb / m[k].w;
    vec3 var = abs(s[k] / m[k].w - mean * mean);
    float sigma2 = var.r + var.g + var.b;
    float wk = 1.0 / (1.0 + pow(uHardness * 1000.0 * sigma2, 0.5 * uSharpness));
    acc += vec4(mean * wk, wk);
  }
  vec3 painted = acc.w > 0.0 ? acc.rgb / acc.w : src;
  outColor = vec4(mix(src, painted, uStrength), 1.0);
}
