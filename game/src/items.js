// Items, recipes and smelting.
import { B, blocks, blockName } from './blocks.js';
import { tex } from './textures.js';

export const I = {
  IRON_SHOVEL: 256, IRON_PICKAXE: 257, IRON_AXE: 258, FLINT_STEEL: 259, APPLE: 260, BOW: 261, ARROW: 262,
  COAL: 263, DIAMOND: 264, IRON_INGOT: 265, GOLD_INGOT: 266, IRON_SWORD: 267,
  WOOD_SWORD: 268, WOOD_SHOVEL: 269, WOOD_PICKAXE: 270, WOOD_AXE: 271,
  STONE_SWORD: 272, STONE_SHOVEL: 273, STONE_PICKAXE: 274, STONE_AXE: 275,
  DIAMOND_SWORD: 276, DIAMOND_SHOVEL: 277, DIAMOND_PICKAXE: 278, DIAMOND_AXE: 279,
  STICK: 280, BOWL: 281, MUSHROOM_STEW: 282, GOLD_SWORD: 283, GOLD_SHOVEL: 284, GOLD_PICKAXE: 285, GOLD_AXE: 286,
  STRING: 287, FEATHER: 288, GUNPOWDER: 289, WOOD_HOE: 290, STONE_HOE: 291, IRON_HOE: 292, DIAMOND_HOE: 293, GOLD_HOE: 294,
  SEEDS: 295, WHEAT: 296, BREAD: 297, FLINT: 318, PORKCHOP: 319, COOKED_PORKCHOP: 320, PAINTING: 321,
  DOOR: 324, SNOWBALL: 332, LEATHER: 334, BRICK: 336, CLAY_BALL: 337, SUGARCANE: 338, PAPER: 339, BOOK: 340,
  EGG: 344, GLOWSTONE_DUST: 348, DYE: 351, BONE: 352, SUGAR: 353, BED: 355, SHEARS: 359,
  MELON_SLICE: 360, PUMPKIN_SEEDS: 361, MELON_SEEDS: 362, BEEF: 363, STEAK: 364, CHICKEN: 365, COOKED_CHICKEN: 366
};

export const items = new Map();

const TIERS = {
  wood: { tier: 0, speed: 2, dur: 60, dmg: 4 }, stone: { tier: 1, speed: 4, dur: 132, dmg: 5 },
  iron: { tier: 2, speed: 6, dur: 251, dmg: 6 }, diamond: { tier: 3, speed: 8, dur: 1562, dmg: 7 },
  gold: { tier: 0, speed: 12, dur: 33, dmg: 4 }
};

function item(id, name, icon, props = {}) {
  const it = Object.assign({ id, name, icon, maxStack: 64 }, props);
  items.set(id, it);
  return it;
}

const toolIds = {
  wood: [I.WOOD_SWORD, I.WOOD_SHOVEL, I.WOOD_PICKAXE, I.WOOD_AXE, I.WOOD_HOE],
  stone: [I.STONE_SWORD, I.STONE_SHOVEL, I.STONE_PICKAXE, I.STONE_AXE, I.STONE_HOE],
  iron: [I.IRON_SWORD, I.IRON_SHOVEL, I.IRON_PICKAXE, I.IRON_AXE, I.IRON_HOE],
  gold: [I.GOLD_SWORD, I.GOLD_SHOVEL, I.GOLD_PICKAXE, I.GOLD_AXE, I.GOLD_HOE],
  diamond: [I.DIAMOND_SWORD, I.DIAMOND_SHOVEL, I.DIAMOND_PICKAXE, I.DIAMOND_AXE, I.DIAMOND_HOE]
};
const matName = { wood: 'Wooden', stone: 'Stone', iron: 'Iron', gold: 'Golden', diamond: 'Diamond' };
const kinds = ['sword', 'shovel', 'pickaxe', 'axe', 'hoe'];
for (const m of Object.keys(toolIds)) {
  toolIds[m].forEach((id, k) => {
    const kind = kinds[k];
    const t = TIERS[m];
    item(id, `${matName[m]} ${kind[0].toUpperCase() + kind.slice(1)}`, `${m}_${kind}`, {
      maxStack: 1, tool: kind, tier: t.tier, speed: t.speed, durability: t.dur,
      damage: kind === 'sword' ? t.dmg : kind === 'axe' ? t.dmg - 1 : kind === 'pickaxe' ? t.dmg - 2 : t.dmg - 3
    });
  });
}
item(I.FLINT_STEEL, 'Flint and Steel', 'flint_steel', { maxStack: 1, durability: 65, use: 'ignite' });
item(I.APPLE, 'Apple', 'apple', { food: 4 });
item(I.BOW, 'Bow', 'bow', { maxStack: 1, durability: 385, use: 'bow' });
item(I.ARROW, 'Arrow', 'arrow');
item(I.COAL, 'Coal', 'coal');
item(I.DIAMOND, 'Diamond', 'diamond');
item(I.IRON_INGOT, 'Iron Ingot', 'iron_ingot');
item(I.GOLD_INGOT, 'Gold Ingot', 'gold_ingot');
item(I.STICK, 'Stick', 'stick');
item(I.BOWL, 'Bowl', 'bowl');
item(I.MUSHROOM_STEW, 'Mushroom Stew', 'mushroom_stew', { maxStack: 1, food: 10, leaves: I.BOWL });
item(I.STRING, 'String', 'string');
item(I.FEATHER, 'Feather', 'feather');
item(I.GUNPOWDER, 'Gunpowder', 'gunpowder');
item(I.SEEDS, 'Seeds', 'seeds', { plant: B.WHEAT });
item(I.WHEAT, 'Wheat', 'wheat');
item(I.BREAD, 'Bread', 'bread', { food: 5 });
item(I.FLINT, 'Flint', 'flint');
item(I.PORKCHOP, 'Raw Porkchop', 'porkchop_raw', { food: 3 });
item(I.COOKED_PORKCHOP, 'Cooked Porkchop', 'porkchop_cooked', { food: 8 });
item(I.PAINTING, 'Painting', 'painting', { use: 'painting' });
item(I.DOOR, 'Wooden Door', 'door_item', { maxStack: 1, use: 'door' });
item(I.SNOWBALL, 'Snowball', 'snowball', { maxStack: 16, use: 'throw' });
item(I.LEATHER, 'Leather', 'leather');
item(I.BRICK, 'Brick', 'brick');
item(I.CLAY_BALL, 'Clay', 'clay_ball');
item(I.SUGARCANE, 'Sugar Canes', 'sugarcane_item', { plantCane: true });
item(I.PAPER, 'Paper', 'paper');
item(I.BOOK, 'Book', 'book');
item(I.EGG, 'Egg', 'egg', { maxStack: 16, use: 'throw' });
item(I.GLOWSTONE_DUST, 'Glowstone Dust', 'glowstone_dust');
item(I.BONE, 'Bone', 'bone');
item(I.SUGAR, 'Sugar', 'sugar');
item(I.BED, 'Bed', 'bed_item', { maxStack: 1, use: 'bed' });
item(I.SHEARS, 'Shears', 'shears', { maxStack: 1, durability: 238, tool: 'shears', speed: 5 });
item(I.MELON_SLICE, 'Melon', 'melon_slice', { food: 2 });
item(I.PUMPKIN_SEEDS, 'Pumpkin Seeds', 'pumpkin_seeds', { plant: B.PUMPKIN_STEM });
item(I.MELON_SEEDS, 'Melon Seeds', 'melon_seeds', { plant: B.MELON_STEM });
item(I.BEEF, 'Raw Beef', 'beef_raw', { food: 3 });
item(I.STEAK, 'Steak', 'steak', { food: 8 });
item(I.CHICKEN, 'Raw Chicken', 'chicken_raw', { food: 2 });
item(I.COOKED_CHICKEN, 'Cooked Chicken', 'chicken_cooked', { food: 6 });
export const DYE_NAMES = ['Ink Sac', 'Rose Red', 'Cactus Green', 'Cocoa Beans', 'Lapis Lazuli', 'Purple Dye', 'Cyan Dye', 'Light Gray Dye', 'Gray Dye', 'Pink Dye', 'Lime Dye', 'Dandelion Yellow', 'Light Blue Dye', 'Magenta Dye', 'Orange Dye', 'Bone Meal'];
item(I.DYE, 'Dye', 'dye_0', { iconFn: (m) => 'dye_' + (m & 15), nameFn: (m) => DYE_NAMES[m & 15] });

export function isBlockItem(id) { return id > 0 && id < 256 && !!blocks[id]; }
export function getItem(id) { return items.get(id); }

export function itemName(id, meta = 0) {
  if (id < 256) return blockName(id, meta);
  const it = items.get(id);
  if (!it) return 'Unknown';
  return it.nameFn ? it.nameFn(meta) : it.name;
}
export function maxStack(id) {
  if (id < 256) return 64;
  const it = items.get(id);
  return it ? it.maxStack : 64;
}
export function itemIconTile(id, meta = 0) {
  const it = items.get(id);
  if (!it) return 0;
  return tex(it.iconFn ? it.iconFn(meta) : it.icon);
}
// Blocks that show as a flat sprite in inventory (instead of iso cube)
export function blockIconIsFlat(id) {
  const b = blocks[id];
  if (!b) return true;
  return [2, 3, 8, 12, 15, 7, 18, 17].includes(b.render);
}

// ---------------------------------------------------------------- recipes
// ingredient: [id, count, meta|-1]
export const recipes = [];
function rec(cat, out, ins, table = true) { recipes.push({ id: recipes.length, cat, out, in: ins, table }); }
const ANY = -1;

rec('Blocks', [B.PLANKS, 4, 0], [[B.LOG, 1, ANY]], false);
rec('Items', [I.STICK, 4, 0], [[B.PLANKS, 2, ANY]], false);
rec('Blocks', [B.WORKBENCH, 1, 0], [[B.PLANKS, 4, ANY]], false);
rec('Blocks', [B.TORCH, 4, 0], [[I.STICK, 1, 0], [I.COAL, 1, ANY]], false);
rec('Blocks', [B.SANDSTONE, 1, 0], [[B.SAND, 4, 0]], false);
rec('Blocks', [B.STONE_BRICKS, 4, 0], [[B.STONE, 4, 0]], false);
rec('Blocks', [B.WOOL, 1, 0], [[I.STRING, 4, 0]], false);
rec('Blocks', [B.SNOW, 1, 0], [[I.SNOWBALL, 4, 0]], false);
rec('Blocks', [B.CLAY, 1, 0], [[I.CLAY_BALL, 4, 0]], false);
rec('Blocks', [B.BRICKS, 1, 0], [[I.BRICK, 4, 0]], false);
rec('Blocks', [B.GLOWSTONE, 1, 0], [[I.GLOWSTONE_DUST, 4, 0]], false);
rec('Blocks', [B.FURNACE, 1, 0], [[B.COBBLE, 8, 0]]);
rec('Blocks', [B.CHEST, 1, 0], [[B.PLANKS, 8, ANY]]);
rec('Blocks', [B.TNT, 1, 0], [[I.GUNPOWDER, 5, 0], [B.SAND, 4, 0]]);
rec('Blocks', [B.BOOKSHELF, 1, 0], [[B.PLANKS, 6, ANY], [I.BOOK, 3, 0]]);
rec('Blocks', [B.GOLD_BLOCK, 1, 0], [[I.GOLD_INGOT, 9, 0]]);
rec('Blocks', [B.IRON_BLOCK, 1, 0], [[I.IRON_INGOT, 9, 0]]);
rec('Blocks', [B.DIAMOND_BLOCK, 1, 0], [[I.DIAMOND, 9, 0]]);
rec('Blocks', [B.LAPIS_BLOCK, 1, 0], [[I.DYE, 9, 4]]);
rec('Blocks', [B.MELON, 1, 0], [[I.MELON_SLICE, 9, 0]]);
rec('Blocks', [B.REACTOR, 1, 0], [[I.DIAMOND, 3, 0], [I.IRON_INGOT, 6, 0]]);
rec('Items', [I.GOLD_INGOT, 9, 0], [[B.GOLD_BLOCK, 1, 0]]);
rec('Items', [I.IRON_INGOT, 9, 0], [[B.IRON_BLOCK, 1, 0]]);
rec('Items', [I.DIAMOND, 9, 0], [[B.DIAMOND_BLOCK, 1, 0]]);
rec('Items', [I.DYE, 9, 4], [[B.LAPIS_BLOCK, 1, 0]]);
const slabMats = [[B.STONE, 0], [B.SANDSTONE, 1], [B.PLANKS, 2], [B.COBBLE, 3], [B.BRICKS, 4], [B.STONE_BRICKS, 5]];
for (const [mat, m] of slabMats) rec('Blocks', [B.SLAB, 6, m], [[mat, 3, mat === B.PLANKS ? ANY : 0]]);
const stairMats = [[B.PLANKS, B.WOOD_STAIRS], [B.COBBLE, B.COBBLE_STAIRS], [B.BRICKS, B.BRICK_STAIRS], [B.STONE_BRICKS, B.STONEBRICK_STAIRS], [B.SANDSTONE, B.SANDSTONE_STAIRS], [B.NETHER_BRICK, B.NETHERBRICK_STAIRS]];
for (const [mat, s] of stairMats) rec('Blocks', [s, 4, 0], [[mat, 6, mat === B.PLANKS ? ANY : 0]]);
rec('Decoration', [B.FENCE, 2, 0], [[I.STICK, 6, 0]]);
rec('Decoration', [B.FENCE_GATE, 1, 0], [[I.STICK, 4, 0], [B.PLANKS, 2, ANY]]);
rec('Decoration', [B.LADDER, 3, 0], [[I.STICK, 7, 0]]);
rec('Decoration', [I.DOOR, 1, 0], [[B.PLANKS, 6, ANY]]);
rec('Decoration', [B.TRAPDOOR, 2, 0], [[B.PLANKS, 6, ANY]]);
rec('Decoration', [I.BED, 1, 0], [[B.WOOL, 3, ANY], [B.PLANKS, 3, ANY]]);
rec('Decoration', [I.PAINTING, 1, 0], [[I.STICK, 8, 0], [B.WOOL, 1, ANY]]);
for (let c = 1; c < 16; c++) rec('Decoration', [B.WOOL, 1, c], [[I.DYE, 1, 15 - c], [B.WOOL, 1, 0]], false);
const toolMats = { wood: [B.PLANKS, ANY], stone: [B.COBBLE, 0], iron: [I.IRON_INGOT, 0], gold: [I.GOLD_INGOT, 0], diamond: [I.DIAMOND, 0] };
for (const m of Object.keys(toolMats)) {
  const [mat, mm] = toolMats[m];
  const [sw, sh, pk, ax, ho] = toolIds[m];
  rec('Tools', [pk, 1, 0], [[mat, 3, mm], [I.STICK, 2, 0]]);
  rec('Tools', [ax, 1, 0], [[mat, 3, mm], [I.STICK, 2, 0]]);
  rec('Tools', [sh, 1, 0], [[mat, 1, mm], [I.STICK, 2, 0]]);
  rec('Tools', [ho, 1, 0], [[mat, 2, mm], [I.STICK, 2, 0]]);
  rec('Tools', [sw, 1, 0], [[mat, 2, mm], [I.STICK, 1, 0]]);
}
rec('Tools', [I.BOW, 1, 0], [[I.STICK, 3, 0], [I.STRING, 3, 0]]);
rec('Tools', [I.ARROW, 4, 0], [[I.FLINT, 1, 0], [I.STICK, 1, 0], [I.FEATHER, 1, 0]]);
rec('Tools', [I.SHEARS, 1, 0], [[I.IRON_INGOT, 2, 0]], false);
rec('Tools', [I.FLINT_STEEL, 1, 0], [[I.IRON_INGOT, 1, 0], [I.FLINT, 1, 0]], false);
rec('Items', [I.BOWL, 4, 0], [[B.PLANKS, 3, ANY]]);
rec('Food', [I.BREAD, 1, 0], [[I.WHEAT, 3, 0]]);
rec('Food', [I.MUSHROOM_STEW, 1, 0], [[I.BOWL, 1, 0], [B.BROWN_MUSHROOM, 1, 0], [B.RED_MUSHROOM, 1, 0]], false);
rec('Items', [I.SUGAR, 1, 0], [[I.SUGARCANE, 1, 0]], false);
rec('Items', [I.PAPER, 3, 0], [[I.SUGARCANE, 3, 0]]);
rec('Items', [I.BOOK, 1, 0], [[I.PAPER, 3, 0]], false);
rec('Items', [I.PUMPKIN_SEEDS, 4, 0], [[B.PUMPKIN, 1, 0]], false);
rec('Items', [I.MELON_SEEDS, 1, 0], [[I.MELON_SLICE, 1, 0]], false);
rec('Items', [I.DYE, 3, 15], [[I.BONE, 1, 0]], false);
rec('Items', [I.DYE, 2, 1], [[B.ROSE, 1, 0]], false);
rec('Items', [I.DYE, 2, 11], [[B.DANDELION, 1, 0]], false);
rec('Items', [I.DYE, 2, 14], [[I.DYE, 1, 1], [I.DYE, 1, 11]], false);
rec('Items', [I.DYE, 2, 9], [[I.DYE, 1, 1], [I.DYE, 1, 15]], false);
rec('Items', [I.DYE, 2, 10], [[I.DYE, 1, 2], [I.DYE, 1, 15]], false);
rec('Items', [I.DYE, 2, 8], [[I.DYE, 1, 0], [I.DYE, 1, 15]], false);
rec('Items', [I.DYE, 2, 7], [[I.DYE, 1, 8], [I.DYE, 1, 15]], false);
rec('Items', [I.DYE, 2, 12], [[I.DYE, 1, 4], [I.DYE, 1, 15]], false);
rec('Items', [I.DYE, 2, 6], [[I.DYE, 1, 4], [I.DYE, 1, 2]], false);
rec('Items', [I.DYE, 2, 5], [[I.DYE, 1, 4], [I.DYE, 1, 1]], false);
rec('Items', [I.DYE, 2, 13], [[I.DYE, 1, 5], [I.DYE, 1, 9]], false);

// ---------------------------------------------------------------- smelting
export const smelting = new Map([
  [B.COBBLE, [B.STONE, 1, 0]], [B.SAND, [B.GLASS, 1, 0]], [B.IRON_ORE, [I.IRON_INGOT, 1, 0]], [B.GOLD_ORE, [I.GOLD_INGOT, 1, 0]],
  [B.LOG, [I.COAL, 1, 1]], [B.CACTUS, [I.DYE, 1, 2]], [I.PORKCHOP, [I.COOKED_PORKCHOP, 1, 0]], [I.BEEF, [I.STEAK, 1, 0]],
  [I.CHICKEN, [I.COOKED_CHICKEN, 1, 0]], [I.CLAY_BALL, [I.BRICK, 1, 0]], [B.DIAMOND_ORE, [I.DIAMOND, 1, 0]],
  [B.NETHERRACK, [B.NETHER_BRICK, 1, 0]], [B.COAL_ORE, [I.COAL, 1, 0]], [B.LAPIS_ORE, [I.DYE, 1, 4]]
]);
// fuel burn time in ticks (20/s)
export function fuelTime(id) {
  if (id === I.COAL) return 1600;
  if (id === B.LOG || id === B.PLANKS || id === B.WORKBENCH || id === B.CHEST || id === B.BOOKSHELF || id === B.FENCE || id === B.WOOD_STAIRS || id === B.TRAPDOOR || id === B.FENCE_GATE) return 300;
  if (id === B.SLAB) return 150;
  if (id === I.STICK || id === B.SAPLING || id === I.BOWL) return 100;
  if (id === I.WOOD_AXE || id === I.WOOD_PICKAXE || id === I.WOOD_SHOVEL || id === I.WOOD_SWORD || id === I.WOOD_HOE || id === I.BOW) return 200;
  if (id === B.LAVA || id === B.STILL_LAVA) return 20000;
  return 0;
}

// ---------------------------------------------------------------- creative inventory order
export const CREATIVE = [];
function cr(id, meta = 0) { CREATIVE.push([id, meta]); }
[B.STONE, B.COBBLE, B.MOSSY_COBBLE, B.STONE_BRICKS, B.BRICKS, B.SANDSTONE, B.GRASS, B.DIRT, B.SAND, B.GRAVEL, B.CLAY,
  B.PLANKS].forEach((i) => cr(i));
[0, 1, 2].forEach((m) => cr(B.LOG, m));
[0, 1, 2].forEach((m) => cr(B.LEAVES, m));
[B.GLASS, B.OBSIDIAN, B.BEDROCK, B.NETHERRACK, B.NETHER_BRICK, B.GLOWSTONE, B.GLOWING_OBSIDIAN, B.REACTOR,
  B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE, B.DIAMOND_ORE, B.LAPIS_ORE, B.REDSTONE_ORE,
  B.IRON_BLOCK, B.GOLD_BLOCK, B.DIAMOND_BLOCK, B.LAPIS_BLOCK, B.SNOW, B.ICE, B.SNOW_LAYER, B.CACTUS, B.PUMPKIN, B.MELON,
  B.TNT, B.BOOKSHELF, B.WORKBENCH, B.FURNACE, B.CHEST].forEach((i) => cr(i));
for (let m = 0; m < 6; m++) cr(B.SLAB, m);
[B.WOOD_STAIRS, B.COBBLE_STAIRS, B.BRICK_STAIRS, B.STONEBRICK_STAIRS, B.SANDSTONE_STAIRS, B.NETHERBRICK_STAIRS,
  B.FENCE, B.FENCE_GATE, B.LADDER, B.TRAPDOOR, I.DOOR, I.BED, I.PAINTING, B.TORCH].forEach((i) => cr(i));
for (let m = 0; m < 16; m++) cr(B.WOOL, m);
[0, 1, 2].forEach((m) => cr(B.SAPLING, m));
[B.TALLGRASS, B.DEADBUSH, B.DANDELION, B.ROSE, B.BROWN_MUSHROOM, B.RED_MUSHROOM, B.COBWEB, I.SUGARCANE, I.SEEDS, I.PUMPKIN_SEEDS, I.MELON_SEEDS].forEach((i) => cr(i));
for (const m of ['wood', 'stone', 'iron', 'gold', 'diamond']) toolIds[m].forEach((i) => cr(i));
[I.BOW, I.ARROW, I.SHEARS, I.FLINT_STEEL, I.SNOWBALL, I.EGG, I.COAL, I.IRON_INGOT, I.GOLD_INGOT, I.DIAMOND, I.STICK, I.BOWL,
  I.STRING, I.FEATHER, I.GUNPOWDER, I.FLINT, I.LEATHER, I.BRICK, I.CLAY_BALL, I.PAPER, I.BOOK, I.GLOWSTONE_DUST, I.BONE, I.SUGAR,
  I.WHEAT, I.APPLE, I.BREAD, I.MUSHROOM_STEW, I.MELON_SLICE, I.PORKCHOP, I.COOKED_PORKCHOP, I.BEEF, I.STEAK, I.CHICKEN, I.COOKED_CHICKEN].forEach((i) => cr(i));
for (let m = 0; m < 16; m++) cr(I.DYE, m);

// ---------------------------------------------------------------- inventory
export class Inventory {
  constructor(size) { this.size = size; this.slots = new Array(size).fill(null); }
  // slot: {id, count, meta, dmg}
  add(id, count, meta = 0, dmg = 0) {
    const ms = maxStack(id);
    for (let i = 0; i < this.size && count > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.meta === meta && s.count < ms && !s.dmg && !dmg) {
        const n = Math.min(ms - s.count, count); s.count += n; count -= n;
      }
    }
    for (let i = 0; i < this.size && count > 0; i++) {
      if (!this.slots[i]) { const n = Math.min(ms, count); this.slots[i] = { id, count: n, meta, dmg }; count -= n; }
    }
    return count; // leftover
  }
  count(id, meta = -1) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id && (meta < 0 || s.meta === meta)) n += s.count;
    return n;
  }
  remove(id, count, meta = -1) {
    for (let i = this.size - 1; i >= 0 && count > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id && (meta < 0 || s.meta === meta)) {
        const n = Math.min(s.count, count); s.count -= n; count -= n;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    return count === 0;
  }
  toJSON() { return this.slots.map((s) => (s ? [s.id, s.count, s.meta, s.dmg || 0] : 0)); }
  load(arr) {
    this.slots = new Array(this.size).fill(null);
    if (!arr) return;
    arr.forEach((s, i) => { if (s && i < this.size) this.slots[i] = { id: s[0], count: s[1], meta: s[2] || 0, dmg: s[3] || 0 }; });
  }
}

export function canCraft(inv, r, haveTable) {
  if (r.table && !haveTable) return false;
  for (const [id, n, m] of r.in) if (inv.count(id, m) < n) return false;
  return true;
}
