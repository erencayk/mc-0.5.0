// World storage + lighting. Finite 256x256x128 world like the original pocket worlds.
import { B, blocks, OPAQUE, LIGHT_OPACITY, LIGHT_EMIT } from './blocks.js';

export const WX = 256, WZ = 256, WY = 128;
export const SEA = 63;
const N = WX * WZ * WY;

// index layout: column-major with y contiguous
export const idx = (x, y, z) => (((x << 8) | z) << 7) | y;

export class World {
  constructor() {
    this.blocks = new Uint8Array(N);
    this.meta = new Uint8Array(N);
    this.light = new Uint8Array(N); // sky << 4 | block
    this.height = new Uint8Array(WX * WZ); // first y above top light-blocking block
    this.tiles = new Map(); // idx -> tile entity
    this.listeners = [];
    this.seed = 0;
    this.time = 0; // ticks, 0..24000 day
    this.spawn = [128, 70, 128];
    this.name = 'World';
    this.mode = 'survival';
    this.skyDarken = 0;
    this._rq = new Int32Array(1 << 20);
    this._aq = new Int32Array(1 << 21);
  }

  inBounds(x, y, z) { return x >= 0 && z >= 0 && y >= 0 && x < WX && z < WZ && y < WY; }
  getBlock(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (x < 0 || z < 0 || x >= WX || z >= WZ || y >= WY) return 0;
    return this.blocks[idx(x, y, z)];
  }
  // used by physics: world edges are solid walls
  getBlockColl(x, y, z) {
    if (x < 0 || z < 0 || x >= WX || z >= WZ) return B.INVISIBLE_BEDROCK;
    if (y < 0) return B.BEDROCK;
    if (y >= WY) return 0;
    return this.blocks[idx(x, y, z)];
  }
  getMeta(x, y, z) {
    if (!this.inBounds(x, y, z)) return 0;
    return this.meta[idx(x, y, z)];
  }
  getSky(x, y, z) {
    if (y >= WY) return 15;
    if (!this.inBounds(x, y, z)) return y < 0 ? 0 : 15;
    return this.light[idx(x, y, z)] >> 4;
  }
  getBlockLight(x, y, z) {
    if (!this.inBounds(x, y, z)) return 0;
    return this.light[idx(x, y, z)] & 15;
  }
  // combined brightness 0..15 with daylight
  getBrightness(x, y, z) {
    const sky = Math.max(0, this.getSky(x, y, z) - this.skyDarken);
    return Math.max(sky, this.getBlockLight(x, y, z));
  }
  topY(x, z) { return this.height[(x << 8) | z]; }
  // highest non-air block y
  surfaceY(x, z) {
    if (x < 0 || z < 0 || x >= WX || z >= WZ) return 0;
    const base = ((x << 8) | z) << 7;
    for (let y = WY - 1; y >= 0; y--) if (this.blocks[base + y] !== 0) return y;
    return 0;
  }

  onChange(fn) { this.listeners.push(fn); }

  // set without lighting/notify (generation)
  rawSet(x, y, z, id, meta = 0) {
    const i = idx(x, y, z);
    this.blocks[i] = id; this.meta[i] = meta;
  }

  setBlock(x, y, z, id, meta = 0, notify = true) {
    if (!this.inBounds(x, y, z)) return false;
    const i = idx(x, y, z);
    const oldId = this.blocks[i], oldMeta = this.meta[i];
    if (oldId === id && oldMeta === meta) return false;
    this.blocks[i] = id; this.meta[i] = meta;
    if (oldId !== id) {
      if (blocks[oldId] && blocks[oldId].container && !(blocks[id] && blocks[id].container)) this.tiles.delete(i);
      this.relightAt(x, y, z, oldId, id);
    } else if (blocks[id] && blocks[id].lightFn) {
      this.relightAt(x, y, z, oldId, id);
    }
    if (notify) for (const l of this.listeners) l(x, y, z, id, meta, oldId, oldMeta);
    return true;
  }
  setMeta(x, y, z, meta, notify = true) {
    return this.setBlock(x, y, z, this.getBlock(x, y, z), meta, notify);
  }

  emitOf(i) {
    const id = this.blocks[i];
    const b = blocks[id];
    if (b && b.lightFn) return b.lightFn(this.meta[i]);
    return LIGHT_EMIT[id];
  }

  // ------------------------------------------------------------------ lighting
  computeHeight(x, z) {
    const base = ((x << 8) | z) << 7;
    let y = WY - 1;
    while (y >= 0 && LIGHT_OPACITY[this.blocks[base + y]] === 0) y--;
    this.height[(x << 8) | z] = y + 1;
  }

  fullLight() {
    const L = this.light;
    L.fill(0);
    const aq = this._aq;
    let qt = 0;
    const push = (i) => { aq[qt++ & (aq.length - 1)] = i; };
    // sky columns
    for (let x = 0; x < WX; x++) for (let z = 0; z < WZ; z++) {
      this.computeHeight(x, z);
      const h = this.height[(x << 8) | z];
      const base = ((x << 8) | z) << 7;
      let lv = 15;
      for (let y = WY - 1; y >= 0; y--) {
        if (y < h) {
          const op = LIGHT_OPACITY[this.blocks[base + y]];
          lv = op >= 15 ? 0 : Math.max(0, lv - Math.max(1, op));
          if (lv === 0) break;
        }
        L[base + y] = lv << 4;
      }
    }
    // seed BFS for sky: cells in a column at heights below a neighbour's height
    this._bfsAdd(4, () => {
      for (let x = 0; x < WX; x++) for (let z = 0; z < WZ; z++) {
        const h = this.height[(x << 8) | z];
        let mx = h;
        if (x > 0) mx = Math.max(mx, this.height[((x - 1) << 8) | z]);
        if (x < WX - 1) mx = Math.max(mx, this.height[((x + 1) << 8) | z]);
        if (z > 0) mx = Math.max(mx, this.height[(x << 8) | (z - 1)]);
        if (z < WZ - 1) mx = Math.max(mx, this.height[(x << 8) | (z + 1)]);
        const base = ((x << 8) | z) << 7;
        for (let y = Math.max(0, h - 16); y < Math.min(mx + 1, WY); y++) if (L[base + y] >> 4) push(base + y);
      }
      return qt;
    });
    // block light
    qt = 0;
    for (let i = 0; i < N; i++) {
      const id = this.blocks[i];
      if (id && (LIGHT_EMIT[id] || blocks[id].lightFn)) {
        const e = this.emitOf(i);
        if (e) { L[i] = (L[i] & 0xf0) | e; push(i); }
      }
    }
    this._bfsAdd(0, () => qt);
  }

  // add-phase flood fill. shift=4 for sky, 0 for block. seed() fills this._aq and returns count
  _bfsAdd(shift, seed) {
    const L = this.light, BL = this.blocks, aq = this._aq, M = aq.length - 1;
    let tail = seed(), head = 0;
    const mask = shift ? 0x0f : 0xf0;
    while (head !== tail) {
      const i = aq[head++ & M];
      const lv = (L[i] >> shift) & 15;
      if (lv <= 1) continue;
      const y = i & 127, z = (i >> 7) & 255, x = i >> 15;
      for (let d = 0; d < 6; d++) {
        let j;
        if (d === 0) { if (y === 0) continue; j = i - 1; }
        else if (d === 1) { if (y === 127) continue; j = i + 1; }
        else if (d === 2) { if (z === 0) continue; j = i - 128; }
        else if (d === 3) { if (z === 255) continue; j = i + 128; }
        else if (d === 4) { if (x === 0) continue; j = i - 32768; }
        else { if (x === 255) continue; j = i + 32768; }
        const op = LIGHT_OPACITY[BL[j]];
        if (op >= 15) continue;
        let nl;
        if (shift && d === 0 && lv === 15 && op === 0) nl = 15; else nl = lv - Math.max(1, op);
        if (nl > ((L[j] >> shift) & 15)) {
          L[j] = (L[j] & mask) | (nl << shift);
          aq[tail++ & M] = j;
        }
      }
    }
  }

  // incremental relight of a set of cells for one channel
  _relight(shift, cells) {
    const L = this.light, BL = this.blocks, rq = this._rq, aq = this._aq, RM = rq.length - 1, AM = aq.length - 1;
    const mask = shift ? 0x0f : 0xf0;
    let rt = 0, rh = 0, at = 0;
    const touched = this._touched;
    for (const i of cells) {
      const old = (L[i] >> shift) & 15;
      L[i] &= mask;
      rq[rt++ & RM] = i; rq[rt++ & RM] = old;
      touched.add(i);
    }
    while (rh !== rt) {
      const i = rq[rh++ & RM], lv = rq[rh++ & RM];
      const y = i & 127, z = (i >> 7) & 255, x = i >> 15;
      for (let d = 0; d < 6; d++) {
        let j;
        if (d === 0) { if (y === 0) continue; j = i - 1; }
        else if (d === 1) { if (y === 127) continue; j = i + 1; }
        else if (d === 2) { if (z === 0) continue; j = i - 128; }
        else if (d === 3) { if (z === 255) continue; j = i + 128; }
        else if (d === 4) { if (x === 0) continue; j = i - 32768; }
        else { if (x === 255) continue; j = i + 32768; }
        const nl = (L[j] >> shift) & 15;
        if (nl === 0) continue;
        if (nl < lv || (shift && d === 0 && lv === 15 && nl === 15)) {
          L[j] &= mask;
          touched.add(j);
          rq[rt++ & RM] = j; rq[rt++ & RM] = nl;
        } else {
          aq[at++ & AM] = j;
        }
      }
    }
    // re-seed sources inside the removed region
    for (const i of touched) {
      let src = 0;
      if (shift) {
        const y = i & 127, col = i >> 7;
        if (y >= this.height[col]) src = 15;
      } else src = this.emitOf(i);
      if (src > ((L[i] >> shift) & 15)) { L[i] = (L[i] & mask) | (src << shift); }
      if ((L[i] >> shift) & 15) aq[at++ & AM] = i;
    }
    this._bfsAdd(shift, () => at);
  }

  relightAt(x, y, z, oldId, newId) {
    this._touched = new Set();
    const col = (x << 8) | z;
    const oldH = this.height[col];
    this.computeHeight(x, z);
    const newH = this.height[col];
    const base = col << 7;
    const i = base + y;
    // sky
    const skyCells = [i];
    if (newH !== oldH) {
      const lo = Math.min(oldH, newH), hi = Math.max(oldH, newH);
      for (let yy = lo; yy < hi; yy++) skyCells.push(base + yy);
    }
    this._relight(4, skyCells);
    const affected = this._touched;
    this._touched = new Set();
    this._relight(0, [i]);
    for (const t of this._touched) affected.add(t);
    this._lastTouched = affected;
    // notify listeners of light-affected columns (renderer remeshes sections)
    if (this.onLight) this.onLight(affected);
  }

  // ------------------------------------------------------------------ tile entities
  getTile(x, y, z) { return this.tiles.get(idx(x, y, z)); }
  setTile(x, y, z, t) { this.tiles.set(idx(x, y, z), t); }

  // ------------------------------------------------------------------ serialization
  exportChunk(cx, cz) {
    // 16x16 columns of blocks+meta
    const out = new Uint8Array(16 * 16 * WY * 2);
    let o = 0;
    for (let x = cx * 16; x < cx * 16 + 16; x++) for (let z = cz * 16; z < cz * 16 + 16; z++) {
      const base = ((x << 8) | z) << 7;
      out.set(this.blocks.subarray(base, base + WY), o); o += WY;
      out.set(this.meta.subarray(base, base + WY), o); o += WY;
    }
    return out;
  }
  importChunk(cx, cz, data) {
    let o = 0;
    for (let x = cx * 16; x < cx * 16 + 16; x++) for (let z = cz * 16; z < cz * 16 + 16; z++) {
      const base = ((x << 8) | z) << 7;
      this.blocks.set(data.subarray(o, o + WY), base); o += WY;
      this.meta.set(data.subarray(o, o + WY), base); o += WY;
    }
  }
}
