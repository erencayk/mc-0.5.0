// Authoritative game simulation (runs on single-player and on the LAN host).
// Clients run the same class with authority=false and only mirror state.
import { B, blocks, SOLID, OPAQUE, LIQUID, R, REPLACEABLE, isWater, isLava, LIGHT_OPACITY, selectionBox, doorState, FACE_DIRS } from './blocks.js';
import { I, getItem, recipes, canCraft, smelting, fuelTime, Inventory, maxStack, isBlockItem } from './items.js';
import { WX, WY, WZ, SEA, idx } from './world.js';
import { mulberry } from './noise.js';
import { growTree } from './worldgen.js';
import { PAINTINGS } from './textures.js';
import { TILES_050, DOME_050, REACTOR_050, MOBS_050 } from './pe050data.js';
import {
  Entity, Player, ItemEntity, Arrow, Thrown, PrimedTNT, FallingBlock, Painting, MOB_CLASSES, HOSTILE,
  Pig, Cow, Chicken, Sheep, PigZombie, createEntity, livingPhysics, liquidAt, rayBox, setNextId
} from './entities.js';

export const DAY = 24000;
const REACH = 6;

export function yawQuadrant(yaw) {
  // 0 north(-z), 1 east(+x), 2 south(+z), 3 west(-x)
  return ((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4;
}
const FRONT_FACING_PLAYER = [3, 4, 2, 5]; // front face index facing back at player for each look quadrant

export class Game {
  constructor(world, opts = {}) {
    this.world = world;
    this.authority = opts.authority !== false;
    this.entities = new Map();
    this.players = new Map();
    this.local = null;
    this.rand = mulberry((world.seed ^ Date.now()) >>> 0);
    this.scheduled = new Map(); // idx -> due tick
    this.tick = 0;
    this.fxListeners = [];
    this.hooks = { blockChange: [], entityAdd: [], entityRemove: [], entityDirty: [], bulk: [], night: [] };
    this.difficulty = opts.difficulty || 'normal';
    this.reactor = null;
    this.sleepTicks = 0;
    this.messages = [];
    if (this.authority) world.onChange((x, y, z, id, meta, oldId, oldMeta) => this.onBlockChanged(x, y, z, id, meta, oldId, oldMeta));
  }

  // ------------------------------------------------------------------ basics
  fx(e) { for (const f of this.fxListeners) f(e); }
  isDay() { if (this.world.nightMode) return false; const t = this.world.time % DAY; return t < 12500 || t > 23500; }
  addEntity(e) {
    if (e.type === 'player') { this.players.set(e.id, e); }
    else this.entities.set(e.id, e);
    for (const h of this.hooks.entityAdd) h(e);
    return e;
  }
  removeEntity(e) {
    e.removed = true;
    if (e.type === 'player') this.players.delete(e.id); else this.entities.delete(e.id);
    for (const h of this.hooks.entityRemove) h(e);
  }
  dirtyEntity(e) { for (const h of this.hooks.entityDirty) h(e); }
  *livingEntities() {
    for (const e of this.entities.values()) if (e.living && !e.removed) yield e;
    for (const p of this.players.values()) if (!p.removed && p.deathTime === 0) yield p;
  }
  getEntity(id) { return this.entities.get(id) || this.players.get(id); }
  spawnItem(x, y, z, id, count, meta = 0, dmg = 0, vel = true) {
    if (!this.authority || count <= 0) return null;
    const e = new ItemEntity(x, y, z, id, count, meta, dmg);
    if (vel) { e.vx = (this.rand() - 0.5) * 0.2; e.vy = 0.2; e.vz = (this.rand() - 0.5) * 0.2; }
    return this.addEntity(e);
  }
  msg(player, text) {
    if (player && player.sink) player.sink.msg(text);
  }
  broadcastMsg(text) { for (const p of this.players.values()) this.msg(p, text); }

  setBlock(x, y, z, id, meta = 0) {
    return this.world.setBlock(x, y, z, id, meta);
  }

  // ------------------------------------------------------------------ neighbour updates / scheduling
  schedule(x, y, z, delay) {
    if (!this.world.inBounds(x, y, z)) return;
    const k = idx(x, y, z);
    const due = this.tick + delay;
    const cur = this.scheduled.get(k);
    if (cur === undefined || cur > due) this.scheduled.set(k, due);
  }
  onBlockChanged(x, y, z, id, meta, oldId, oldMeta) {
    for (const h of this.hooks.blockChange) h(x, y, z, id, meta);
    this.neighborChanged(x, y, z);
    for (const [dx, dy, dz] of FACE_DIRS) this.neighborChanged(x + dx, y + dy, z + dz);
  }
  neighborChanged(x, y, z) {
    const w = this.world;
    if (!w.inBounds(x, y, z)) return;
    const id = w.getBlock(x, y, z);
    if (!id) return;
    const b = blocks[id];
    if (b.liquid) { this.schedule(x, y, z, b.liquid === 'water' ? 5 : 30); return; }
    if (b.gravity) { this.schedule(x, y, z, 2); return; }
    if (b.needsSupport || b.door || b.render === R.BED) this.schedule(x, y, z, 1);
    if (b.fire) this.schedule(x, y, z, 30);
  }

  // support rules; returns true if block at pos can stay
  canStay(x, y, z, id, meta) {
    const w = this.world;
    const below = w.getBlock(x, y - 1, z);
    const b = blocks[id];
    switch (id) {
      case B.SAPLING: case B.DANDELION: case B.ROSE: case B.TALLGRASS:
        return below === B.GRASS || below === B.DIRT || below === B.FARMLAND;
      case B.DEADBUSH: return below === B.SAND;
      case B.BROWN_MUSHROOM: case B.RED_MUSHROOM: return OPAQUE[below] === 1;
      case B.WHEAT: case B.PUMPKIN_STEM: case B.MELON_STEM: return below === B.FARMLAND;
      case B.SUGARCANE: {
        if (below === B.SUGARCANE) return true;
        if (below !== B.GRASS && below !== B.DIRT && below !== B.SAND) return false;
        return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => isWater(w.getBlock(x + dx, y - 1, z + dz)));
      }
      case B.CACTUS: {
        if (below !== B.SAND && below !== B.CACTUS) return false;
        return ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => SOLID[w.getBlock(x + dx, y, z + dz)]);
      }
      case B.SNOW_LAYER: return OPAQUE[below] === 1 || below === B.LEAVES;
      case B.TORCH: {
        if (meta === 5 || meta === 0) return OPAQUE[below] === 1 || below === B.FENCE || below === B.GLASS;
        const off = [null, [-1, 0], [1, 0], [0, -1], [0, 1]][meta];
        return off ? OPAQUE[w.getBlock(x + off[0], y, z + off[1])] === 1 : false;
      }
      case B.LADDER: {
        const off = { 2: [0, 1], 3: [0, -1], 4: [1, 0], 5: [-1, 0] }[meta];
        return off ? OPAQUE[w.getBlock(x + off[0], y, z + off[1])] === 1 : false;
      }
      case B.WOOD_DOOR: {
        if (meta & 8) return w.getBlock(x, y - 1, z) === B.WOOD_DOOR;
        return w.getBlock(x, y + 1, z) === B.WOOD_DOOR && SOLID[below] === 1;
      }
      case B.BED: {
        const d = meta & 3, off = [[0, 1], [-1, 0], [0, -1], [1, 0]][d];
        const s = (meta & 8) ? -1 : 1;
        return w.getBlock(x + off[0] * s, y, z + off[1] * s) === B.BED;
      }
    }
    return true;
  }

  runScheduled() {
    if (!this.scheduled.size) return;
    const due = [];
    for (const [k, t] of this.scheduled) if (t <= this.tick) due.push(k);
    for (const k of due) {
      this.scheduled.delete(k);
      const y = k & 127, z = (k >> 7) & 255, x = k >> 15;
      this.scheduledTick(x, y, z);
    }
  }

  scheduledTick(x, y, z) {
    const w = this.world;
    const id = w.getBlock(x, y, z);
    if (!id) return;
    const b = blocks[id];
    const meta = w.getMeta(x, y, z);
    if (b.liquid) { this.liquidTick(x, y, z, id, meta); return; }
    if (b.gravity) {
      const below = w.getBlock(x, y - 1, z);
      if (y > 0 && (below === 0 || REPLACEABLE[below] || blocks[below].fire)) {
        this.setBlock(x, y, z, 0);
        this.addEntity(new FallingBlock(x + 0.5, y, z + 0.5, id, meta));
      }
      return;
    }
    if (b.fire) { this.fireTick(x, y, z); return; }
    if (!this.canStay(x, y, z, id, meta)) this.breakBlock(x, y, z, null, true);
  }

  // ------------------------------------------------------------------ liquids
  liquidTick(x, y, z, id, meta) {
    const w = this.world;
    const water = isWater(id);
    const L = water ? 1 : 2;
    const sameLiquid = (i) => LIQUID[i] === L;
    const levelAt = (xx, yy, zz) => { const i = w.getBlock(xx, yy, zz); if (!sameLiquid(i)) return -1; const m = w.getMeta(xx, yy, zz); return (m & 8) ? 0 : m & 7; };
    const drop = water ? 1 : 2;
    // interactions with the other liquid
    if (!water) {
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
        if (isWater(w.getBlock(x + dx, y + dy, z + dz))) {
          this.setBlock(x, y, z, (meta & 7) === 0 && !(meta & 8) ? B.OBSIDIAN : B.COBBLE);
          this.fx({ k: 'snd', s: 'fizz', x: x + 0.5, y: y + 0.5, z: z + 0.5 });
          return;
        }
      }
    }
    let level = (meta & 8) ? 0 : (meta & 7);
    const isSource = (meta & 7) === 0 && !(meta & 8);
    if (!isSource) {
      // recompute from neighbours
      let best = 99, sources = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const l = levelAt(x + dx, y, z + dz);
        if (l < 0) continue;
        const nm = w.getMeta(x + dx, y, z + dz);
        if ((nm & 7) === 0 && !(nm & 8)) sources++;
        best = Math.min(best, l + drop);
      }
      let nl = best;
      let falling = false;
      if (sameLiquid(w.getBlock(x, y + 1, z))) { nl = 1; falling = true; }
      if (water && sources >= 2 && (SOLID[w.getBlock(x, y - 1, z)] || (isWater(w.getBlock(x, y - 1, z)) && (w.getMeta(x, y - 1, z) & 7) === 0))) { nl = 0; falling = false; }
      if (nl > 7) { this.setBlock(x, y, z, 0); return; }
      const newMeta = falling ? (8 | 1) : nl;
      if (newMeta !== meta) {
        this.setBlock(x, y, z, water ? B.WATER : B.LAVA, newMeta);
        level = falling ? 0 : nl;
        meta = newMeta;
      } else if (id === (water ? B.WATER : B.LAVA)) {
        // stable
      }
    }
    // spread down
    const below = w.getBlock(x, y - 1, z);
    if (y > 0 && this.canFlowInto(below, L)) {
      if (LIQUID[below] && LIQUID[below] !== L) { this.setBlock(x, y - 1, z, water ? B.STONE : B.COBBLE); return; }
      this.flowInto(x, y - 1, z, water ? B.WATER : B.LAVA, 8 | 1);
      return;
    }
    if (sameLiquid(below) && !isSource) return;
    // spread sideways
    const nlv = ((meta & 8) ? 0 : level) + drop;
    if (nlv > 7) return;
    // prefer directions that lead to a drop within 4 blocks
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const costs = dirs.map(([dx, dz]) => {
      const nid = w.getBlock(x + dx, y, z + dz);
      if (!this.canFlowInto(nid, L) || (sameLiquid(nid) && levelAt(x + dx, y, z + dz) <= nlv)) return 1000;
      return this.dropDistance(x + dx, y, z + dz, 1, L);
    });
    const min = Math.min(...costs);
    if (min >= 1000) return;
    dirs.forEach(([dx, dz], i) => {
      if (costs[i] !== min) return;
      const nid = w.getBlock(x + dx, y, z + dz);
      if (LIQUID[nid] && LIQUID[nid] !== L) { this.setBlock(x + dx, y, z + dz, water ? B.COBBLE : B.COBBLE); return; }
      this.flowInto(x + dx, y, z + dz, water ? B.WATER : B.LAVA, nlv);
    });
  }
  canFlowInto(id, L) {
    if (id === 0) return true;
    if (LIQUID[id] === L) return true;
    if (LIQUID[id]) return true;
    const b = blocks[id];
    if (b.door || id === B.LADDER || id === B.SUGARCANE) return false;
    return !SOLID[id] && (b.replaceable || b.render === R.CROSS || b.render === R.TORCH || b.render === R.CROPS || b.render === R.STEM || b.render === R.SNOW);
  }
  dropDistance(x, y, z, depth, L) {
    const w = this.world;
    if (this.canFlowInto(w.getBlock(x, y - 1, z), L) && LIQUID[w.getBlock(x, y - 1, z)] !== L) return depth;
    if (depth >= 4) return 100;
    let best = 100;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nid = w.getBlock(x + dx, y, z + dz);
      if (!this.canFlowInto(nid, L) || LIQUID[nid] === L) continue;
      best = Math.min(best, this.dropDistance(x + dx, y, z + dz, depth + 1, L));
    }
    return best;
  }
  flowInto(x, y, z, id, meta) {
    const w = this.world;
    const cur = w.getBlock(x, y, z);
    if (LIQUID[cur] === LIQUID[id]) {
      const cm = w.getMeta(x, y, z);
      if ((cm & 7) === 0 && !(cm & 8)) return; // source stays
      if (!(meta & 8) && !(cm & 8) && (cm & 7) <= (meta & 7)) return;
      if ((meta & 8) && (cm & 8)) return;
    } else if (cur !== 0) {
      // wash away plants/torches
      this.breakBlock(x, y, z, null, true);
    }
    this.setBlock(x, y, z, id, meta);
  }

  // ------------------------------------------------------------------ fire
  fireTick(x, y, z) {
    const w = this.world;
    const below = w.getBlock(x, y - 1, z);
    const burnable = (xx, yy, zz) => blocks[w.getBlock(xx, yy, zz)] && blocks[w.getBlock(xx, yy, zz)].flammable;
    const anyFuel = burnable(x, y - 1, z) || FACE_DIRS.some(([dx, dy, dz]) => burnable(x + dx, y + dy, z + dz));
    if (below === B.NETHERRACK) { this.schedule(x, y, z, 40); return; }
    if (!anyFuel && !OPAQUE[below]) { this.setBlock(x, y, z, 0); return; }
    if (this.rand() < 0.25) {
      // burn a neighbour
      for (const [dx, dy, dz] of FACE_DIRS) {
        const xx = x + dx, yy = y + dy, zz = z + dz;
        if (burnable(xx, yy, zz) && this.rand() < 0.3) {
          if (w.getBlock(xx, yy, zz) === B.TNT) { this.setBlock(xx, yy, zz, 0); this.addEntity(new PrimedTNT(xx + 0.5, yy, zz + 0.5)); continue; }
          this.setBlock(xx, yy, zz, this.rand() < 0.5 ? B.FIRE : 0);
        }
      }
    }
    if (this.rand() < 0.2 || !anyFuel) { this.setBlock(x, y, z, 0); return; }
    // spread to nearby air above fuel
    if (this.rand() < 0.3) {
      const xx = x + ((this.rand() * 3) | 0) - 1, yy = y + ((this.rand() * 3) | 0) - 1, zz = z + ((this.rand() * 3) | 0) - 1;
      if (w.getBlock(xx, yy, zz) === 0 && FACE_DIRS.some(([dx, dy, dz]) => burnable(xx + dx, yy + dy, zz + dz))) this.setBlock(xx, yy, zz, B.FIRE);
    }
    this.schedule(x, y, z, 30 + ((this.rand() * 10) | 0));
  }

  // ------------------------------------------------------------------ random ticks
  randomTicks() {
    const w = this.world;
    const n = 2048 * 3;
    for (let i = 0; i < n; i++) {
      const r = (this.rand() * 0x7fffffff) | 0;
      const x = r & 255, z = (r >> 8) & 255, y = (r >> 16) & 127;
      const id = w.blocks[idx(x, y, z)];
      if (!id) continue;
      switch (id) {
        case B.GRASS: this.tickGrass(x, y, z); break;
        case B.DIRT: break;
        case B.WHEAT: this.tickCrop(x, y, z); break;
        case B.PUMPKIN_STEM: case B.MELON_STEM: this.tickStem(x, y, z, id); break;
        case B.SAPLING: if (w.getBrightness(x, y + 1, z) >= 9 && this.rand() < 0.15) this.growSapling(x, y, z); break;
        case B.SUGARCANE: case B.CACTUS: this.tickTall(x, y, z, id); break;
        case B.LEAVES: this.tickLeaves(x, y, z); break;
        case B.FARMLAND: this.tickFarmland(x, y, z); break;
        case B.BROWN_MUSHROOM: case B.RED_MUSHROOM: this.tickMushroom(x, y, z, id); break;
        case B.ICE: if (w.getBlockLight(x, y + 1, z) > 11) this.setBlock(x, y, z, B.STILL_WATER); break;
        case B.SNOW_LAYER: if (w.getBlockLight(x, y, z) > 11) this.setBlock(x, y, z, 0); break;
      }
    }
  }
  tickGrass(x, y, z) {
    const w = this.world;
    const above = w.getBlock(x, y + 1, z);
    if (LIGHT_OPACITY[above] > 2 || (w.getBrightness(x, y + 1, z) < 4 && LIGHT_OPACITY[above] > 0)) { this.setBlock(x, y, z, B.DIRT); return; }
    if (w.getBrightness(x, y + 1, z) >= 9) {
      for (let k = 0; k < 2; k++) {
        const xx = x + ((this.rand() * 3) | 0) - 1, yy = y + ((this.rand() * 5) | 0) - 3, zz = z + ((this.rand() * 3) | 0) - 1;
        if (w.getBlock(xx, yy, zz) === B.DIRT && w.getBrightness(xx, yy + 1, zz) >= 4 && LIGHT_OPACITY[w.getBlock(xx, yy + 1, zz)] <= 2) this.setBlock(xx, yy, zz, B.GRASS);
      }
    }
  }
  isWet(x, y, z) {
    const w = this.world;
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = 0; dy <= 1; dy++) if (isWater(w.getBlock(x + dx, y + dy, z + dz))) return true;
    return false;
  }
  tickFarmland(x, y, z) {
    const w = this.world;
    const m = w.getMeta(x, y, z);
    if (this.isWet(x, y, z)) { if (m < 7) w.setMeta(x, y, z, 7); }
    else if (m > 0) w.setMeta(x, y, z, m - 1);
    else {
      const above = w.getBlock(x, y + 1, z);
      if (above !== B.WHEAT && above !== B.PUMPKIN_STEM && above !== B.MELON_STEM) this.setBlock(x, y, z, B.DIRT);
    }
  }
  growthChance(x, y, z) {
    const m = this.world.getMeta(x, y - 1, z);
    return m > 0 ? 0.33 : 0.15;
  }
  tickCrop(x, y, z) {
    const w = this.world;
    if (w.getBrightness(x, y + 1, z) < 9) return;
    const m = w.getMeta(x, y, z);
    if (m < 7 && this.rand() < this.growthChance(x, y, z)) w.setMeta(x, y, z, m + 1);
  }
  tickStem(x, y, z, id) {
    const w = this.world;
    if (w.getBrightness(x, y + 1, z) < 9) return;
    const m = w.getMeta(x, y, z);
    if (this.rand() > this.growthChance(x, y, z)) return;
    if (m < 7) { w.setMeta(x, y, z, m + 1); return; }
    const fruit = blocks[id].stem;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => w.getBlock(x + dx, y, z + dz) === fruit)) return;
    const [dx, dz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][(this.rand() * 4) | 0];
    const g = w.getBlock(x + dx, y - 1, z + dz);
    if (w.getBlock(x + dx, y, z + dz) === 0 && (g === B.FARMLAND || g === B.DIRT || g === B.GRASS)) this.setBlock(x + dx, y, z + dz, fruit, fruit === B.PUMPKIN ? 2 + ((this.rand() * 4) | 0) : 0);
  }
  tickTall(x, y, z, id) {
    const w = this.world;
    if (w.getBlock(x, y + 1, z) !== 0) return;
    let h = 1;
    while (w.getBlock(x, y - h, z) === id) h++;
    if (h >= 3) return;
    const m = w.getMeta(x, y, z);
    if (m >= 15) { w.setMeta(x, y, z, 0, false); if (this.canStay(x, y + 1, z, id, 0)) this.setBlock(x, y + 1, z, id, 0); }
    else w.setMeta(x, y, z, m + 1, false);
  }
  tickLeaves(x, y, z) {
    const w = this.world;
    const m = w.getMeta(x, y, z);
    if (m & 4) return; // player placed
    // find a log within 4 blocks (BFS through leaves)
    const seen = new Set();
    const q = [[x, y, z, 0]];
    while (q.length) {
      const [cx, cy, cz, d] = q.shift();
      for (const [dx, dy, dz] of FACE_DIRS) {
        const nx = cx + dx, ny = cy + dy, nz = cz + dz;
        const id = w.getBlock(nx, ny, nz);
        if (id === B.LOG) return;
        if (id === B.LEAVES && d < 4) {
          const k = (nx << 16) | (ny << 8) | nz;
          if (!seen.has(k)) { seen.add(k); q.push([nx, ny, nz, d + 1]); }
        }
      }
    }
    this.breakBlock(x, y, z, null, true);
  }
  tickMushroom(x, y, z, id) {
    // mushroom farming: mushrooms slowly spread in the dark
    const w = this.world;
    if (this.rand() > 0.04) return;
    let n = 0;
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = -1; dy <= 1; dy++) if (w.getBlock(x + dx, y + dy, z + dz) === id) n++;
    if (n >= 5) return;
    const xx = x + ((this.rand() * 3) | 0) - 1, yy = y + ((this.rand() * 2) | 0) - ((this.rand() * 2) | 0), zz = z + ((this.rand() * 3) | 0) - 1;
    if (w.getBlock(xx, yy, zz) === 0 && OPAQUE[w.getBlock(xx, yy - 1, zz)] && w.getBrightness(xx, yy, zz) < 13) this.setBlock(xx, yy, zz, id);
  }
  growSapling(x, y, z) {
    const w = this.world;
    const m = w.getMeta(x, y, z);
    if (!(m & 8)) { w.setMeta(x, y, z, m | 8, false); return false; }
    // check room
    for (let k = 1; k < 6; k++) if (w.getBlock(x, y + k, z) !== 0 && w.getBlock(x, y + k, z) !== B.LEAVES) return false;
    w.setBlock(x, y, z, 0, 0, false);
    const before = new Map();
    // collect changed cells by diffing a small box
    const box = [];
    for (let dx = -3; dx <= 3; dx++) for (let dy = 0; dy <= 11; dy++) for (let dz = -3; dz <= 3; dz++) box.push([x + dx, y + dy, z + dz, w.getBlock(x + dx, y + dy, z + dz)]);
    // place via rawSet into a scratch then apply with setBlock for lighting/network
    const saved = box.map(([bx, by, bz]) => w.inBounds(bx, by, bz) ? [w.blocks[idx(bx, by, bz)], w.meta[idx(bx, by, bz)]] : null);
    growTree(w, x, y, z, m & 3, this.rand);
    const changes = [];
    box.forEach(([bx, by, bz], i) => {
      if (!saved[i]) return;
      const k = idx(bx, by, bz);
      const nid = w.blocks[k], nm = w.meta[k];
      if (nid !== saved[i][0] || nm !== saved[i][1]) { changes.push([bx, by, bz, nid, nm]); w.blocks[k] = saved[i][0]; w.meta[k] = saved[i][1]; }
    });
    for (const [bx, by, bz, nid, nm] of changes) this.setBlock(bx, by, bz, nid, nm);
    this.setBlock(x, y, z, w.getBlock(x, y, z) || B.LOG, w.getMeta(x, y, z) || (m & 3));
    return true;
  }

  // ------------------------------------------------------------------ explosions
  explode(x, y, z, power, src) {
    const w = this.world;
    this.fx({ k: 'explode', x, y, z, p: power });
    if (!this.authority) return;
    const destroyed = new Map();
    // blast resistance as stored in 0.5.0 (explosion code divides it by 5)
    const res = (id) => {
      const t = TILES_050[id];
      if (t) return t[1] / 5;
      if (LIQUID[id]) return 100;
      const b = blocks[id]; return b ? Math.max(0, b.hardness) * 5 : 0;
    };
    for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) for (let k = 0; k < 16; k++) {
      if (i !== 0 && i !== 15 && j !== 0 && j !== 15 && k !== 0 && k !== 15) continue;
      let dx = i / 15 * 2 - 1, dy = j / 15 * 2 - 1, dz = k / 15 * 2 - 1;
      const d = Math.hypot(dx, dy, dz); dx /= d; dy /= d; dz /= d;
      let f = power * (0.7 + this.rand() * 0.6);
      let px = x, py = y, pz = z;
      while (f > 0) {
        const bx = Math.floor(px), by = Math.floor(py), bz = Math.floor(pz);
        const id = w.getBlock(bx, by, bz);
        if (id) { f -= (res(id) + 0.3) * 0.3; if (f > 0 && w.inBounds(bx, by, bz)) destroyed.set(idx(bx, by, bz), [bx, by, bz, id]); }
        px += dx * 0.3; py += dy * 0.3; pz += dz * 0.3; f -= 0.225;
      }
    }
    for (const [, [bx, by, bz, id]] of destroyed) {
      if (LIQUID[id]) continue;
      if (id === B.TNT) { w.setBlock(bx, by, bz, 0); const t = new PrimedTNT(bx + 0.5, by, bz + 0.5, 10 + ((this.rand() * 20) | 0)); this.addEntity(t); continue; }
      const meta = w.getMeta(bx, by, bz);
      if (this.rand() < 1 / power) this.dropBlock(bx, by, bz, id, meta, null);
      this.dropContainer(bx, by, bz);
      w.setBlock(bx, by, bz, 0);
    }
    // damage entities
    const r = power * 2;
    for (const e of [...this.livingEntities(), ...this.entities.values()]) {
      if (e === src || e.removed) continue;
      const dx = e.x - x, dy = e.y + e.h / 2 - y, dz = e.z - z;
      const d = Math.hypot(dx, dy, dz);
      if (d > r) continue;
      const impact = (1 - d / r);
      if (e.living) e.damage(this, Math.floor((impact * impact + impact) / 2 * 8 * power + 1), { explosion: true, entity: src, knock: 0 });
      if (e.type === 'item' && impact > 0.3) { e.removed = true; continue; }
      const k = impact / (d || 1);
      e.vx += dx * k; e.vy += dy * k + impact * 0.3; e.vz += dz * k;
      if (e.type === 'player' && e.sink) e.sink.knock(dx * k, dy * k + impact * 0.3, dz * k);
    }
  }

  // ------------------------------------------------------------------ block breaking
  dropBlock(x, y, z, id, meta, player, tool) {
    const b = blocks[id];
    if (!b) return;
    let drops = b.drop(meta, this.rand);
    if (tool && tool.tool === 'shears' && (id === B.LEAVES || id === B.TALLGRASS || id === B.COBWEB)) drops = [[id, 1, id === B.LEAVES ? (meta & 3) : 0]];
    for (const [did, n, m] of drops) if (n > 0) this.spawnItem(x + 0.5, y + 0.3, z + 0.5, did, n, m);
  }
  dropContainer(x, y, z) {
    const t = this.world.getTile(x, y, z);
    if (!t) return;
    const slots = t.inv ? t.inv.slots : [t.input, t.fuel, t.output];
    for (const s of slots) if (s) this.spawnItem(x + 0.5, y + 0.5, z + 0.5, s.id, s.count, s.meta, s.dmg);
    this.world.tiles.delete(idx(x, y, z));
  }
  // remove a block with drops; player may be null for natural breaks
  breakBlock(x, y, z, player, drops = true) {
    const w = this.world;
    const id = w.getBlock(x, y, z);
    if (!id) return;
    const meta = w.getMeta(x, y, z);
    const b = blocks[id];
    const survival = !player || player.mode !== 'creative';
    const held = player ? player.held() : null;
    const tool = held ? getItem(held.id) : null;
    let canHarvest = true;
    if (b.level >= 0 && b.tool === 'pickaxe') canHarvest = !!(tool && tool.tool === 'pickaxe' && tool.tier >= b.level);
    if (b.id === B.COBWEB) canHarvest = !!(tool && (tool.tool === 'sword' || tool.tool === 'shears'));
    if (player && drops && survival && canHarvest) {
      if (id === B.TNT) { w.setBlock(x, y, z, 0); this.addEntity(new PrimedTNT(x + 0.5, y, z + 0.5)); return; }
      this.dropBlock(x, y, z, id, meta, player, tool);
    } else if (!player && drops) {
      this.dropBlock(x, y, z, id, meta, null, null);
    }
    if (b.container) this.dropContainer(x, y, z);
    this.fx({ k: 'break', x, y, z, id, m: meta });
    // multi-block structures
    if (b.door) {
      const other = (meta & 8) ? y - 1 : y + 1;
      if (w.getBlock(x, other, z) === B.WOOD_DOOR) w.setBlock(x, other, z, 0);
    }
    if (id === B.BED) {
      const d = meta & 3, off = [[0, 1], [-1, 0], [0, -1], [1, 0]][d];
      const s = (meta & 8) ? -1 : 1;
      if (w.getBlock(x + off[0] * s, y, z + off[1] * s) === B.BED) w.setBlock(x + off[0] * s, y, z + off[1] * s, 0);
    }
    // ice becomes water if there's something below
    if (id === B.ICE && survival && player && SOLID[w.getBlock(x, y - 1, z)]) { w.setBlock(x, y, z, B.WATER, 0); return; }
    w.setBlock(x, y, z, 0);
    if (id === B.REACTOR && this.reactor && this.reactor.x === x && this.reactor.y === y && this.reactor.z === z) this.reactor = null;
  }

  // ------------------------------------------------------------------ commands (from local UI or network)
  command(player, cmd) {
    if (!this.authority) return;
    try { this._command(player, cmd); } catch (e) { console.error('command failed', cmd, e); }
  }
  _command(p, cmd) {
    const w = this.world;
    const near = (x, y, z) => Math.hypot(x + 0.5 - p.x, y + 0.5 - (p.y + p.eyeH), z + 0.5 - p.z) <= REACH + 2;
    switch (cmd.c) {
      case 'sel': p.sel = Math.max(0, Math.min(8, cmd.s | 0)); this.dirtyEntity(p); break;
      case 'swing': p.swing = 1; this.fx({ k: 'swing', id: p.id }); break;
      case 'dig': {
        const { x, y, z } = cmd;
        if (!near(x, y, z) || p.deathTime) return;
        const id = w.getBlock(x, y, z);
        if (!id || blocks[id].hardness < 0 || blocks[id].liquid) return;
        this.breakBlock(x, y, z, p, true);
        if (p.mode !== 'creative') this.damageTool(p, 1);
        break;
      }
      case 'use': this.useOnBlock(p, cmd); break;
      case 'useItem': this.useItem(p, cmd); break;
      case 'attack': {
        const e = this.getEntity(cmd.id);
        if (!e || e === p || p.deathTime) return;
        if (Math.sqrt(e.dist2(p)) > REACH + 1) return;
        if (e.type === 'painting') { this.removeEntity(e); if (p.mode !== 'creative') this.spawnItem(e.x, e.y + 0.5, e.z, I.PAINTING, 1, 0); this.fx({ k: 'snd', s: 'wood', x: e.x, y: e.y, z: e.z }); return; }
        if (!e.living) return;
        if (e.type === 'player' && !this.pvp) return;
        const h = p.held(); const it = h ? getItem(h.id) : null;
        const dmg = it && it.damage ? it.damage : 1;
        if (e.damage(this, dmg, { entity: p, knock: 0.4 })) { if (it && it.tool && p.mode !== 'creative') this.damageTool(p, it.tool === 'sword' ? 1 : 2); }
        break;
      }
      case 'interact': {
        const e = this.getEntity(cmd.id);
        if (!e || Math.sqrt(e.dist2(p)) > REACH + 1) return;
        const h = p.held();
        if (e.type === 'sheep' && h) {
          if (h.id === I.SHEARS && !e.sheared) {
            e.sheared = true; this.dirtyEntity(e);
            const n = 1 + ((this.rand() * 3) | 0);
            for (let i = 0; i < n; i++) this.spawnItem(e.x, e.y + 1, e.z, B.WOOL, 1, e.woolColor);
            this.damageTool(p, 1);
            this.fx({ k: 'snd', s: 'shear', x: e.x, y: e.y, z: e.z });
          } else if (h.id === I.DYE && !e.sheared) {
            const c = 15 - (h.meta & 15);
            if (e.woolColor !== c) { e.applyExtra({ c, s: 0 }); this.dirtyEntity(e); this.consume(p, 1); }
          }
        }
        break;
      }
      case 'drop': {
        const s = p.inv.slots[cmd.s];
        if (!s) return;
        const n = cmd.all ? s.count : 1;
        const fx = Math.sin(p.yaw) * Math.cos(p.pitch), fz = -Math.cos(p.yaw) * Math.cos(p.pitch);
        const e = this.spawnItem(p.x + fx * 0.5, p.y + p.eyeH - 0.3, p.z + fz * 0.5, s.id, n, s.meta, s.dmg, false);
        if (e) { e.vx = fx * 0.3; e.vz = fz * 0.3; e.vy = 0.1 - Math.sin(p.pitch) * 0.3; e.pickupDelay = 40; }
        s.count -= n; if (s.count <= 0) p.inv.slots[cmd.s] = null;
        this.syncInv(p);
        break;
      }
      case 'invMove': {
        const a = cmd.a | 0, b = cmd.b | 0;
        if (a < 0 || b < 0 || a >= 36 || b >= 36) return;
        const sa = p.inv.slots[a], sb = p.inv.slots[b];
        if (sa && sb && sa.id === sb.id && sa.meta === sb.meta && !sa.dmg && !sb.dmg && cmd.merge) {
          const ms = maxStack(sa.id); const n = Math.min(ms - sb.count, sa.count);
          sb.count += n; sa.count -= n; if (sa.count <= 0) p.inv.slots[a] = null;
        } else { p.inv.slots[a] = sb; p.inv.slots[b] = sa; }
        this.syncInv(p); this.dirtyEntity(p);
        break;
      }
      case 'creative': {
        if (p.mode !== 'creative') return;
        const slot = cmd.s === undefined ? p.sel : cmd.s | 0;
        if (cmd.id === 0) p.inv.slots[slot] = null;
        else p.inv.slots[slot] = { id: cmd.id | 0, count: Math.min(maxStack(cmd.id), cmd.n || maxStack(cmd.id)), meta: cmd.m | 0, dmg: 0 };
        this.syncInv(p); this.dirtyEntity(p);
        break;
      }
      case 'craft': {
        const r = recipes[cmd.r | 0];
        if (!r) return;
        const table = cmd.table && this.nearBlock(p, B.WORKBENCH, 6);
        let times = Math.max(1, Math.min(64, cmd.n | 0 || 1));
        let made = 0;
        while (times-- > 0 && canCraft(p.inv, r, table)) {
          for (const [id, n, m] of r.in) p.inv.remove(id, n, m);
          const left = p.inv.add(r.out[0], r.out[1], r.out[2]);
          if (left > 0) this.spawnItem(p.x, p.y + 1, p.z, r.out[0], left, r.out[2]);
          made++;
        }
        if (made) { this.syncInv(p); this.fx({ k: 'snd', s: 'craft', x: p.x, y: p.y, z: p.z, only: p.id }); }
        break;
      }
      case 'cont': this.containerAction(p, cmd); break;
      case 'close': p.openContainer = null; break;
      case 'respawn': if (p.deathTime > 0) this.respawn(p); break;
      case 'fall': if (cmd.d > 0 && cmd.d < 200) p.damage(this, cmd.d | 0, { fall: true }); break;
      case 'wake': this.wake(p); break;
      case 'mode': if (cmd.m === 'creative' || cmd.m === 'survival') { p.mode = cmd.m; if (p.sink) p.sink.mode(p.mode); } break;
      case 'chat': if (typeof cmd.t === 'string' && cmd.t.length < 200) this.broadcastMsg(`<${p.name}> ${cmd.t}`); break;
      case 'bow': this.shootBow(p, cmd.charge || 0); break;
    }
  }

  nearBlock(p, id, r) {
    const w = this.world;
    const cx = Math.floor(p.x), cy = Math.floor(p.y), cz = Math.floor(p.z);
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) if (w.getBlock(cx + dx, cy + dy, cz + dz) === id) return true;
    return false;
  }

  consume(p, n = 1) {
    if (p.mode === 'creative') return;
    const s = p.held();
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) p.inv.slots[p.sel] = null;
    this.syncInv(p); this.dirtyEntity(p);
  }
  damageTool(p, n) {
    const s = p.held();
    if (!s) return;
    const it = getItem(s.id);
    if (!it || !it.durability) return;
    s.dmg = (s.dmg || 0) + n;
    if (s.dmg >= it.durability) { p.inv.slots[p.sel] = null; this.fx({ k: 'snd', s: 'toolbreak', x: p.x, y: p.y, z: p.z }); this.dirtyEntity(p); }
    this.syncInv(p);
  }
  syncInv(p) { if (p.sink) p.sink.inv(); }

  // ------------------------------------------------------------------ use on block / placement
  useOnBlock(p, cmd) {
    const w = this.world;
    const { x, y, z, f } = cmd;
    if (p.deathTime || !w.inBounds(x, y, z)) return;
    if (Math.hypot(x + 0.5 - p.x, y + 0.5 - (p.y + p.eyeH), z + 0.5 - p.z) > REACH + 2) return;
    const id = w.getBlock(x, y, z);
    const meta = w.getMeta(x, y, z);
    const held = p.held();
    const item = held ? (held.id >= 256 ? getItem(held.id) : null) : null;
    // --- block interactions
    if (!p.sneak) {
      if (id === B.WOOD_DOOR) {
        const ly = (meta & 8) ? y - 1 : y;
        const lm = w.getMeta(x, ly, z);
        w.setMeta(x, ly, z, lm ^ 4);
        w.setMeta(x, ly + 1, z, w.getMeta(x, ly + 1, z));
        this.markDirty(x, ly + 1, z);
        this.fx({ k: 'snd', s: 'door', x: x + 0.5, y: y + 0.5, z: z + 0.5 });
        return;
      }
      if (id === B.TRAPDOOR || id === B.FENCE_GATE) {
        let nm = meta ^ 4;
        if (id === B.FENCE_GATE && !(meta & 4)) {
          // open away from player
          const q = yawQuadrant(p.yaw);
          nm = (nm & ~1) | ((q === 1 || q === 3) ? 1 : 0);
          if (((meta & 1) !== 0) !== (q === 1 || q === 3)) nm = (meta & 1) | 4;
        }
        w.setMeta(x, y, z, nm);
        this.fx({ k: 'snd', s: 'door', x: x + 0.5, y: y + 0.5, z: z + 0.5 });
        return;
      }
      if (id === B.BED) { this.trySleep(p, x, y, z, meta); return; }
      if (id === B.CHEST || id === B.FURNACE || id === B.LIT_FURNACE) { this.openContainer(p, x, y, z, id); return; }
      if (id === B.WORKBENCH) { if (p.sink) p.sink.open('workbench', { x, y, z }); return; }
      if (id === B.REACTOR) { this.activateReactor(p, x, y, z); return; }
    }
    // --- item on block
    if (held) {
      if (item && item.tool === 'hoe' && f !== 0 && (id === B.GRASS || id === B.DIRT) && w.getBlock(x, y + 1, z) === 0) {
        this.setBlock(x, y, z, B.FARMLAND, 0);
        this.fx({ k: 'snd', s: 'gravel', x: x + 0.5, y: y + 1, z: z + 0.5 });
        if (p.mode !== 'creative') this.damageTool(p, 1);
        return;
      }
      if (held.id === I.DYE && (held.meta & 15) === 15) { if (this.boneMeal(x, y, z, id, meta)) { this.consume(p); this.fx({ k: 'bonemeal', x, y, z }); } return; }
      if (held.id === I.FLINT_STEEL) {
        if (id === B.TNT) { w.setBlock(x, y, z, 0); this.addEntity(new PrimedTNT(x + 0.5, y, z + 0.5)); this.fx({ k: 'snd', s: 'fuse', x, y, z }); }
        else {
          const [dx, dy, dz] = FACE_DIRS[f];
          if (w.getBlock(x + dx, y + dy, z + dz) === 0) { this.setBlock(x + dx, y + dy, z + dz, B.FIRE); this.schedule(x + dx, y + dy, z + dz, 20); this.fx({ k: 'snd', s: 'ignite', x, y, z }); }
        }
        if (p.mode !== 'creative') this.damageTool(p, 1);
        return;
      }
      if (held.id === I.PAINTING) { this.placePainting(p, x, y, z, f); return; }
      this.placeFromItem(p, held, item, x, y, z, f, cmd);
    }
  }

  markDirty(x, y, z) { for (const h of this.hooks.blockChange) h(x, y, z, this.world.getBlock(x, y, z), this.world.getMeta(x, y, z)); }

  boneMeal(x, y, z, id, meta) {
    const w = this.world;
    if (id === B.SAPLING) { w.setMeta(x, y, z, meta | 8, false); return this.growSapling(x, y, z) || true; }
    if (id === B.WHEAT) { if ((meta & 7) < 7) { w.setMeta(x, y, z, 7); return true; } return false; }
    if (id === B.PUMPKIN_STEM || id === B.MELON_STEM) { if ((meta & 7) < 7) { w.setMeta(x, y, z, 7); return true; } return false; }
    if (id === B.BROWN_MUSHROOM || id === B.RED_MUSHROOM) {
      let placed = 0;
      for (let k = 0; k < 8; k++) {
        const xx = x + ((this.rand() * 5) | 0) - 2, zz = z + ((this.rand() * 5) | 0) - 2;
        if (w.getBlock(xx, y, zz) === 0 && OPAQUE[w.getBlock(xx, y - 1, zz)]) { this.setBlock(xx, y, zz, id); placed++; }
      }
      return placed > 0;
    }
    if (id === B.GRASS) {
      for (let k = 0; k < 40; k++) {
        const xx = x + ((this.rand() * 7) | 0) - 3, zz = z + ((this.rand() * 7) | 0) - 3, yy = y + ((this.rand() * 3) | 0) - 1;
        if (w.getBlock(xx, yy, zz) === B.GRASS && w.getBlock(xx, yy + 1, zz) === 0) {
          const r = this.rand();
          this.setBlock(xx, yy + 1, zz, r < 0.8 ? B.TALLGRASS : r < 0.9 ? B.DANDELION : B.ROSE, r < 0.8 ? 1 : 0);
        }
      }
      return true;
    }
    return false;
  }

  entityBlocks(x, y, z) {
    for (const e of this.livingEntities()) {
      const hw = e.w / 2;
      if (e.x + hw > x && e.x - hw < x + 1 && e.y + e.h > y && e.y < y + 1 && e.z + hw > z && e.z - hw < z + 1) return true;
    }
    return false;
  }

  placeFromItem(p, held, item, x, y, z, f, cmd) {
    const w = this.world;
    const clicked = w.getBlock(x, y, z);
    let tx = x, ty = y, tz = z;
    const replaceClicked = clicked === 0 || (blocks[clicked].replaceable && clicked !== held.id);
    if (!replaceClicked) { const [dx, dy, dz] = FACE_DIRS[f]; tx += dx; ty += dy; tz += dz; }
    if (!w.inBounds(tx, ty, tz)) return;
    let placeId = 0, placeMeta = 0;
    const q = yawQuadrant(p.yaw);
    const hy = cmd.hy !== undefined ? cmd.hy : 0.5;
    if (held.id < 256) { placeId = held.id; placeMeta = blocks[held.id].metaItem ? held.meta : 0; }
    else if (item && item.plant) {
      if (f !== 1) return;
      placeId = item.plant;
      if (w.getBlock(tx, ty - 1, tz) !== B.FARMLAND) return;
    } else if (item && item.plantCane) placeId = B.SUGARCANE;
    else if (held.id === I.DOOR) { this.placeDoor(p, tx, ty, tz, q); return; }
    else if (held.id === I.BED) { this.placeBed(p, tx, ty, tz, q); return; }
    else return;

    const target = w.getBlock(tx, ty, tz);
    // slab merge
    if (placeId === B.SLAB) {
      const sm = held.meta & 7;
      if (clicked === B.SLAB && (w.getMeta(x, y, z) & 7) === sm && ((f === 1 && !(w.getMeta(x, y, z) & 8)) || (f === 0 && (w.getMeta(x, y, z) & 8)))) {
        this.setBlock(x, y, z, B.DOUBLE_SLAB, sm); this.consume(p); this.placeSound(B.SLAB, x, y, z); return;
      }
      if (target === B.SLAB && (w.getMeta(tx, ty, tz) & 7) === sm) { this.setBlock(tx, ty, tz, B.DOUBLE_SLAB, sm); this.consume(p); this.placeSound(B.SLAB, tx, ty, tz); return; }
      placeMeta = sm | ((f === 0 || (f > 1 && hy > 0.5)) ? 8 : 0);
    }
    if (target !== 0 && !(blocks[target].replaceable)) return;
    const b = blocks[placeId];
    if (!b) return;
    // orientation
    switch (b.render) {
      case R.STAIRS: placeMeta = [2, 0, 3, 1][q] === undefined ? 0 : ({ 0: 3, 1: 0, 2: 2, 3: 1 })[q]; if (f === 0 || (f > 1 && hy > 0.5)) placeMeta |= 4; break;
      case R.TORCH: if (f === 0) return; placeMeta = f === 1 ? 5 : ({ 5: 1, 4: 2, 3: 3, 2: 4 })[f]; break;
      case R.LADDER: if (f < 2) return; placeMeta = f; break;
      case R.TRAPDOOR: placeMeta = f >= 2 ? ({ 2: 0, 3: 1, 4: 2, 5: 3 })[f] : ({ 0: 1, 1: 2, 2: 0, 3: 3 })[q]; if (f === 0 || (f > 1 && hy > 0.5)) placeMeta |= 8; break;
      case R.GATE: placeMeta = (q === 1 || q === 3) ? 1 : 0; break;
    }
    if (b.container || placeId === B.PUMPKIN || placeId === B.FURNACE) placeMeta = FRONT_FACING_PLAYER[q];
    if (placeId === B.LEAVES) placeMeta = (placeMeta & 3) | 4;
    if (!this.canStay(tx, ty, tz, placeId, placeMeta)) return;
    if (SOLID[placeId] && this.entityBlocks(tx, ty, tz)) return;
    this.setBlock(tx, ty, tz, placeId, placeMeta);
    if (b.container === 'chest') w.setTile(tx, ty, tz, { kind: 'chest', inv: new Inventory(27) });
    if (b.container === 'furnace') w.setTile(tx, ty, tz, newFurnace());
    if (b.gravity) this.schedule(tx, ty, tz, 2);
    if (b.liquid) this.schedule(tx, ty, tz, 5);
    this.consume(p);
    this.placeSound(placeId, tx, ty, tz);
  }
  placeSound(id, x, y, z) { this.fx({ k: 'place', id, x: x + 0.5, y: y + 0.5, z: z + 0.5 }); }

  placeDoor(p, x, y, z, q) {
    const w = this.world;
    if (w.getBlock(x, y, z) !== 0 && !blocks[w.getBlock(x, y, z)].replaceable) return;
    if (w.getBlock(x, y + 1, z) !== 0 || !SOLID[w.getBlock(x, y - 1, z)]) return;
    if (this.entityBlocks(x, y, z) || this.entityBlocks(x, y + 1, z)) return;
    const facing = [3, 0, 1, 2][q];
    const hinge = this.doorHinge(x, y, z, facing);
    w.setBlock(x, y, z, B.WOOD_DOOR, facing);
    w.setBlock(x, y + 1, z, B.WOOD_DOOR, 8 | hinge);
    this.consume(p);
    this.placeSound(B.WOOD_DOOR, x, y, z);
  }
  doorHinge(x, y, z, facing) {
    // put the hinge next to an existing door so double doors open outward together
    const side = [[0, 1], [1, 0], [0, -1], [-1, 0]][facing];
    return this.world.getBlock(x + side[0], y, z + side[1]) === B.WOOD_DOOR ? 1 : 0;
  }
  placeBed(p, x, y, z, q) {
    const w = this.world;
    const d = [2, 3, 0, 1][q];
    const off = [[0, 1], [-1, 0], [0, -1], [1, 0]][d];
    const hx = x + off[0], hz = z + off[1];
    const free = (xx, zz) => (w.getBlock(xx, y, zz) === 0 || blocks[w.getBlock(xx, y, zz)].replaceable) && SOLID[w.getBlock(xx, y - 1, zz)] && !this.entityBlocks(xx, y, zz);
    if (!free(x, z) || !free(hx, hz)) return;
    w.setBlock(x, y, z, B.BED, d);
    w.setBlock(hx, y, hz, B.BED, d | 8);
    this.consume(p);
    this.placeSound(B.BED, x, y, z);
  }
  placePainting(p, x, y, z, f) {
    if (f < 2) return;
    const w = this.world;
    if (!OPAQUE[w.getBlock(x, y, z)]) return;
    const [dx, , dz] = FACE_DIRS[f];
    const bx = x + dx, by = y, bz = z + dz;
    // choose the largest paintings that fit
    const fits = [];
    for (let a = 0; a < PAINTINGS.length; a++) {
      const art = PAINTINGS[a];
      // anchor so the clicked spot is roughly central
      for (let ox = 0; ox < art.w; ox++) for (let oy = 0; oy < art.h; oy++) {
        let ax = bx, az = bz;
        if (f === 2) ax += ox; else if (f === 3) ax -= ox; else if (f === 4) az -= ox; else az += ox;
        const pt = new Painting(ax, by - oy, az, f, a);
        pt.id = -1;
        if (pt.valid(w) && !this.paintingOverlap(pt)) fits.push([art.w * art.h, pt]);
      }
    }
    if (!fits.length) return;
    const maxA = Math.max(...fits.map((q) => q[0]));
    const cands = fits.filter((q) => q[0] === maxA);
    const choice = cands[(this.rand() * cands.length) | 0][1];
    const pt = new Painting(choice.bx, choice.by, choice.bz, choice.dir, choice.art);
    this.addEntity(pt);
    this.consume(p);
    this.fx({ k: 'snd', s: 'wood', x: pt.x, y: pt.y, z: pt.z });
  }
  paintingOverlap(pt) {
    const cells = new Set(pt.cells().map((c) => c.join(',')));
    for (const e of this.entities.values()) if (e.type === 'painting' && e.dir === pt.dir) for (const c of e.cells()) if (cells.has(c.join(','))) return true;
    return false;
  }

  // ------------------------------------------------------------------ items used in the air
  useItem(p, cmd) {
    const h = p.held();
    if (!h || p.deathTime) return;
    const it = getItem(h.id);
    if (!it) return;
    if (it.food) {
      if (p.health >= p.maxHealth && p.mode !== 'creative') return;
      p.health = Math.min(p.maxHealth, p.health + it.food);
      this.fx({ k: 'snd', s: 'eat', x: p.x, y: p.y, z: p.z });
      if (p.mode !== 'creative') {
        h.count--;
        if (h.count <= 0) p.inv.slots[p.sel] = it.leaves ? { id: it.leaves, count: 1, meta: 0, dmg: 0 } : null;
        this.syncInv(p);
      }
      if (p.sink) p.sink.hp();
      return;
    }
    if (it.use === 'throw') {
      const e = new Thrown(h.id === I.EGG ? 'egg' : 'snowball', p.x, p.y + p.eyeH - 0.1, p.z, p);
      const fx = Math.sin(p.yaw) * Math.cos(p.pitch), fy = -Math.sin(p.pitch), fz = -Math.cos(p.yaw) * Math.cos(p.pitch);
      e.vx = fx * 1.5; e.vy = fy * 1.5; e.vz = fz * 1.5;
      this.addEntity(e);
      this.consume(p);
      this.fx({ k: 'snd', s: 'throw', x: p.x, y: p.y, z: p.z });
    }
  }
  shootBow(p, charge) {
    const h = p.held();
    if (!h || h.id !== I.BOW || p.deathTime) return;
    if (p.mode !== 'creative' && p.inv.count(I.ARROW) <= 0) return;
    charge = Math.max(0, Math.min(1, charge));
    if (charge < 0.1) return;
    const a = new Arrow(p.x, p.y + p.eyeH - 0.1, p.z, p);
    const fx = Math.sin(p.yaw) * Math.cos(p.pitch), fy = -Math.sin(p.pitch), fz = -Math.cos(p.yaw) * Math.cos(p.pitch);
    a.shoot(fx, fy, fz, charge * 3, 1);
    a.dmg = 2 + (charge >= 1 ? 1 : 0);
    a.ownerPlayer = p.id;
    this.addEntity(a);
    if (p.mode !== 'creative') { p.inv.remove(I.ARROW, 1); this.damageTool(p, 1); this.syncInv(p); }
    this.fx({ k: 'snd', s: 'bow', x: p.x, y: p.y, z: p.z });
  }

  // ------------------------------------------------------------------ containers
  openContainer(p, x, y, z, id) {
    const w = this.world;
    let t = w.getTile(x, y, z);
    if (!t) { t = blocks[id].container === 'chest' ? { kind: 'chest', inv: new Inventory(27) } : newFurnace(); w.setTile(x, y, z, t); }
    p.openContainer = { x, y, z };
    if (p.sink) p.sink.open(t.kind, { x, y, z, state: containerState(t) });
    if (t.kind === 'chest') this.fx({ k: 'snd', s: 'chestopen', x: x + 0.5, y: y + 0.5, z: z + 0.5 });
  }
  containerAction(p, cmd) {
    if (!p.openContainer) return;
    const { x, y, z } = p.openContainer;
    const t = this.world.getTile(x, y, z);
    if (!t) return;
    const inv = p.inv;
    if (t.kind === 'chest') {
      if (cmd.act === 'take') {
        const s = t.inv.slots[cmd.s | 0];
        if (!s) return;
        const left = inv.add(s.id, s.count, s.meta, s.dmg);
        if (left === 0) t.inv.slots[cmd.s | 0] = null; else s.count = left;
      } else if (cmd.act === 'put') {
        const s = inv.slots[cmd.s | 0];
        if (!s) return;
        const left = t.inv.add(s.id, s.count, s.meta, s.dmg);
        if (left === 0) inv.slots[cmd.s | 0] = null; else s.count = left;
      }
    } else if (t.kind === 'furnace') {
      if (cmd.act === 'put') {
        const s = inv.slots[cmd.s | 0];
        if (!s) return;
        const toFuel = cmd.to === 'fuel';
        const key = toFuel ? 'fuel' : 'input';
        if (toFuel && !fuelTime(s.id)) return;
        if (!toFuel && !smelting.has(s.id)) return;
        const cur = t[key];
        if (cur && (cur.id !== s.id || cur.meta !== s.meta)) { inv.slots[cmd.s | 0] = cur; t[key] = s; }
        else if (cur) { const n = Math.min(64 - cur.count, s.count); cur.count += n; s.count -= n; if (s.count <= 0) inv.slots[cmd.s | 0] = null; }
        else { t[key] = s; inv.slots[cmd.s | 0] = null; }
      } else if (cmd.act === 'take') {
        const key = cmd.from;
        if (!['input', 'fuel', 'output'].includes(key)) return;
        const s = t[key];
        if (!s) return;
        const left = inv.add(s.id, s.count, s.meta, s.dmg);
        if (left === 0) t[key] = null; else s.count = left;
      }
    }
    this.syncInv(p);
    this.syncContainer(x, y, z);
  }
  syncContainer(x, y, z) {
    const t = this.world.getTile(x, y, z);
    if (!t) return;
    const st = containerState(t);
    for (const p of this.players.values()) {
      if (p.openContainer && p.openContainer.x === x && p.openContainer.y === y && p.openContainer.z === z && p.sink) p.sink.cont(st);
    }
  }
  tickFurnaces() {
    const w = this.world;
    for (const [k, t] of w.tiles) {
      if (t.kind !== 'furnace') continue;
      const y = k & 127, z = (k >> 7) & 255, x = k >> 15;
      const wasBurning = t.burn > 0;
      let changed = false;
      if (t.burn > 0) t.burn--;
      const res = t.input ? smelting.get(t.input.id) : null;
      const canSmelt = res && (!t.output || (t.output.id === res[0] && t.output.meta === res[2] && t.output.count < maxStack(res[0])));
      if (t.burn <= 0 && canSmelt && t.fuel) {
        const ft = fuelTime(t.fuel.id);
        if (ft) { t.burn = t.burnMax = ft; t.fuel.count--; if (t.fuel.count <= 0) t.fuel = null; changed = true; }
      }
      if (t.burn > 0 && canSmelt) {
        t.cook++;
        if (t.cook >= 200) {
          t.cook = 0;
          t.input.count--; if (t.input.count <= 0) t.input = null;
          if (t.output) t.output.count += res[1]; else t.output = { id: res[0], count: res[1], meta: res[2], dmg: 0 };
          changed = true;
        }
      } else if (t.cook > 0) t.cook = Math.max(0, t.cook - 2);
      const burning = t.burn > 0;
      if (burning !== wasBurning) {
        const meta = w.getMeta(x, y, z);
        w.setBlock(x, y, z, burning ? B.LIT_FURNACE : B.FURNACE, meta);
        w.setTile(x, y, z, t);
        changed = true;
      }
      if (changed || this.tick % 10 === 0) this.syncContainer(x, y, z);
    }
  }

  // ------------------------------------------------------------------ sleeping
  trySleep(p, x, y, z, meta) {
    if (this.isDay()) { this.msg(p, 'You can only sleep at night'); return; }
    for (const e of this.entities.values()) if (HOSTILE.has(e.type) && e.dist2(p) < 64) { this.msg(p, 'You may not rest now, there are monsters nearby'); return; }
    // head position
    let hx = x, hz = z;
    if (!(meta & 8)) { const off = [[0, 1], [-1, 0], [0, -1], [1, 0]][meta & 3]; hx += off[0]; hz += off[1]; }
    p.sleeping = { x: hx, y, z: hz, d: meta & 3 };
    p.spawnPoint = [hx + 0.5, y + 1, hz + 0.5];
    if (p.sink) p.sink.sleep(p.sleeping);
    this.dirtyEntity(p);
  }
  wake(p) {
    if (!p.sleeping) return;
    const s = p.sleeping;
    p.sleeping = null;
    if (p.sink) p.sink.sleep(null, [s.x + 0.5, s.y + 0.6, s.z + 0.5]);
    this.dirtyEntity(p);
  }
  tickSleep() {
    const ps = [...this.players.values()].filter((p) => p.deathTime === 0);
    if (!ps.length) return;
    if (ps.every((p) => p.sleeping)) {
      this.sleepTicks++;
      if (this.sleepTicks > 100) {
        this.world.time = Math.ceil(this.world.time / DAY) * DAY;
        for (const p of ps) { p.health = p.maxHealth; if (p.sink) p.sink.hp(); this.wake(p); }
        this.sleepTicks = 0;
        if (this.onTimeJump) this.onTimeJump();
      }
    } else this.sleepTicks = 0;
  }

  // ------------------------------------------------------------------ players
  respawn(p) {
    const sp = this.validSpawn(p);
    p.x = sp[0]; p.y = sp[1]; p.z = sp[2];
    p.vx = p.vy = p.vz = 0;
    p.health = p.maxHealth; p.deathTime = 0; p.fire = 0; p.air = 300; p.fallDist = 0;
    p.sleeping = null;
    if (p.sink) { p.sink.teleport(p.x, p.y, p.z); p.sink.hp(); p.sink.inv(); }
    this.dirtyEntity(p);
  }
  validSpawn(p) {
    const w = this.world;
    if (p.spawnPoint) {
      const [x, y, z] = p.spawnPoint;
      // bed must still exist
      if (w.getBlock(Math.floor(x), Math.floor(y - 1), Math.floor(z)) === B.BED) {
        for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
          const bx = Math.floor(x) + dx, bz = Math.floor(z) + dz, by = Math.floor(y) - 1;
          if (!SOLID[w.getBlock(bx, by + 1, bz)] && !SOLID[w.getBlock(bx, by + 2, bz)] && dx !== 0 | dz !== 0) return [bx + 0.5, by + 1, bz + 0.5];
        }
      }
      p.spawnPoint = null;
    }
    const [sx, , sz] = w.spawn;
    const x = Math.floor(sx) + ((this.rand() * 5) | 0) - 2, z = Math.floor(sz) + ((this.rand() * 5) | 0) - 2;
    return [x + 0.5, w.surfaceY(x, z) + 1, z + 0.5];
  }
  playerDied(p) {
    if (p.mode !== 'creative') {
      for (let i = 0; i < p.inv.size; i++) {
        const s = p.inv.slots[i];
        if (s) { const e = this.spawnItem(p.x, p.y + 1, p.z, s.id, s.count, s.meta, s.dmg); if (e) { e.vx = (this.rand() - 0.5) * 0.6; e.vz = (this.rand() - 0.5) * 0.6; e.pickupDelay = 40; } p.inv.slots[i] = null; }
      }
      this.syncInv(p);
    }
    this.broadcastMsg(`${p.name} died`);
    if (p.sink) p.sink.hp();
    this.dirtyEntity(p);
  }
  // server-side per-player logic (env damage + pickup)
  tickPlayer(p) {
    if (p.removed) return;
    if (p.swing > 0) p.swing = Math.max(0, p.swing - 0.15);
    if (p.deathTime > 0) { p.deathTime++; return; }
    const env = liquidAt(this.world, p);
    p.inWater = env.water; p.inLava = env.lava;
    p.baseTick(this);
    if (env.cactus && p.age % 10 === 0) p.damage(this, 1, { cactus: true });
    if (p.hurtTimeSent !== p.hurtTime && p.sink) { p.sink.hp(); }
    p.hurtTimeSent = p.hurtTime;
    if (p.age % 20 === 0 && p.sink) p.sink.hp();
    // pickups
    for (const e of this.entities.values()) {
      if (e.type === 'item' && !e.removed && e.pickupDelay <= 0) {
        const dx = e.x - p.x, dy = e.y - (p.y + 0.5), dz = e.z - p.z;
        if (dx * dx + dz * dz < 2.2 && dy > -2.1 && dy < 1.9) {
          const left = p.inv.add(e.item.id, e.item.count, e.item.meta, e.item.dmg);
          if (left < e.item.count) {
            this.fx({ k: 'pickup', id: e.id, to: p.id, x: e.x, y: e.y, z: e.z });
            if (left === 0) this.removeEntity(e); else { e.item.count = left; this.dirtyEntity(e); }
            this.syncInv(p); this.dirtyEntity(p);
          }
        }
      } else if (e.type === 'arrow' && e.stuck && e.fromPlayer && e.age > 10) {
        if (e.dist2(p) < 2) { if (p.inv.add(I.ARROW, 1) === 0) { this.removeEntity(e); this.syncInv(p); this.fx({ k: 'pickup', id: e.id, to: p.id, x: e.x, y: e.y, z: e.z }); } }
      }
    }
  }

  // ------------------------------------------------------------------ mob spawning
  countMobs() {
    let a = 0, h = 0;
    for (const e of this.entities.values()) { if (HOSTILE.has(e.type)) h++; else if (e.type === 'pig' || e.type === 'cow' || e.type === 'chicken' || e.type === 'sheep') a++; }
    return [a, h];
  }
  spawnAnimals(n) {
    const w = this.world;
    const types = ['pig', 'cow', 'chicken', 'sheep'];
    let made = 0;
    for (let tries = 0; tries < n * 20 && made < n; tries++) {
      const x = 4 + ((this.rand() * (WX - 8)) | 0), z = 4 + ((this.rand() * (WZ - 8)) | 0);
      const y = w.surfaceY(x, z);
      if (w.getBlock(x, y, z) !== B.GRASS || w.getBlock(x, y + 1, z) !== 0) continue;
      const t = types[(this.rand() * types.length) | 0];
      const grp = 2 + ((this.rand() * 3) | 0);
      for (let g = 0; g < grp && made < n; g++) {
        const xx = x + ((this.rand() * 5) | 0) - 2, zz = z + ((this.rand() * 5) | 0) - 2, yy = w.surfaceY(xx, zz);
        if (w.getBlock(xx, yy, zz) !== B.GRASS || SOLID[w.getBlock(xx, yy + 1, zz)]) continue;
        let e;
        if (t === 'sheep') { const r = this.rand(); e = new Sheep(xx + 0.5, yy + 1, zz + 0.5, r < 0.8 ? 0 : r < 0.88 ? 7 : r < 0.94 ? 8 : r < 0.97 ? 15 : 12); }
        else e = new MOB_CLASSES[t](xx + 0.5, yy + 1, zz + 0.5);
        e.yaw = this.rand() * Math.PI * 2;
        this.addEntity(e); made++;
      }
    }
    return made;
  }
  spawnMonsters() {
    if (this.difficulty === 'peaceful') return;
    const w = this.world;
    const survivors = [...this.players.values()].filter((p) => p.mode !== 'creative' && p.deathTime === 0);
    if (!survivors.length) return;
    const [, h] = this.countMobs();
    if (h >= 18) return;
    const p = survivors[(this.rand() * survivors.length) | 0];
    for (let tries = 0; tries < 4; tries++) {
      const ang = this.rand() * Math.PI * 2, dist = 20 + this.rand() * 28;
      const x = Math.floor(p.x + Math.cos(ang) * dist), z = Math.floor(p.z + Math.sin(ang) * dist);
      if (x < 1 || z < 1 || x >= WX - 1 || z >= WZ - 1) continue;
      const y = Math.max(1, Math.min(WY - 3, Math.floor(p.y + (this.rand() - 0.5) * 30)));
      // find floor near y
      let yy = y;
      while (yy > 1 && !SOLID[w.getBlock(x, yy - 1, z)]) yy--;
      if (!OPAQUE[w.getBlock(x, yy - 1, z)] || SOLID[w.getBlock(x, yy, z)] || SOLID[w.getBlock(x, yy + 1, z)] || LIQUID[w.getBlock(x, yy, z)]) continue;
      if (w.getBrightness(x, yy, z) > 7) continue;
      let tooClose = false;
      for (const q of this.players.values()) if ((q.x - x) ** 2 + (q.y - yy) ** 2 + (q.z - z) ** 2 < 24 * 24) tooClose = true;
      if (tooClose) continue;
      const r = this.rand();
      const type = r < 0.3 ? 'zombie' : r < 0.55 ? 'skeleton' : r < 0.78 ? 'spider' : 'creeper';
      if (type === 'spider' && (SOLID[w.getBlock(x + 1, yy, z)] || SOLID[w.getBlock(x, yy, z + 1)])) continue;
      const e = new MOB_CLASSES[type](x + 0.5, yy, z + 0.5);
      e.yaw = this.rand() * Math.PI * 2;
      this.addEntity(e);
      return;
    }
  }
  despawn() {
    for (const e of this.entities.values()) {
      if (!HOSTILE.has(e.type)) continue;
      let near = 1e9;
      for (const p of this.players.values()) near = Math.min(near, e.dist2(p));
      if (near > 80 * 80 || (near > 32 * 32 && this.rand() < 0.002)) e.removed = true;
      // creative-only worlds / daytime cleanup of zombies & skeletons happens through burning
    }
  }

  // ------------------------------------------------------------------ nether reactor (behaviour measured from 0.5.0)
  reactorPattern(x, y, z) {
    const w = this.world;
    const G = B.GOLD_BLOCK, C = B.COBBLE, A = 0;
    const layers = [
      [[G, C, G], [C, C, C], [G, C, G]],
      [[C, A, C], [A, B.REACTOR, A], [C, A, C]],
      [[A, C, A], [C, C, C], [A, C, A]]
    ];
    for (let l = 0; l < 3; l++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const want = layers[l][i][j];
      const got = w.getBlock(x + i - 1, y + l - 1, z + j - 1);
      if (want === A) { if (got !== 0 && !blocks[got].replaceable) return false; }
      else if (got !== want) return false;
    }
    return true;
  }
  playersNearReactor(x, y, z, range, dy = 3) {
    return [...this.players.values()].filter((q) => q.deathTime === 0 && Math.abs(q.x - (x + 0.5)) <= range && Math.abs(q.z - (z + 0.5)) <= range && Math.abs(q.y - y) <= dy);
  }
  activateReactor(p, x, y, z) {
    const w = this.world, R = REACTOR_050;
    if (w.getMeta(x, y, z) !== 0) return;
    if (p.mode === 'creative') return; // the reactor only reacts in survival
    if (!this.reactorPattern(x, y, z)) { this.msg(p, 'Not the correct pattern!'); return; }
    const alive = [...this.players.values()].filter((q) => q.deathTime === 0);
    if (this.playersNearReactor(x, y, z, R.playerRange).length < alive.length) { this.msg(p, 'All players need to be close to the reactor.'); return; }
    if (y > R.maxY) { this.msg(p, 'The nether reactor needs to be built lower down.'); return; }
    if (y + R.clearY0 < 1) { this.msg(p, 'The nether reactor needs to be built higher up.'); return; }
    if (this.reactor) { this.msg(p, 'Another reactor is already active'); return; }
    this.msg(p, 'Active!');
    w.setMeta(x, y, z, 1);
    this.reactor = { x, y, z, t: 0, level: 0, running: true, finished: false };
    this.buildSpire(x, y, z);
    this.setNightMode(true);
  }
  setNightMode(on) {
    this.world.nightMode = !!on;
    for (const h of this.hooks.night || []) h(!!on);
  }
  domeCell(ch) { return ch === 'a' ? 0 : (ch === 'o' || ch === 'x') ? B.OBSIDIAN : -1; }
  buildSpire(cx, cy, cz) {
    const R = REACTOR_050;
    const target = new Map();
    const key = (x, y, z) => (x + 64) * 65536 + (y + 64) * 256 + (z + 64);
    // the original first clears a 25x25 column around the core (keeping the core itself)
    for (let dx = -R.clearRadius; dx <= R.clearRadius; dx++) for (let dz = -R.clearRadius; dz <= R.clearRadius; dz++) for (let dy = R.clearY0; dy <= R.clearY1; dy++) {
      if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1 && dy <= 2) continue;
      target.set(key(dx, dy, dz), [dx, dy, dz, 0]);
    }
    DOME_050.forEach((layer, li) => {
      const dy = li - 3;
      layer.split('|').forEach((row, ri) => {
        for (let ci = 0; ci < row.length; ci++) {
          const id = this.domeCell(row[ci]);
          if (id < 0) continue;
          const dx = ci - 8, dz = ri - 8;
          target.set(key(dx, dy, dz), [dx, dy, dz, id]);
        }
      });
    });
    const w = this.world, changes = [];
    for (const [dx, dy, dz, id] of target.values()) {
      const x = cx + dx, y = cy + dy, z = cz + dz;
      if (!w.inBounds(x, y, z)) continue;
      if (w.getBlock(x, y, z) !== id) changes.push([x, y, z, id, 0]);
    }
    this.bulkSet(changes);
    // nothing survives inside the spire
    for (const e of this.entities.values()) if (e.type === 'item' && Math.abs(e.x - cx) < 12 && Math.abs(e.z - cz) < 12 && e.y > cy - 3 && e.y < cy + 40) e.removed = true;
  }
  bulkSet(changes) {
    this.world.bulkSet(changes);
    for (const h of this.hooks.bulk || []) h(changes);
  }
  reactorLayer(r, ly, from, to) {
    const w = this.world;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const id = w.getBlock(r.x + i, r.y + ly, r.z + j);
      if (from.includes(id)) w.setBlock(r.x + i, r.y + ly, r.z + j, to);
    }
  }
  reactorItemsForLevel(level) {
    if (level === 0) return 3;
    if (level <= 3) return 5;
    if (level <= 7) return Math.max(0, ((this.rand() * 14) | 0) - 4);
    return Math.max(0, ((this.rand() * 9) | 0) - 2);
  }
  reactorEnemiesForLevel(level) {
    if (level === 0) return 3;
    if (level <= 3) return 2;
    if (level <= 5) return this.rand() < 0.5 ? 1 : 0;
    return 0;
  }
  reactorSpawnPos(r) {
    const ang = this.rand() * Math.PI * 2, d = 2.5 + this.rand() * 4.5;
    return [r.x + 0.5 + Math.cos(ang) * d, r.y - 1, r.z + 0.5 + Math.sin(ang) * d];
  }
  reactorPigmen(r) {
    return [...this.entities.values()].filter((e) => e.type === 'pigzombie' && !e.removed && e.deathTime === 0 && Math.abs(e.x - r.x) < 12 && Math.abs(e.z - r.z) < 12);
  }
  reactorSpawnPigmen(r, max, n) {
    const have = this.reactorPigmen(r).length;
    for (let i = 0; i < Math.min(n, max - have); i++) {
      const [x, y, z] = this.reactorSpawnPos(r);
      this.addEntity(new PigZombie(x, y, z));
    }
  }
  tickReactor() {
    const r = this.reactor;
    if (!r) return;
    const w = this.world, R = REACTOR_050;
    if (w.getBlock(r.x, r.y, r.z) !== B.REACTOR) { this.reactor = null; this.setNightMode(false); return; }
    r.t++;
    if (r.t % 20 !== 0) return;
    const sec = r.t / 20;
    if (r.running) {
      if (R.glow[sec] !== undefined) this.reactorLayer(r, R.glow[sec], [B.GOLD_BLOCK, B.COBBLE], B.GLOWING_OBSIDIAN);
      if (R.toObsidian[sec] !== undefined) this.reactorLayer(r, R.toObsidian[sec] - 1, [B.GLOWING_OBSIDIAN], B.OBSIDIAN);
      if (R.levelSeconds.includes(sec)) {
        r.level++;
        const n = this.reactorItemsForLevel(r.level);
        for (let i = 0; i < n; i++) {
          let id, c = 1;
          if (this.rand() < 6 / 7) [id, c] = R.commonLoot[(this.rand() * R.commonLoot.length) | 0];
          else id = R.rareLoot[(this.rand() * R.rareLoot.length) | 0];
          const [x, y, z] = this.reactorSpawnPos(r);
          this.spawnItem(x, y + 0.5, z, id, c, 0);
        }
        this.reactorSpawnPigmen(r, 3, this.reactorEnemiesForLevel(r.level));
        this.fx({ k: 'snd', s: 'reactor', x: r.x, y: r.y, z: r.z });
      }
      if (r.t > R.endTick) this.finishReactor(r);
    } else if (r.finished) {
      // the finished spire keeps two pigmen around while somebody is close, and clears them when everybody leaves
      if (this.playersNearReactor(r.x, r.y, r.z, R.keepEnemiesRange, 40).length) this.reactorSpawnPigmen(r, 2, 3);
      else { for (const e of this.reactorPigmen(r)) e.removed = true; }
    }
  }
  finishReactor(r) {
    const w = this.world;
    r.running = false; r.finished = true;
    w.setMeta(r.x, r.y, r.z, 2);
    this.setNightMode(false);
    for (let ly = -1; ly <= 1; ly++) this.reactorLayer(r, ly, [B.GLOWING_OBSIDIAN], B.OBSIDIAN);
    // the spire crumbles the way the original does
    const changes = [];
    DOME_050.forEach((layer, li) => layer.split('|').forEach((row, ri) => {
      for (let ci = 0; ci < row.length; ci++) {
        if (row[ci] !== 'x') continue;
        const x = r.x + ci - 8, y = r.y + li - 3, z = r.z + ri - 8;
        if (w.getBlock(x, y, z) === B.OBSIDIAN) changes.push([x, y, z, 0, 0]);
      }
    }));
    this.bulkSet(changes);
  }

  // ------------------------------------------------------------------ ray casting
  canSee(x0, y0, z0, x1, y1, z1) {
    const d = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    const n = Math.ceil(d * 2);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const id = this.world.getBlock(Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t), Math.floor(z0 + (z1 - z0) * t));
      if (OPAQUE[id]) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------ main server tick
  serverTick() {
    const w = this.world;
    this.tick++;
    w.time++;
    this.updateSkyDarken();
    this.randomTicks();
    this.runScheduled();
    for (const e of this.entities.values()) {
      if (e.removed) continue;
      e.savePrev();
      e.tick(this);
    }
    for (const e of [...this.entities.values()]) if (e.removed) this.removeEntity(e);
    for (const p of this.players.values()) this.tickPlayer(p);
    this.tickFurnaces();
    this.tickReactor();
    if (this.tick % 20 === 0) this.spawnMonsters();
    if (this.tick % 600 === 0) { const [a] = this.countMobs(); if (a < 30) this.spawnAnimals(3); }
    if (this.tick % 100 === 0) this.despawn();
    this.tickSleep();
  }
  updateSkyDarken() {
    const st = this.world.time % DAY;
    const ang = (st / DAY - 0.25) * Math.PI * 2;
    const day = this.world.nightMode ? 0 : Math.max(0, Math.min(1, Math.cos(ang) * 2 + 0.5));
    this.world.skyDarken = Math.round((1 - day) * 11);
  }

  // ------------------------------------------------------------------ persistence
  saveState() {
    const ents = [];
    for (const e of this.entities.values()) {
      if (e.removed || e.type === 'arrow' && !e.stuck) continue;
      ents.push(e.toSave());
    }
    const tiles = [];
    for (const [k, t] of this.world.tiles) {
      const y = k & 127, z = (k >> 7) & 255, x = k >> 15;
      if (t.kind === 'chest') tiles.push({ x, y, z, kind: 'chest', inv: t.inv.toJSON() });
      else tiles.push({ x, y, z, kind: 'furnace', input: slotJ(t.input), fuel: slotJ(t.fuel), output: slotJ(t.output), burn: t.burn, burnMax: t.burnMax, cook: t.cook });
    }
    return { ents, tiles, reactor: this.reactor };
  }
  loadState(s) {
    if (!s) return;
    for (const t of s.tiles || []) {
      if (t.kind === 'chest') { const inv = new Inventory(27); inv.load(t.inv); this.world.setTile(t.x, t.y, t.z, { kind: 'chest', inv }); }
      else this.world.setTile(t.x, t.y, t.z, { kind: 'furnace', input: slotP(t.input), fuel: slotP(t.fuel), output: slotP(t.output), burn: t.burn || 0, burnMax: t.burnMax || 0, cook: t.cook || 0 });
    }
    for (const es of s.ents || []) {
      let e;
      if (es.t === 'painting') { e = new Painting(0, 0, 0, 2, 0); e.applyExtra(es.ex); e.x = e.bx + 0.5; e.y = e.by; e.z = e.bz + 0.5; }
      else e = createEntity(es.t, es.x, es.y, es.z, es.ex);
      if (!e) continue;
      e.yaw = es.yaw || 0; if (es.hp) e.health = es.hp;
      e.savePrev();
      this.addEntity(e);
    }
    this.reactor = s.reactor || null;
    if (this.reactor && this.reactor.running) this.world.nightMode = true;
  }
}

function slotJ(s) { return s ? [s.id, s.count, s.meta, s.dmg || 0] : 0; }
function slotP(a) { return a ? { id: a[0], count: a[1], meta: a[2] || 0, dmg: a[3] || 0 } : null; }
export function newFurnace() { return { kind: 'furnace', input: null, fuel: null, output: null, burn: 0, burnMax: 0, cook: 0 }; }
export function containerState(t) {
  if (t.kind === 'chest') return { kind: 'chest', slots: t.inv.toJSON() };
  return { kind: 'furnace', input: slotJ(t.input), fuel: slotJ(t.fuel), output: slotJ(t.output), burn: t.burnMax ? t.burn / t.burnMax : 0, cook: t.cook / 200 };
}
