// Section mesher. Builds quad lists (4 verts each) for a 16^3 section.
// Vertex: x,y,z,u,v (float32) + sky,blk,shade,_ (u8) + r,g,b,a tint (u8) = 28 bytes.
import { blocks, R, B, OPAQUE, RENDER, LIQUID, FACE_DIRS, fenceConnections, doorState, paneBoxes } from './blocks.js';
import { WX, WY, WZ, idx } from './world.js';
import { tileUV, tex } from './textures.js';
import { BIOME } from './worldgen.js';

export const STRIDE = 28;
const FACE_SHADE = [0.5, 1.0, 0.8, 0.8, 0.6, 0.6];

class QuadBuf {
  constructor() { this.cap = 4096; this.buf = new ArrayBuffer(this.cap * 4 * STRIDE); this.f = new Float32Array(this.buf); this.u8 = new Uint8Array(this.buf); this.n = 0; }
  reset() { this.n = 0; }
  grow() {
    this.cap *= 2;
    const nb = new ArrayBuffer(this.cap * 4 * STRIDE);
    new Uint8Array(nb).set(this.u8);
    this.buf = nb; this.f = new Float32Array(nb); this.u8 = new Uint8Array(nb);
  }
  vert(x, y, z, u, v, sky, blk, shade, r, g, b) {
    const vi = this.n;
    if ((vi >> 2) >= this.cap) this.grow();
    const fo = vi * 7, bo = vi * STRIDE + 20;
    const f = this.f, u8 = this.u8;
    f[fo] = x; f[fo + 1] = y; f[fo + 2] = z; f[fo + 3] = u; f[fo + 4] = v;
    u8[bo] = sky * 17; u8[bo + 1] = blk * 17; u8[bo + 2] = shade * 255; u8[bo + 3] = 255;
    u8[bo + 4] = r; u8[bo + 5] = g; u8[bo + 6] = b; u8[bo + 7] = 255;
    this.n++;
  }
  slice() { return new Uint8Array(this.buf, 0, this.n * STRIDE).slice(); }
}

const opaqueBuf = new QuadBuf();
const transBuf = new QuadBuf();

function biomeTint(world, x, z, kind) {
  const b = world.biomes ? world.biomes[(x << 8) | z] : BIOME.PLAINS;
  // multipliers relative to texture's base green
  switch (b) {
    case BIOME.DESERT: return kind === 1 ? [255, 235, 160] : [250, 230, 150];
    case BIOME.TAIGA: return kind === 1 ? [190, 230, 220] : [200, 235, 225];
    case BIOME.SWAMP: return [170, 190, 120];
    case BIOME.FOREST: return kind === 1 ? [225, 255, 215] : [235, 255, 225];
    default: return [255, 255, 255];
  }
}

export function buildSection(world, sx, sy, sz) {
  opaqueBuf.reset(); transBuf.reset();
  const x0 = sx * 16, y0 = sy * 16, z0 = sz * 16;
  const BL = world.blocks, ME = world.meta, LI = world.light;
  let any = false;

  // light sampling helpers with bounds
  const lightAt = (x, y, z) => {
    if (y >= WY) return 0xf0;
    if (y < 0 || x < 0 || z < 0 || x >= WX || z >= WZ) return x < 0 || z < 0 || x >= WX || z >= WZ ? 0xf0 : 0;
    return LI[idx(x, y, z)];
  };
  const opq = (x, y, z) => {
    if (y < 0) return 1;
    if (y >= WY || x < 0 || z < 0 || x >= WX || z >= WZ) return 0;
    return OPAQUE[BL[idx(x, y, z)]];
  };
  const idAt = (x, y, z) => {
    if (y < 0) return B.BEDROCK;
    if (y >= WY || x < 0 || z < 0 || x >= WX || z >= WZ) return 0;
    return BL[idx(x, y, z)];
  };

  // ---- full cube face with smooth light + AO
  const CORNERS = [
    // per face: 4 corner offsets (in face plane) as [ax, ay, az] for vertex positions, plus tangent dirs
    // down (y-)
    [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]],
    // up
    [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
    // north z-
    [[1, 1, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0]],
    // south z+
    [[0, 1, 1], [0, 0, 1], [1, 0, 1], [1, 1, 1]],
    // west x-
    [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]],
    // east x+
    [[1, 1, 1], [1, 0, 1], [1, 0, 0], [1, 1, 0]]
  ];
  const UVS = [[0, 0], [0, 1], [1, 1], [1, 0]];

  function cubeFace(buf, x, y, z, f, tile, tint, yTop = 1) {
    const [dx, dy, dz] = FACE_DIRS[f];
    const nx = x + dx, ny = y + dy, nz = z + dz;
    const [tu, tv, ts] = tileUV(tile);
    const sh = FACE_SHADE[f];
    const cs = CORNERS[f];
    const lv = [0, 0, 0, 0], bv = [0, 0, 0, 0], ao = [0, 0, 0, 0];
    for (let c = 0; c < 4; c++) {
      const cx = cs[c][0], cy = cs[c][1], cz = cs[c][2];
      // tangent offsets: for each axis not equal to normal axis, offset is (corner?+1:-1)
      const ox = dx !== 0 ? 0 : (cx ? 1 : -1);
      const oy = dy !== 0 ? 0 : (cy ? 1 : -1);
      const oz = dz !== 0 ? 0 : (cz ? 1 : -1);
      // two side neighbours + corner in the outward layer
      let s1x = nx, s1y = ny, s1z = nz, s2x = nx, s2y = ny, s2z = nz;
      if (dx !== 0) { s1y += oy; s2z += oz; } else if (dy !== 0) { s1x += ox; s2z += oz; } else { s1x += ox; s2y += oy; }
      const cxw = nx + ox, cyw = ny + oy, czw = nz + oz;
      const o1 = opq(s1x, s1y, s1z), o2 = opq(s2x, s2y, s2z), oc = opq(cxw, cyw, czw);
      const aoV = (o1 && o2) ? 0 : 3 - (o1 + o2 + oc);
      const L0 = lightAt(nx, ny, nz), L1 = o1 ? -1 : lightAt(s1x, s1y, s1z), L2 = o2 ? -1 : lightAt(s2x, s2y, s2z), L3 = (oc || (o1 && o2)) ? -1 : lightAt(cxw, cyw, czw);
      let ss = L0 >> 4, bs = L0 & 15, n = 1;
      if (L1 >= 0) { ss += L1 >> 4; bs += L1 & 15; n++; }
      if (L2 >= 0) { ss += L2 >> 4; bs += L2 & 15; n++; }
      if (L3 >= 0) { ss += L3 >> 4; bs += L3 & 15; n++; }
      lv[c] = ss / n; bv[c] = bs / n; ao[c] = aoV;
    }
    const AOF = [0.5, 0.65, 0.82, 1.0];
    // flip quad diagonal for nicer AO
    const flip = ao[0] + ao[2] < ao[1] + ao[3];
    const order = flip ? [1, 2, 3, 0] : [0, 1, 2, 3];
    for (const c of order) {
      const p = cs[c];
      let vy = p[1];
      if (yTop !== 1 && vy === 1) vy = yTop;
      let uu = UVS[c][0], vv = UVS[c][1];
      if (f >= 2 && yTop !== 1) { if (vv === 0) vv = 1 - yTop; }
      buf.vert(x + p[0], y + vy, z + p[2], tu + uu * ts, tv + vv * ts, lv[c], bv[c], sh * AOF[ao[c]], tint[0], tint[1], tint[2]);
    }
  }

  // ---- generic axis-aligned box (flat lit), b = [x0,y0,z0,x1,y1,z1] local, texFor(face)->tile
  function box(buf, x, y, z, bx, texFor, tint, cullFaces = true, lightSelf = false) {
    const [a0, b0, c0, a1, b1, c1] = bx;
    for (let f = 0; f < 6; f++) {
      const onEdge = (f === 0 && b0 === 0) || (f === 1 && b1 === 1) || (f === 2 && c0 === 0) || (f === 3 && c1 === 1) || (f === 4 && a0 === 0) || (f === 5 && a1 === 1);
      const [dx, dy, dz] = FACE_DIRS[f];
      if (cullFaces && onEdge && opq(x + dx, y + dy, z + dz)) continue;
      const tile = texFor(f);
      if (tile < 0) continue;
      const L = (onEdge && !lightSelf) ? lightAt(x + dx, y + dy, z + dz) : lightAt(x, y, z);
      const sky = L >> 4, bl = L & 15, sh = FACE_SHADE[f];
      const [tu, tv, ts] = tileUV(tile);
      let quad;
      // u,v sub-rect based on box extents
      if (f === 0 || f === 1) {
        const u0 = a0, u1 = a1, v0 = c0, v1 = c1;
        quad = f === 1
          ? [[a0, b1, c0, u0, v0], [a0, b1, c1, u0, v1], [a1, b1, c1, u1, v1], [a1, b1, c0, u1, v0]]
          : [[a0, b0, c1, u0, v1], [a0, b0, c0, u0, v0], [a1, b0, c0, u1, v0], [a1, b0, c1, u1, v1]];
      } else if (f === 2) quad = [[a1, b1, c0, 1 - a1, 1 - b1], [a1, b0, c0, 1 - a1, 1 - b0], [a0, b0, c0, 1 - a0, 1 - b0], [a0, b1, c0, 1 - a0, 1 - b1]];
      else if (f === 3) quad = [[a0, b1, c1, a0, 1 - b1], [a0, b0, c1, a0, 1 - b0], [a1, b0, c1, a1, 1 - b0], [a1, b1, c1, a1, 1 - b1]];
      else if (f === 4) quad = [[a0, b1, c0, c0, 1 - b1], [a0, b0, c0, c0, 1 - b0], [a0, b0, c1, c1, 1 - b0], [a0, b1, c1, c1, 1 - b1]];
      else quad = [[a1, b1, c1, 1 - c1, 1 - b1], [a1, b0, c1, 1 - c1, 1 - b0], [a1, b0, c0, 1 - c0, 1 - b0], [a1, b1, c0, 1 - c0, 1 - b1]];
      for (const q of quad) buf.vert(x + q[0], y + q[1], z + q[2], tu + q[3] * ts, tv + q[4] * ts, sky, bl, sh, tint[0], tint[1], tint[2]);
    }
  }

  function crossQuads(buf, x, y, z, tile, tint, h = 1, ox = 0, oz = 0) {
    const L = lightAt(x, y, z);
    const sky = L >> 4, bl = L & 15;
    const [tu, tv, ts] = tileUV(tile);
    const vTop = tv + (1 - h) * ts;
    const planes = [[0.15, 0.15, 0.85, 0.85], [0.15, 0.85, 0.85, 0.15]];
    for (const [ax, az, bx, bz] of planes) {
      for (let side = 0; side < 1; side++) {
        const pts = side === 0
          ? [[ax, h, az, 0, vTop], [ax, 0, az, 0, tv + ts], [bx, 0, bz, 1, tv + ts], [bx, h, bz, 1, vTop]]
          : [[bx, h, bz, 1, vTop], [bx, 0, bz, 1, tv + ts], [ax, 0, az, 0, tv + ts], [ax, h, az, 0, vTop]];
        for (const p of pts) buf.vert(x + p[0] + ox, y + p[1], z + p[2] + oz, tu + p[3] * ts, p[4], sky, bl, 0.95, tint[0], tint[1], tint[2]);
      }
    }
  }

  function hashPlanes(buf, x, y, z, tile, inset = 0.25, h = 1) {
    const L = lightAt(x, y, z);
    const sky = L >> 4, bl = L & 15;
    const [tu, tv, ts] = tileUV(tile);
    const vt = tv + (1 - h) * ts;
    for (const k of [inset, 1 - inset]) {
      for (const axis of [0, 1]) for (let side = 0; side < 1; side++) {
        let pts;
        if (axis === 0) pts = [[k, h, 0, 0, vt], [k, 0, 0, 0, tv + ts], [k, 0, 1, 1, tv + ts], [k, h, 1, 1, vt]];
        else pts = [[0, h, k, 0, vt], [0, 0, k, 0, tv + ts], [1, 0, k, 1, tv + ts], [1, h, k, 1, vt]];
        if (side) pts.reverse();
        for (const p of pts) buf.vert(x + p[0], y + p[1], z + p[2], tu + p[3] * ts, p[4], sky, bl, 0.9, 255, 255, 255);
      }
    }
  }

  function liquidHeight(x, y, z, lid) {
    const id = idAt(x, y, z);
    if (LIQUID[id] !== lid) return -1;
    if (LIQUID[idAt(x, y + 1, z)] === lid) return 1;
    const m = world.getMeta(x, y, z);
    if (m & 8) return 1;
    return (8 - (m & 7)) / 9;
  }
  function liquid(buf, x, y, z, id) {
    const lid = LIQUID[id];
    const tile = blocks[id].texFn(1, 0);
    const [tu, tv, ts] = tileUV(tile);
    const above = LIQUID[idAt(x, y + 1, z)] === lid;
    // corner heights
    const ch = (cx, cz) => {
      if (above) return 1;
      let s = 0, n = 0;
      for (const [ddx, ddz] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
        const xx = x + cx + ddx, zz = z + cz + ddz;
        if (LIQUID[idAt(xx, y + 1, zz)] === lid) return 1;
        const h = liquidHeight(xx, y, zz, lid);
        if (h >= 0) { s += h; n++; } else if (!OPAQUE[idAt(xx, y, zz)]) { n++; s += 0; }
      }
      return n ? Math.max(0.05, s / n) : 0.9;
    };
    const h00 = ch(0, 0), h01 = ch(0, 1), h11 = ch(1, 1), h10 = ch(1, 0);
    const tint = [255, 255, 255];
    const L0 = lightAt(x, y, z);
    // top
    if (!above) {
      const L = lightAt(x, y + 1, z);
      const sky = Math.max(L >> 4, L0 >> 4), bl = Math.max(L & 15, L0 & 15);
      const top = [[0, h00, 0, 0, 0], [0, h01, 1, 0, 1], [1, h11, 1, 1, 1], [1, h10, 0, 1, 0]];
      for (const p of top) buf.vert(x + p[0], y + p[1] - 0.001, z + p[2], tu + p[3] * ts, tv + p[4] * ts, sky, bl, 1, ...tint);
    }
    // sides & bottom
    for (let f = 0; f < 6; f++) {
      if (f === 1) continue;
      const [dx, dy, dz] = FACE_DIRS[f];
      const nid = idAt(x + dx, y + dy, z + dz);
      if (LIQUID[nid] === lid || OPAQUE[nid]) continue;
      if (f === 0 && nid !== 0 && !OPAQUE[nid] && LIQUID[nid]) continue;
      const L = lightAt(x + dx, y + dy, z + dz);
      const sky = L >> 4, bl = L & 15, sh = FACE_SHADE[f];
      let q;
      if (f === 0) q = [[0, 0, 1, 0, 1], [0, 0, 0, 0, 0], [1, 0, 0, 1, 0], [1, 0, 1, 1, 1]];
      else if (f === 2) q = [[1, h10, 0, 0, 1 - h10], [1, 0, 0, 0, 1], [0, 0, 0, 1, 1], [0, h00, 0, 1, 1 - h00]];
      else if (f === 3) q = [[0, h01, 1, 0, 1 - h01], [0, 0, 1, 0, 1], [1, 0, 1, 1, 1], [1, h11, 1, 1, 1 - h11]];
      else if (f === 4) q = [[0, h00, 0, 0, 1 - h00], [0, 0, 0, 0, 1], [0, 0, 1, 1, 1], [0, h01, 1, 1, 1 - h01]];
      else q = [[1, h11, 1, 0, 1 - h11], [1, 0, 1, 0, 1], [1, 0, 0, 1, 1], [1, h10, 0, 1, 1 - h10]];
      for (const p of q) buf.vert(x + p[0], y + p[1], z + p[2], tu + p[3] * ts, tv + p[4] * ts, sky, bl, sh, ...tint);
    }
  }

  const WHITE = [255, 255, 255];
  for (let x = x0; x < x0 + 16; x++) for (let z = z0; z < z0 + 16; z++) {
    const colBase = ((x << 8) | z) << 7;
    for (let y = y0; y < y0 + 16; y++) {
      const id = BL[colBase + y];
      if (id === 0) continue;
      const rt = RENDER[id];
      if (rt === R.NONE) continue;
      const b = blocks[id];
      const meta = ME[colBase + y];
      any = true;
      const buf = b.pass === 2 ? transBuf : opaqueBuf;
      switch (rt) {
        case R.CUBE: {
          const snowy = id === B.GRASS && (idAt(x, y + 1, z) === B.SNOW_LAYER || idAt(x, y + 1, z) === B.SNOW);
          for (let f = 0; f < 6; f++) {
            const [dx, dy, dz] = FACE_DIRS[f];
            const nid = idAt(x + dx, y + dy, z + dz);
            if (OPAQUE[nid]) continue;
            if (!b.opaque && nid === id && (b.pass !== 1 || b.leaves || id === B.GLASS)) continue;
            if (id === B.ICE && LIQUID[nid] === 1) continue;
            let tint = WHITE;
            if (b.leaves) tint = biomeTint(world, x, z, 1);
            else if (id === B.GRASS && f === 1) tint = biomeTint(world, x, z, 0);
            cubeFace(buf, x, y, z, f, b.texFn(f, meta, snowy), tint);
          }
          break;
        }
        case R.CROSS: {
          const tint = b.tint ? biomeTint(world, x, z, 0) : WHITE;
          let ox = 0, oz = 0;
          if (id === B.TALLGRASS) { const h = (x * 3129871) ^ (z * 116129781) ^ y; ox = ((h >> 16) & 15) / 15 * 0.3 - 0.15; oz = ((h >> 20) & 15) / 15 * 0.3 - 0.15; }
          crossQuads(buf, x, y, z, b.texFn(0, meta), tint, 1, ox, oz);
          break;
        }
        case R.STEM: {
          const tile = (meta & 7) === 7 && hasFruitNeighbour(world, x, y, z, b.stem) ? tex('stem_connected') : b.texFn(0, meta);
          crossQuads(buf, x, y, z, tile, WHITE, 1);
          break;
        }
        case R.CROPS: hashPlanes(buf, x, y, z, b.texFn(0, meta)); break;
        case R.FIRE: hashPlanes(buf, x, y, z, b.texFn(0, meta), 0.1); crossQuads(buf, x, y, z, b.texFn(0, meta), WHITE); break;
        case R.LIQUID: liquid(buf, x, y, z, id); break;
        case R.TORCH: torch(buf, x, y, z, meta, b); break;
        case R.SLAB: {
          const top = (meta & 8) !== 0;
          box(buf, x, y, z, top ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1], (f) => b.texFn(f, meta), WHITE);
          break;
        }
        case R.STAIRS: {
          const top = (meta & 4) !== 0, d = meta & 3;
          box(buf, x, y, z, top ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1], (f) => b.texFn(f, meta), WHITE);
          const y0b = top ? 0 : 0.5, y1b = top ? 0.5 : 1;
          const bx = d === 0 ? [0.5, y0b, 0, 1, y1b, 1] : d === 1 ? [0, y0b, 0, 0.5, y1b, 1] : d === 2 ? [0, y0b, 0.5, 1, y1b, 1] : [0, y0b, 0, 1, y1b, 0.5];
          box(buf, x, y, z, bx, (f) => b.texFn(f, meta), WHITE);
          break;
        }
        case R.FARMLAND: box(buf, x, y, z, [0, 0, 0, 1, 15 / 16, 1], (f) => b.texFn(f, meta), WHITE); break;
        case R.SNOW: box(buf, x, y, z, [0, 0, 0, 1, 0.125, 1], () => b.texFn(0, meta), WHITE); break;
        case R.CACTUS: {
          const e = 1 / 16;
          box(buf, x, y, z, [e, 0, e, 1 - e, 1, 1 - e], (f) => b.texFn(f, meta), WHITE, false);
          break;
        }
        case R.LADDER: {
          const t = 0.06;
          const bx = meta === 2 ? [0, 0, 1 - t, 1, 1, 1 - t + 0.001] : meta === 3 ? [0, 0, t - 0.001, 1, 1, t] : meta === 4 ? [1 - t, 0, 0, 1 - t + 0.001, 1, 1] : [t - 0.001, 0, 0, t, 1, 1];
          box(buf, x, y, z, bx, (f) => (f < 2 ? -1 : b.texFn(f, meta)), WHITE, false, true);
          break;
        }
        case R.FENCE: {
          const [n, s, w, e] = fenceConnections(world, x, y, z);
          const tf = (f) => b.texFn(f, meta);
          box(buf, x, y, z, [0.375, 0, 0.375, 0.625, 1, 0.625], tf, WHITE);
          for (const [yy0, yy1] of [[0.375, 0.5625], [0.75, 0.9375]]) {
            if (n) box(buf, x, y, z, [0.4375, yy0, 0, 0.5625, yy1, 0.375], tf, WHITE, false, true);
            if (s) box(buf, x, y, z, [0.4375, yy0, 0.625, 0.5625, yy1, 1], tf, WHITE, false, true);
            if (w) box(buf, x, y, z, [0, yy0, 0.4375, 0.375, yy1, 0.5625], tf, WHITE, false, true);
            if (e) box(buf, x, y, z, [0.625, yy0, 0.4375, 1, yy1, 0.5625], tf, WHITE, false, true);
          }
          break;
        }
        case R.GATE: {
          const tf = (f) => b.texFn(f, meta);
          const open = (meta & 4) !== 0, alongX = (meta & 1) === 0;
          if (alongX) {
            box(buf, x, y, z, [0, 0.3125, 0.4375, 0.125, 1, 0.5625], tf, WHITE, false, true);
            box(buf, x, y, z, [0.875, 0.3125, 0.4375, 1, 1, 0.5625], tf, WHITE, false, true);
            if (!open) for (const [yy0, yy1] of [[0.375, 0.5625], [0.75, 0.9375]]) box(buf, x, y, z, [0.125, yy0, 0.4375, 0.875, yy1, 0.5625], tf, WHITE, false, true);
            else for (const [yy0, yy1] of [[0.375, 0.5625], [0.75, 0.9375]]) { box(buf, x, y, z, [0, yy0, 0.5625, 0.125, yy1, 0.9375], tf, WHITE, false, true); box(buf, x, y, z, [0.875, yy0, 0.5625, 1, yy1, 0.9375], tf, WHITE, false, true); }
          } else {
            box(buf, x, y, z, [0.4375, 0.3125, 0, 0.5625, 1, 0.125], tf, WHITE, false, true);
            box(buf, x, y, z, [0.4375, 0.3125, 0.875, 0.5625, 1, 1], tf, WHITE, false, true);
            if (!open) for (const [yy0, yy1] of [[0.375, 0.5625], [0.75, 0.9375]]) box(buf, x, y, z, [0.4375, yy0, 0.125, 0.5625, yy1, 0.875], tf, WHITE, false, true);
            else for (const [yy0, yy1] of [[0.375, 0.5625], [0.75, 0.9375]]) { box(buf, x, y, z, [0.5625, yy0, 0, 0.9375, yy1, 0.125], tf, WHITE, false, true); box(buf, x, y, z, [0.5625, yy0, 0.875, 0.9375, yy1, 1], tf, WHITE, false, true); }
          }
          break;
        }
        case R.DOOR: {
          const st = doorState(world, x, y, z, meta);
          let dir = st.facing;
          if (st.open) dir = (dir + (st.hingeRight ? 3 : 1)) & 3;
          const t = 3 / 16;
          const bx = dir === 0 ? [0, 0, 0, t, 1, 1] : dir === 1 ? [0, 0, 0, 1, 1, t] : dir === 2 ? [1 - t, 0, 0, 1, 1, 1] : [0, 0, 1 - t, 1, 1, 1];
          box(buf, x, y, z, bx, (f) => b.texFn(f, meta), WHITE, false, true);
          break;
        }
        case R.TRAPDOOR: {
          const t = 3 / 16;
          let bx;
          if (meta & 4) { const d = meta & 3; bx = d === 0 ? [0, 0, 1 - t, 1, 1, 1] : d === 1 ? [0, 0, 0, 1, 1, t] : d === 2 ? [1 - t, 0, 0, 1, 1, 1] : [0, 0, 0, t, 1, 1]; }
          else bx = (meta & 8) ? [0, 1 - t, 0, 1, 1, 1] : [0, 0, 0, 1, t, 1];
          box(buf, x, y, z, bx, () => b.texFn(0, meta), WHITE, false, true);
          break;
        }
        case R.BED: bed(buf, x, y, z, meta); break;
        case R.PANE: for (const bx of paneBoxes(world, x, y, z)) box(buf, x, y, z, bx, (f) => b.texFn(f, meta), WHITE, false, true); break;
      }
    }
  }

  function torch(buf, x, y, z, meta, b) {
    const tile = b.texFn(0, meta);
    const [tu, tv, ts] = tileUV(tile);
    const L = lightAt(x, y, z);
    const sky = L >> 4, bl = 15;
    const w = 1 / 16;
    // base position and tilt
    let bx = 0.5, bz = 0.5, by = 0, tx = 0, tz = 0;
    if (meta === 1) { bx = 0.1; tx = 0.3; by = 0.2; }
    else if (meta === 2) { bx = 0.9; tx = -0.3; by = 0.2; }
    else if (meta === 3) { bz = 0.1; tz = 0.3; by = 0.2; }
    else if (meta === 4) { bz = 0.9; tz = -0.3; by = 0.2; }
    const h = 10 / 16;
    const u0 = tu + 7 / 16 * ts, u1 = tu + 9 / 16 * ts, vT = tv + 6 / 16 * ts, vB = tv + ts;
    const top = [bx + tx * h * 0.6, by + h, bz + tz * h * 0.6];
    const bot = [bx, by, bz];
    const sides = [[-w, -w, w, -w], [w, -w, w, w], [w, w, -w, w], [-w, w, -w, -w]];
    for (const [ax, az, cx, cz] of sides) {
      const pts = [[top[0] + ax, top[1], top[2] + az, u0, vT], [bot[0] + ax, bot[1], bot[2] + az, u0, vB], [bot[0] + cx, bot[1], bot[2] + cz, u1, vB], [top[0] + cx, top[1], top[2] + cz, u1, vT]];
      for (const p of pts) buf.vert(x + p[0], y + p[1], z + p[2], p[3], p[4], sky, bl, 1, 255, 255, 255);
    }
    // top cap
    const ut0 = tu + 7 / 16 * ts, ut1 = tu + 9 / 16 * ts, vt0 = tv + 4 / 16 * ts, vt1 = tv + 6 / 16 * ts;
    const cap = [[-w, -w, ut0, vt0], [-w, w, ut0, vt1], [w, w, ut1, vt1], [w, -w, ut1, vt0]];
    for (const c of cap) buf.vert(x + top[0] + c[0], y + top[1], z + top[2] + c[1], c[2], c[3], sky, bl, 1, 255, 255, 255);
  }

  function bed(buf, x, y, z, meta) {
    const head = (meta & 8) !== 0, d = meta & 3;
    const tTop = tex(head ? 'bed_head_top' : 'bed_foot_top');
    const tSide = tex(head ? 'bed_side_head' : 'bed_side_foot');
    const tEnd = tex('bed_end'), tWood = tex('planks');
    // direction vector the bed points to (foot -> head)
    const dirFace = [3, 4, 2, 5][d]; // south, west, north, east
    const backFace = [2, 5, 3, 4][d];
    box(buf, x, y, z, [0, 3 / 16, 0, 1, 9 / 16, 1], (f) => {
      if (f === 1) return tTop;
      if (f === 0) return tWood;
      if (f === dirFace) return head ? tEnd : -1;
      if (f === backFace) return head ? -1 : tEnd;
      return tSide;
    }, WHITE, false, true);
    // legs
    const legs = [[0, 0], [13 / 16, 0], [0, 13 / 16], [13 / 16, 13 / 16]];
    for (const [lx, lz] of legs) box(buf, x, y, z, [lx, 0, lz, lx + 3 / 16, 3 / 16, lz + 3 / 16], () => tWood, WHITE, false, true);
  }

  return { any, opaque: opaqueBuf.n ? opaqueBuf.slice() : null, trans: transBuf.n ? transBuf.slice() : null, nOpaque: opaqueBuf.n, nTrans: transBuf.n };
}

function hasFruitNeighbour(world, x, y, z, fruit) {
  return world.getBlock(x + 1, y, z) === fruit || world.getBlock(x - 1, y, z) === fruit || world.getBlock(x, y, z + 1) === fruit || world.getBlock(x, y, z - 1) === fruit;
}
