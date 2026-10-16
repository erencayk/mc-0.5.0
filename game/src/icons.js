// Inventory icons rendered from the procedural atlas (isometric cubes for blocks).
import { atlasCanvas, TILE, ATLAS_TILES, tex } from './textures.js';
import { blocks, R } from './blocks.js';
import { isBlockItem, blockIconIsFlat, itemIconTile } from './items.js';

const cache = new Map();
const SIZE = 48;

function tileXY(t) { return [(t % ATLAS_TILES) * TILE, Math.floor(t / ATLAS_TILES) * TILE]; }

function drawFace(ctx, tile, a, b, c, d, e, f, shade, crop = null) {
  const [sx, sy] = tileXY(tile);
  ctx.save();
  ctx.setTransform(a, b, c, d, e, f);
  if (crop) ctx.drawImage(atlasCanvas, sx, sy + crop[0], TILE, crop[1], 0, crop[0], TILE, crop[1]);
  else ctx.drawImage(atlasCanvas, sx, sy, TILE, TILE, 0, 0, TILE, TILE);
  if (shade < 1) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(0,0,0,${1 - shade})`;
    ctx.fillRect(0, 0, TILE, TILE);
  }
  ctx.restore();
}

export function iconCanvas(id, meta = 0) {
  const key = id + ':' + meta;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (isBlockItem(id) && !blockIconIsFlat(id)) {
    const b = blocks[id];
    const fm = (b.container || id === 86 || id === 61 || id === 62) ? 3 : meta;
    const top = b.texFn(1, meta), left = b.texFn(3, fm), right = b.texFn(5, meta);
    // isometric projection: each face is a 16x16 tile mapped by an affine transform
    const s = SIZE / 36; // half-width scale
    const cx = SIZE / 2, cy = SIZE * 0.06;
    let h = 1;
    if (b.render === R.SLAB) h = 0.5;
    if (b.render === R.SNOW) h = 0.125;
    if (b.render === R.BED) h = 0.56;
    const topY = cy + (1 - h) * 16 * s * 1.15;
    // top: maps (0,0)->(cx,topY), (16,0)->(cx+16s, topY+8s), (0,16)->(cx-16s, topY+8s)
    drawFace(ctx, top, s, s * 0.5, -s, s * 0.5, cx, topY, 1);
    // left face (south): from (cx-16s, topY+8s) down
    const crop = h < 1 ? [Math.round((1 - h) * 16), Math.round(h * 16)] : null;
    const off = h < 1 ? -(1 - h) * 16 * s * 1.15 : 0;
    drawFace(ctx, left, s, s * 0.5, 0, s * 1.15, cx - 16 * s, topY + 8 * s + off, 0.8, crop);
    drawFace(ctx, right, s, -s * 0.5, 0, s * 1.15, cx, topY + 16 * s + off, 0.62, crop);
  } else {
    const tile = id < 256 ? (blocks[id] ? blocks[id].texFn(1, meta) : 0) : itemIconTile(id, meta);
    const [sx, sy] = tileXY(tile);
    ctx.drawImage(atlasCanvas, sx, sy, TILE, TILE, 4, 4, SIZE - 8, SIZE - 8);
  }
  cache.set(key, c);
  return c;
}

const urlCache = new Map();
export function iconURL(id, meta = 0) {
  const key = id + ':' + meta;
  let u = urlCache.get(key);
  if (!u) { u = iconCanvas(id, meta).toDataURL(); urlCache.set(key, u); }
  return u;
}
export function tileURL(name) {
  let u = urlCache.get('t:' + name);
  if (!u) {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const [sx, sy] = tileXY(tex(name));
    ctx.drawImage(atlasCanvas, sx, sy, TILE, TILE, 0, 0, 32, 32);
    u = c.toDataURL(); urlCache.set('t:' + name, u);
  }
  return u;
}
