// Client-side visuals: particles and the per-frame dynamic geometry (entities, items, overlays).
import { blocks, R, B } from './blocks.js';
import { tex, tileUV, look050, terrainTile } from './textures.js';
import { drawMob, drawItem, drawBox, drawPainting, T3 } from './models.js';
import { isBlockItem, blockIconIsFlat } from './items.js';

export class Particles {
  constructor(world) { this.world = world; this.list = []; }
  add(p) { if (this.list.length < 1500) this.list.push(p); }
  blockBreak(x, y, z, id, meta) {
    const b = blocks[id]; if (!b) return;
    const tile = b.texFn(2, meta);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) {
      if (Math.random() < 0.55) continue;
      const px = x + (i + 0.5) / 4, py = y + (j + 0.5) / 4, pz = z + (k + 0.5) / 4;
      this.add({ x: px, y: py, z: pz, vx: (px - x - 0.5) * 0.25 + (Math.random() - 0.5) * 0.05, vy: (py - y - 0.5) * 0.25 + Math.random() * 0.1, vz: (pz - z - 0.5) * 0.25 + (Math.random() - 0.5) * 0.05, life: 15 + Math.random() * 20, tile, size: 0.08 + Math.random() * 0.06, g: 0.04, sub: true, uo: Math.random() * 0.75, vo: Math.random() * 0.75 });
    }
  }
  blockHit(x, y, z, id, meta, f) {
    const b = blocks[id]; if (!b) return;
    const tile = b.texFn(2, meta);
    const n = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]][f || 1];
    for (let i = 0; i < 3; i++) {
      const px = x + 0.5 + n[0] * 0.55 + (n[0] ? 0 : (Math.random() - 0.5)), py = y + 0.5 + n[1] * 0.55 + (n[1] ? 0 : (Math.random() - 0.5)), pz = z + 0.5 + n[2] * 0.55 + (n[2] ? 0 : (Math.random() - 0.5));
      this.add({ x: px, y: py, z: pz, vx: n[0] * 0.05 + (Math.random() - 0.5) * 0.06, vy: n[1] * 0.05 + Math.random() * 0.06, vz: n[2] * 0.05 + (Math.random() - 0.5) * 0.06, life: 10 + Math.random() * 10, tile, size: 0.07, g: 0.04, sub: true, uo: Math.random() * 0.75, vo: Math.random() * 0.75 });
    }
  }
  explosion(x, y, z, p) {
    const t = tex('smoke');
    for (let i = 0; i < 40 + p * 10; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2, s = Math.random() * 0.4;
      this.add({ x, y, z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + 0.05, vz: Math.sin(a) * Math.cos(e) * s, life: 20 + Math.random() * 25, tile: t, size: 0.4 + Math.random() * 0.6, g: -0.005, drag: 0.9, col: [255, 255, 255], light: true });
    }
  }
  poof(x, y, z, tileName, col) {
    const t = tex(tileName || 'smoke');
    for (let i = 0; i < 8; i++) this.add({ x, y, z, vx: (Math.random() - 0.5) * 0.15, vy: Math.random() * 0.15, vz: (Math.random() - 0.5) * 0.15, life: 10 + Math.random() * 10, tile: t, size: 0.12, g: 0.03, sub: !!tileName, uo: 0.25, vo: 0.25, col });
  }
  sparkle(x, y, z, col) {
    const t = tex('particle');
    for (let i = 0; i < 10; i++) this.add({ x: x + Math.random(), y: y + Math.random(), z: z + Math.random(), vx: 0, vy: 0.02, vz: 0, life: 20 + Math.random() * 10, tile: t, size: 0.08, g: -0.001, col: col || [120, 255, 120], light: true });
  }
  bubble(x, y, z) { this.add({ x, y, z, vx: 0, vy: 0.05, vz: 0, life: 20, tile: tex('bubble'), size: 0.08, g: -0.01, light: true }); }
  smokeAt(x, y, z) { this.add({ x, y, z, vx: (Math.random() - 0.5) * 0.02, vy: 0.04, vz: (Math.random() - 0.5) * 0.02, life: 20 + Math.random() * 10, tile: tex('smoke'), size: 0.12, g: -0.002, col: [90, 90, 90] }); }
  flame(x, y, z) { this.add({ x, y, z, vx: 0, vy: 0.01, vz: 0, life: 8 + Math.random() * 6, tile: tex('fire'), size: 0.08, g: -0.003, light: true, sub: true, uo: 0.3, vo: 0.5 }); }
  tick() {
    const w = this.world;
    let j = 0;
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      p.life--;
      p.vy -= p.g;
      const d = p.drag || 0.96;
      p.vx *= d; p.vy *= d; p.vz *= d;
      const nx = p.x + p.vx, ny = p.y + p.vy, nz = p.z + p.vz;
      const id = w.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
      if (blocks[id] && blocks[id].solid && blocks[id].opaque) { p.vx *= 0.2; p.vz *= 0.2; p.vy = 0; }
      else { p.x = nx; p.y = ny; p.z = nz; }
      if (p.life > 0) this.list[j++] = p;
    }
    this.list.length = j;
  }
  build(mesh, cam) {
    const w = this.world;
    // camera right & up vectors
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const rx = cy, rz = sy; // right
    const ux = sy * sp, uy = cp, uz = -cy * sp; // up
    for (const p of this.list) {
      const s = p.size;
      const [tu, tv, ts] = tileUV(p.tile);
      let u0 = tu, v0 = tv, u1 = tu + ts, v1 = tv + ts;
      if (p.sub) { u0 = tu + p.uo * ts; v0 = tv + p.vo * ts; u1 = u0 + ts * 0.25; v1 = v0 + ts * 0.25; }
      const L = p.light ? 0xff : w.light[(((p.x | 0) & 255) << 15) | (((p.z | 0) & 255) << 7) | Math.max(0, Math.min(127, p.y | 0))];
      const sky = L >> 4, blk = L & 15;
      const c = p.col || [255, 255, 255];
      mesh.quad(
        [p.x - rx * s + ux * s, p.y + uy * s, p.z - rz * s + uz * s],
        [p.x - rx * s - ux * s, p.y - uy * s, p.z - rz * s - uz * s],
        [p.x + rx * s - ux * s, p.y - uy * s, p.z + rz * s - uz * s],
        [p.x + rx * s + ux * s, p.y + uy * s, p.z + rz * s + uz * s],
        u0, v0, u1, v1, sky, blk, 1, c);
    }
  }
}

function lightAt(w, x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  if (yi >= 128) return [15, 0];
  if (xi < 0 || zi < 0 || xi > 255 || zi > 255 || yi < 0) return [15, 0];
  const L = w.light[(xi << 15) | (zi << 7) | yi];
  return [L >> 4, L & 15];
}

const lerp = (a, b, t) => a + (b - a) * t;
function lerpAngle(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }

export function buildEntities(mesh, game, me, alpha, cam, renderDist) {
  const w = game.world;
  const rd2 = renderDist * renderDist;
  const draw = (e) => {
    if (e === me || e.removed) return;
    const x = lerp(e.px, e.x, alpha), y = lerp(e.py, e.y, alpha), z = lerp(e.pz, e.z, alpha);
    if ((x - cam.x) ** 2 + (z - cam.z) ** 2 > rd2) return;
    const [sky, blk] = lightAt(w, x, y + 0.5, z);
    if (e.type === 'item') {
      const t = (e.age + alpha) / 20;
      const bob = Math.sin(t * 2 + e.bob) * 0.08 + 0.15;
      let m = T3.t(T3.id(), x, y + bob, z);
      m = T3.ry(m, t + e.bob);
      const n = e.item.count > 20 ? 3 : e.item.count > 5 ? 2 : 1;
      const block3d = isBlockItem(e.item.id) && !blockIconIsFlat(e.item.id);
      for (let k = 0; k < n; k++) {
        let mm = T3.t(m, k * 0.06, k * 0.04, k * 0.05);
        mm = block3d ? T3.s(mm, 0.45, 0.45, 0.45) : T3.s(mm, 0.45, 0.45, 0.45);
        mm = T3.t(mm, -0.5, block3d ? -0.2 : 0, -0.5);
        drawItem(mesh, mm, e.item.id, e.item.meta, sky, blk);
      }
      return;
    }
    if (e.type === 'painting') { drawPainting(mesh, e, ...lightAt(w, e.bx + 0.5 + [0, 0, 0, 0, 1, -1][e.dir] * 0, e.by + 0.5, e.bz + 0.5)); return; }
    if (e.type === 'arrow') {
      let m = T3.t(T3.id(), x, y + 0.1, z);
      m = T3.ry(m, -e.yaw); m = T3.rx(m, e.pitch || 0);
      drawBox(mesh, m, -0.03, -0.03, -0.35, 0.03, 0.03, 0.35, [120, 85, 40], sky, blk);
      drawBox(mesh, m, -0.08, -0.01, 0.25, 0.08, 0.01, 0.38, [230, 230, 230], sky, blk);
      drawBox(mesh, m, -0.05, -0.05, -0.42, 0.05, 0.05, -0.33, [130, 130, 130], sky, blk);
      return;
    }
    if (e.type === 'snowball' || e.type === 'egg') {
      let m = T3.t(T3.id(), x - 0.15, y, z - 0.15); m = T3.s(m, 0.3, 0.3, 0.3);
      drawItem(mesh, m, e.type === 'egg' ? 344 : 332, 0, sky, blk);
      return;
    }
    if (e.type === 'tnt' || e.type === 'falling') {
      const id = e.type === 'tnt' ? B.TNT : e.block;
      const b = blocks[id];
      let m = T3.t(T3.id(), x - 0.5, y, z - 0.5);
      let sc = 1;
      if (e.type === 'tnt' && e.fuse < 10) sc = 1 + (10 - e.fuse) / 10 * 0.2;
      if (sc !== 1) { m = T3.t(m, 0.5, 0.5, 0.5); m = T3.s(m, sc, sc, sc); m = T3.t(m, -0.5, -0.5, -0.5); }
      const faces = [0, 1, 2, 3, 4, 5].map((f) => ({ tile: b.texFn(f, e.meta || 0) }));
      const flash = e.type === 'tnt' && Math.floor(e.fuse / 5) % 2 === 0;
      drawBox(mesh, m, 0, 0, 0, 1, 1, 1, faces, flash ? 15 : sky, flash ? 15 : blk);
      if (flash) drawBox(mesh, m, -0.01, -0.01, -0.01, 1.01, 1.01, 1.01, [255, 255, 255], 15, 15, 140);
      return;
    }
    // mobs & players
    e.rx = x; e.ry = y; e.rz = z;
    if (e.type !== 'player') e.ryaw = lerpAngle(e.pyaw !== undefined ? e.pyaw : e.ryaw, e.ryaw, alpha);
    else e.ryaw = e.yaw;
    const fireLit = e.fire > 0 ? 15 : blk;
    if (e.type === 'player') {
      e.rx = x; e.ry = (e.sneak ? y - 0.1 : y);
      if (e.sleepingNet || e.sleeping) { e.ry = y - 1.2; }
    }
    drawMob(mesh, e, sky, fireLit);
    if (e.type === 'player' && e.name) e._label = [x, y + 2.05, z];
  };
  for (const e of game.entities.values()) draw(e);
  for (const p of game.players.values()) draw(p);
}

export function buildOverlay(mesh, ctrl) {
  // block breaking cracks
  const br = ctrl.breaking;
  if (!br || br.progress <= 0) return;
  const stage = Math.min(9, Math.floor(br.progress * 10));
  const tile = look050 ? terrainTile(240 + stage) : tex('destroy_' + stage);
  const e = 0.003;
  const sb = ctrl.target && ctrl.target.x === br.x && ctrl.target.y === br.y && ctrl.target.z === br.z ? ctrl.target.box : [0, 0, 0, 1, 1, 1];
  const m = T3.t(T3.id(), br.x, br.y, br.z);
  drawBox(mesh, m, sb[0] - e, sb[1] - e, sb[2] - e, sb[3] + e, sb[4] + e, sb[5] + e, { tile, col: [255, 255, 255] }, 15, 15);
}
