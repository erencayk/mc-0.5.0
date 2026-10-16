// Local player controller: movement, looking, breaking/placing via touch or mouse, camera & hand.
import { B, blocks, selectionBox, LIQUID, isWater, isLava, R, OPAQUE } from './blocks.js';
import { getItem, I, isBlockItem } from './items.js';
import { livingPhysics, rayBox } from './entities.js';
import { drawItem, drawBox, T3 } from './models.js';
import { tex, tileUV } from './textures.js';
import * as audio from './audio.js';

const REACH_S = 5, REACH_C = 6;
const INTERACTIVE = new Set([B.WOOD_DOOR, B.TRAPDOOR, B.FENCE_GATE, B.CHEST, B.FURNACE, B.LIT_FURNACE, B.WORKBENCH, B.BED, B.REACTOR, B.TNT]);

export function breakTicks(id, held) {
  const b = blocks[id];
  if (!b || b.hardness < 0) return Infinity;
  if (b.hardness === 0) return 1;
  const tool = held ? getItem(held.id) : null;
  let speed = 1;
  if (tool && tool.tool && (tool.tool === b.tool || (tool.tool === 'sword' && b.id === B.COBWEB) || (tool.tool === 'shears' && (b.leaves || b.id === B.WOOL || b.id === B.COBWEB)))) speed = tool.speed;
  if (tool && tool.tool === 'sword' && b.id !== B.COBWEB) speed = 1.5;
  let harvest = true;
  if (b.level >= 0 && b.tool === 'pickaxe') harvest = !!(tool && tool.tool === 'pickaxe' && tool.tier >= b.level);
  const perTick = speed / b.hardness / (harvest ? 30 : 100);
  return Math.ceil(1 / perTick);
}

export class Controller {
  constructor(app) {
    this.app = app;
    this.input = { fwd: 0, strafe: 0, jump: false, sneak: false };
    this.breaking = null; // {x,y,z, progress, ticks}
    this.holdAim = null; // screen point being held (touch) or 'center'
    this.target = null;
    this.targetEnt = null;
    this.digCooldown = 0;
    this.swing = 0;
    this.stepDist = 0;
    this.bowCharge = -1;
    this.lastJumpTap = 0;
    this.camBob = 0;
    this.prevBob = 0;
    this.landY = 0;
    this.wasInWater = false;
    this.useCooldown = 0;
  }
  get p() { return this.app.me; }
  get game() { return this.app.game; }
  get world() { return this.app.world; }

  // ------------------------------------------------------------------ fixed tick
  tick() {
    const p = this.p, w = this.world;
    if (!p) return;
    p.savePrev();
    this.prevBob = this.camBob;
    if (this.digCooldown > 0) this.digCooldown--;
    if (this.useCooldown > 0) this.useCooldown--;
    if (this.swing > 0) this.swing = Math.max(0, this.swing - 0.17);
    if (p.deathTime > 0 || this.app.paused && !this.app.isMultiplayer()) return;
    if (p.sleeping) { p.vx = p.vy = p.vz = 0; return; }
    const inp = this.app.menuOpen() ? { fwd: 0, strafe: 0, jump: false, sneak: false } : this.input;
    p.sneak = inp.sneak && !p.flying;
    const speed = p.sneak ? 0.03 : 0.1;
    const wasGround = p.onGround;
    const preY = p.y;
    const env = livingPhysics(w, p, { fwd: inp.fwd, strafe: inp.strafe, jump: inp.jump, speed }, p.flying, inp.sneak);
    if (p.flying && p.onGround && p.mode === 'creative' && !inp.jump) p.flying = false;
    if (p.mode !== 'creative') p.flying = false;
    // landing / fall damage
    if (p.onGround && !wasGround) {
      if (p.fallDist > 3 && p.mode !== 'creative' && !env.water) this.app.command({ c: 'fall', d: Math.ceil(p.fallDist - 3) });
      if (p.fallDist > 1.5) audio.play('step', { mat: this.matUnder(), vol: 1.5 });
      p.fallDist = 0;
    }
    if (env.water && !this.wasInWater) audio.play('splash', { vol: Math.min(1, Math.abs(p.vy) * 3 + 0.3) });
    this.wasInWater = env.water;
    // footsteps
    const mv = Math.hypot(p.x - p.px, p.z - p.pz);
    if (p.onGround && !p.sneak) { this.stepDist += mv; if (this.stepDist > 1.7) { this.stepDist = 0; audio.play('step', { mat: this.matUnder() }); } }
    p.walkAmt += (Math.min(1, mv * 4) - p.walkAmt) * 0.4; p.walkAnim += mv * 4;
    if (p.onGround) this.camBob += mv;
    // breaking
    this.tickBreaking();
    // bow charge
    if (this.bowCharge >= 0) this.bowCharge = Math.min(1, this.bowCharge + 1 / 20);
  }

  matUnder() {
    const p = this.p;
    const id = this.world.getBlock(Math.floor(p.x), Math.floor(p.y - 0.2), Math.floor(p.z));
    return blocks[id] ? blocks[id].sound : 'stone';
  }

  tickBreaking() {
    const p = this.p;
    if (!this.holdAim || this.app.menuOpen()) { this.breaking = null; return; }
    const held = p.held();
    // bow: charging instead of breaking
    if (held && held.id === I.BOW) return;
    const hit = this.aim(this.holdAim);
    if (hit && hit.ent) {
      // holding on a mob attacks it repeatedly
      if (this.digCooldown <= 0) { this.attackEntity(hit.ent); this.digCooldown = 10; }
      this.breaking = null;
      return;
    }
    if (!hit || !hit.block) { this.breaking = null; return; }
    const { x, y, z } = hit.block;
    const id = this.world.getBlock(x, y, z);
    if (!this.breaking || this.breaking.x !== x || this.breaking.y !== y || this.breaking.z !== z) {
      this.breaking = { x, y, z, progress: 0, n: 0 };
    }
    if (p.mode === 'creative') {
      if (this.digCooldown <= 0) { this.digBlock(x, y, z, id); this.digCooldown = 6; }
      this.breaking = null;
      return;
    }
    const bt = breakTicks(id, held);
    let rate = 1 / bt;
    if (isWater(this.world.getBlock(Math.floor(p.x), Math.floor(p.y + p.eyeH), Math.floor(p.z)))) rate /= 5;
    if (!p.onGround && !p.flying && !p.inWater) rate /= 5;
    this.breaking.progress += rate;
    this.breaking.n++;
    this.swing = 1;
    if (this.breaking.n % 4 === 1) {
      audio.play('dig', { mat: blocks[id].sound });
      this.app.particles.blockHit(x, y, z, id, this.world.getMeta(x, y, z), hit.block.f);
      if (this.app.isMultiplayer()) this.app.command({ c: 'swing' });
    }
    if (this.breaking.progress >= 1 && this.digCooldown <= 0) {
      this.digBlock(x, y, z, id);
      this.breaking = null;
      this.digCooldown = 5;
    }
  }

  digBlock(x, y, z, id) {
    const meta = this.world.getMeta(x, y, z);
    this.app.command({ c: 'dig', x, y, z });
    this.swing = 1;
    if (!this.game.authority) {
      // predict locally for responsiveness; the host corrects us if needed
      this.app.particles.blockBreak(x, y, z, id, meta);
      audio.play('break', { mat: blocks[id].sound });
      this.world.setBlock(x, y, z, 0);
    }
  }

  attackEntity(e) {
    this.swing = 1;
    const held = this.p.held();
    if (e.type === 'sheep' && held && (held.id === I.SHEARS || held.id === I.DYE)) this.app.command({ c: 'interact', id: e.id });
    else this.app.command({ c: 'attack', id: e.id });
  }

  // ------------------------------------------------------------------ actions from input layer
  pressStart(aim) {
    this.holdAim = aim;
    const held = this.p && this.p.held();
    if (held && held.id === I.BOW && (this.p.mode === 'creative' || this.p.inv.count(I.ARROW) > 0)) this.bowCharge = 0;
  }
  pressMove(aim) { if (this.holdAim) this.holdAim = aim; }
  pressEnd(aim, wasTap) {
    this.holdAim = null;
    this.breaking = null;
    if (this.bowCharge >= 0) {
      const c = this.bowCharge; this.bowCharge = -1;
      if (c > 0.1) { this.app.command({ c: 'bow', charge: c }); this.swing = 1; }
      if (!wasTap) return;
    }
    if (wasTap) this.use(aim, true);
  }
  // right-click / tap
  use(aim, fromTap = false) {
    const p = this.p;
    if (!p || p.deathTime > 0 || this.useCooldown > 0) return;
    this.useCooldown = 3;
    const hit = this.aim(aim);
    const held = p.held();
    if (hit && hit.ent) {
      if (fromTap || hit.ent.type === 'sheep') { this.attackEntity(hit.ent); return; }
    }
    const it = held ? getItem(held.id) : null;
    if (hit && hit.block && it && it.food) {
      // tapping with food eats it unless the block itself does something
      const bid = this.world.getBlock(hit.block.x, hit.block.y, hit.block.z);
      if (!INTERACTIVE.has(bid)) { this.app.command({ c: 'useItem' }); this.swing = 1; return; }
    }
    if (hit && hit.block) {
      const b = hit.block;
      this.app.command({ c: 'use', x: b.x, y: b.y, z: b.z, f: b.f, hy: b.hy });
      this.swing = 1;
      return;
    }
    if (held) {
      const it = getItem(held.id);
      if (it && (it.food || it.use === 'throw')) { this.app.command({ c: 'useItem' }); this.swing = 1; }
    }
  }
  attackPress(aim) {
    // mouse left button: attack entity immediately, otherwise begin breaking
    const hit = this.aim(aim);
    if (hit && hit.ent) { this.attackEntity(hit.ent); this.digCooldown = 8; return false; }
    return true;
  }

  jumpTap() {
    const now = performance.now();
    if (this.p && this.p.mode === 'creative' && now - this.lastJumpTap < 300) { this.p.flying = !this.p.flying; this.p.vy = 0; }
    this.lastJumpTap = now;
  }

  // ------------------------------------------------------------------ aiming
  eye(alpha = 1) {
    const p = this.p;
    const x = p.px + (p.x - p.px) * alpha, y = p.py + (p.y - p.py) * alpha, z = p.pz + (p.z - p.pz) * alpha;
    let eh = p.eyeH;
    if (p.sneak) eh -= 0.12;
    if (p.sleeping) eh = 0.3;
    if (p.deathTime > 0) eh = 0.2;
    return [x, y + eh, z];
  }
  // direction for a screen point (null = center)
  rayDir(aim) {
    const p = this.p;
    let dx = 0, dy = 0, dz = -1;
    if (aim && aim !== 'center') {
      const c = this.app.canvas;
      const W = c.clientWidth, H = c.clientHeight;
      const nx = (aim[0] / W) * 2 - 1, ny = 1 - (aim[1] / H) * 2;
      const t = Math.tan(this.app.renderer.fov * Math.PI / 360);
      dx = nx * t * (W / H); dy = ny * t; dz = -1;
    }
    // rotate camera-space dir by pitch then yaw (inverse of view)
    const cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
    const y1 = dy * cp + dz * sp, z1 = -dy * sp + dz * cp;
    const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
    const x2 = dx * cy - z1 * sy, z2 = dx * sy + z1 * cy;
    const l = Math.hypot(x2, y1, z2);
    return [x2 / l, y1 / l, z2 / l];
  }
  aim(aim) {
    const p = this.p;
    if (!p) return null;
    const [ox, oy, oz] = this.eye();
    const [dx, dy, dz] = this.rayDir(aim);
    const reach = p.mode === 'creative' ? REACH_C : REACH_S;
    const block = this.raycastBlock(ox, oy, oz, dx, dy, dz, reach);
    // entities
    let ent = null, ed = block ? block.d : reach;
    const consider = (e) => {
      if (e === p || e.removed || e.deathTime > 0) return;
      if (e.type === 'painting') {
        const d = e.hitTest(ox, oy, oz, dx, dy, dz, ed);
        if (d !== null && d < ed) { ed = d; ent = e; }
        return;
      }
      if (!e.living) return;
      const hw = e.w / 2 + 0.1;
      const d = rayBox(ox, oy, oz, dx, dy, dz, [e.x - hw, e.y - 0.05, e.z - hw, e.x + hw, e.y + e.h + 0.1, e.z + hw]);
      if (d !== null && d < ed) { ed = d; ent = e; }
    };
    for (const e of this.game.entities.values()) consider(e);
    for (const e of this.game.players.values()) if (e.id !== p.id) consider(e);
    if (ent) return { ent, d: ed };
    return block ? { block, d: block.d } : null;
  }
  raycastBlock(ox, oy, oz, dx, dy, dz, maxD) {
    const w = this.world;
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
    const tdx = Math.abs(1 / dx), tdy = Math.abs(1 / dy), tdz = Math.abs(1 / dz);
    let tmx = dx > 0 ? (x + 1 - ox) * tdx : (ox - x) * tdx;
    let tmy = dy > 0 ? (y + 1 - oy) * tdy : (oy - y) * tdy;
    let tmz = dz > 0 ? (z + 1 - oz) * tdz : (oz - z) * tdz;
    for (let i = 0; i < 64; i++) {
      const id = w.getBlock(x, y, z);
      if (id && !LIQUID[id] && blocks[id].render !== R.NONE) {
        const sb = selectionBox(w, x, y, z, id, w.getMeta(x, y, z));
        if (sb) {
          const box = [x + sb[0], y + sb[1], z + sb[2], x + sb[3], y + sb[4], z + sb[5]];
          const t = rayBox(ox, oy, oz, dx, dy, dz, box);
          if (t !== null && t <= maxD) {
            const hx = ox + dx * t, hy = oy + dy * t, hz = oz + dz * t;
            // face from hit point
            const e = 1e-4;
            let f;
            if (Math.abs(hy - box[1]) < e) f = 0; else if (Math.abs(hy - box[4]) < e) f = 1;
            else if (Math.abs(hz - box[2]) < e) f = 2; else if (Math.abs(hz - box[5]) < e) f = 3;
            else if (Math.abs(hx - box[0]) < e) f = 4; else f = 5;
            return { x, y, z, f, d: t, hy: hy - y, box: sb };
          }
        }
      }
      if (tmx < tmy && tmx < tmz) { if (tmx > maxD) break; x += sx; tmx += tdx; }
      else if (tmy < tmz) { if (tmy > maxD) break; y += sy; tmy += tdy; }
      else { if (tmz > maxD) break; z += sz; tmz += tdz; }
    }
    return null;
  }

  updateTarget(aim) {
    const hit = this.aim(aim);
    this.target = hit && hit.block ? hit.block : null;
    this.targetEnt = hit && hit.ent ? hit.ent : null;
  }

  // ------------------------------------------------------------------ hand rendering (view space)
  buildHand(mesh, alpha) {
    const p = this.p;
    if (!p || p.sleeping || p.deathTime > 0) return;
    const held = p.held();
    const bx = p.x, by = p.y + p.eyeH, bz = p.z;
    const w = this.world;
    const L = w.light[((Math.floor(bx) & 255) << 15) | ((Math.floor(bz) & 255) << 7) | Math.max(0, Math.min(127, Math.floor(by)))] || 0;
    const sky = Math.min(15, (L >> 4) + 1), blk = L & 15;
    const sw = this.swing;
    const swingA = Math.sin(sw * Math.PI);
    const bob = this.prevBob + (this.camBob - this.prevBob) * alpha;
    const bobX = Math.sin(bob * Math.PI) * 0.03 * p.walkAmt, bobY = -Math.abs(Math.cos(bob * Math.PI)) * 0.03 * p.walkAmt;
    let m = T3.id();
    if (held) {
      m = T3.t(m, 0.42 + bobX - swingA * 0.15, -0.42 + bobY + swingA * 0.1 - (this.bowCharge > 0 ? 0 : 0), -0.75 - swingA * 0.1);
      m = T3.rx(m, -swingA * 0.9);
      if (held.id === I.BOW && this.bowCharge >= 0) m = T3.t(T3.ry(m, 0.4), -0.2, 0.1, 0.1 + this.bowCharge * 0.1);
      const flat = !(isBlockItem(held.id) && blocks[held.id] && ![R.CROSS, R.TORCH, R.LADDER, R.CROPS, R.STEM, R.DOOR].includes(blocks[held.id].render));
      if (flat) { m = T3.ry(m, -0.8); m = T3.rz(m, 0.3); m = T3.s(m, 0.55, 0.55, 0.55); m = T3.t(m, -0.5, -0.3, -0.5); }
      else { m = T3.ry(m, 0.75); m = T3.s(m, 0.45, 0.45, 0.45); m = T3.t(m, -0.5, -0.5, -0.5); }
      drawItem(mesh, m, held.id, held.meta || 0, sky, blk);
    } else {
      m = T3.t(m, 0.5 + bobX - swingA * 0.2, -0.55 + bobY + swingA * 0.15, -0.6);
      m = T3.rx(m, -0.9 - swingA * 0.8);
      m = T3.ry(m, -0.35);
      const skin = [214, 166, 126];
      drawBox(mesh, m, -0.08, -0.5, -0.08, 0.08, 0.1, 0.08, skin, sky, blk);
    }
  }
}
