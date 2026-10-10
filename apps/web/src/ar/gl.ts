/**
 * Tiny WebGL renderer: lit, coloured meshes plus textured label quads.
 * No external libraries. Geometry is shared; per-draw state is uniforms only,
 * so there are no per-frame allocations beyond small matrices.
 */

import { Mat4 } from "./math.js";

export interface Mesh {
  vao: WebGLVertexArrayObject;
  count: number;
}

export type RGBA = [number, number, number, number];

const VS = `#version 300 es
in vec3 aPos; in vec3 aNormal; in vec2 aUv;
uniform mat4 uModel; uniform mat4 uViewProj;
out vec3 vNormal; out vec2 vUv;
void main(){
  vNormal = mat3(uModel) * aNormal;
  vUv = aUv;
  gl_Position = uViewProj * uModel * vec4(aPos, 1.0);
}`;

const FS = `#version 300 es
precision mediump float;
in vec3 vNormal; in vec2 vUv;
uniform vec4 uColor; uniform float uEmissive; uniform int uUseTex; uniform sampler2D uTex;
uniform vec4 uUvRect;
out vec4 outColor;
void main(){
  vec3 n = normalize(vNormal);
  float light = 0.55 + 0.45 * max(dot(n, normalize(vec3(0.3, 1.0, 0.5))), 0.0);
  vec4 c = uColor;
  if (uUseTex == 1) {
    vec4 t = texture(uTex, uUvRect.xy + vUv * uUvRect.zw);
    c = vec4(uColor.rgb, uColor.a * t.a);
    if (c.a < 0.02) discard;
    outColor = c;
    return;
  }
  vec3 rgb = c.rgb * mix(light, 1.0, uEmissive);
  outColor = vec4(rgb, c.a);
}`;

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  readonly box: Mesh;
  readonly sphere: Mesh;
  readonly quad: Mesh;
  readonly ring: Mesh;
  private labelTex: WebGLTexture | null = null;
  private labelIndex = new Map<string, [number, number, number, number]>();

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.prog = this.compile();
    for (const u of ["uModel", "uViewProj", "uColor", "uEmissive", "uUseTex", "uTex", "uUvRect"]) {
      this.loc[u] = gl.getUniformLocation(this.prog, u);
    }
    this.box = this.makeBox();
    this.sphere = this.makeSphere(10, 14);
    this.quad = this.makeQuad();
    this.ring = this.makeRing(28, 0.78);
    this.buildLabels();
  }

  private compile(): WebGLProgram {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(p, 0, "aPos");
    gl.bindAttribLocation(p, 1, "aNormal");
    gl.bindAttribLocation(p, 2, "aUv");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link");
    return p;
  }

  private upload(pos: number[], nrm: number[], uv: number[], idx: number[]): Mesh {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = (data: number[], loc: number, size: number) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    buf(pos, 0, 3);
    buf(nrm, 1, 3);
    buf(uv, 2, 2);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: idx.length };
  }

  /** Unit cube centred at the origin (size 1). */
  private makeBox(): Mesh {
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
    const faces: [number[], number[], number[]][] = [
      [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
      [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
      [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    ];
    for (const [n, u, v] of faces) {
      const base = pos.length / 3;
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        pos.push(n[0]! / 2 + (u[0]! * a) / 2 + (v[0]! * b) / 2, n[1]! / 2 + (u[1]! * a) / 2 + (v[1]! * b) / 2, n[2]! / 2 + (u[2]! * a) / 2 + (v[2]! * b) / 2);
        nrm.push(n[0]!, n[1]!, n[2]!);
        uv.push((a + 1) / 2, (b + 1) / 2);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return this.upload(pos, nrm, uv, idx);
  }

  private makeSphere(rings: number, segs: number): Mesh {
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let r = 0; r <= rings; r++) {
      const th = (r / rings) * Math.PI;
      for (let s = 0; s <= segs; s++) {
        const ph = (s / segs) * Math.PI * 2;
        const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
        pos.push(x / 2, y / 2, z / 2);
        nrm.push(x, y, z);
        uv.push(s / segs, r / rings);
      }
    }
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < segs; s++) {
        const a = r * (segs + 1) + s, b = a + segs + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    return this.upload(pos, nrm, uv, idx);
  }

  /** Unit quad in the XZ plane facing +Y (for flat labels). */
  private makeQuad(): Mesh {
    return this.upload(
      [-0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, -0.5],
      [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
      [0, 1, 1, 1, 1, 0, 0, 0],
      [0, 1, 2, 0, 2, 3],
    );
  }

  /** Flat annulus in the XZ plane, outer radius 0.5. */
  private makeRing(segs: number, inner: number): Mesh {
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const c = Math.cos(a) / 2, d = Math.sin(a) / 2;
      pos.push(c, 0, d, c * inner, 0, d * inner);
      nrm.push(0, 1, 0, 0, 1, 0);
      uv.push(0, 0, 0, 0);
      if (s < segs) idx.push(2 * s, 2 * s + 2, 2 * s + 1, 2 * s + 1, 2 * s + 2, 2 * s + 3);
    }
    return this.upload(pos, nrm, uv, idx);
  }

  private buildLabels(): void {
    const glyphs = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "A", "B", "C", "D", "E", "F", "G", "H", "S", "?", "!", "≈"];
    const cell = 64;
    const cols = 8;
    const rows = Math.ceil(glyphs.length / cols);
    const canvas = document.createElement("canvas");
    canvas.width = cols * cell;
    canvas.height = rows * cell;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 48px system-ui, sans-serif";
    glyphs.forEach((g, i) => {
      const x = (i % cols) * cell, y = Math.floor(i / cols) * cell;
      ctx.fillText(g, x + cell / 2, y + cell / 2 + 2);
      this.labelIndex.set(g, [x / canvas.width, y / canvas.height, cell / canvas.width, cell / canvas.height]);
    });
    const gl = this.gl;
    this.labelTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.labelTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  }

  begin(viewProj: Mat4): void {
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.loc.uViewProj!, false, viewProj);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    // keep destination alpha correct for compositing over the camera (premultiplied layers)
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1i(this.loc.uUseTex!, 0);
  }

  draw(mesh: Mesh, model: Mat4, color: RGBA, emissive = 0): void {
    const gl = this.gl;
    gl.uniformMatrix4fv(this.loc.uModel!, false, model);
    gl.uniform4fv(this.loc.uColor!, color);
    gl.uniform1f(this.loc.uEmissive!, emissive);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }

  drawLabel(glyph: string, model: Mat4, color: RGBA): void {
    const rect = this.labelIndex.get(glyph);
    if (!rect || !this.labelTex) return;
    const gl = this.gl;
    gl.uniform1i(this.loc.uUseTex!, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.labelTex);
    gl.uniform1i(this.loc.uTex!, 0);
    gl.uniform4fv(this.loc.uUvRect!, rect);
    gl.depthMask(false);
    this.draw(this.quad, model, color, 1);
    gl.depthMask(true);
    gl.uniform1i(this.loc.uUseTex!, 0);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.prog);
    if (this.labelTex) gl.deleteTexture(this.labelTex);
    for (const m of [this.box, this.sphere, this.quad, this.ring]) gl.deleteVertexArray(m.vao);
  }
}
