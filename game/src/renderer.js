// WebGL1 renderer for the voxel world, entities, sky, particles and first-person view.
import { buildSection, STRIDE } from './mesher.js';
import { WX, WY, WZ, idx } from './world.js';
import * as M from './mat.js';
import { atlasCanvas, tileUV, tex } from './textures.js';
import { blocks, selectionBox, B } from './blocks.js';

const VS = `
attribute vec3 aPos; attribute vec2 aUV; attribute vec4 aLight; attribute vec4 aTint;
uniform mat4 uMVP; uniform vec3 uCam; uniform float uDay; uniform float uFogNear; uniform float uFogFar; uniform float uBright;
varying vec2 vUV; varying vec3 vCol; varying float vFog; varying float vAlpha;
void main(){
  gl_Position = uMVP * vec4(aPos, 1.0);
  vUV = aUV;
  float l = max(aLight.x * uDay, aLight.y);
  float b = l / (4.0 - 3.0 * l);
  b = pow(b, 0.85);
  b = mix(b, 1.0, uBright * 0.15);
  b = max(b, 0.05);
  vec3 blk = vec3(1.0, 0.92, 0.8) * (aLight.y > aLight.x * uDay ? 1.0 : 0.0);
  vec3 tintc = mix(vec3(1.0), blk, 0.25);
  vCol = aTint.rgb * b * aLight.z * tintc;
  vAlpha = aTint.a;
  float d = length(aPos - uCam);
  vFog = clamp((d - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
}`;
const FS = `
precision mediump float;
uniform sampler2D uTex; uniform vec3 uFogCol; uniform float uAlphaTest; uniform vec4 uColorMul;
varying vec2 vUV; varying vec3 vCol; varying float vFog; varying float vAlpha;
void main(){
  vec4 t = texture2D(uTex, vUV);
  if (t.a < uAlphaTest) discard;
  vec3 c = t.rgb * vCol * uColorMul.rgb;
  gl_FragColor = vec4(mix(c, uFogCol, vFog), t.a * vAlpha * uColorMul.a);
}`;
const LVS = `attribute vec3 aPos; uniform mat4 uMVP; void main(){ gl_Position = uMVP * vec4(aPos,1.0); }`;
const LFS = `precision mediump float; uniform vec4 uCol; void main(){ gl_FragColor = uCol; }`;

function compile(gl, vs, fs) {
  const mk = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, a = {};
  const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < nu; i++) { const n = gl.getActiveUniform(p, i).name; u[n] = gl.getUniformLocation(p, n); }
  const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < na; i++) { const n = gl.getActiveAttrib(p, i).name; a[n] = gl.getAttribLocation(p, n); }
  return { p, u, a };
}

const MAX_QUADS = 16384;

// dynamic quad builder used for entities, particles, overlays
export class DynMesh {
  constructor() { this.cap = 2048; this.ab = new ArrayBuffer(this.cap * 4 * STRIDE); this.f = new Float32Array(this.ab); this.u8 = new Uint8Array(this.ab); this.n = 0; }
  reset() { this.n = 0; }
  vert(x, y, z, u, v, sky, blk, shade, r, g, b, a = 255) {
    if ((this.n >> 2) >= this.cap) {
      this.cap *= 2; const nb = new ArrayBuffer(this.cap * 4 * STRIDE); new Uint8Array(nb).set(this.u8);
      this.ab = nb; this.f = new Float32Array(nb); this.u8 = new Uint8Array(nb);
    }
    const fo = this.n * 7, bo = this.n * STRIDE + 20;
    this.f[fo] = x; this.f[fo + 1] = y; this.f[fo + 2] = z; this.f[fo + 3] = u; this.f[fo + 4] = v;
    this.u8[bo] = sky * 17; this.u8[bo + 1] = blk * 17; this.u8[bo + 2] = shade * 255; this.u8[bo + 3] = 255;
    this.u8[bo + 4] = r; this.u8[bo + 5] = g; this.u8[bo + 6] = b; this.u8[bo + 7] = a;
    this.n++;
  }
  // quad from 4 points (each [x,y,z]) with uv rect
  quad(p0, p1, p2, p3, u0, v0, u1, v1, sky, blk, shade, col = [255, 255, 255], a = 255) {
    this.vert(p0[0], p0[1], p0[2], u0, v0, sky, blk, shade, col[0], col[1], col[2], a);
    this.vert(p1[0], p1[1], p1[2], u0, v1, sky, blk, shade, col[0], col[1], col[2], a);
    this.vert(p2[0], p2[1], p2[2], u1, v1, sky, blk, shade, col[0], col[1], col[2], a);
    this.vert(p3[0], p3[1], p3[2], u1, v0, sky, blk, shade, col[0], col[1], col[2], a);
  }
}

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' })
      || canvas.getContext('experimental-webgl');
    if (!gl) throw new Error('WebGL not available');
    this.gl = gl;
    this.world = world;
    this.prog = compile(gl, VS, FS);
    this.lprog = compile(gl, LVS, LFS);
    // atlas texture
    this.atlas = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // shared quad index buffer
    const ind = new Uint16Array(MAX_QUADS * 6);
    for (let q = 0; q < MAX_QUADS; q++) { const v = q * 4, o = q * 6; ind[o] = v; ind[o + 1] = v + 1; ind[o + 2] = v + 2; ind[o + 3] = v; ind[o + 4] = v + 2; ind[o + 5] = v + 3; }
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ind, gl.STATIC_DRAW);
    this.dynBuf = gl.createBuffer();
    this.lineBuf = gl.createBuffer();
    this.sections = new Map(); // key -> {vbo, n, tvbo, tn}
    this.dirty = new Set();
    this.renderDist = 96;
    this.dyn = new DynMesh();
    this.dynT = new DynMesh();
    this.fov = 70;
    this.buildClouds();
    for (let sx = 0; sx < WX / 16; sx++) for (let sy = 0; sy < WY / 16; sy++) for (let sz = 0; sz < WZ / 16; sz++) this.dirty.add(this.key(sx, sy, sz));
    world.onChange((x, y, z) => this.markBlock(x, y, z));
    world.onBulk((x0, y0, z0, x1, y1, z1) => {
      for (let sx = Math.max(0, (x0 - 16) >> 4); sx <= Math.min(15, (x1 + 16) >> 4); sx++)
        for (let sz = Math.max(0, (z0 - 16) >> 4); sz <= Math.min(15, (z1 + 16) >> 4); sz++)
          for (let sy = 0; sy < WY / 16; sy++) this.dirty.add(this.key(sx, sy, sz));
    });
    world.onLight = (cells) => {
      for (const i of cells) {
        const y = i & 127, z = (i >> 7) & 255, x = i >> 15;
        this.dirty.add(this.key(x >> 4, y >> 4, z >> 4));
      }
    };
  }

  key(sx, sy, sz) { return (sx << 10) | (sz << 3) | sy; }

  markBlock(x, y, z) {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const xx = x + dx, yy = y + dy, zz = z + dz;
      if (xx < 0 || yy < 0 || zz < 0 || xx >= WX || yy >= WY || zz >= WZ) continue;
      this.dirty.add(this.key(xx >> 4, yy >> 4, zz >> 4));
    }
  }
  markAll() { for (let sx = 0; sx < WX / 16; sx++) for (let sy = 0; sy < WY / 16; sy++) for (let sz = 0; sz < WZ / 16; sz++) this.dirty.add(this.key(sx, sy, sz)); }

  // rebuild dirty sections, nearest first, within time budget (ms)
  updateMeshes(cx, cy, cz, budgetMs) {
    if (!this.dirty.size) return 0;
    const t0 = performance.now();
    const rd = this.renderDist + 16;
    const list = [];
    for (const k of this.dirty) {
      const sx = k >> 10, sz = (k >> 3) & 127, sy = k & 7;
      const dx = sx * 16 + 8 - cx, dy = sy * 16 + 8 - cy, dz = sz * 16 + 8 - cz;
      const d = dx * dx + dy * dy * 0.5 + dz * dz;
      if (d > rd * rd) continue;
      list.push([d, k]);
    }
    list.sort((a, b) => a[0] - b[0]);
    let built = 0;
    for (const [, k] of list) {
      this.buildSectionMesh(k);
      this.dirty.delete(k);
      built++;
      if (performance.now() - t0 > budgetMs) break;
    }
    return built;
  }

  buildSectionMesh(k) {
    const gl = this.gl;
    const sx = k >> 10, sz = (k >> 3) & 127, sy = k & 7;
    const res = buildSection(this.world, sx, sy, sz);
    let s = this.sections.get(k);
    if (!res.opaque && !res.trans) {
      if (s) { if (s.vbo) gl.deleteBuffer(s.vbo); if (s.tvbo) gl.deleteBuffer(s.tvbo); this.sections.delete(k); }
      return;
    }
    if (!s) { s = { sx, sy, sz, vbo: null, n: 0, tvbo: null, tn: 0 }; this.sections.set(k, s); }
    const up = (data, n, which) => {
      if (!data) { if (s[which]) { gl.deleteBuffer(s[which]); s[which] = null; } return 0; }
      if (!s[which]) s[which] = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, s[which]);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return n;
    };
    s.n = up(res.opaque, res.nOpaque, 'vbo');
    s.tn = up(res.trans, res.nTrans, 'tvbo');
  }

  bindAttribs(prog, offsetVerts = 0) {
    const gl = this.gl, a = prog.a, o = offsetVerts * STRIDE;
    gl.enableVertexAttribArray(a.aPos); gl.vertexAttribPointer(a.aPos, 3, gl.FLOAT, false, STRIDE, o);
    gl.enableVertexAttribArray(a.aUV); gl.vertexAttribPointer(a.aUV, 2, gl.FLOAT, false, STRIDE, o + 12);
    gl.enableVertexAttribArray(a.aLight); gl.vertexAttribPointer(a.aLight, 4, gl.UNSIGNED_BYTE, true, STRIDE, o + 20);
    gl.enableVertexAttribArray(a.aTint); gl.vertexAttribPointer(a.aTint, 4, gl.UNSIGNED_BYTE, true, STRIDE, o + 24);
  }

  drawBuffer(vbo, nVerts) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    for (let start = 0; start < nVerts; start += MAX_QUADS * 4) {
      const cnt = Math.min(MAX_QUADS * 4, nVerts - start);
      this.bindAttribs(this.prog, start);
      gl.drawElements(gl.TRIANGLES, (cnt >> 2) * 6, gl.UNSIGNED_SHORT, 0);
    }
  }

  drawDyn(mesh) {
    if (!mesh.n) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(mesh.ab, 0, mesh.n * STRIDE), gl.STREAM_DRAW);
    for (let start = 0; start < mesh.n; start += MAX_QUADS * 4) {
      const cnt = Math.min(MAX_QUADS * 4, mesh.n - start);
      this.bindAttribs(this.prog, start);
      gl.drawElements(gl.TRIANGLES, (cnt >> 2) * 6, gl.UNSIGNED_SHORT, 0);
    }
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr || 2);
    const w = Math.floor(this.canvas.clientWidth * dpr), h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }

  buildClouds() {
    this.clouds = [];
    let s = 1234567;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let cx = -8; cx < 40; cx++) for (let cz = -8; cz < 40; cz++) if (rnd() < 0.22) this.clouds.push([cx * 12, cz * 12, 12 + ((rnd() * 2) | 0) * 12]);
  }

  // sky color from time of day
  skyState(time) {
    const t = ((time % 24000) + 24000) % 24000 / 24000; // 0 = sunrise-ish
    // celestial angle: 0 at noon
    const ang = (t - 0.25) * Math.PI * 2;
    let day = Math.cos(ang) * 2 + 0.5;
    day = Math.max(0, Math.min(1, day));
    // an active nether reactor plunges the world into night (as in 0.5.0)
    if (this.world.nightMode) { const sky = [0.06, 0.01, 0.01]; return { day: 0, sky, fog: [0.16, 0.03, 0.02], ang, sunset: 0 }; }
    const dayC = [0.53, 0.72, 1.0], nightC = [0.02, 0.03, 0.08];
    const sky = dayC.map((c, i) => nightC[i] + (c - nightC[i]) * day);
    // sunset glow
    const sunset = Math.max(0, 1 - Math.abs(Math.cos(ang)) * 3) * (Math.sin(ang) > -0.4 ? 1 : 0);
    const fog = [sky[0] * 0.9 + 0.08 * day + sunset * 0.25, sky[1] * 0.92 + 0.06 * day, sky[2] * 0.95 + 0.04 * day];
    return { day, sky, fog, ang, sunset };
  }

  render(cam, scene) {
    const gl = this.gl;
    this.resize();
    const W = this.canvas.width, H = this.canvas.height;
    gl.viewport(0, 0, W, H);
    const st = this.skyState(this.world.time);
    let fogCol = st.fog;
    let fogNear = this.renderDist * 0.55, fogFar = this.renderDist;
    if (cam.underwater) { fogCol = [0.05, 0.1, 0.35]; fogNear = 0; fogFar = 18; }
    if (cam.inLava) { fogCol = [0.6, 0.15, 0.0]; fogNear = 0; fogFar = 3; }
    gl.clearColor(fogCol[0], fogCol[1], fogCol[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const proj = M.perspective(this.fov * Math.PI / 180, W / H, 0.05, 400);
    const view = M.viewMatrix(cam.x, cam.y, cam.z, cam.yaw, cam.pitch);
    const vp = M.mul(proj, view);
    this.lastVP = vp;
    const planes = M.frustum(vp);
    const P = this.prog;
    gl.useProgram(P.p);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.uniform1i(P.u.uTex, 0);
    gl.uniform3f(P.u.uCam, cam.x, cam.y, cam.z);
    gl.uniform1f(P.u.uDay, Math.max(0.3, st.day) * (1 - (scene.darken || 0) * 0.7));
    gl.uniform1f(P.u.uBright, scene.brightness || 0);
    gl.uniform3f(P.u.uFogCol, fogCol[0], fogCol[1], fogCol[2]);
    gl.uniform4f(P.u.uColorMul, 1, 1, 1, 1);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    // ---- sky objects (no fog, no depth write)
    this.drawSky(cam, proj, st);

    gl.uniform3f(P.u.uCam, cam.x, cam.y, cam.z);
    gl.uniform1f(P.u.uFogNear, fogNear);
    gl.uniform1f(P.u.uFogFar, fogFar);
    gl.uniformMatrix4fv(P.u.uMVP, false, vp);

    // ---- opaque world
    gl.disable(gl.BLEND);
    gl.uniform1f(P.u.uAlphaTest, 0.5);
    const rd2 = (this.renderDist + 24) * (this.renderDist + 24);
    const visible = [];
    for (const s of this.sections.values()) {
      const x0 = s.sx * 16, y0 = s.sy * 16, z0 = s.sz * 16;
      const dx = x0 + 8 - cam.x, dz = z0 + 8 - cam.z;
      if (dx * dx + dz * dz > rd2) continue;
      if (!M.boxInFrustum(planes, x0, y0, z0, x0 + 16, y0 + 16, z0 + 16)) continue;
      visible.push(s);
      if (s.n) this.drawBuffer(s.vbo, s.n);
    }

    // ---- entities & particles (opaque/cutout)
    this.dyn.reset();
    if (scene.buildDyn) scene.buildDyn(this.dyn, cam);
    this.drawDyn(this.dyn);

    // ---- clouds
    this.drawClouds(cam, vp, st, fogNear, fogFar);

    // ---- translucent world (water/ice), back to front
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(P.u.uAlphaTest, 0.01);
    gl.uniformMatrix4fv(P.u.uMVP, false, vp);
    visible.sort((a, b) => {
      const da = (a.sx * 16 + 8 - cam.x) ** 2 + (a.sy * 16 + 8 - cam.y) ** 2 + (a.sz * 16 + 8 - cam.z) ** 2;
      const db = (b.sx * 16 + 8 - cam.x) ** 2 + (b.sy * 16 + 8 - cam.y) ** 2 + (b.sz * 16 + 8 - cam.z) ** 2;
      return db - da;
    });
    gl.depthMask(false);
    for (const s of visible) if (s.tn) this.drawBuffer(s.tvbo, s.tn);
    // translucent dynamic (break overlay, shadows)
    this.dynT.reset();
    if (scene.buildDynT) scene.buildDynT(this.dynT, cam);
    gl.blendFunc(gl.DST_COLOR, gl.SRC_COLOR);
    this.drawDyn(this.dynT);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(true);

    // ---- selection outline
    if (scene.selection) this.drawSelection(scene.selection, vp);

    // ---- first-person hand/item
    if (scene.buildHand) {
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(P.p);
      const hp = M.perspective(70 * Math.PI / 180, W / H, 0.01, 10);
      gl.uniformMatrix4fv(P.u.uMVP, false, hp);
      gl.uniform3f(P.u.uCam, 0, 0, 0);
      gl.uniform1f(P.u.uFogNear, 100); gl.uniform1f(P.u.uFogFar, 200);
      gl.uniform1f(P.u.uAlphaTest, 0.5);
      gl.disable(gl.BLEND);
      this.dyn.reset();
      scene.buildHand(this.dyn);
      this.drawDyn(this.dyn);
    }
    // ---- screen tint overlays (underwater, damage)
    if (scene.screenTint) this.drawScreenTint(scene.screenTint);
  }

  drawSky(cam, proj, st) {
    const gl = this.gl, P = this.prog;
    // sky dome color = clear color; draw sun & moon relative to camera
    let v = M.viewMatrix(0, 0, 0, cam.yaw, cam.pitch);
    const mvp = M.mul(proj, v);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.uniformMatrix4fv(P.u.uMVP, false, mvp);
    gl.uniform1f(P.u.uFogNear, 1000); gl.uniform1f(P.u.uFogFar, 2000);
    gl.uniform1f(P.u.uAlphaTest, 0.01);
    gl.uniform3f(P.u.uCam, 0, 0, 0);
    const d = this.dyn; d.reset();
    const [tu, tv, ts] = tileUV(tex('white'));
    const a = st.ang;
    // sun direction rotates around the x axis (east-west path)
    const sun = [Math.sin(a), Math.cos(a), 0];
    const disc = (dir, size, col) => {
      const c = [dir[0] * 100, dir[1] * 100, dir[2] * 100];
      // tangent basis
      const up = [0, 0, 1];
      const r = [dir[1] * up[2] - dir[2] * up[1], dir[2] * up[0] - dir[0] * up[2], dir[0] * up[1] - dir[1] * up[0]];
      const u = [r[1] * dir[2] - r[2] * dir[1], r[2] * dir[0] - r[0] * dir[2], r[0] * dir[1] - r[1] * dir[0]];
      const p = (sx, sy) => [c[0] + (r[0] * sx + u[0] * sy) * size, c[1] + (r[1] * sx + u[1] * sy) * size, c[2] + (r[2] * sx + u[2] * sy) * size];
      d.quad(p(-1, 1), p(-1, -1), p(1, -1), p(1, 1), tu, tv, tu + ts, tv + ts, 15, 15, 1, col);
    };
    disc(sun, 12, [255, 240, 160]);
    disc([-sun[0], -sun[1], 0], 8, [220, 220, 240]);
    // stars at night
    if (st.day < 0.6) {
      if (!this.stars) {
        this.stars = [];
        let s = 99;
        const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
        for (let i = 0; i < 400; i++) { const th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * 2 - 1); this.stars.push([Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th), 0.25 + rnd() * 0.35]); }
      }
      const alpha = (1 - st.day / 0.6) * 255;
      for (const s of this.stars) {
        // rotate with sky
        const x = s[0] * Math.cos(a) + s[1] * Math.sin(a), y = -s[0] * Math.sin(a) + s[1] * Math.cos(a);
        const dir = [x, y, s[2]];
        const c = [dir[0] * 100, dir[1] * 100, dir[2] * 100];
        const sz = s[3];
        d.quad([c[0] - sz, c[1] + sz, c[2]], [c[0] - sz, c[1] - sz, c[2]], [c[0] + sz, c[1] - sz, c[2]], [c[0] + sz, c[1] + sz, c[2]], tu, tv, tu + ts, tv + ts, 15, 15, 1, [255, 255, 255], alpha);
      }
    }
    this.drawDyn(d);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  drawClouds(cam, vp, st, fogNear, fogFar) {
    const gl = this.gl, P = this.prog;
    const d = this.dyn; d.reset();
    const [tu, tv, ts] = tileUV(tex('white'));
    const off = (performance.now() / 1000 * 0.6) % (48 * 12);
    const y = 122;
    const br = Math.max(0.25, st.day);
    const col = [255 * br, 255 * br, 255 * br];
    for (const [cx, cz, w] of this.clouds) {
      const x = cx + off - 96, z = cz - 96;
      if (Math.abs(x - cam.x) > 220 || Math.abs(z - cam.z) > 220) continue;
      d.quad([x, y, z], [x, y, z + 12], [x + w, y, z + 12], [x + w, y, z], tu, tv, tu + ts, tv + ts, 15, 0, 1, col, 200);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(P.u.uFogNear, fogNear * 2); gl.uniform1f(P.u.uFogFar, Math.max(fogFar * 2.4, 200));
    gl.uniform1f(P.u.uAlphaTest, 0.01);
    gl.depthMask(false);
    this.drawDyn(d);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.uniform1f(P.u.uFogNear, fogNear); gl.uniform1f(P.u.uFogFar, fogFar);
    gl.uniform1f(P.u.uAlphaTest, 0.5);
  }

  drawSelection(sel, vp) {
    const gl = this.gl, L = this.lprog;
    const [x, y, z, bx] = sel;
    const e = 0.002;
    const x0 = x + bx[0] - e, y0 = y + bx[1] - e, z0 = z + bx[2] - e, x1 = x + bx[3] + e, y1 = y + bx[4] + e, z1 = z + bx[5] + e;
    const v = new Float32Array([
      x0, y0, z0, x1, y0, z0, x1, y0, z0, x1, y0, z1, x1, y0, z1, x0, y0, z1, x0, y0, z1, x0, y0, z0,
      x0, y1, z0, x1, y1, z0, x1, y1, z0, x1, y1, z1, x1, y1, z1, x0, y1, z1, x0, y1, z1, x0, y1, z0,
      x0, y0, z0, x0, y1, z0, x1, y0, z0, x1, y1, z0, x1, y0, z1, x1, y1, z1, x0, y0, z1, x0, y1, z1
    ]);
    gl.useProgram(L.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, v, gl.STREAM_DRAW);
    gl.disableVertexAttribArray(this.prog.a.aUV); gl.disableVertexAttribArray(this.prog.a.aLight); gl.disableVertexAttribArray(this.prog.a.aTint);
    gl.enableVertexAttribArray(L.a.aPos);
    gl.vertexAttribPointer(L.a.aPos, 3, gl.FLOAT, false, 12, 0);
    gl.uniformMatrix4fv(L.u.uMVP, false, vp);
    gl.uniform4f(L.u.uCol, 0, 0, 0, 0.6);
    gl.enable(gl.BLEND);
    gl.lineWidth(2);
    gl.drawArrays(gl.LINES, 0, 24);
    gl.disable(gl.BLEND);
    gl.useProgram(this.prog.p);
  }

  drawScreenTint(c) {
    const gl = this.gl, L = this.lprog;
    gl.useProgram(L.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0]), gl.STREAM_DRAW);
    gl.disableVertexAttribArray(this.prog.a.aUV); gl.disableVertexAttribArray(this.prog.a.aLight); gl.disableVertexAttribArray(this.prog.a.aTint);
    gl.enableVertexAttribArray(L.a.aPos);
    gl.vertexAttribPointer(L.a.aPos, 3, gl.FLOAT, false, 12, 0);
    gl.uniformMatrix4fv(L.u.uMVP, false, M.identity());
    gl.uniform4f(L.u.uCol, c[0], c[1], c[2], c[3]);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(this.prog.p);
  }

  dispose() {
    const gl = this.gl;
    for (const s of this.sections.values()) { if (s.vbo) gl.deleteBuffer(s.vbo); if (s.tvbo) gl.deleteBuffer(s.tvbo); }
    this.sections.clear();
  }
}
