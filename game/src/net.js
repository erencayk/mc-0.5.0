// LAN multiplayer: host-authoritative protocol over the native TCP bridge (or the web dev relay).
import { deflateSync, inflateSync } from 'fflate';
import { b64encode, b64decode } from './storage.js';
import { getTransport } from './bridge.js';
import { WX, WZ, WY } from './world.js';
import { Player, createEntity, PLAYER_COLORS } from './entities.js';
import { Inventory } from './items.js';

export const PORT = 19135;
export const PROTO = 5;

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

function entSpawn(e) {
  return [e.id, e.type, r3(e.x), r3(e.y), r3(e.z), r2(e.yaw), r2(e.pitch || 0), e.extra()];
}

// ================================================================== SERVER
export class Server {
  constructor(game, opts) {
    this.game = game;
    this.t = getTransport();
    this.clients = new Map(); // cid -> {cid, player, ready, chunkQueue, name}
    this.blockQueue = [];
    this.dirtyEnts = new Set();
    this.lastSent = new Map();
    this.worldName = opts.worldName;
    this.hostName = opts.hostName;
    this.playerData = opts.playerData || {};
    this.onChange = opts.onChange || (() => { });
    this.open = false;
    const g = game;
    g.hooks.blockChange.push((x, y, z, id, meta) => { if (this.clients.size) this.blockQueue.push([x, y, z, id, meta]); });
    g.hooks.entityAdd.push((e) => this.bcast({ t: 'spawn', e: entSpawn(e) }, e.type === 'player' ? e : null));
    g.hooks.entityRemove.push((e) => { this.lastSent.delete(e.id); this.bcast({ t: 'rm', ids: [e.id] }); });
    g.hooks.entityDirty.push((e) => this.dirtyEnts.add(e.id));
    g.fxListeners.push((fx) => { if (!fx._remote) this.bcastFx(fx); });
    this.t.handlers.accept = (cid, addr) => this.onAccept(cid, addr);
    this.t.handlers.msg = (cid, data) => this.onMsg(cid, data);
    this.t.handlers.close = (cid) => this.onClose(cid);
  }
  start() {
    if (this.open) return;
    this.open = true;
    this.t.host(PORT);
    this.t.advertise(this.worldName + ' (' + this.hostName + ')', PORT, { w: this.worldName, h: this.hostName, v: PROTO, m: this.game.world.mode });
  }
  stop() {
    if (!this.open) return;
    for (const c of this.clients.values()) { this.sendTo(c, { t: 'bye', reason: 'Host closed the world' }); this.t.close(c.cid); }
    this.t.unadvertise();
    this.t.unhost();
    this.open = false;
  }
  sendTo(c, m) { this.t.send(c.cid, JSON.stringify(m)); }
  bcast(m, except) {
    const s = JSON.stringify(m);
    for (const c of this.clients.values()) if (c.ready && c.player !== except) this.t.send(c.cid, s);
  }
  bcastFx(fx) {
    const s = JSON.stringify({ t: 'fx', e: fx });
    for (const c of this.clients.values()) {
      if (!c.ready) continue;
      if (fx.only && fx.only !== c.player.id) continue;
      this.t.send(c.cid, s);
    }
  }
  onAccept(cid, addr) {
    if (!this.open) { this.t.close(cid); return; }
    this.clients.set(cid, { cid, player: null, ready: false, chunkQueue: [], addr });
  }
  onClose(cid) {
    const c = this.clients.get(cid);
    if (!c) return;
    this.clients.delete(cid);
    if (c.player) {
      this.savePlayer(c.player);
      this.game.removeEntity(c.player);
      this.game.broadcastMsg(c.player.name + ' left the game');
    }
    this.onChange();
  }
  savePlayer(p) {
    this.playerData[p.name] = { x: p.x, y: p.y, z: p.z, hp: p.health, inv: p.inv.toJSON(), mode: p.mode, sp: p.spawnPoint };
  }
  onMsg(cid, data) {
    const c = this.clients.get(cid);
    if (!c) return;
    let m;
    try { m = JSON.parse(data); } catch (e) { return; }
    const g = this.game;
    if (m.t === 'hello') {
      if (m.v !== PROTO) { this.sendTo(c, { t: 'bye', reason: 'Incompatible version' }); this.t.close(cid); return; }
      let name = String(m.name || 'Player').slice(0, 16).replace(/[^\w \-.]/g, '') || 'Player';
      const taken = new Set([...g.players.values()].map((p) => p.name));
      if (taken.has(name)) { let i = 2; while (taken.has(name + i)) i++; name = name + i; }
      const saved = this.playerData[name];
      const sp = saved ? [saved.x, saved.y, saved.z] : g.validSpawn({ spawnPoint: null });
      const p = new Player(name, sp[0], sp[1], sp[2]);
      p.remote = true;
      p.mode = saved ? saved.mode : g.world.mode;
      p.color = PLAYER_COLORS[(m.color | 0) % PLAYER_COLORS.length];
      if (saved) { p.inv.load(saved.inv); p.health = saved.hp || 20; p.spawnPoint = saved.sp || null; }
      p.tx = p.x; p.ty = p.y; p.tz = p.z;
      p.sink = this.makeSink(c, p);
      c.player = p;
      c.name = name;
      this.sendTo(c, {
        t: 'welcome', id: p.id, name, seed: g.world.seed, time: g.world.time, mode: p.mode, worldMode: g.world.mode,
        pos: [p.x, p.y, p.z], hp: p.health, inv: p.inv.toJSON(), world: this.worldName, diff: g.difficulty, spawn: g.world.spawn,
        biomes: g.world.biomes ? b64encode(deflateSync(g.world.biomes)) : null
      });
      for (let cx = 0; cx < WX / 16; cx++) for (let cz = 0; cz < WZ / 16; cz++) c.chunkQueue.push([cx, cz]);
      // nearest chunks first
      const pcx = p.x / 16, pcz = p.z / 16;
      c.chunkQueue.sort((a, b) => ((a[0] - pcx) ** 2 + (a[1] - pcz) ** 2) - ((b[0] - pcx) ** 2 + (b[1] - pcz) ** 2));
      return;
    }
    const p = c.player;
    if (!p) return;
    if (m.t === 'pos') {
      if (p.deathTime > 0) return;
      if (!Number.isFinite(m.x) || !Number.isFinite(m.y) || !Number.isFinite(m.z)) return;
      p.tx = Math.max(-2, Math.min(WX + 2, m.x)); p.ty = Math.max(-80, Math.min(WY + 64, m.y)); p.tz = Math.max(-2, Math.min(WZ + 2, m.z));
      p.yaw = m.yaw; p.pitch = m.pitch; p.onGround = !!m.g;
      const sn = !!m.sn; if (sn !== p.sneak) { p.sneak = sn; this.dirtyEnts.add(p.id); }
      p.flying = !!m.f;
      return;
    }
    if (m.t === 'cmd' && m.cmd) { g.command(p, m.cmd); return; }
    if (m.t === 'ping') { this.sendTo(c, { t: 'pong', k: m.k }); }
  }
  makeSink(c, p) {
    const s = (m) => this.sendTo(c, m);
    return {
      inv: () => s({ t: 'inv', s: p.inv.toJSON(), sel: p.sel }),
      hp: () => s({ t: 'hp', v: p.health, air: p.air, dead: p.deathTime > 0 ? 1 : 0 }),
      msg: (text) => s({ t: 'msg', s: text }),
      open: (kind, data) => s({ t: 'open', kind, data }),
      cont: (st) => s({ t: 'cont', s: st }),
      sleep: (st, wake) => s({ t: 'sleep', s: st, wake }),
      teleport: (x, y, z) => { p.tx = x; p.ty = y; p.tz = z; s({ t: 'tp', x, y, z }); },
      knock: (vx, vy, vz) => s({ t: 'knock', v: [vx, vy, vz] }),
      mode: (m) => s({ t: 'mode', m })
    };
  }
  // called once per server tick
  tick() {
    const g = this.game;
    // remote players smoothly follow reported positions
    for (const c of this.clients.values()) {
      const p = c.player;
      if (!p || p.tx === undefined) continue;
      p.savePrev();
      p.x = p.tx; p.y = p.ty; p.z = p.tz;
      const mv = Math.hypot(p.x - p.px, p.z - p.pz);
      p.walkAmt += (Math.min(1, mv * 4) - p.walkAmt) * 0.4; p.walkAnim += mv * 4;
    }
    // stream chunks to joining clients
    for (const c of this.clients.values()) {
      if (!c.player || c.ready) continue;
      let n = 0;
      while (c.chunkQueue.length && n < 6) {
        const [cx, cz] = c.chunkQueue.shift();
        const raw = g.world.exportChunk(cx, cz);
        this.sendTo(c, { t: 'chunk', cx, cz, d: b64encode(deflateSync(raw, { level: 4 })), left: c.chunkQueue.length });
        n++;
      }
      if (!c.chunkQueue.length) {
        // pending block updates during streaming are included because later chunks are fresh; resend recent ones
        c.ready = true;
        this.sendTo(c, { t: 'ready' });
        const list = [];
        for (const e of g.entities.values()) list.push(entSpawn(e));
        for (const p of g.players.values()) if (p !== c.player) list.push(entSpawn(p));
        this.sendTo(c, { t: 'spawnMany', l: list });
        if (g.reactor) this.sendTo(c, { t: 'reactor', r: g.reactor });
        g.addEntity(c.player);
        g.broadcastMsg(c.player.name + ' joined the game');
        c.player.sink.inv();
        this.onChange();
      }
    }
    if (!this.clients.size) { this.blockQueue.length = 0; this.dirtyEnts.clear(); return; }
    if (this.blockQueue.length) {
      const l = this.blockQueue; this.blockQueue = [];
      const s = JSON.stringify({ t: 'b', l });
      for (const c of this.clients.values()) this.t.send(c.cid, s); // streaming clients need these too
    }
    if (g.tick % 2 === 0) this.sendEntities();
    if (g.tick % 40 === 0) this.bcast({ t: 'time', v: g.world.time });
  }
  sendEntities() {
    const g = this.game;
    const list = [];
    const consider = (e) => {
      const ls = this.lastSent.get(e.id);
      const dirty = this.dirtyEnts.has(e.id);
      const yaw = e.type === 'player' ? e.yaw : (e.ryaw !== undefined ? e.ryaw : e.yaw);
      if (!ls || dirty || Math.abs(ls[0] - e.x) > 0.01 || Math.abs(ls[1] - e.y) > 0.01 || Math.abs(ls[2] - e.z) > 0.01 || Math.abs(ls[3] - yaw) > 0.02 || Math.abs(ls[4] - (e.pitch || 0)) > 0.02 || (e.hurtTime > 0) !== ls[5] || (e.deathTime > 0) !== ls[6]) {
        const row = [e.id, r3(e.x), r3(e.y), r3(e.z), r2(yaw), r2(e.pitch || 0), e.hurtTime > 0 ? 1 : 0, e.deathTime > 0 ? 1 : 0];
        if (dirty) row.push(e.extra());
        list.push(row);
        this.lastSent.set(e.id, [e.x, e.y, e.z, yaw, e.pitch || 0, e.hurtTime > 0, e.deathTime > 0]);
      }
    };
    for (const e of g.entities.values()) if (e.type !== 'painting' || this.dirtyEnts.has(e.id)) consider(e);
    for (const p of g.players.values()) consider(p);
    this.dirtyEnts.clear();
    if (!list.length) return;
    // each client: skip its own player row
    for (const c of this.clients.values()) {
      if (!c.ready) continue;
      const mine = c.player.id;
      const l = list.filter((r) => r[0] !== mine);
      if (l.length) this.t.send(c.cid, JSON.stringify({ t: 'ents', l }));
    }
  }
  playerCount() { let n = 0; for (const c of this.clients.values()) if (c.ready) n++; return n; }
}

// ================================================================== CLIENT
export class Client {
  constructor(host, port, opts) {
    this.t = getTransport();
    this.host = host; this.port = port || PORT;
    this.opts = opts;
    this.cid = null;
    this.handlers = opts.handlers;
    this.chunksLeft = WX * WZ / 256;
  }
  connect() {
    this.t.handlers.open = (cid) => { if (cid === this.cid) this.send({ t: 'hello', v: PROTO, name: this.opts.name, color: this.opts.color }); };
    this.t.handlers.msg = (cid, data) => { if (cid === this.cid) this.onMsg(data); };
    this.t.handlers.close = (cid) => { if (cid === this.cid) this.handlers.closed('Connection lost'); };
    this.t.handlers.error = (cid, msg) => { if (cid === this.cid) this.handlers.closed('Could not connect: ' + (msg || 'error')); };
    this.cid = this.t.connect(this.host, this.port);
  }
  send(m) { if (this.cid) this.t.send(this.cid, JSON.stringify(m)); }
  cmd(c) { this.send({ t: 'cmd', cmd: c }); }
  close() { if (this.cid) this.t.close(this.cid); this.cid = null; }
  onMsg(data) {
    let m;
    try { m = JSON.parse(data); } catch (e) { return; }
    const h = this.handlers;
    switch (m.t) {
      case 'welcome': h.welcome(m); break;
      case 'chunk': h.chunk(m.cx, m.cz, inflateSync(b64decode(m.d)), m.left); break;
      case 'ready': h.ready(); break;
      case 'b': h.blocks(m.l); break;
      case 'spawn': h.spawn([m.e]); break;
      case 'spawnMany': h.spawn(m.l); break;
      case 'rm': h.remove(m.ids); break;
      case 'ents': h.ents(m.l); break;
      case 'time': h.time(m.v); break;
      case 'fx': h.fx(m.e); break;
      case 'inv': h.inv(m.s, m.sel); break;
      case 'hp': h.hp(m.v, m.air, m.dead); break;
      case 'msg': h.msg(m.s); break;
      case 'open': h.open(m.kind, m.data); break;
      case 'cont': h.cont(m.s); break;
      case 'sleep': h.sleep(m.s, m.wake); break;
      case 'tp': h.tp(m.x, m.y, m.z); break;
      case 'knock': h.knock(m.v); break;
      case 'mode': h.mode(m.m); break;
      case 'reactor': h.reactor && h.reactor(m.r); break;
      case 'bye': h.closed(m.reason || 'Disconnected'); this.close(); break;
    }
  }
}

// ------------------------------------------------------------------ discovery
export function discoverGames(onFound, onLost) {
  const t = getTransport();
  t.discover(onFound, onLost);
  return () => t.undiscover();
}
