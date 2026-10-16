// Terrain generator: finite 256x256 world with biomes, caves, ores, trees and plants.
import { B } from './blocks.js';
import { WX, WZ, WY, SEA, idx } from './world.js';
import { Noise, mulberry } from './noise.js';

export const BIOME = { PLAINS: 0, FOREST: 1, DESERT: 2, TAIGA: 3, BEACH: 4, OCEAN: 5, SWAMP: 6 };

export function generate(world, seed, progress) {
  world.seed = seed;
  const r = mulberry(seed ^ 0x9e3779b9);
  const nH = new Noise(seed), nD = new Noise(seed + 1), nT = new Noise(seed + 2), nM = new Noise(seed + 3);
  const nC1 = new Noise(seed + 4), nC2 = new Noise(seed + 5), nR = new Noise(seed + 6), nS = new Noise(seed + 7);
  const biomes = new Uint8Array(WX * WZ);
  const heights = new Uint8Array(WX * WZ);
  world.biomes = biomes;

  // ---------------------------------------------------- heights & biomes
  for (let x = 0; x < WX; x++) for (let z = 0; z < WZ; z++) {
    const cont = nH.fbm2(x / 160, z / 160, 4);
    const detail = nD.fbm2(x / 40, z / 40, 3);
    const ridge = 1 - Math.abs(nR.fbm2(x / 90, z / 90, 3));
    const mount = Math.max(0, ridge - 0.55) * 2.2;
    const temp = nT.fbm2(x / 200, z / 200, 2) + (r() - 0.5) * 0.02;
    const humid = nM.fbm2(x / 180, z / 180, 2);
    let h = 66 + cont * 22 + detail * 6 + mount * mount * 38;
    // gently push down the very edge of the world so it reads as coastline
    const ed = Math.min(x, z, WX - 1 - x, WZ - 1 - z);
    if (ed < 12) h = h - (12 - ed) * 0.6;
    h = Math.max(4, Math.min(WY - 8, h));
    const hi = Math.floor(h);
    heights[(x << 8) | z] = hi;
    let b;
    if (hi < SEA - 1) b = BIOME.OCEAN;
    else if (hi <= SEA + 1 && temp > -0.25) b = BIOME.BEACH;
    else if (temp > 0.22 && humid < 0.05) b = BIOME.DESERT;
    else if (temp < -0.22) b = BIOME.TAIGA;
    else if (humid > 0.25 && hi < SEA + 4) b = BIOME.SWAMP;
    else if (humid > 0.05) b = BIOME.FOREST;
    else b = BIOME.PLAINS;
    biomes[(x << 8) | z] = b;
  }
  progress && progress(0.15);

  // ---------------------------------------------------- base column fill
  for (let x = 0; x < WX; x++) for (let z = 0; z < WZ; z++) {
    const col = (x << 8) | z;
    const h = heights[col];
    const b = biomes[col];
    const base = col << 7;
    const dirtDepth = 3 + ((nS.noise2(x / 8, z / 8) + 1) * 1.5 | 0);
    for (let y = 0; y < WY; y++) {
      let id = 0;
      if (y === 0) id = B.BEDROCK;
      else if (y < 5 && r() < (5 - y) / 5) id = B.BEDROCK;
      else if (y < h - dirtDepth) id = B.STONE;
      else if (y < h) {
        if (b === BIOME.DESERT || b === BIOME.BEACH) id = (y < h - 3 && b === BIOME.DESERT) ? B.SANDSTONE : B.SAND;
        else if (b === BIOME.OCEAN) id = h < SEA - 6 && nS.noise2(x / 12, z / 12) > 0.3 ? B.GRAVEL : (nS.noise2(x / 9 + 50, z / 9) > 0.45 ? B.CLAY : B.SAND);
        else id = B.DIRT;
      } else if (y === h) {
        if (b === BIOME.DESERT || b === BIOME.BEACH) id = B.SAND;
        else if (b === BIOME.OCEAN) id = B.SAND;
        else id = h < SEA ? B.DIRT : B.GRASS;
      } else if (y <= SEA) {
        id = B.STILL_WATER;
      }
      world.blocks[base + y] = id;
    }
    if (b === BIOME.TAIGA || (b === BIOME.OCEAN && nT.fbm2(x / 200, z / 200, 2) < -0.25)) {
      if (h >= SEA) { if (r() < 0.95) world.blocks[base + h + 1] = B.SNOW_LAYER; }
      else world.blocks[base + SEA] = B.ICE;
    }
  }
  progress && progress(0.3);

  // ---------------------------------------------------- caves (interpolated 3D noise)
  const S = 4;
  const gx = WX / S + 1, gy = WY / S + 1, gz = WZ / S + 1;
  const g1 = new Float32Array(gx * gy * gz), g2 = new Float32Array(gx * gy * gz);
  for (let x = 0; x < gx; x++) for (let y = 0; y < gy; y++) for (let z = 0; z < gz; z++) {
    const i = (x * gy + y) * gz + z;
    g1[i] = nC1.noise3(x * S / 28, y * S / 16, z * S / 28);
    g2[i] = nC2.noise3(x * S / 28, y * S / 16, z * S / 28);
  }
  const sample = (g, x, y, z) => {
    const fx = x / S, fy = y / S, fz = z / S;
    const x0 = fx | 0, y0 = fy | 0, z0 = fz | 0;
    const tx = fx - x0, ty = fy - y0, tz = fz - z0;
    const at = (a, b, c) => g[(a * gy + b) * gz + c];
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(at(x0, y0, z0), at(x0 + 1, y0, z0), tx), l(at(x0, y0 + 1, z0), at(x0 + 1, y0 + 1, z0), tx), ty),
      l(l(at(x0, y0, z0 + 1), at(x0 + 1, y0, z0 + 1), tx), l(at(x0, y0 + 1, z0 + 1), at(x0 + 1, y0 + 1, z0 + 1), tx), ty), tz);
  };
  for (let x = 1; x < WX - 1; x++) for (let z = 1; z < WZ - 1; z++) {
    const col = (x << 8) | z;
    const h = heights[col];
    const base = col << 7;
    const top = Math.min(h - (biomes[col] === BIOME.OCEAN || h <= SEA + 1 ? 6 : 1), WY - 2);
    for (let y = 4; y <= top; y++) {
      const a = sample(g1, x, y, z), c = sample(g2, x, y, z);
      const t = 0.075 + (y < 20 ? 0.03 : 0);
      if (Math.abs(a) < t && Math.abs(c) < t) {
        const cur = world.blocks[base + y];
        if (cur === B.BEDROCK || cur === B.STILL_WATER) continue;
        // don't open caves right under water
        if (world.blocks[base + y + 1] === B.STILL_WATER) continue;
        world.blocks[base + y] = y < 11 ? B.STILL_LAVA : 0;
        // keep grass on surface consistent
        if (y === h - 1 || y === h) { /* surface opening */ }
      }
    }
    // if top block exposed to a cave below, turn dirt under into grass correctly later in lighting
  }
  // grass blocks with air removed below become dirt only visually fine; fix dirt-surface where cave opened at top
  for (let x = 0; x < WX; x++) for (let z = 0; z < WZ; z++) {
    const base = ((x << 8) | z) << 7;
    const y = world.surfaceY(x, z);
    if (world.blocks[base + y] === B.DIRT && y >= SEA) world.blocks[base + y] = B.GRASS;
  }
  progress && progress(0.45);

  // ---------------------------------------------------- ores
  const ore = (id, count, size, maxY, minY = 1) => {
    for (let n = 0; n < count; n++) {
      let x = r() * WX, y = minY + r() * (maxY - minY), z = r() * WZ;
      for (let k = 0; k < size; k++) {
        const xi = x | 0, yi = y | 0, zi = z | 0;
        if (world.inBounds(xi, yi, zi) && world.blocks[idx(xi, yi, zi)] === B.STONE) world.blocks[idx(xi, yi, zi)] = id;
        x += r() * 2 - 1; y += r() * 2 - 1; z += r() * 2 - 1;
      }
    }
  };
  const chunks = (WX / 16) * (WZ / 16);
  ore(B.DIRT, chunks * 6, 24, 120);
  ore(B.GRAVEL, chunks * 4, 24, 120);
  ore(B.COAL_ORE, chunks * 20, 14, 120);
  ore(B.IRON_ORE, chunks * 18, 8, 64);
  ore(B.GOLD_ORE, chunks * 2, 8, 32);
  ore(B.REDSTONE_ORE, chunks * 8, 7, 16);
  ore(B.DIAMOND_ORE, chunks * 1.2, 7, 16);
  ore(B.LAPIS_ORE, chunks * 1.2, 6, 32);
  progress && progress(0.55);

  // ---------------------------------------------------- lakes
  for (let n = 0; n < 14; n++) {
    const cx = 16 + ((r() * (WX - 32)) | 0), cz = 16 + ((r() * (WZ - 32)) | 0);
    const lava = r() < 0.15;
    const sy = world.surfaceY(cx, cz);
    if (sy <= SEA + 1 || sy > 100) continue;
    const bm = biomes[(cx << 8) | cz];
    if (!lava && bm === BIOME.DESERT) continue;
    const rad = 3 + r() * 4;
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
      const d = Math.sqrt(dx * dx + dz * dz) + nS.noise2((cx + dx) / 4, (cz + dz) / 4) * 2;
      if (d > rad) continue;
      const x = cx + dx, z = cz + dz;
      const depth = Math.max(1, Math.round((rad - d) * 0.7));
      for (let y = sy; y > sy - depth; y--) world.rawSet(x, y, z, lava ? B.STILL_LAVA : B.STILL_WATER);
      for (let y = sy + 1; y < sy + 6; y++) world.rawSet(x, y, z, 0);
      if (lava) world.rawSet(x, sy - depth, z, B.STONE);
    }
  }

  // ---------------------------------------------------- trees & plants
  const isSoil = (id) => id === B.GRASS || id === B.DIRT;
  for (let x = 2; x < WX - 2; x++) for (let z = 2; z < WZ - 2; z++) {
    const col = (x << 8) | z;
    const bm = biomes[col];
    const y = world.surfaceY(x, z);
    const ground = world.getBlock(x, y, z);
    const above = world.getBlock(x, y + 1, z);
    if (above !== 0 && above !== B.SNOW_LAYER) continue;
    const forestN = nM.noise2(x / 30, z / 30);
    let treeChance = bm === BIOME.FOREST ? 0.045 + forestN * 0.03 : bm === BIOME.PLAINS ? 0.003 : bm === BIOME.TAIGA ? 0.03 : bm === BIOME.SWAMP ? 0.012 : 0;
    if (isSoil(ground) && r() < treeChance) {
      let type = 0;
      if (bm === BIOME.TAIGA) type = 1; else if (bm === BIOME.FOREST && r() < 0.25) type = 2;
      if (above === B.SNOW_LAYER) world.rawSet(x, y + 1, z, 0);
      growTree(world, x, y + 1, z, type, r);
      continue;
    }
    if (ground === B.GRASS) {
      const p = r();
      if (bm === BIOME.PLAINS && p < 0.12) world.rawSet(x, y + 1, z, B.TALLGRASS, 1);
      else if (bm === BIOME.FOREST && p < 0.05) world.rawSet(x, y + 1, z, B.TALLGRASS, 1);
      else if (bm === BIOME.SWAMP && p < 0.08) world.rawSet(x, y + 1, z, B.TALLGRASS, 1);
      else if (p < 0.135 && p >= 0.128 && bm !== BIOME.TAIGA) world.rawSet(x, y + 1, z, nS.noise2(x / 20, z / 20) > 0 ? B.DANDELION : B.ROSE);
      else if (p > 0.996 && (bm === BIOME.FOREST || bm === BIOME.SWAMP)) world.rawSet(x, y + 1, z, r() < 0.5 ? B.BROWN_MUSHROOM : B.RED_MUSHROOM);
    } else if (ground === B.SAND && bm === BIOME.DESERT) {
      const p = r();
      if (p < 0.006) { const hgt = 1 + ((r() * 3) | 0); for (let k = 1; k <= hgt; k++) world.rawSet(x, y + k, z, B.CACTUS); }
    }
    // sugar cane next to water
    if ((ground === B.GRASS || ground === B.SAND || ground === B.DIRT) && y === SEA && r() < 0.12) {
      const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => world.getBlock(x + dx, y, z + dz) === B.STILL_WATER);
      if (nearWater) { const hgt = 1 + ((r() * 3) | 0); for (let k = 1; k <= hgt; k++) world.rawSet(x, y + k, z, B.SUGARCANE); }
    }
  }
  // underground mushrooms
  for (let n = 0; n < 400; n++) {
    const x = (r() * WX) | 0, z = (r() * WZ) | 0, y = 10 + ((r() * 50) | 0);
    if (world.getBlock(x, y, z) === 0 && world.getBlock(x, y - 1, z) === B.STONE) world.rawSet(x, y, z, r() < 0.5 ? B.BROWN_MUSHROOM : B.RED_MUSHROOM);
  }
  progress && progress(0.7);

  // ---------------------------------------------------- spawn point
  let best = null;
  for (let rad = 0; rad < 120 && !best; rad += 2) {
    for (let a = 0; a < 16 && !best; a++) {
      const x = Math.round(128 + Math.cos(a / 16 * Math.PI * 2) * rad), z = Math.round(128 + Math.sin(a / 16 * Math.PI * 2) * rad);
      const y = world.surfaceY(x, z);
      const g = world.getBlock(x, y, z);
      if ((g === B.GRASS || g === B.SAND) && y >= SEA) best = [x + 0.5, y + 1, z + 0.5];
    }
  }
  world.spawn = best || [128.5, world.surfaceY(128, 128) + 1, 128.5];
  world.fullLight();
  progress && progress(1);
}

export function generateFlat(world, seed) {
  world.seed = seed;
  for (let x = 0; x < WX; x++) for (let z = 0; z < WZ; z++) {
    const base = ((x << 8) | z) << 7;
    world.blocks[base] = B.BEDROCK;
    for (let y = 1; y < 3; y++) world.blocks[base + y] = B.DIRT;
    world.blocks[base + 3] = B.GRASS;
  }
  world.spawn = [128.5, 4, 128.5];
  world.fullLight();
}

export function growTree(world, x, y, z, type, r) {
  const set = (xx, yy, zz, id, m) => {
    if (!world.inBounds(xx, yy, zz)) return;
    const cur = world.getBlock(xx, yy, zz);
    if (id === B.LEAVES && cur !== 0 && cur !== B.SNOW_LAYER && cur !== B.TALLGRASS) return;
    world.rawSet(xx, yy, zz, id, m);
  };
  if (y + 8 >= WY) return false;
  if (type === 1) {
    const h = 6 + ((r() * 4) | 0);
    for (let k = 0; k < h; k++) set(x, y + k, z, B.LOG, 1);
    let rad = 0;
    for (let yy = y + h; yy >= y + 2; yy--) {
      for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
        if (Math.abs(dx) === rad && Math.abs(dz) === rad && rad > 0) continue;
        if (dx === 0 && dz === 0 && yy < y + h) continue;
        set(x + dx, yy, z + dz, B.LEAVES, 1);
      }
      rad = rad >= 2 ? 1 : rad + 1;
    }
    set(x, y + h, z, B.LEAVES, 1);
    return true;
  }
  const h = 4 + ((r() * 3) | 0) + (type === 2 ? 1 : 0);
  const m = type === 2 ? 2 : 0;
  for (let yy = y + h - 3; yy <= y + h; yy++) {
    const rad = yy >= y + h - 1 ? 1 : 2;
    for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
      if (Math.abs(dx) === rad && Math.abs(dz) === rad && (yy === y + h || r() < 0.5)) continue;
      set(x + dx, yy, z + dz, B.LEAVES, m);
    }
  }
  for (let k = 0; k < h; k++) world.rawSet(x, y + k, z, B.LOG, m);
  if (world.getBlock(x, y - 1, z) === B.GRASS) world.rawSet(x, y - 1, z, B.DIRT);
  return true;
}
