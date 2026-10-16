// Block registry. IDs follow the familiar numeric scheme so worlds are easy to reason about,
// but every behaviour here is an independent implementation.
import { tex, look050, terrainTile, tintedTerrain } from './textures.js';
import { TILES_050, TERRAIN_IDX_050, TINT_050 } from './pe050data.js';

export const B = {
  AIR: 0, STONE: 1, GRASS: 2, DIRT: 3, COBBLE: 4, PLANKS: 5, SAPLING: 6, BEDROCK: 7,
  WATER: 8, STILL_WATER: 9, LAVA: 10, STILL_LAVA: 11, SAND: 12, GRAVEL: 13,
  GOLD_ORE: 14, IRON_ORE: 15, COAL_ORE: 16, LOG: 17, LEAVES: 18, GLASS: 20,
  LAPIS_ORE: 21, LAPIS_BLOCK: 22, SANDSTONE: 24, BED: 26, COBWEB: 30, TALLGRASS: 31, DEADBUSH: 32,
  WOOL: 35, DANDELION: 37, ROSE: 38, BROWN_MUSHROOM: 39, RED_MUSHROOM: 40,
  GOLD_BLOCK: 41, IRON_BLOCK: 42, DOUBLE_SLAB: 43, SLAB: 44, BRICKS: 45, TNT: 46,
  BOOKSHELF: 47, MOSSY_COBBLE: 48, OBSIDIAN: 49, TORCH: 50, FIRE: 51, WOOD_STAIRS: 53, CHEST: 54,
  DIAMOND_ORE: 56, DIAMOND_BLOCK: 57, WORKBENCH: 58, WHEAT: 59, FARMLAND: 60,
  FURNACE: 61, LIT_FURNACE: 62, WOOD_DOOR: 64, LADDER: 65, COBBLE_STAIRS: 67,
  REDSTONE_ORE: 73, LIT_REDSTONE_ORE: 74, SNOW_LAYER: 78, ICE: 79, SNOW: 80, CACTUS: 81, CLAY: 82,
  SUGARCANE: 83, FENCE: 85, PUMPKIN: 86, NETHERRACK: 87, GLOWSTONE: 89, TRAPDOOR: 96,
  STONE_BRICKS: 98, GLASS_PANE: 102, MELON: 103, PUMPKIN_STEM: 104, MELON_STEM: 105, FENCE_GATE: 107,
  BRICK_STAIRS: 108, STONEBRICK_STAIRS: 109, NETHER_BRICK: 112, NETHERBRICK_STAIRS: 114,
  SANDSTONE_STAIRS: 128, GLOWING_OBSIDIAN: 246, REACTOR: 247, INVISIBLE_BEDROCK: 95
};

export const R = {
  NONE: 0, CUBE: 1, CROSS: 2, TORCH: 3, LIQUID: 4, SLAB: 5, STAIRS: 6, DOOR: 7, LADDER: 8,
  FENCE: 9, BED: 10, CACTUS: 11, CROPS: 12, FARMLAND: 13, SNOW: 14, STEM: 15, GATE: 16, TRAPDOOR: 17, FIRE: 18, PANE: 19
};

// face order: 0 down, 1 up, 2 north(-z), 3 south(+z), 4 west(-x), 5 east(+x)
export const FACE_DIRS = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];

export const blocks = new Array(256).fill(null);

const defaults = {
  render: R.CUBE, solid: true, opaque: true, lightOpacity: 15, light: 0, hardness: 1,
  tool: null, level: -1, pass: 0 /*0 opaque,1 cutout,2 translucent*/, replaceable: false,
  sound: 'stone', flammable: false, friction: 0.6, gravity: false, needsSupport: false
};

function reg(id, name, props) {
  const b = Object.assign({ id, name }, defaults, props);
  if (b.render !== R.CUBE && props.opaque === undefined) b.opaque = false;
  if (!b.opaque && props.lightOpacity === undefined) b.lightOpacity = (b.render === R.LIQUID) ? 2 : 0;
  blocks[id] = b;
  return b;
}

function texFn(spec) {
  if (typeof spec === 'string') { let t = -1; return () => (t < 0 ? (t = tex(spec)) : t); }
  if (typeof spec === 'function') return spec;
  const cache = {};
  const get = (n) => (cache[n] !== undefined ? cache[n] : (cache[n] = tex(n)));
  return (face) => get(face === 1 ? (spec.top || spec.side) : face === 0 ? (spec.bottom || spec.top || spec.side) : spec.side);
}

function dropSelf(id) { return (meta) => [[id, 1, 0]]; }

const T = (n) => tex(n);
const FACING_FRONT = { 2: 2, 3: 3, 4: 4, 5: 5 };

reg(B.AIR, 'Air', { render: R.NONE, solid: false, opaque: false, lightOpacity: 0, hardness: 0, replaceable: true });
reg(B.STONE, 'Stone', { tex: 'stone', hardness: 1.5, tool: 'pickaxe', level: 0, drop: () => [[B.COBBLE, 1, 0]] });
reg(B.GRASS, 'Grass Block', { tex: (f, m, snowy) => f === 1 ? T('grass_top') : f === 0 ? T('dirt') : T(snowy ? 'grass_side_snow' : 'grass_side'), hardness: 0.6, tool: 'shovel', sound: 'grass', drop: () => [[B.DIRT, 1, 0]], tintTop: true });
reg(B.DIRT, 'Dirt', { tex: 'dirt', hardness: 0.5, tool: 'shovel', sound: 'gravel' });
reg(B.COBBLE, 'Cobblestone', { tex: 'cobblestone', hardness: 2, tool: 'pickaxe', level: 0 });
reg(B.PLANKS, 'Wooden Planks', { tex: 'planks', hardness: 2, tool: 'axe', sound: 'wood', flammable: true });
reg(B.SAPLING, 'Sapling', { render: R.CROSS, solid: false, tex: (f, m) => T(['sapling_oak', 'sapling_spruce', 'sapling_birch'][m & 3] || 'sapling_oak'), hardness: 0, pass: 1, sound: 'grass', needsSupport: true, drop: (m) => [[B.SAPLING, 1, m & 3]], metaItem: true });
reg(B.BEDROCK, 'Bedrock', { tex: 'bedrock', hardness: -1 });
reg(B.INVISIBLE_BEDROCK, 'Invisible Bedrock', { render: R.NONE, tex: 'bedrock', hardness: -1, opaque: false, lightOpacity: 0 });
for (const [id, still, name] of [[B.WATER, false, 'Water'], [B.STILL_WATER, true, 'Water']]) {
  reg(id, name, { render: R.LIQUID, solid: false, tex: 'water', pass: 2, hardness: 100, replaceable: true, liquid: 'water', lightOpacity: 2, drop: () => [] });
}
for (const [id, still, name] of [[B.LAVA, false, 'Lava'], [B.STILL_LAVA, true, 'Lava']]) {
  reg(id, name, { render: R.LIQUID, solid: false, tex: 'lava', pass: 0, hardness: 100, replaceable: true, liquid: 'lava', light: 15, lightOpacity: 15, drop: () => [] });
}
reg(B.SAND, 'Sand', { tex: 'sand', hardness: 0.5, tool: 'shovel', sound: 'sand', gravity: true });
reg(B.GRAVEL, 'Gravel', { tex: 'gravel', hardness: 0.6, tool: 'shovel', sound: 'gravel', gravity: true, drop: (m, r) => r() < 0.1 ? [[318, 1, 0]] : [[B.GRAVEL, 1, 0]] });
reg(B.GOLD_ORE, 'Gold Ore', { tex: 'gold_ore', hardness: 3, tool: 'pickaxe', level: 2 });
reg(B.IRON_ORE, 'Iron Ore', { tex: 'iron_ore', hardness: 3, tool: 'pickaxe', level: 1 });
reg(B.COAL_ORE, 'Coal Ore', { tex: 'coal_ore', hardness: 3, tool: 'pickaxe', level: 0, drop: () => [[263, 1, 0]] });
reg(B.LOG, 'Wood', {
  tex: (f, m) => (f === 0 || f === 1) ? T('log_top') : T(['log_oak', 'log_spruce', 'log_birch'][m & 3] || 'log_oak'),
  hardness: 2, tool: 'axe', sound: 'wood', flammable: true, drop: (m) => [[B.LOG, 1, m & 3]], metaItem: true
});
reg(B.LEAVES, 'Leaves', {
  tex: (f, m) => T(['leaves_oak', 'leaves_spruce', 'leaves_birch'][m & 3] || 'leaves_oak'), opaque: false, lightOpacity: 1, pass: 1,
  hardness: 0.2, sound: 'grass', flammable: true, tool: 'shears', leaves: true,
  drop: (m, r) => { const d = []; if (r() < 0.05) d.push([B.SAPLING, 1, m & 3]); if ((m & 3) === 0 && r() < 0.005) d.push([260, 1, 0]); return d; },
  metaItem: true
});
reg(B.GLASS, 'Glass', { tex: 'glass', opaque: false, pass: 1, hardness: 0.3, sound: 'glass', drop: () => [] });
reg(B.LAPIS_ORE, 'Lapis Lazuli Ore', { tex: 'lapis_ore', hardness: 3, tool: 'pickaxe', level: 1, drop: (m, r) => [[351, 4 + ((r() * 5) | 0), 4]] });
reg(B.LAPIS_BLOCK, 'Lapis Lazuli Block', { tex: 'lapis_block', hardness: 3, tool: 'pickaxe', level: 1 });
reg(B.SANDSTONE, 'Sandstone', { tex: { top: 'sandstone_top', bottom: 'sandstone_bottom', side: 'sandstone_side' }, hardness: 0.8, tool: 'pickaxe', level: 0 });
reg(B.BED, 'Bed', { render: R.BED, solid: true, tex: 'bed_foot_top', hardness: 0.2, sound: 'wood', drop: () => [[355, 1, 0]], aabb: [0, 0, 0, 1, 9 / 16, 1] });
reg(B.COBWEB, 'Cobweb', { render: R.CROSS, solid: false, tex: 'cobweb', pass: 1, hardness: 4, tool: 'sword', drop: () => [[287, 1, 0]], web: true });
reg(B.TALLGRASS, 'Tall Grass', { render: R.CROSS, solid: false, tex: 'tallgrass', pass: 1, hardness: 0, replaceable: true, sound: 'grass', tint: true, needsSupport: true, drop: (m, r) => r() < 0.125 ? [[295, 1, 0]] : [] });
reg(B.DEADBUSH, 'Dead Bush', { render: R.CROSS, solid: false, tex: 'deadbush', pass: 1, hardness: 0, replaceable: true, sound: 'grass', needsSupport: true, drop: () => [] });
reg(B.WOOL, 'Wool', { tex: (f, m) => T(m ? 'wool_' + m : 'wool'), hardness: 0.8, sound: 'cloth', flammable: true, drop: (m) => [[B.WOOL, 1, m]], metaItem: true });
reg(B.DANDELION, 'Dandelion', { render: R.CROSS, solid: false, tex: 'dandelion', pass: 1, hardness: 0, sound: 'grass', needsSupport: true });
reg(B.ROSE, 'Rose', { render: R.CROSS, solid: false, tex: 'rose', pass: 1, hardness: 0, sound: 'grass', needsSupport: true });
reg(B.BROWN_MUSHROOM, 'Brown Mushroom', { render: R.CROSS, solid: false, tex: 'mushroom_brown', pass: 1, hardness: 0, light: 1, sound: 'grass', needsSupport: true });
reg(B.RED_MUSHROOM, 'Red Mushroom', { render: R.CROSS, solid: false, tex: 'mushroom_red', pass: 1, hardness: 0, sound: 'grass', needsSupport: true });
reg(B.GOLD_BLOCK, 'Block of Gold', { tex: 'gold_block', hardness: 3, tool: 'pickaxe', level: 2, sound: 'metal' });
reg(B.IRON_BLOCK, 'Block of Iron', { tex: 'iron_block', hardness: 5, tool: 'pickaxe', level: 1, sound: 'metal' });
const SLAB_TEX = [
  { top: 'stone', side: 'stone' }, { top: 'sandstone_top', side: 'sandstone_side', bottom: 'sandstone_bottom' }, { top: 'planks', side: 'planks' },
  { top: 'cobblestone', side: 'cobblestone' }, { top: 'bricks', side: 'bricks' }, { top: 'stone_bricks', side: 'stone_bricks' }
];
const slabTex = (f, m) => { const s = SLAB_TEX[m & 7] || SLAB_TEX[0]; return T(f === 1 ? s.top : f === 0 ? (s.bottom || s.top) : s.side); };
export const SLAB_NAMES = ['Stone Slab', 'Sandstone Slab', 'Wooden Slab', 'Cobblestone Slab', 'Brick Slab', 'Stone Brick Slab'];
reg(B.DOUBLE_SLAB, 'Double Slab', { tex: slabTex, hardness: 2, tool: 'pickaxe', level: 0, drop: (m) => [[B.SLAB, 2, m & 7]] });
reg(B.SLAB, 'Slab', { render: R.SLAB, tex: slabTex, hardness: 2, tool: 'pickaxe', level: 0, opaque: false, lightOpacity: 15, drop: (m) => [[B.SLAB, 1, m & 7]], metaItem: true, aabbFn: (m) => (m & 8) ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1] });
reg(B.BRICKS, 'Bricks', { tex: 'bricks', hardness: 2, tool: 'pickaxe', level: 0 });
reg(B.TNT, 'TNT', { tex: { top: 'tnt_top', bottom: 'tnt_bottom', side: 'tnt_side' }, hardness: 0, sound: 'grass', tnt: true });
reg(B.BOOKSHELF, 'Bookshelf', { tex: (f) => (f < 2 ? T('planks') : T('bookshelf')), hardness: 1.5, tool: 'axe', sound: 'wood', flammable: true, drop: () => [[340, 3, 0]] });
reg(B.MOSSY_COBBLE, 'Moss Stone', { tex: 'mossy_cobblestone', hardness: 2, tool: 'pickaxe', level: 0 });
reg(B.OBSIDIAN, 'Obsidian', { tex: 'obsidian', hardness: 10, tool: 'pickaxe', level: 3 });
reg(B.TORCH, 'Torch', { render: R.TORCH, solid: false, tex: 'torch', light: 14, hardness: 0, pass: 1, sound: 'wood', needsSupport: true, drop: () => [[B.TORCH, 1, 0]] });
reg(B.FIRE, 'Fire', { render: R.FIRE, solid: false, tex: 'fire', light: 15, hardness: 0, pass: 1, replaceable: true, drop: () => [], fire: true });
const stairs = (id, name, t, props = {}) => reg(id, name, Object.assign({ render: R.STAIRS, tex: typeof t === 'function' ? t : texFn(t), hardness: 2, tool: 'pickaxe', level: 0, lightOpacity: 15, drop: () => [[id, 1, 0]] }, props));
stairs(B.WOOD_STAIRS, 'Wooden Stairs', 'planks', { tool: 'axe', level: -1, sound: 'wood' });
stairs(B.COBBLE_STAIRS, 'Cobblestone Stairs', 'cobblestone');
stairs(B.BRICK_STAIRS, 'Brick Stairs', 'bricks');
stairs(B.STONEBRICK_STAIRS, 'Stone Brick Stairs', 'stone_bricks');
stairs(B.NETHERBRICK_STAIRS, 'Nether Brick Stairs', 'nether_bricks');
stairs(B.SANDSTONE_STAIRS, 'Sandstone Stairs', { top: 'sandstone_top', side: 'sandstone_side', bottom: 'sandstone_bottom' });
const facingTex = (front, side, top) => (f, m) => {
  const fr = (m & 7) || 3;
  if (f === 1 || f === 0) return T(top);
  return T(f === fr ? front : side);
};
reg(B.CHEST, 'Chest', { tex: facingTex('chest_front', 'chest_side', 'chest_top'), hardness: 2.5, tool: 'axe', sound: 'wood', container: 'chest', opaque: true });
reg(B.DIAMOND_ORE, 'Diamond Ore', { tex: 'diamond_ore', hardness: 3, tool: 'pickaxe', level: 2, drop: () => [[264, 1, 0]] });
reg(B.DIAMOND_BLOCK, 'Block of Diamond', { tex: 'diamond_block', hardness: 5, tool: 'pickaxe', level: 2, sound: 'metal' });
reg(B.WORKBENCH, 'Crafting Table', { tex: (f) => f === 1 ? T('crafting_top') : f === 0 ? T('planks') : (f === 2 || f === 4) ? T('crafting_front') : T('crafting_side'), hardness: 2.5, tool: 'axe', sound: 'wood', flammable: true });
reg(B.WHEAT, 'Crops', { render: R.CROPS, solid: false, tex: (f, m) => T('wheat_' + Math.min(7, m & 7)), pass: 1, hardness: 0, sound: 'grass', needsSupport: true, drop: (m, r) => (m & 7) >= 7 ? [[296, 1, 0], [295, 1 + ((r() * 3) | 0), 0]] : [[295, 1, 0]] });
reg(B.FARMLAND, 'Farmland', { render: R.FARMLAND, tex: (f, m) => f === 1 ? T(m > 0 ? 'farmland_wet' : 'farmland_dry') : T('dirt'), hardness: 0.6, tool: 'shovel', sound: 'gravel', lightOpacity: 15, drop: () => [[B.DIRT, 1, 0]], aabb: [0, 0, 0, 1, 15 / 16, 1] });
reg(B.FURNACE, 'Furnace', { tex: facingTex('furnace_front', 'furnace_side', 'furnace_top'), hardness: 3.5, tool: 'pickaxe', level: 0, container: 'furnace' });
reg(B.LIT_FURNACE, 'Furnace', { tex: facingTex('furnace_front_lit', 'furnace_side', 'furnace_top'), hardness: 3.5, tool: 'pickaxe', level: 0, light: 13, container: 'furnace', drop: () => [[B.FURNACE, 1, 0]] });
reg(B.WOOD_DOOR, 'Wooden Door', { render: R.DOOR, tex: (f, m) => T((m & 8) ? 'door_wood_upper' : 'door_wood_lower'), hardness: 3, tool: 'axe', sound: 'wood', pass: 1, drop: (m) => (m & 8) ? [] : [[324, 1, 0]], door: true });
reg(B.LADDER, 'Ladder', { render: R.LADDER, solid: false, tex: 'ladder', hardness: 0.4, tool: 'axe', pass: 1, sound: 'wood', climbable: true, needsSupport: true });
reg(B.REDSTONE_ORE, 'Redstone Ore', { tex: 'redstone_ore', hardness: 3, tool: 'pickaxe', level: 2, drop: () => [] });
reg(B.LIT_REDSTONE_ORE, 'Redstone Ore', { tex: 'redstone_ore', hardness: 3, tool: 'pickaxe', level: 2, light: 9, drop: () => [] });
reg(B.SNOW_LAYER, 'Snow', { render: R.SNOW, solid: false, tex: 'snow', hardness: 0.1, tool: 'shovel', replaceable: true, sound: 'cloth', needsSupport: true, drop: () => [[332, 1, 0]] });
reg(B.ICE, 'Ice', { tex: 'ice', opaque: false, pass: 2, lightOpacity: 3, hardness: 0.5, tool: 'pickaxe', sound: 'glass', friction: 0.98, drop: () => [] });
reg(B.SNOW, 'Snow Block', { tex: 'snow', hardness: 0.2, tool: 'shovel', sound: 'cloth', drop: () => [[332, 4, 0]] });
reg(B.CACTUS, 'Cactus', { render: R.CACTUS, tex: { top: 'cactus_top', bottom: 'cactus_bottom', side: 'cactus_side' }, hardness: 0.4, sound: 'cloth', pass: 1, lightOpacity: 0, aabb: [1 / 16, 0, 1 / 16, 15 / 16, 15 / 16, 15 / 16], cactus: true, needsSupport: true, drop: () => [[B.CACTUS, 1, 0]] });
reg(B.CLAY, 'Clay', { tex: 'clay', hardness: 0.6, tool: 'shovel', sound: 'gravel', drop: () => [[337, 4, 0]] });
reg(B.SUGARCANE, 'Sugar Cane', { render: R.CROSS, solid: false, tex: 'sugarcane', pass: 1, hardness: 0, sound: 'grass', tint: false, needsSupport: true, drop: () => [[338, 1, 0]] });
reg(B.FENCE, 'Fence', { render: R.FENCE, tex: 'planks', hardness: 2, tool: 'axe', sound: 'wood', lightOpacity: 0, fence: true });
reg(B.PUMPKIN, 'Pumpkin', { tex: facingTex('pumpkin_face', 'pumpkin_side', 'pumpkin_top'), hardness: 1, tool: 'axe', sound: 'wood', drop: () => [[B.PUMPKIN, 1, 0]] });
reg(B.NETHERRACK, 'Netherrack', { tex: 'netherrack', hardness: 0.4, tool: 'pickaxe', level: 0 });
reg(B.GLOWSTONE, 'Glowstone', { tex: 'glowstone', hardness: 0.3, light: 15, sound: 'glass', drop: (m, r) => [[348, 2 + ((r() * 3) | 0), 0]] });
reg(B.TRAPDOOR, 'Trapdoor', { render: R.TRAPDOOR, tex: 'trapdoor', hardness: 3, tool: 'axe', sound: 'wood', pass: 1, lightOpacity: 0, trapdoor: true });
reg(B.STONE_BRICKS, 'Stone Bricks', { tex: 'stone_bricks', hardness: 1.5, tool: 'pickaxe', level: 0 });
reg(B.MELON, 'Melon', { tex: { top: 'melon_top', side: 'melon_side' }, hardness: 1, tool: 'axe', sound: 'wood', drop: (m, r) => [[360, 3 + ((r() * 5) | 0), 0]] });
reg(B.PUMPKIN_STEM, 'Pumpkin Stem', { render: R.STEM, solid: false, tex: (f, m) => T('stem_' + (m & 7)), pass: 1, hardness: 0, sound: 'grass', needsSupport: true, stem: B.PUMPKIN, drop: (m, r) => r() < (m & 7) / 15 + 0.1 ? [[361, 1, 0]] : [] });
reg(B.MELON_STEM, 'Melon Stem', { render: R.STEM, solid: false, tex: (f, m) => T('stem_' + (m & 7)), pass: 1, hardness: 0, sound: 'grass', needsSupport: true, stem: B.MELON, drop: (m, r) => r() < (m & 7) / 15 + 0.1 ? [[362, 1, 0]] : [] });
reg(B.FENCE_GATE, 'Fence Gate', { render: R.GATE, tex: 'planks', hardness: 2, tool: 'axe', sound: 'wood', lightOpacity: 0, gate: true, drop: () => [[B.FENCE_GATE, 1, 0]] });
reg(B.NETHER_BRICK, 'Nether Brick', { tex: 'nether_bricks', hardness: 2, tool: 'pickaxe', level: 0 });
reg(B.GLOWING_OBSIDIAN, 'Glowing Obsidian', { tex: 'glowing_obsidian', hardness: 10, tool: 'pickaxe', level: 3, light: 12, drop: () => [[B.OBSIDIAN, 1, 0]] });
reg(B.REACTOR, 'Nether Reactor Core', {
  tex: (f, m) => T(m === 1 ? 'reactor_core_active' : m === 2 ? 'reactor_core_used' : 'reactor_core'), hardness: 3, tool: 'pickaxe', level: 0,
  lightFn: (m) => (m === 1 ? 15 : 0), drop: () => [[264, 3, 0], [265, 6, 0]], reactor: true
});

reg(B.GLASS_PANE, 'Glass Pane', { render: R.PANE, tex: 'glass', opaque: false, pass: 1, lightOpacity: 0, hardness: 0.3, sound: 'glass', drop: () => [], pane: true });

// hardness values measured from the 0.5.0 build
for (const [id, [hard]] of Object.entries(TILES_050)) {
  const b = blocks[+id];
  if (b && b.hardness >= 0 && hard >= 0 && !b.liquid) b.hardness = hard;
}

// Original look (only when the player imported their own 0.5.0 APK): the terrain.png slot each
// face uses, following the table measured from the original getTexture(face, data).
const SUBST_050 = { 104: 105, 109: 98, 128: 24 }; // blocks 0.5.0 lacks -> closest original tile set
const T5 = terrainTile;
function tex050(id, f, m, snowy, proc) {
  switch (id) {
    case B.GRASS:
      if (f === 1) return tintedTerrain(0, TINT_050.grass);
      if (f > 1 && snowy) return T5(68);
      break;
    case B.LEAVES: {
      const d = m & 3;
      return tintedTerrain(d === 1 ? 132 : 52, TINT_050.leaves[d] || TINT_050.leaves[0]);
    }
    case B.TALLGRASS: return tintedTerrain(m === 2 ? 56 : 39, TINT_050.tallgrass);
    case B.CHEST: case B.FURNACE: case B.LIT_FURNACE: {
      const e = TERRAIN_IDX_050[id][0];
      if (f < 2) return T5(e[f]);
      return T5(f === ((m & 7) || 3) ? (id === B.LIT_FURNACE ? 61 : e[3]) : e[2]);
    }
    case B.WOOD_DOOR: return T5((m & 8) ? 81 : 97);
    case B.WHEAT: return T5(88 + Math.min(7, m & 7));
    case B.SLAB: case B.DOUBLE_SLAB: if ((m & 7) === 5) return T5(54); m &= 7; break;
    case B.PUMPKIN_STEM: case B.MELON_STEM: return T5(111);
    case B.REACTOR: return T5([234, 233, 232][m] || 234);
  }
  const e = TERRAIN_IDX_050[SUBST_050[id] || id];
  if (!e) return proc(f, m, snowy);
  const v = e[m] !== undefined ? e[m] : e[0];
  return T5(Array.isArray(v) ? v[f] : v);
}
export const STEM_CONNECTED_050 = () => T5(127);

// resolve tex specs to functions
for (const b of blocks) {
  if (!b) continue;
  const proc = b.tex ? texFn(b.tex) : () => 0;
  const id = b.id;
  b.texFn = (f, m, snowy) => (look050 ? tex050(id, f, m | 0, snowy, proc) : proc(f, m, snowy));
  if (!b.drop) b.drop = dropSelf(b.id);
}

// ---------------------------------------------------------------- fast lookup tables
export const OPAQUE = new Uint8Array(256);
export const SOLID = new Uint8Array(256);
export const LIGHT_OPACITY = new Uint8Array(256);
export const LIGHT_EMIT = new Uint8Array(256);
export const RENDER = new Uint8Array(256);
export const REPLACEABLE = new Uint8Array(256);
export const LIQUID = new Uint8Array(256); // 1 water, 2 lava
for (let i = 0; i < 256; i++) {
  const b = blocks[i];
  if (!b) { OPAQUE[i] = 1; SOLID[i] = 1; LIGHT_OPACITY[i] = 15; RENDER[i] = R.CUBE; continue; }
  OPAQUE[i] = b.opaque ? 1 : 0;
  SOLID[i] = b.solid ? 1 : 0;
  LIGHT_OPACITY[i] = b.lightOpacity;
  LIGHT_EMIT[i] = b.light;
  RENDER[i] = b.render;
  REPLACEABLE[i] = b.replaceable ? 1 : 0;
  LIQUID[i] = b.liquid === 'water' ? 1 : b.liquid === 'lava' ? 2 : 0;
}
export const isWater = (id) => id === B.WATER || id === B.STILL_WATER;
export const isLava = (id) => id === B.LAVA || id === B.STILL_LAVA;

export function blockName(id, meta) {
  if (id === B.SLAB || id === B.DOUBLE_SLAB) return SLAB_NAMES[meta & 7] || 'Slab';
  if (id === B.WOOL) return WOOL_NAMES[meta & 15] + ' Wool';
  if (id === B.LOG) return ['Oak Wood', 'Spruce Wood', 'Birch Wood'][meta & 3] || 'Wood';
  if (id === B.SAPLING) return ['Oak Sapling', 'Spruce Sapling', 'Birch Sapling'][meta & 3] || 'Sapling';
  if (id === B.LEAVES) return ['Oak Leaves', 'Spruce Leaves', 'Birch Leaves'][meta & 3] || 'Leaves';
  return blocks[id] ? blocks[id].name : 'Unknown';
}
export const WOOL_NAMES = ['White', 'Orange', 'Magenta', 'Light Blue', 'Yellow', 'Lime', 'Pink', 'Gray', 'Light Gray', 'Cyan', 'Purple', 'Blue', 'Brown', 'Green', 'Red', 'Black'];

// collision boxes in block-local coords; returns array of [x0,y0,z0,x1,y1,z1]
export function collisionBoxes(world, x, y, z, id, meta) {
  const b = blocks[id];
  if (!b || !b.solid) return null;
  switch (b.render) {
    case R.SLAB: return [b.aabbFn(meta)];
    case R.STAIRS: {
      const top = (meta & 4) !== 0;
      const boxes = [top ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1]];
      const d = meta & 3;
      const y0 = top ? 0 : 0.5, y1 = top ? 0.5 : 1;
      if (d === 0) boxes.push([0.5, y0, 0, 1, y1, 1]);
      else if (d === 1) boxes.push([0, y0, 0, 0.5, y1, 1]);
      else if (d === 2) boxes.push([0, y0, 0.5, 1, y1, 1]);
      else boxes.push([0, y0, 0, 1, y1, 0.5]);
      return boxes;
    }
    case R.DOOR: return [doorBox(world, x, y, z, meta)];
    case R.FENCE: return [fenceBox(world, x, y, z, true)];
    case R.GATE: return (meta & 4) ? null : [((meta & 1) ? [0.375, 0, 0, 0.625, 1.5, 1] : [0, 0, 0.375, 1, 1.5, 0.625])];
    case R.TRAPDOOR: return [trapdoorBox(meta)];
    case R.PANE: return paneBoxes(world, x, y, z);
    default:
      return [b.aabb || [0, 0, 0, 1, 1, 1]];
  }
}

// selection / ray-hit box
export function selectionBox(world, x, y, z, id, meta) {
  const b = blocks[id];
  switch (b.render) {
    case R.CROSS: case R.CROPS: case R.STEM: return [0.15, 0, 0.15, 0.85, b.render === R.CROSS ? 0.85 : 0.4 + (meta & 7) / 14, 0.85];
    case R.TORCH: {
      const w = 0.15;
      if (meta === 1) return [0, 0.2, 0.5 - w, w * 2, 0.8, 0.5 + w];
      if (meta === 2) return [1 - w * 2, 0.2, 0.5 - w, 1, 0.8, 0.5 + w];
      if (meta === 3) return [0.5 - w, 0.2, 0, 0.5 + w, 0.8, w * 2];
      if (meta === 4) return [0.5 - w, 0.2, 1 - w * 2, 0.5 + w, 0.8, 1];
      return [0.4, 0, 0.4, 0.6, 0.6, 0.6];
    }
    case R.LADDER: {
      const t = 0.125;
      if (meta === 2) return [0, 0, 1 - t, 1, 1, 1];
      if (meta === 3) return [0, 0, 0, 1, 1, t];
      if (meta === 4) return [1 - t, 0, 0, 1, 1, 1];
      return [0, 0, 0, t, 1, 1];
    }
    case R.SNOW: return [0, 0, 0, 1, 0.125, 1];
    case R.FENCE: return fenceBox(world, x, y, z, false);
    case R.GATE: return (meta & 1) ? [0.375, 0, 0, 0.625, 1, 1] : [0, 0, 0.375, 1, 1, 0.625];
    case R.LIQUID: return null;
    case R.SLAB: return b.aabbFn(meta);
    case R.DOOR: return doorBox(world, x, y, z, meta);
    case R.TRAPDOOR: return trapdoorBox(meta);
    case R.PANE: { const bs = paneBoxes(world, x, y, z); return bs.reduce((a, c) => [Math.min(a[0], c[0]), 0, Math.min(a[2], c[2]), Math.max(a[3], c[3]), 1, Math.max(a[5], c[5])]); }
    case R.FIRE: return null;
    default: return b.aabb || [0, 0, 0, 1, 1, 1];
  }
}

export function paneConnections(world, x, y, z) {
  const c = (xx, zz) => { const id = world.getBlock(xx, y, zz); return id === B.GLASS_PANE || id === B.GLASS || OPAQUE[id] === 1; };
  return [c(x, z - 1), c(x, z + 1), c(x - 1, z), c(x + 1, z)];
}
export function paneBoxes(world, x, y, z) {
  const [n, s, w, e] = paneConnections(world, x, y, z);
  const t0 = 7 / 16, t1 = 9 / 16, out = [];
  if (!n && !s && !w && !e) return [[0, 0, t0, 1, 1, t1], [t0, 0, 0, t1, 1, 1]];
  if (n || s) out.push([t0, 0, n ? 0 : t0, t1, 1, s ? 1 : t1]);
  if (w || e) out.push([w ? 0 : t0, 0, t0, e ? 1 : t1, 1, t1]);
  return out;
}
function connectsFence(world, x, y, z) {
  const id = world.getBlock(x, y, z);
  return id === B.FENCE || id === B.FENCE_GATE || (OPAQUE[id] === 1);
}
export function fenceConnections(world, x, y, z) {
  return [connectsFence(world, x, y, z - 1), connectsFence(world, x, y, z + 1), connectsFence(world, x - 1, y, z), connectsFence(world, x + 1, y, z)];
}
function fenceBox(world, x, y, z, coll) {
  const [n, s, w, e] = fenceConnections(world, x, y, z);
  return [w ? 0 : 0.375, 0, n ? 0 : 0.375, e ? 1 : 0.625, coll ? 1.5 : 1, s ? 1 : 0.625];
}

// door: lower block meta bits 0-1 facing, bit 2 open; upper block bit 3 set
export function doorState(world, x, y, z, meta) {
  let lower = meta, upper = meta;
  if (meta & 8) { lower = world.getMeta(x, y - 1, z); } else { upper = world.getMeta(x, y + 1, z); }
  return { facing: lower & 3, open: (lower & 4) !== 0, hingeRight: (upper & 1) !== 0 };
}
function doorBox(world, x, y, z, meta) {
  const st = doorState(world, x, y, z, meta);
  let dir = st.facing;
  if (st.open) dir = (dir + (st.hingeRight ? 3 : 1)) & 3;
  const t = 3 / 16;
  // dir 0: door on west side(-x)... choose: 0 -> x min, 1 -> z min, 2 -> x max, 3 -> z max
  if (dir === 0) return [0, 0, 0, t, 1, 1];
  if (dir === 1) return [0, 0, 0, 1, 1, t];
  if (dir === 2) return [1 - t, 0, 0, 1, 1, 1];
  return [0, 0, 1 - t, 1, 1, 1];
}
function trapdoorBox(meta) {
  const t = 3 / 16;
  if (meta & 4) {
    const d = meta & 3;
    if (d === 0) return [0, 0, 1 - t, 1, 1, 1];
    if (d === 1) return [0, 0, 0, 1, 1, t];
    if (d === 2) return [1 - t, 0, 0, 1, 1, 1];
    return [0, 0, 0, t, 1, 1];
  }
  return (meta & 8) ? [0, 1 - t, 0, 1, 1, 1] : [0, 0, 0, 1, t, 1];
}
