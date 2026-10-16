// Low-poly box models for players and mobs (original designs), plus item/block rendering helpers.
import { tileUV, tex, PAINTINGS } from './textures.js';
import { blocks, R } from './blocks.js';
import { itemIconTile, isBlockItem, blockIconIsFlat } from './items.js';

// 3x4 affine matrix as array [m00,m01,m02,m03, m10.., m20..]
function I3() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]; }
function mm(a, b) {
  const o = new Array(12);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c];
    o[r * 4 + 3] = a[r * 4] * b[3] + a[r * 4 + 1] * b[7] + a[r * 4 + 2] * b[11] + a[r * 4 + 3];
  }
  return o;
}
export const T3 = {
  id: I3,
  t: (m, x, y, z) => mm(m, [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z]),
  ry: (m, a) => { const c = Math.cos(a), s = Math.sin(a); return mm(m, [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]); },
  rx: (m, a) => { const c = Math.cos(a), s = Math.sin(a); return mm(m, [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]); },
  rz: (m, a) => { const c = Math.cos(a), s = Math.sin(a); return mm(m, [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]); },
  s: (m, x, y, z) => mm(m, [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0]),
  ap: (m, x, y, z) => [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]]
};

const SH = [0.5, 1.0, 0.8, 0.8, 0.6, 0.6];
// box from (x0,y0,z0) to (x1,y1,z1) in model units; faces: array of 6 colors or {tile, col}
export function drawBox(mesh, m, x0, y0, z0, x1, y1, z1, faces, sky, blk, alpha = 255) {
  const P = (x, y, z) => T3.ap(m, x, y, z);
  const corners = [
    [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]],
    [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]],
    [[x1, y1, z0], [x1, y0, z0], [x0, y0, z0], [x0, y1, z0]],
    [[x0, y1, z1], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1]],
    [[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]],
    [[x1, y1, z1], [x1, y0, z1], [x1, y0, z0], [x1, y1, z0]]
  ];
  const white = tileUV(tex('white'));
  for (let f = 0; f < 6; f++) {
    let fc = Array.isArray(faces) && faces.length === 6 ? faces[f] : faces;
    if (!fc) continue;
    let col, uv;
    if (fc.tile !== undefined) { col = fc.col || [255, 255, 255]; const [tu, tv, ts] = tileUV(fc.tile); uv = fc.uv ? [tu + fc.uv[0] * ts, tv + fc.uv[1] * ts, tu + fc.uv[2] * ts, tv + fc.uv[3] * ts] : [tu, tv, tu + ts, tv + ts]; }
    else { col = fc; uv = [white[0] + 0.01 * white[2], white[1] + 0.01 * white[2], white[0] + 0.99 * white[2], white[1] + 0.99 * white[2]]; }
    const c = corners[f];
    mesh.quad(P(...c[0]), P(...c[1]), P(...c[2]), P(...c[3]), uv[0], uv[1], uv[2], uv[3], sky, blk, SH[f], col, alpha);
  }
}

const shadeCol = (c, f) => [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)];
// a cuboid with a "face" on its front (-z = front after yaw)
function headFaces(base, front) { return [shadeCol(base, 0.9), base, front || base, base, base, base]; }

// all models are built in units of 1/16 block, origin at feet center, facing -z (north) at yaw 0
const MODELS = {};
const px = 1 / 16;

function limb(mesh, m, pivot, size, angle, faces, sky, blk, angleZ = 0) {
  let t = T3.t(m, pivot[0] * px, pivot[1] * px, pivot[2] * px);
  if (angle) t = T3.rx(t, angle);
  if (angleZ) t = T3.rz(t, angleZ);
  const [w, h, d, ox = 0, oz = 0] = size;
  drawBox(mesh, t, (-w / 2 + ox) * px, -h * px, (-d / 2 + oz) * px, (w / 2 + ox) * px, 0, (d / 2 + oz) * px, faces, sky, blk);
}

function face(mesh, m, x, y, z, w, h, col, sky, blk) {
  drawBox(mesh, m, x * px, y * px, z * px - 0.002, (x + w) * px, (y + h) * px, z * px, [null, null, col, null, null, null], sky, blk);
}

function humanoid(mesh, m, e, sky, blk, pal) {
  const sw = Math.sin(e.walkAnim * 0.6662) * 1.0 * e.walkAmt;
  const headPitch = e.pitch || 0;
  // legs
  limb(mesh, m, [-2, 12, 0], [4, 12, 4], sw, pal.legs, sky, blk);
  limb(mesh, m, [2, 12, 0], [4, 12, 4], -sw, pal.legs, sky, blk);
  // body
  drawBox(mesh, m, -4 * px, 12 * px, -2 * px, 4 * px, 24 * px, 2 * px, pal.body, sky, blk);
  // arms
  const armRaise = pal.armsForward ? -Math.PI / 2 : 0;
  const swing = e.swing ? -Math.sin(e.swing * Math.PI) * 1.2 : 0;
  limb(mesh, m, [-6, 22, 0], [4, 12, 4], armRaise + (pal.armsForward ? 0 : -sw * 0.8), pal.arms, sky, blk);
  limb(mesh, m, [6, 22, 0], [4, 12, 4], armRaise + (pal.armsForward ? 0 : sw * 0.8) + swing, pal.arms, sky, blk);
  // held item in right hand
  if (e.held && e.held.id) {
    let t = T3.t(m, 6 * px, 22 * px, 0);
    t = T3.rx(t, armRaise + sw * 0.8 + swing);
    t = T3.t(t, 0, -10 * px, -2 * px);
    t = T3.rx(t, -Math.PI / 2);
    t = T3.s(t, 0.45, 0.45, 0.45);
    t = T3.t(t, -0.5, -0.1, -0.5);
    drawItem(mesh, t, e.held.id, e.held.meta || 0, sky, blk, true);
  }
  // head
  let h = T3.t(m, 0, 24 * px, 0);
  h = T3.rx(h, headPitch);
  drawBox(mesh, h, -4 * px, 0, -4 * px, 4 * px, 8 * px, 4 * px, pal.head, sky, blk);
  if (pal.hair) drawBox(mesh, h, -4.2 * px, 6 * px, -4.2 * px, 4.2 * px, 8.3 * px, 4.2 * px, pal.hair, sky, blk);
  if (pal.face) pal.face(mesh, h, sky, blk);
}

const eyes = (white, pupil) => (mesh, h, sky, blk) => {
  face(mesh, h, -3, 3, -4, 2, 1, white, sky, blk); face(mesh, h, 1, 3, -4, 2, 1, white, sky, blk);
  face(mesh, h, -2, 3, -4.01, 1, 1, pupil, sky, blk); face(mesh, h, 1, 3, -4.01, 1, 1, pupil, sky, blk);
};

const SKIN = [214, 166, 126], SHIRT = [56, 120, 180], PANTS = [52, 52, 110], HAIR = [70, 45, 25];
MODELS.player = (mesh, m, e, sky, blk) => {
  const shirt = e.color || SHIRT;
  humanoid(mesh, m, e, sky, blk, {
    legs: PANTS, body: shirt, arms: [shirt, SKIN, shirt, shirt, shirt, shirt], head: SKIN, hair: [HAIR, HAIR, null, HAIR, HAIR, HAIR],
    face: (mesh, h, sky, blk) => { eyes([240, 240, 240], [60, 60, 160])(mesh, h, sky, blk); face(mesh, h, -2, 1, -4, 4, 1, [150, 90, 70], sky, blk); }
  });
};
MODELS.zombie = (mesh, m, e, sky, blk) => {
  const g = [90, 140, 80];
  humanoid(mesh, m, e, sky, blk, {
    legs: [60, 60, 120], body: [40, 140, 160], arms: g, head: g, armsForward: true,
    face: (mesh, h, sky, blk) => { face(mesh, h, -3, 3, -4, 2, 2, [20, 30, 20], sky, blk); face(mesh, h, 1, 3, -4, 2, 2, [20, 30, 20], sky, blk); face(mesh, h, -2, 1, -4, 4, 1, [50, 80, 45], sky, blk); }
  });
};
MODELS.pigzombie = (mesh, m, e, sky, blk) => {
  const pink = [230, 150, 150], rot = [110, 150, 80];
  humanoid(mesh, m, e, sky, blk, {
    legs: [pink, pink, rot, pink, rot, pink], body: [180, 120, 100], arms: [pink, pink, pink, rot, pink, pink], head: [pink, pink, pink, pink, rot, pink], armsForward: false,
    face: (mesh, h, sky, blk) => { face(mesh, h, -2, 1, -4.5, 4, 2, [240, 170, 170], sky, blk); face(mesh, h, -3, 4, -4, 2, 1, [30, 30, 30], sky, blk); face(mesh, h, 1, 4, -4, 2, 1, [30, 30, 30], sky, blk); }
  });
};
MODELS.skeleton = (mesh, m, e, sky, blk) => {
  const b = [200, 200, 200];
  const sw = Math.sin(e.walkAnim * 0.6662) * e.walkAmt;
  limb(mesh, m, [-2, 12, 0], [2, 12, 2], sw, b, sky, blk);
  limb(mesh, m, [2, 12, 0], [2, 12, 2], -sw, b, sky, blk);
  drawBox(mesh, m, -4 * px, 12 * px, -1.5 * px, 4 * px, 24 * px, 1.5 * px, [180, 180, 180], sky, blk);
  limb(mesh, m, [-5, 22, 0], [2, 12, 2], -Math.PI / 2, b, sky, blk);
  limb(mesh, m, [5, 22, 0], [2, 12, 2], -Math.PI / 2, b, sky, blk);
  let t = T3.t(m, 5 * px, 22 * px, 0); t = T3.rx(t, -Math.PI / 2); t = T3.t(t, 0, -11 * px, 0); t = T3.ry(t, Math.PI / 2); t = T3.s(t, 0.6, 0.6, 0.6); t = T3.t(t, -0.5, -0.5, 0);
  drawItem(mesh, t, 261, 0, sky, blk, true);
  let h = T3.t(m, 0, 24 * px, 0); h = T3.rx(h, e.pitch || 0);
  drawBox(mesh, h, -4 * px, 0, -4 * px, 4 * px, 8 * px, 4 * px, b, sky, blk);
  face(mesh, h, -3, 3, -4, 2, 2, [30, 30, 30], sky, blk); face(mesh, h, 1, 3, -4, 2, 2, [30, 30, 30], sky, blk); face(mesh, h, -2, 1, -4, 4, 1, [60, 60, 60], sky, blk);
};
MODELS.creeper = (mesh, m, e, sky, blk) => {
  const g = [80, 170, 70], g2 = [60, 140, 55];
  const sw = Math.sin(e.walkAnim * 0.6662) * e.walkAmt;
  const fuse = e.fuse ? 1 + Math.sin(e.fuse * 1.2) * 0.04 + e.fuse / 30 * 0.1 : 1;
  m = T3.s(m, fuse, 1, fuse);
  limb(mesh, m, [-2, 6, -4], [4, 6, 4], sw, g2, sky, blk);
  limb(mesh, m, [2, 6, -4], [4, 6, 4], -sw, g2, sky, blk);
  limb(mesh, m, [-2, 6, 4], [4, 6, 4], -sw, g2, sky, blk);
  limb(mesh, m, [2, 6, 4], [4, 6, 4], sw, g2, sky, blk);
  drawBox(mesh, m, -4 * px, 6 * px, -2 * px, 4 * px, 18 * px, 2 * px, g, sky, blk);
  const h = T3.t(m, 0, 18 * px, 0);
  drawBox(mesh, h, -4 * px, 0, -4 * px, 4 * px, 8 * px, 4 * px, g, sky, blk);
  const k = [20, 30, 20];
  face(mesh, h, -3, 4, -4, 2, 2, k, sky, blk); face(mesh, h, 1, 4, -4, 2, 2, k, sky, blk);
  face(mesh, h, -1, 1, -4, 2, 3, k, sky, blk); face(mesh, h, -2, 0, -4, 1, 2, k, sky, blk); face(mesh, h, 1, 0, -4, 1, 2, k, sky, blk);
  if (e.fuse && Math.floor(e.fuse / 4) % 2) drawBox(mesh, m, -4.3 * px, 0, -4.3 * px, 4.3 * px, 26.3 * px, 4.3 * px, [255, 255, 255], 15, 15, 120);
};
MODELS.spider = (mesh, m, e, sky, blk) => {
  const d = [50, 40, 36], d2 = [70, 56, 50];
  drawBox(mesh, m, -3 * px, 5 * px, -3 * px, 3 * px, 11 * px, 3 * px, d, sky, blk);
  drawBox(mesh, m, -5 * px, 4 * px, 3 * px, 5 * px, 12 * px, 15 * px, d2, sky, blk);
  const h = T3.t(m, 0, 4 * px, -3 * px);
  drawBox(mesh, h, -4 * px, 0, -8 * px, 4 * px, 8 * px, 0, d, sky, blk);
  const red = [230, 30, 30];
  for (const [x, y] of [[-3, 5], [2, 5], [-2, 3], [1, 3]]) face(mesh, h, x, y, -8, 1, 1, red, 15, 15);
  const sw = Math.sin(e.walkAnim * 0.6662 * 2) * 0.4 * e.walkAmt;
  for (let i = 0; i < 4; i++) for (const side of [-1, 1]) {
    let t = T3.t(m, side * 3 * px, 9 * px, (-1 + i * 1.2) * px);
    t = T3.ry(t, side * (0.6 - i * 0.4) + (i % 2 ? sw : -sw) * side);
    t = T3.rz(t, side * 0.6);
    drawBox(mesh, t, (side < 0 ? -15 : 0) * px, -1 * px, -1 * px, (side < 0 ? 0 : 15) * px, 1 * px, 1 * px, d, sky, blk);
  }
};
function quadruped(mesh, m, e, sky, blk, o) {
  const sw = Math.sin(e.walkAnim * 0.6662) * 1.2 * e.walkAmt;
  const lh = o.legH;
  for (const [x, z, s] of [[-o.legX, -o.legZ, sw], [o.legX, -o.legZ, -sw], [-o.legX, o.legZ, -sw], [o.legX, o.legZ, sw]]) limb(mesh, m, [x, lh, z], [o.legW, lh, o.legW], s, o.leg, sky, blk);
  drawBox(mesh, m, -o.bw / 2 * px, lh * px, -o.bl / 2 * px, o.bw / 2 * px, (lh + o.bh) * px, o.bl / 2 * px, o.body, sky, blk);
  if (o.wool) drawBox(mesh, m, (-o.bw / 2 - 1.5) * px, (lh - 1) * px, (-o.bl / 2 - 1.5) * px, (o.bw / 2 + 1.5) * px, (lh + o.bh + 1.5) * px, (o.bl / 2 + 1.5) * px, o.wool, sky, blk);
  let h = T3.t(m, 0, (lh + o.bh - 1) * px, -o.bl / 2 * px);
  h = T3.rx(h, e.pitch || 0);
  drawBox(mesh, h, -o.hw / 2 * px, (-o.hh + o.hUp) * px, -o.hd * px, o.hw / 2 * px, o.hUp * px, 0, o.head, sky, blk);
  if (o.face) o.face(mesh, h, sky, blk);
}
MODELS.pig = (mesh, m, e, sky, blk) => quadruped(mesh, m, e, sky, blk, {
  legH: 6, legW: 4, legX: 3, legZ: 5, bw: 10, bl: 16, bh: 8, hw: 8, hh: 8, hd: 8, hUp: 5, leg: [230, 150, 150], body: [240, 160, 160], head: [240, 160, 160],
  face: (mesh, h, sky, blk) => { drawBox(mesh, h, -2 * px, -2 * px, -9 * px, 2 * px, 1 * px, -8 * px, [230, 130, 140], sky, blk); face(mesh, h, -4, 1, -8, 2, 1, [30, 30, 30], sky, blk); face(mesh, h, 2, 1, -8, 2, 1, [30, 30, 30], sky, blk); }
});
MODELS.cow = (mesh, m, e, sky, blk) => quadruped(mesh, m, e, sky, blk, {
  legH: 12, legW: 4, legX: 4, legZ: 6, bw: 12, bl: 18, bh: 10, hw: 8, hh: 8, hd: 6, hUp: 4, leg: [70, 50, 40], body: [[90, 60, 40], [90, 60, 40], [230, 230, 230], [90, 60, 40], [230, 230, 230], [90, 60, 40]], head: [80, 55, 40],
  face: (mesh, h, sky, blk) => {
    drawBox(mesh, h, -3 * px, -4 * px, -7 * px, 3 * px, -1 * px, -6 * px, [200, 170, 150], sky, blk);
    face(mesh, h, -3, 1, -6, 2, 1, [20, 20, 20], sky, blk); face(mesh, h, 1, 1, -6, 2, 1, [20, 20, 20], sky, blk);
    drawBox(mesh, h, -5 * px, 3 * px, -4 * px, -4 * px, 5 * px, -3 * px, [220, 220, 210], sky, blk); drawBox(mesh, h, 4 * px, 3 * px, -4 * px, 5 * px, 5 * px, -3 * px, [220, 220, 210], sky, blk);
  }
});
MODELS.sheep = (mesh, m, e, sky, blk) => {
  const wc = e.woolColor !== undefined ? e.woolColorRGB : [235, 235, 235];
  quadruped(mesh, m, e, sky, blk, {
    legH: 12, legW: 4, legX: 3, legZ: 5, bw: 8, bl: 16, bh: 6, hw: 6, hh: 6, hd: 8, hUp: 4, leg: [220, 210, 200], body: [220, 180, 170], head: [210, 200, 190],
    wool: e.sheared ? null : wc,
    face: (mesh, h, sky, blk) => { face(mesh, h, -3, 0, -8, 2, 1, [30, 30, 30], sky, blk); face(mesh, h, 1, 0, -8, 2, 1, [30, 30, 30], sky, blk); }
  });
};
MODELS.chicken = (mesh, m, e, sky, blk) => {
  const sw = Math.sin(e.walkAnim * 0.6662) * 1.2 * e.walkAmt;
  const yel = [230, 180, 40];
  limb(mesh, m, [-1.5, 5, 1], [1, 5, 1], sw, yel, sky, blk);
  limb(mesh, m, [1.5, 5, 1], [1, 5, 1], -sw, yel, sky, blk);
  drawBox(mesh, m, -3 * px, 4 * px, -3 * px, 3 * px, 10 * px, 5 * px, [245, 245, 245], sky, blk);
  const flap = e.onGround ? 0 : Math.sin(e.walkAnim * 3) * 0.8;
  limb(mesh, m, [-3.5, 9, 1], [1, 4, 6], 0, [235, 235, 235], sky, blk, flap);
  limb(mesh, m, [3.5, 9, 1], [1, 4, 6], 0, [235, 235, 235], sky, blk, -flap);
  const h = T3.t(m, 0, 9 * px, -3 * px);
  drawBox(mesh, h, -2 * px, 0, -3 * px, 2 * px, 6 * px, 0, [250, 250, 250], sky, blk);
  drawBox(mesh, h, -2 * px, 2 * px, -5 * px, 2 * px, 4 * px, -3 * px, [240, 170, 40], sky, blk);
  drawBox(mesh, h, -1 * px, 0, -4 * px, 1 * px, 2 * px, -3 * px, [210, 30, 30], sky, blk);
  face(mesh, h, -2, 4, -3, 1, 1, [20, 20, 20], sky, blk); face(mesh, h, 1, 4, -3, 1, 1, [20, 20, 20], sky, blk);
};

export function drawMob(mesh, e, sky, blk) {
  const fn = MODELS[e.type];
  if (!fn) return;
  let m = T3.t(T3.id(), e.rx, e.ry, e.rz);
  m = T3.ry(m, -e.ryaw);
  if (e.deathTime > 0) m = T3.rz(m, Math.min(1, e.deathTime / 20) * Math.PI / 2);
  if (e.scale) m = T3.s(m, e.scale, e.scale, e.scale);
  const hurt = e.hurtTime > 0 || e.deathTime > 0;
  const start = mesh.n;
  fn(mesh, m, e, sky, blk);
  if (hurt) {
    // red flash: re-tint the vertices just written
    const u8 = mesh.u8;
    for (let v = start; v < mesh.n; v++) { const o = v * 28 + 24; u8[o + 1] *= 0.45; u8[o + 2] *= 0.45; }
  }
}

// draw an item/block in model space unit box [0,1]
export function drawItem(mesh, m, id, meta, sky, blk, thin = false) {
  if (isBlockItem(id) && !blockIconIsFlat(id)) {
    const b = blocks[id];
    const faces = [];
    for (let f = 0; f < 6; f++) faces.push({ tile: b.texFn(f, f === 2 && (b.container || id === 86) ? meta || 2 : meta) });
    let y1 = 1;
    if (b.render === R.SLAB || b.render === R.BED) y1 = 0.5;
    if (b.render === R.SNOW) y1 = 0.125;
    drawBox(mesh, m, 0.2, 0.2, 0.2, 0.8, 0.2 + 0.6 * y1, 0.8, faces.map((f, i) => ((i < 2 || y1 === 1) ? f : { tile: f.tile, uv: [0, 1 - y1, 1, 1] })), sky, blk);
    return;
  }
  const tile = id < 256 ? (blocks[id] ? blocks[id].texFn(1, meta) : 0) : itemIconTile(id, meta);
  const [tu, tv, ts] = tileUV(tile);
  const P = (x, y, z) => T3.ap(m, x, y, z);
  // flat sprite with a little thickness (front & back)
  const z0 = 0.47, z1 = 0.53;
  mesh.quad(P(0, 1, z0), P(0, 0, z0), P(1, 0, z0), P(1, 1, z0), tu, tv, tu + ts, tv + ts, sky, blk, 1);
  mesh.quad(P(1, 1, z1), P(1, 0, z1), P(0, 0, z1), P(0, 1, z1), tu + ts, tv, tu, tv + ts, sky, blk, 0.8);
}

export function drawPainting(mesh, p, sky, blk) {
  const art = PAINTINGS[p.art % PAINTINGS.length];
  // p.x,p.y,p.z = bottom-left block coords on wall; p.dir 2..5 facing direction
  const e = 0.03;
  for (let ty = 0; ty < art.h; ty++) for (let tx = 0; tx < art.w; tx++) {
    const tile = tex(art.tiles[(art.h - 1 - ty) * art.w + tx]);
    const [tu, tv, ts] = tileUV(tile);
    let p0, p1, p2, p3;
    const bx = p.x, by = p.y + ty, bz = p.z;
    if (p.dir === 2) { // facing north: on south face of block at z, painting plane at z+1-e... we place on block face: wall at z+1
      const x = bx - tx, z = bz + 1 - e;
      p0 = [x + 1, by + 1, z]; p1 = [x + 1, by, z]; p2 = [x, by, z]; p3 = [x, by + 1, z];
    } else if (p.dir === 3) {
      const x = bx + tx, z = bz + e;
      p0 = [x, by + 1, z]; p1 = [x, by, z]; p2 = [x + 1, by, z]; p3 = [x + 1, by + 1, z];
    } else if (p.dir === 4) {
      const z = bz + tx, x = bx + 1 - e;
      p0 = [x, by + 1, z]; p1 = [x, by, z]; p2 = [x, by, z + 1]; p3 = [x, by + 1, z + 1];
    } else {
      const z = bz - tx, x = bx + e;
      p0 = [x, by + 1, z + 1]; p1 = [x, by, z + 1]; p2 = [x, by, z]; p3 = [x, by + 1, z];
    }
    mesh.quad(p0, p1, p2, p3, tu, tv, tu + ts, tv + ts, sky, blk, 1);
  }
}
