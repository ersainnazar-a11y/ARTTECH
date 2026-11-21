// Маленький хелпер WebGL2: программы, текстуры, FBO, полноэкранный проход.

export interface Target { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number }
export interface Prog { p: WebGLProgram; u: Map<string, WebGLUniformLocation | null> }

export function createGL(canvas: HTMLCanvasElement | OffscreenCanvas): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false }) as WebGL2RenderingContext | null;
  if (!gl) throw new Error('WebGL2 недоступен в этом браузере');
  gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('OES_texture_float_linear');
  return gl;
}

export function program(gl: WebGL2RenderingContext, vs: string, fs: string): Prog {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('GLSL: ' + gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('GLSL link: ' + gl.getProgramInfoLog(p));
  return { p, u: new Map() };
}

export function texture(gl: WebGL2RenderingContext, src: TexImageSource | null, w = 0, h = 0, float = false): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (src) {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  } else if (float) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  return t;
}

export function target(gl: WebGL2RenderingContext, w: number, h: number, float = false): Target {
  const tex = texture(gl, null, w, h, float);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE && float) {
    gl.deleteFramebuffer(fbo); gl.deleteTexture(tex);
    return target(gl, w, h, false);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo, w, h };
}

type U = number | number[] | WebGLTexture;

/** полноэкранный проход: uniforms по имени; текстуры привязываются к юнитам по порядку */
export function pass(gl: WebGL2RenderingContext, pr: Prog, out: Target | null, w: number, h: number, uniforms: Record<string, U>, strips = 1) {
  gl.useProgram(pr.p);
  gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fbo : null);
  gl.viewport(0, 0, w, h);
  let unit = 0;
  for (const [name, v] of Object.entries(uniforms)) {
    if (!pr.u.has(name)) pr.u.set(name, gl.getUniformLocation(pr.p, name));
    const loc = pr.u.get(name)!;
    if (loc === null) continue;
    if (v instanceof WebGLTexture) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, v);
      gl.uniform1i(loc, unit++);
    } else if (typeof v === 'number') gl.uniform1f(loc, v);
    else if (v.length === 2) gl.uniform2fv(loc, v);
    else if (v.length === 3) gl.uniform3fv(loc, v);
    else if (v.length === 4) gl.uniform4fv(loc, v);
  }
  if (strips <= 1) {
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return;
  }
  // тяжёлые проходы режем на полосы, чтобы не упереться в сторожевой таймер GPU
  gl.enable(gl.SCISSOR_TEST);
  const sh = Math.ceil(h / strips);
  for (let i = 0; i < strips; i++) {
    gl.scissor(0, i * sh, w, sh);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.flush();
  }
  gl.disable(gl.SCISSOR_TEST);
}
