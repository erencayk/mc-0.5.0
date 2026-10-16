// Entities: physics, players, mobs (AI), items, projectiles, TNT, falling blocks, paintings.
import { B, blocks, collisionBoxes, isWater, isLava, LIQUID, SOLID, R } from './blocks.js';
import { I, Inventory, getItem, maxStack } from './items.js';
import { WOOL_COLORS, PAINTINGS } from './textures.js';
import { WX, WZ, WY } from './world.js';

let NEXT_ID = 1;
export function setNextId(n) { NEXT_ID = Math.max(NEXT_ID, n); }

export class Entity {
  constructor(type, x, y, z) {
    this.id = NEXT_ID++;
    this.type = type;
    this.x = x; this.y = y; this.z = z;
    this.px = x; this.py = y; this.pz = z;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0; this.pitch = 0; this.pyaw = 0;
    this.w = 0.6; this.h = 1.8;
    this.onGround = false; this.inWater = false; this.inLava = false;
    this.horizCollide = false;
    this.health = 10; this.maxHealth = 10;
    this.hurtTime = 0; this.deathTime = 0; this.invuln = 0;
    this.fire = 0; this.air = 300; this.fallDist = 0;
    this.age = 0; this.removed = false;
    this.walkAnim = 0; this.walkAmt = 0;
    this.stepHeight = 0.5;
    this.noGravity = false;
    this.living = false;
  }
  get bbox() { const hw = this.w / 2; return [this.x - hw, this.y, this.z - hw, this.x + hw, this.y + this.h, this.z + hw]; }
  dist2(o) { const dx = this.x - o.x, dy = this.y - o.y, dz = this.z - o.z; return dx * dx + dy * dy + dz * dz; }
  savePrev() { this.px = this.x; this.py = this.y; this.pz = this.z; this.pyaw = this.yaw; }
  // network snapshot fields beyond position
  extra() { return null; }
  applyExtra(x) { }
  toSave() { return { t: this.type, x: this.x, y: this.y, z: this.z, yaw: this.yaw, hp: this.health, ex: this.extra() }; }
}

// ------------------------------------------------------------------ physics
export function gatherBoxes(world, x0, y0, z0, x1, y1, z1) {
  const out = [];
  const bx0 = Math.floor(x0), by0 = Math.floor(y0) - 1, bz0 = Math.floor(z0), bx1 = Math.floor(x1), by1 = Math.floor(y1), bz1 = Math.floor(z1);
  for (let x = bx0; x <= bx1; x++) for (let z = bz0; z <= bz1; z++) for (let y = by0; y <= by1; y++) {
    const id = world.getBlockColl(x, y, z);
    if (!id || !SOLID[id]) continue;
    const boxes = collisionBoxes(world, x, y, z, id, world.getMeta(x, y, z));
    if (!boxes) continue;
    for (const b of boxes) out.push([x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]);
  }
  return out;
}

function clipAxis(boxes, bb, d, axis) {
  // axis 0 x,1 y,2 z
  const a0 = axis, a1 = axis + 3;
  const o1 = (axis + 1) % 3, o2 = (axis + 2) % 3;
  for (const b of boxes) {
    if (bb[o1 + 3] <= b[o1] || bb[o1] >= b[o1 + 3] || bb[o2 + 3] <= b[o2] || bb[o2] >= b[o2 + 3]) continue;
    if (d > 0 && bb[a1] <= b[a0]) { const m = b[a0] - bb[a1]; if (m < d) d = m; }
    else if (d < 0 && bb[a0] >= b[a1]) { const m = b[a1] - bb[a0]; if (m > d) d = m; }
  }
  return d;
}

export function moveEntity(world, e, dx, dy, dz, sneaking = false) {
  const hw = e.w / 2;
  let bb = [e.x - hw, e.y, e.z - hw, e.x + hw, e.y + e.h, e.z + hw];
  const ox = dx, oy = dy, oz = dz;
  // sneaking: don't walk off edges
  if (sneaking && e.onGround) {
    const step = 0.05;
    const hasFloor = (bx, bz) => gatherBoxes(world, bb[0] + bx, bb[1] - 1, bb[2] + bz, bb[3] + bx, bb[1] - 0.01, bb[5] + bz).some((b) => b[4] > bb[1] - 1 && b[0] < bb[3] + bx && b[3] > bb[0] + bx && b[2] < bb[5] + bz && b[5] > bb[2] + bz);
    while (dx !== 0 && !hasFloor(dx, 0)) { if (Math.abs(dx) < step) dx = 0; else dx -= Math.sign(dx) * step; }
    while (dz !== 0 && !hasFloor(0, dz)) { if (Math.abs(dz) < step) dz = 0; else dz -= Math.sign(dz) * step; }
    while (dx !== 0 && dz !== 0 && !hasFloor(dx, dz)) { if (Math.abs(dx) < step) dx = 0; else dx -= Math.sign(dx) * step; if (Math.abs(dz) < step) dz = 0; else dz -= Math.sign(dz) * step; }
  }
  const boxes = gatherBoxes(world, Math.min(bb[0], bb[0] + dx) - 1, Math.min(bb[1], bb[1] + dy) - 1, Math.min(bb[2], bb[2] + dz) - 1, Math.max(bb[3], bb[3] + dx) + 1, Math.max(bb[4], bb[4] + dy) + 1, Math.max(bb[5], bb[5] + dz) + 1);
  const orig = bb.slice();
  const tryMove = (bb, dx, dy, dz) => {
    dy = clipAxis(boxes, bb, dy, 1); bb[1] += dy; bb[4] += dy;
    dx = clipAxis(boxes, bb, dx, 0); bb[0] += dx; bb[3] += dx;
    dz = clipAxis(boxes, bb, dz, 2); bb[2] += dz; bb[5] += dz;
    return [dx, dy, dz];
  };
  let [rx, ry, rz] = tryMove(bb, dx, dy, dz);
  const onGroundNow = oy !== ry && oy < 0;
  // step up
  if (e.stepHeight > 0 && (onGroundNow || e.onGround) && (rx !== dx || rz !== dz)) {
    const bb2 = orig.slice();
    let sy = clipAxis(boxes, bb2, e.stepHeight, 1); bb2[1] += sy; bb2[4] += sy;
    const sx = clipAxis(boxes, bb2, dx, 0); bb2[0] += sx; bb2[3] += sx;
    const sz = clipAxis(boxes, bb2, dz, 2); bb2[2] += sz; bb2[5] += sz;
    const down = clipAxis(boxes, bb2, -sy + (dy < 0 ? dy : 0), 1); bb2[1] += down; bb2[4] += down;
    if (sx * sx + sz * sz > rx * rx + rz * rz + 1e-6) { bb = bb2; rx = sx; rz = sz; ry = sy + down; }
  }
  e.x = (bb[0] + bb[3]) / 2; e.y = bb[1]; e.z = (bb[2] + bb[5]) / 2;
  e.horizCollide = rx !== dx || rz !== dz;
  e.vertCollide = ry !== oy;
  e.onGround = oy !== ry && oy < 0;
  if (rx !== dx) e.vx = 0;
  if (rz !== dz) e.vz = 0;
  if (ry !== oy) e.vy = 0;
  return e.onGround;
}

export function liquidAt(world, e) {
  const hw = e.w / 2 - 0.001;
  let water = false, lava = false, web = false, ladder = false, cactus = false;
  const x0 = Math.floor(e.x - hw), x1 = Math.floor(e.x + hw), z0 = Math.floor(e.z - hw), z1 = Math.floor(e.z + hw);
  const y0 = Math.floor(e.y + 0.1), y1 = Math.floor(e.y + e.h * 0.6);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) {
    const id = world.getBlock(x, y, z);
    if (isWater(id)) water = true;
    else if (isLava(id)) lava = true;
    else if (id === B.COBWEB) web = true;
  }
  // ladder & cactus (touching)
  for (let x = Math.floor(e.x - hw - 0.05); x <= Math.floor(e.x + hw + 0.05); x++) for (let z = Math.floor(e.z - hw - 0.05); z <= Math.floor(e.z + hw + 0.05); z++) {
    for (let y = Math.floor(e.y); y <= Math.floor(e.y + e.h - 0.1); y++) {
      const id = world.getBlock(x, y, z);
      if (id === B.CACTUS) cactus = true;
    }
  }
  const lid = world.getBlock(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z));
  const lid2 = world.getBlock(Math.floor(e.x), Math.floor(e.y + 1), Math.floor(e.z));
  if (lid === B.LADDER || lid2 === B.LADDER) ladder = true;
  return { water, lava, web, ladder, cactus };
}

// generic living-entity physics step. input: {fwd, strafe, jump, speed}
export function livingPhysics(world, e, input, flying = false, sneak = false) {
  const env = liquidAt(world, e);
  e.inWater = env.water; e.inLava = env.lava;
  let { fwd = 0, strafe = 0, jump = false, speed = 0.1 } = input;
  const yaw = e.yaw;
  const accel = (a) => {
    let d = fwd * fwd + strafe * strafe;
    if (d < 0.0001) return;
    d = Math.sqrt(d); if (d < 1) d = 1;
    const f = a / d;
    const s = Math.sin(yaw), c = Math.cos(yaw);
    // forward = (sin yaw, -cos yaw)
    e.vx += (fwd * s + strafe * c) * f;
    e.vz += (-fwd * c + strafe * s) * f;
  };
  if (flying) {
    accel(speed * 1.0);
    e.vy *= 0.6;
    if (jump) e.vy += 0.15;
    if (sneak) e.vy -= 0.15;
    moveEntity(world, e, e.vx, e.vy, e.vz);
    e.vx *= 0.91; e.vz *= 0.91;
    e.fallDist = 0;
    return env;
  }
  if (env.water || env.lava) {
    const y0 = e.y;
    accel(0.02);
    if (jump) e.vy += 0.04;
    moveEntity(world, e, e.vx, e.vy, e.vz, false);
    const drag = env.water ? 0.8 : 0.5;
    e.vx *= drag; e.vy *= drag; e.vz *= drag;
    e.vy -= 0.02;
    // climb out onto ledges
    if (e.horizCollide && jump) e.vy = 0.3;
    e.fallDist = 0;
  } else {
    let slip = 0.91;
    if (e.onGround) {
      const bid = world.getBlock(Math.floor(e.x), Math.floor(e.y - 0.5), Math.floor(e.z));
      slip = (blocks[bid] ? blocks[bid].friction : 0.6) * 0.91;
    }
    const a = e.onGround ? speed * (0.16277136 / (slip * slip * slip)) : 0.02;
    accel(a);
    if (env.ladder) {
      e.vx = Math.max(-0.15, Math.min(0.15, e.vx)); e.vz = Math.max(-0.15, Math.min(0.15, e.vz));
      e.fallDist = 0;
      if (e.vy < -0.15) e.vy = -0.15;
      if (sneak && e.vy < 0) e.vy = 0;
    }
    if (jump && e.onGround) { e.vy = 0.42; }
    if (env.web) { e.vx *= 0.25; e.vy *= 0.05; e.vz *= 0.25; e.fallDist = 0; }
    const preVy = e.vy;
    moveEntity(world, e, e.vx, e.vy, e.vz, sneak);
    if (env.ladder && (e.horizCollide || jump)) e.vy = 0.2;
    if (!e.onGround && preVy < 0) e.fallDist -= preVy;
    e.vy -= 0.08;
    e.vy *= 0.98;
    e.vx *= slip; e.vz *= slip;
  }
  return env;
}

// ------------------------------------------------------------------ living base
export class Living extends Entity {
  constructor(type, x, y, z) {
    super(type, x, y, z);
    this.living = true;
    this.ryaw = 0; // body yaw rendered
    this.attackCooldown = 0;
    this.knock = null;
  }
  damage(game, amount, src) {
    if (this.health <= 0 || this.invuln > 0 || this.removed) return false;
    if (this.type === 'player' && this.mode === 'creative' && !(src && src.void)) return false;
    this.health -= amount;
    this.hurtTime = 10; this.invuln = 10;
    if (src && src.entity) {
      const dx = this.x - src.entity.x, dz = this.z - src.entity.z, d = Math.hypot(dx, dz) || 1;
      const k = src.knock !== undefined ? src.knock : 0.4;
      this.vx += dx / d * k; this.vz += dz / d * k; this.vy = Math.max(this.vy, 0.3);
      if (this.onHurtBy) this.onHurtBy(game, src.entity);
    }
    game.fx({ k: 'hurt', id: this.id, type: this.type, x: this.x, y: this.y, z: this.z });
    if (this.health <= 0) this.die(game, src);
    return true;
  }
  die(game, src) {
    this.deathTime = 1;
    if (this.type === 'player' && game.authority) { game.playerDied(this); return; }
    if (this.drops && game.authority) {
      for (const [id, n, m] of this.drops(game.rand)) if (n > 0) game.spawnItem(this.x, this.y + 0.5, this.z, id, n, m || 0);
    }
  }
  baseTick(game) {
    this.age++;
    if (this.hurtTime > 0) this.hurtTime--;
    if (this.invuln > 0) this.invuln--;
    if (this.attackCooldown > 0) this.attackCooldown--;
    if (this.deathTime > 0) { this.deathTime++; if (this.deathTime > 20 && this.type !== 'player') this.removed = true; return false; }
    const w = game.world;
    // environment damage
    if (this.inLava) { this.fire = 300; if (this.age % 10 === 0) this.damage(game, 4, { lava: true }); }
    if (this.fire > 0) {
      if (this.inWater) this.fire = 0;
      else { this.fire--; if (this.fire % 20 === 0) this.damage(game, 1, { fire: true }); }
    }
    const headId = w.getBlock(Math.floor(this.x), Math.floor(this.y + this.h * 0.85), Math.floor(this.z));
    if (isWater(headId)) {
      if (!this.waterBreather) { this.air--; if (this.air <= -20) { this.air = 0; this.damage(game, 2, { drown: true }); } }
    } else this.air = 300;
    if (blocks[headId] && blocks[headId].opaque && SOLID[headId] && this.age % 10 === 0 && this.type !== 'player_remote') this.damage(game, 1, { suffocate: true });
    if (this.y < -64) this.damage(game, 100, { void: true });
    return true;
  }
  landed(game) {
    if (this.fallDist > 3) {
      const dmg = Math.ceil(this.fallDist - 3);
      if (!this.inWater) this.damage(game, dmg, { fall: true });
    }
    this.fallDist = 0;
  }
}

// ------------------------------------------------------------------ player
export const PLAYER_COLORS = [[56, 120, 180], [180, 60, 60], [60, 150, 70], [200, 160, 40], [140, 70, 170], [40, 160, 160], [220, 110, 40], [90, 90, 90]];
export class Player extends Living {
  constructor(name, x, y, z) {
    super('player', x, y, z);
    this.name = name;
    this.health = 20; this.maxHealth = 20;
    this.inv = new Inventory(36);
    this.sel = 0;
    this.mode = 'survival';
    this.flying = false;
    this.sneak = false;
    this.sleeping = null;
    this.sleepTimer = 0;
    this.spawnPoint = null;
    this.color = PLAYER_COLORS[0];
    this.eyeH = 1.62;
    this.swing = 0;
    this.remote = false; // true if controlled by a network client
    this.sendState = null;
    this.openContainer = null;
  }
  held() { return this.inv.slots[this.sel]; }
  extra() { const h = this.held(); return { n: this.name, c: this.color, h: h ? [h.id, h.meta] : 0, s: this.sneak ? 1 : 0, sl: this.sleeping ? 1 : 0, d: this.deathTime > 0 ? 1 : 0 }; }
  applyExtra(x) { if (!x) return; this.name = x.n; this.color = x.c; this.held = () => (x.h ? { id: x.h[0], meta: x.h[1] } : null); this.heldNet = x.h; this.sneak = !!x.s; this.sleepingNet = !!x.sl; this.deadNet = !!x.d; }
}

// ------------------------------------------------------------------ mobs
const rnd = (game) => game.rand();

class Mob extends Living {
  constructor(type, x, y, z) {
    super(type, x, y, z);
    this.target = null; // [x,z]
    this.wanderTimer = 0;
    this.panic = 0;
    this.moveSpeed = 0.1;
    this.input = { fwd: 0, strafe: 0, jump: false, speed: 0.1 };
    this.persistent = false;
  }
  lookAt(x, z) {
    const dx = x - this.x, dz = z - this.z;
    let want = Math.atan2(dx, -dz);
    let d = want - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += Math.max(-0.3, Math.min(0.3, d));
  }
  walkTo(game, tx, tz, speedMul = 1) {
    this.lookAt(tx, tz);
    const d = Math.hypot(tx - this.x, tz - this.z);
    this.input.fwd = d > 0.5 ? 1 : 0;
    this.input.speed = this.moveSpeed * speedMul;
    // jump over obstacles, avoid walking into lava/cliffs a bit
    if (this.horizCollide && this.onGround) this.input.jump = true;
    if (this.inWater) this.input.jump = true;
    // peek ahead for drop/lava
    const ax = this.x + Math.sin(this.yaw) * 0.8, az = this.z - Math.cos(this.yaw) * 0.8;
    const below = game.world.getBlock(Math.floor(ax), Math.floor(this.y - 0.5), Math.floor(az));
    const below2 = game.world.getBlock(Math.floor(ax), Math.floor(this.y - 1.5), Math.floor(az));
    const below3 = game.world.getBlock(Math.floor(ax), Math.floor(this.y - 2.5), Math.floor(az));
    if (isLava(below) || (below === 0 && below2 === 0 && below3 === 0 && !this.fearless)) { this.input.fwd = 0; this.target = null; }
    return d;
  }
  tick(game) {
    this.input.fwd = 0; this.input.jump = false; this.input.strafe = 0;
    if (!this.baseTick(game)) { livingPhysics(game.world, this, this.input); return; }
    this.ai(game);
    const wasGround = this.onGround;
    livingPhysics(game.world, this, this.input);
    if (this.onGround && !wasGround) this.landed(game);
    // body yaw follows head
    let d = this.yaw - this.ryaw;
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.ryaw += d * 0.4;
    const mv = Math.hypot(this.x - this.px, this.z - this.pz);
    this.walkAmt += (Math.min(1, mv * 4) - this.walkAmt) * 0.4;
    this.walkAnim += mv * 4;
  }
  wander(game, chance = 0.008, range = 8) {
    if (this.target) {
      const d = this.walkTo(game, this.target[0], this.target[1], this.panic > 0 ? 1.6 : 1);
      if (d < 0.8 || --this.wanderTimer <= 0) this.target = null;
    } else if (rnd(game) < chance || this.panic > 0) {
      this.target = [this.x + (rnd(game) - 0.5) * range * 2, this.z + (rnd(game) - 0.5) * range * 2];
      this.wanderTimer = 100;
    }
  }
  nearestPlayer(game, range, survivalOnly = true) {
    let best = null, bd = range * range;
    for (const p of game.players.values()) {
      if (p.deathTime > 0 || p.removed) continue;
      if (survivalOnly && p.mode === 'creative') continue;
      const d = this.dist2(p);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
}

class Animal extends Mob {
  constructor(type, x, y, z) { super(type, x, y, z); this.persistent = true; this.health = this.maxHealth = 10; }
  onHurtBy() { this.panic = 60; this.target = null; }
  ai(game) {
    if (this.panic > 0) this.panic--;
    // follow players holding food
    const p = this.temptItem ? this.nearestPlayer(game, 8, false) : null;
    if (p && this.panic <= 0) {
      const h = p.held && p.held();
      if (h && this.temptItem.includes(h.id)) {
        if (this.dist2(p) > 4) this.walkTo(game, p.x, p.z, 0.9);
        else this.lookAt(p.x, p.z);
        return;
      }
    }
    this.wander(game, 0.01, 6);
  }
}
export class Pig extends Animal {
  constructor(x, y, z) { super('pig', x, y, z); this.w = 0.9; this.h = 0.9; this.temptItem = [I.WHEAT]; }
  drops(r) { return [[this.fire > 0 ? I.COOKED_PORKCHOP : I.PORKCHOP, (r() * 3) | 0]]; }
}
export class Cow extends Animal {
  constructor(x, y, z) { super('cow', x, y, z); this.w = 0.9; this.h = 1.3; this.temptItem = [I.WHEAT]; }
  drops(r) { return [[I.LEATHER, (r() * 3) | 0], [this.fire > 0 ? I.STEAK : I.BEEF, 1 + ((r() * 3) | 0)]]; }
}
export class Chicken extends Animal {
  constructor(x, y, z) { super('chicken', x, y, z); this.w = 0.4; this.h = 0.7; this.health = this.maxHealth = 4; this.temptItem = [I.SEEDS, I.PUMPKIN_SEEDS, I.MELON_SEEDS]; this.eggTimer = 6000 + Math.random() * 6000; this.fearless = true; }
  drops(r) { return [[I.FEATHER, (r() * 3) | 0], [this.fire > 0 ? I.COOKED_CHICKEN : I.CHICKEN, 1]]; }
  tick(game) {
    super.tick(game);
    if (!this.onGround && this.vy < 0) { this.vy *= 0.6; this.fallDist = 0; }
    if (game.authority && --this.eggTimer <= 0) { game.spawnItem(this.x, this.y + 0.3, this.z, I.EGG, 1, 0); this.eggTimer = 6000 + game.rand() * 6000; game.fx({ k: 'snd', s: 'plop', x: this.x, y: this.y, z: this.z }); }
  }
}
export class Sheep extends Animal {
  constructor(x, y, z, color = 0) {
    super('sheep', x, y, z); this.w = 0.9; this.h = 1.3; this.temptItem = [I.WHEAT];
    this.sheared = false; this.woolColor = color; this.woolColorRGB = WOOL_COLORS[color];
    this.eatTimer = 0;
  }
  extra() { return { c: this.woolColor, s: this.sheared ? 1 : 0 }; }
  applyExtra(x) { if (!x) return; this.woolColor = x.c; this.woolColorRGB = WOOL_COLORS[x.c & 15]; this.sheared = !!x.s; }
  drops() { return this.sheared ? [] : [[B.WOOL, 1, this.woolColor]]; }
  ai(game) {
    super.ai(game);
    if (this.sheared && game.rand() < 0.002) {
      const bx = Math.floor(this.x), by = Math.floor(this.y - 0.5), bz = Math.floor(this.z);
      if (game.world.getBlock(bx, by, bz) === B.GRASS) { game.setBlock(bx, by, bz, B.DIRT); this.sheared = false; game.dirtyEntity(this); }
    }
  }
}

class Monster extends Mob {
  constructor(type, x, y, z) { super(type, x, y, z); this.health = this.maxHealth = 20; this.attackDmg = 3; this.burnsInDay = false; this.angryAt = null; }
  hostileNow(game) { return true; }
  ai(game) {
    // burn in daylight
    if (this.burnsInDay && game.isDay() && game.world.getSky(Math.floor(this.x), Math.floor(this.y + 1.6), Math.floor(this.z)) >= 15 && !this.inWater) {
      if (this.fire <= 0 && game.rand() < 0.05) this.fire = 160;
    }
    let p = this.angryAt && !this.angryAt.removed && this.angryAt.deathTime === 0 ? this.angryAt : null;
    if (!p && this.hostileNow(game)) p = this.nearestPlayer(game, 16);
    if (p && p.mode === 'creative') p = null;
    if (p) this.chase(game, p);
    else this.wander(game, 0.006, 8);
  }
  chase(game, p) {
    const d = this.walkTo(game, p.x, p.z, 1.2);
    this.pitch = 0;
    if (d < 1.4 && Math.abs(p.y - this.y) < 2 && this.attackCooldown <= 0) {
      this.attackCooldown = 20;
      this.swing = 1;
      p.damage(game, this.attackDmg, { entity: this });
    }
  }
}
export class Zombie extends Monster {
  constructor(x, y, z) { super('zombie', x, y, z); this.burnsInDay = true; this.attackDmg = 4; this.moveSpeed = 0.085; }
  // classic pocket zombies dropped feathers
  drops(r) { return [[I.FEATHER, (r() * 3) | 0]]; }
}
export class PigZombie extends Monster {
  constructor(x, y, z) { super('pigzombie', x, y, z); this.attackDmg = 5; this.moveSpeed = 0.1; this.fireImmune = true; this.persistent = true; }
  hostileNow() { return false; }
  onHurtBy(game, ent) {
    if (ent && ent.type === 'player') {
      this.angryAt = ent;
      for (const e of game.entities.values()) if (e.type === 'pigzombie' && e.dist2(this) < 32 * 32) e.angryAt = ent;
    }
  }
  drops(r) { return [[I.COOKED_PORKCHOP, (r() * 2) | 0], [I.GOLD_INGOT, r() < 0.1 ? 1 : 0]]; }
  baseTick(game) { this.fire = 0; return super.baseTick(game); }
}
export class Skeleton extends Monster {
  constructor(x, y, z) { super('skeleton', x, y, z); this.burnsInDay = true; this.shootTimer = 40; this.moveSpeed = 0.1; }
  drops(r) { return [[I.BONE, (r() * 3) | 0], [I.ARROW, (r() * 3) | 0]]; }
  chase(game, p) {
    const d = Math.sqrt(this.dist2(p));
    if (d > 10) this.walkTo(game, p.x, p.z);
    else { this.lookAt(p.x, p.z); if (d < 5) { this.input.fwd = -0.6; this.input.speed = this.moveSpeed; } }
    if (--this.shootTimer <= 0 && d < 16) {
      this.shootTimer = 40 + ((game.rand() * 30) | 0);
      if (game.canSee(this.x, this.y + 1.5, this.z, p.x, p.y + 1.5, p.z)) {
        const a = new Arrow(this.x, this.y + 1.5, this.z, this);
        const dx = p.x - this.x, dy = p.y + 1.2 - (this.y + 1.5), dz = p.z - this.z;
        const hd = Math.hypot(dx, dz);
        a.shoot(dx, dy + hd * 0.2, dz, 1.6, 12 * (game.rand() * 0.1));
        game.addEntity(a);
        game.fx({ k: 'snd', s: 'bow', x: this.x, y: this.y, z: this.z });
      }
    }
  }
}
export class Spider extends Monster {
  constructor(x, y, z) { super('spider', x, y, z); this.w = 1.4; this.h = 0.9; this.health = this.maxHealth = 16; this.attackDmg = 2; this.moveSpeed = 0.12; }
  hostileNow(game) { return !game.isDay() || game.world.getBrightness(Math.floor(this.x), Math.floor(this.y + 0.5), Math.floor(this.z)) < 8; }
  drops(r) { return [[I.STRING, (r() * 3) | 0]]; }
  chase(game, p) {
    const d = this.walkTo(game, p.x, p.z, 1.1);
    if (this.horizCollide) { this.vy = 0.2; this.fallDist = 0; }
    if (d > 2 && d < 6 && this.onGround && game.rand() < 0.1) { const k = 0.4 / d; this.vx = (p.x - this.x) * k; this.vz = (p.z - this.z) * k; this.vy = 0.4; }
    if (d < 1.6 && Math.abs(p.y - this.y) < 2 && this.attackCooldown <= 0) { this.attackCooldown = 20; p.damage(game, this.attackDmg, { entity: this }); }
  }
}
export class Creeper extends Monster {
  constructor(x, y, z) { super('creeper', x, y, z); this.fuse = 0; this.moveSpeed = 0.09; }
  extra() { return { f: this.fuse }; }
  applyExtra(x) { if (x) this.fuse = x.f; }
  drops(r) { return [[I.GUNPOWDER, (r() * 3) | 0]]; }
  chase(game, p) {
    const d = Math.sqrt(this.dist2(p));
    if (d < 3 || (this.fuse > 0 && d < 7)) {
      this.lookAt(p.x, p.z);
      if (this.fuse === 0) game.fx({ k: 'snd', s: 'fuse', x: this.x, y: this.y, z: this.z });
      this.fuse++;
      game.dirtyEntity(this);
      if (this.fuse >= 30) { this.removed = true; game.explode(this.x, this.y + 0.5, this.z, 3, this); }
    } else {
      if (this.fuse > 0) { this.fuse = Math.max(0, this.fuse - 1); game.dirtyEntity(this); }
      this.walkTo(game, p.x, p.z);
    }
  }
  ai(game) { const p = this.nearestPlayer(game, 16); if (!p && this.fuse > 0) { this.fuse--; game.dirtyEntity(this); } super.ai(game); }
}

export const MOB_CLASSES = { pig: Pig, cow: Cow, chicken: Chicken, sheep: Sheep, zombie: Zombie, pigzombie: PigZombie, skeleton: Skeleton, spider: Spider, creeper: Creeper };
export const HOSTILE = new Set(['zombie', 'skeleton', 'spider', 'creeper']);

// ------------------------------------------------------------------ item entity
export class ItemEntity extends Entity {
  constructor(x, y, z, id, count, meta = 0, dmg = 0) {
    super('item', x, y, z);
    this.w = 0.25; this.h = 0.25;
    this.item = { id, count, meta, dmg };
    this.pickupDelay = 10;
    this.stepHeight = 0;
    this.bob = Math.random() * Math.PI * 2;
  }
  extra() { return { i: [this.item.id, this.item.count, this.item.meta] }; }
  applyExtra(x) { if (x && x.i) this.item = { id: x.i[0], count: x.i[1], meta: x.i[2] }; }
  toSave() { const s = super.toSave(); s.ex.dmg = this.item.dmg || 0; return s; }
  tick(game) {
    this.age++;
    if (this.pickupDelay > 0) this.pickupDelay--;
    const w = game.world;
    const env = liquidAt(w, this);
    if (env.water) { this.vy += 0.01; this.vx *= 0.9; this.vz *= 0.9; }
    if (env.lava) { this.removed = true; game.fx({ k: 'snd', s: 'fizz', x: this.x, y: this.y, z: this.z }); return; }
    // pushed out of solid blocks
    const id = w.getBlockColl(Math.floor(this.x), Math.floor(this.y + 0.1), Math.floor(this.z));
    if (SOLID[id] && blocks[id] && blocks[id].opaque) { this.vy = 0.2; this.y += 0.05; }
    this.vy -= 0.04;
    moveEntity(w, this, this.vx, this.vy, this.vz);
    const f = this.onGround ? 0.6 * 0.98 : 0.98;
    this.vx *= f; this.vz *= f; this.vy *= 0.98;
    if (this.onGround) this.vy *= -0.5;
    if (this.age > 6000) this.removed = true;
    // merge
    if (game.authority && this.age % 20 === 0) {
      for (const o of game.entities.values()) {
        if (o === this || o.type !== 'item' || o.removed) continue;
        if (o.item.id === this.item.id && o.item.meta === this.item.meta && !o.item.dmg && !this.item.dmg && this.dist2(o) < 1 && o.item.count + this.item.count <= maxStack(this.item.id)) {
          this.item.count += o.item.count; o.removed = true; game.dirtyEntity(this);
        }
      }
    }
  }
}

// ------------------------------------------------------------------ projectiles
export class Arrow extends Entity {
  constructor(x, y, z, owner) { super('arrow', x, y, z); this.w = 0.3; this.h = 0.3; this.owner = owner ? owner.id : 0; this.stuck = false; this.dmg = 2; this.stepHeight = 0; this.fromPlayer = owner && owner.type === 'player'; }
  shoot(dx, dy, dz, speed, spread) {
    const d = Math.hypot(dx, dy, dz) || 1;
    this.vx = dx / d * speed + (Math.random() - 0.5) * spread * 0.0075 * 10;
    this.vy = dy / d * speed + (Math.random() - 0.5) * spread * 0.0075 * 10;
    this.vz = dz / d * speed + (Math.random() - 0.5) * spread * 0.0075 * 10;
    this.updateRot();
  }
  updateRot() { const h = Math.hypot(this.vx, this.vz); this.yaw = Math.atan2(this.vx, -this.vz); this.pitch = Math.atan2(this.vy, h); }
  extra() { return { p: this.pitch, s: this.stuck ? 1 : 0 }; }
  applyExtra(x) { if (x) { this.pitch = x.p; this.stuck = !!x.s; } }
  tick(game) {
    this.age++;
    if (this.stuck) { if (this.age > 1200) this.removed = true; return; }
    const w = game.world;
    // entity hit check along path
    if (game.authority) {
      const steps = Math.ceil(Math.hypot(this.vx, this.vy, this.vz) / 0.3);
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const x = this.x + this.vx * t, y = this.y + this.vy * t, z = this.z + this.vz * t;
        for (const e of game.livingEntities()) {
          if (e.id === this.owner && this.age < 5) continue;
          if (e.deathTime > 0) continue;
          const hw = e.w / 2 + 0.15;
          if (x > e.x - hw && x < e.x + hw && z > e.z - hw && z < e.z + hw && y > e.y - 0.1 && y < e.y + e.h + 0.1) {
            const sp = Math.hypot(this.vx, this.vy, this.vz);
            const owner = game.entities.get(this.owner) || game.players.get(this.owner);
            e.damage(game, Math.ceil(sp * this.dmg), { entity: owner || this, knock: 0.3 });
            game.fx({ k: 'snd', s: 'hit', x, y, z });
            this.removed = true;
            return;
          }
        }
      }
    }
    const bx = Math.floor(this.x + this.vx), by = Math.floor(this.y + this.vy), bz = Math.floor(this.z + this.vz);
    const before = [this.vx, this.vy, this.vz];
    moveEntity(w, this, this.vx, this.vy, this.vz);
    if (this.vx !== before[0] || this.vy !== before[1] || this.vz !== before[2]) {
      this.stuck = true; this.age = 0; this.vx = this.vy = this.vz = 0;
      game.fx({ k: 'snd', s: 'arrowhit', x: this.x, y: this.y, z: this.z });
      game.dirtyEntity(this);
      return;
    }
    const inW = isWater(w.getBlock(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)));
    const drag = inW ? 0.8 : 0.99;
    this.vx *= drag; this.vy *= drag; this.vz *= drag;
    this.vy -= 0.05;
    this.updateRot();
    if (this.age > 1200) this.removed = true;
  }
}

export class Thrown extends Entity {
  constructor(kind, x, y, z, owner) { super(kind, x, y, z); this.w = 0.25; this.h = 0.25; this.owner = owner ? owner.id : 0; this.stepHeight = 0; }
  tick(game) {
    this.age++;
    const w = game.world;
    if (game.authority) {
      for (const e of game.livingEntities()) {
        if (e.id === this.owner && this.age < 5) continue;
        const hw = e.w / 2 + 0.2;
        if (this.x > e.x - hw && this.x < e.x + hw && this.z > e.z - hw && this.z < e.z + hw && this.y > e.y && this.y < e.y + e.h) {
          e.damage(game, 0.0001, { entity: this, knock: 0.25 });
          e.health = Math.min(e.maxHealth, Math.ceil(e.health));
          this.hit(game); return;
        }
      }
    }
    const before = [this.vx, this.vy, this.vz];
    moveEntity(w, this, this.vx, this.vy, this.vz);
    if (this.vx !== before[0] || this.vy !== before[1] || this.vz !== before[2]) { this.hit(game); return; }
    this.vx *= 0.99; this.vy *= 0.99; this.vz *= 0.99;
    this.vy -= 0.03;
    if (this.age > 400) this.removed = true;
  }
  hit(game) {
    this.removed = true;
    game.fx({ k: 'poof', x: this.x, y: this.y, z: this.z, tile: this.type === 'egg' ? 'egg' : 'snowball' });
    if (this.type === 'egg' && game.authority && game.rand() < 0.125) {
      const c = new Chicken(this.x, this.y, this.z); c.scale = 1; game.addEntity(c);
    }
  }
}

export class PrimedTNT extends Entity {
  constructor(x, y, z, fuse = 80) { super('tnt', x, y, z); this.w = 0.98; this.h = 0.98; this.fuse = fuse; this.vy = 0.2; this.stepHeight = 0; }
  extra() { return { f: this.fuse }; }
  applyExtra(x) { if (x) this.fuse = x.f; }
  tick(game) {
    this.vy -= 0.04;
    moveEntity(game.world, this, this.vx, this.vy, this.vz);
    this.vx *= 0.98; this.vy *= 0.98; this.vz *= 0.98;
    if (this.onGround) { this.vx *= 0.7; this.vz *= 0.7; this.vy *= -0.5; }
    if (game.authority && --this.fuse <= 0) { this.removed = true; game.explode(this.x, this.y + 0.49, this.z, 4, this); }
    else if (!game.authority) this.fuse--;
  }
}

export class FallingBlock extends Entity {
  constructor(x, y, z, block, meta) { super('falling', x, y, z); this.w = 0.98; this.h = 0.98; this.block = block; this.meta = meta; this.stepHeight = 0; }
  extra() { return { b: this.block, m: this.meta }; }
  applyExtra(x) { if (x) { this.block = x.b; this.meta = x.m; } }
  tick(game) {
    this.age++;
    this.vy -= 0.04;
    moveEntity(game.world, this, this.vx, this.vy, this.vz);
    this.vy *= 0.98;
    if (!game.authority) return;
    if (this.onGround || this.age > 600) {
      this.removed = true;
      const bx = Math.floor(this.x), by = Math.floor(this.y + 0.5), bz = Math.floor(this.z);
      const cur = game.world.getBlock(bx, by, bz);
      if (blocks[cur].replaceable || cur === 0) game.setBlock(bx, by, bz, this.block, this.meta);
      else game.spawnItem(this.x, this.y + 0.5, this.z, this.block, 1, 0);
    }
  }
}

export class Painting extends Entity {
  // bx,by,bz = cell in front of the wall holding the bottom-left tile; dir = facing (2..5)
  constructor(bx, by, bz, dir, art) {
    super('painting', bx + 0.5, by, bz + 0.5);
    this.bx = bx; this.by = by; this.bz = bz; this.dir = dir; this.art = art;
    this.noGravity = true; this.w = 0; this.h = 0;
  }
  extra() { return { b: [this.bx, this.by, this.bz, this.dir, this.art] }; }
  applyExtra(x) { if (x && x.b) [this.bx, this.by, this.bz, this.dir, this.art] = x.b; }
  cells() {
    const art = PAINTINGS[this.art % PAINTINGS.length];
    const out = [];
    for (let ty = 0; ty < art.h; ty++) for (let tx = 0; tx < art.w; tx++) {
      let x = this.bx, z = this.bz;
      if (this.dir === 2) x -= tx; else if (this.dir === 3) x += tx; else if (this.dir === 4) z += tx; else z -= tx;
      out.push([x, this.by + ty, z]);
    }
    return out;
  }
  wallOf(c) {
    const [x, y, z] = c;
    if (this.dir === 2) return [x, y, z + 1];
    if (this.dir === 3) return [x, y, z - 1];
    if (this.dir === 4) return [x + 1, y, z];
    return [x - 1, y, z];
  }
  valid(world) {
    for (const c of this.cells()) {
      const id = world.getBlock(c[0], c[1], c[2]);
      if (id !== 0 && !blocks[id].replaceable) return false;
      const w = this.wallOf(c);
      const wid = world.getBlock(w[0], w[1], w[2]);
      if (!SOLID[wid] || !blocks[wid].opaque) return false;
    }
    return true;
  }
  tick(game) {
    this.age++;
    if (game.authority && this.age % 20 === 0 && !this.valid(game.world)) {
      this.removed = true; game.spawnItem(this.x, this.y + 0.5, this.z, I.PAINTING, 1, 0);
    }
  }
  hitTest(ox, oy, oz, dx, dy, dz, maxD) {
    // ray vs thin boxes covering painting cells
    let best = null;
    for (const c of this.cells()) {
      const w = this.wallOf(c);
      const cx = c[0], cy = c[1], cz = c[2];
      let b;
      const t = 0.0625;
      if (this.dir === 2) b = [cx, cy, cz + 1 - t, cx + 1, cy + 1, cz + 1];
      else if (this.dir === 3) b = [cx, cy, cz, cx + 1, cy + 1, cz + t];
      else if (this.dir === 4) b = [cx + 1 - t, cy, cz, cx + 1, cy + 1, cz + 1];
      else b = [cx, cy, cz, cx + t, cy + 1, cz + 1];
      const d = rayBox(ox, oy, oz, dx, dy, dz, b);
      if (d !== null && d < maxD && (best === null || d < best)) best = d;
    }
    return best;
  }
}

export function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = 1e9;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < b[a] || o[a] > b[a + 3]) return null; continue; }
    let t1 = (b[a] - o[a]) / d[a], t2 = (b[a + 3] - o[a]) / d[a];
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

export function createEntity(type, x, y, z, ex) {
  let e;
  if (MOB_CLASSES[type]) e = new MOB_CLASSES[type](x, y, z);
  else if (type === 'item') e = new ItemEntity(x, y, z, 1, 1, 0);
  else if (type === 'arrow') e = new Arrow(x, y, z, null);
  else if (type === 'snowball' || type === 'egg') e = new Thrown(type, x, y, z, null);
  else if (type === 'tnt') e = new PrimedTNT(x, y, z);
  else if (type === 'falling') e = new FallingBlock(x, y, z, B.SAND, 0);
  else if (type === 'painting') e = new Painting(0, 0, 0, 2, 0);
  else if (type === 'player') e = new Player('?', x, y, z);
  else return null;
  if (ex) e.applyExtra(ex);
  if (type === 'item' && ex && ex.dmg) e.item.dmg = ex.dmg;
  return e;
}
