// App shell: boot, menus, sessions (single player / LAN host / LAN client), main loop.
import { buildAtlas } from './textures.js';
import { World, WX, WZ, WY } from './world.js';
import { generate, generateFlat } from './worldgen.js';
import { Renderer } from './renderer.js';
import { Game } from './game.js';
import { Player, createEntity, PLAYER_COLORS, setNextId, MOB_CLASSES } from './entities.js';
import { recipes } from './items.js';
import { Controller } from './controller.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Particles, buildEntities, buildOverlay } from './scene.js';
import { selectionBox, blocks, isWater, isLava, B } from './blocks.js';
import { Server, Client, discoverGames, PORT } from './net.js';
import { getTransport, isNative, keepAwake, platform, request } from './bridge.js';
import * as storage from './storage.js';
import * as audio from './audio.js';
import { deflateSync, inflateSync } from 'fflate';

const TICK_MS = 50;

class App {
  constructor() {
    this.canvas = document.getElementById('game');
    this.settings = storage.loadSettings();
    this.session = null;
    this.paused = false;
    this.particles = null;
  }

  async boot() {
    if (isNative) {
      try { const s = await request('fsRead', { path: 'settings.json' }); if (s) Object.assign(this.settings, JSON.parse(s)); } catch (e) { }
    }
    if (!this.settings.name) this.settings.name = 'Steve' + Math.floor(Math.random() * 900 + 100);
    buildAtlas();
    this.ui = new UI(this);
    this.ctrl = new Controller(this);
    this.input = new Input(this);
    this.applySettings();
    this.ui.title();
    this.last = performance.now();
    this.acc = 0;
    requestAnimationFrame((t) => this.frame(t));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.autosave(); });
    window.addEventListener('pagehide', () => this.autosave());
    window.addEventListener('resize', () => this.renderer && this.renderer.resize());
    // iOS only unlocks WebAudio from touchend/click user gestures
    for (const ev of ['touchend', 'click', 'keydown']) document.addEventListener(ev, () => audio.unlockAudio(), { passive: true });
  }

  // ------------------------------------------------------------------ settings
  saveSettings() {
    storage.saveSettings(this.settings);
    if (isNative) request('fsWrite', { path: 'settings.json', data: JSON.stringify(this.settings) }).catch(() => { });
  }
  applySettings() {
    const s = this.settings;
    audio.setVolume(s.sound);
    if (this.renderer) { this.renderer.renderDist = s.renderDist; this.renderer.fov = s.fov; }
    this.ui.setTouchControls(this.input ? this.input.touchMode : true, s.dpad);
    this.ui.setCrosshair(s.splitControls || (this.input && !this.input.touchMode));
    if (this.me && this.session && this.session.server === null && this.me.color) this.me.color = this.playerColor();
  }
  playerColor() { return PLAYER_COLORS[this.settings.color % PLAYER_COLORS.length]; }

  // ------------------------------------------------------------------ state helpers
  inGame() { return !!this.session && this.session.running; }
  menuOpen() { return this.ui.isOpen(); }
  isMultiplayer() { return !!this.session && (!!this.session.client || (this.session.server && this.session.server.playerCount() > 0)); }
  get me() { return this.session ? this.session.me : null; }
  get game() { return this.session ? this.session.game : null; }
  get world() { return this.session ? this.session.world : null; }
  get renderer() { return this.session ? this.session.renderer : null; }

  command(cmd) {
    const s = this.session;
    if (!s) return;
    if (s.client) s.client.cmd(cmd);
    else s.game.command(s.me, cmd);
  }
  selectSlot(i) {
    const me = this.me; if (!me) return;
    me.sel = i;
    this.command({ c: 'sel', s: i });
    this.ui.refreshHotbar();
  }

  // ------------------------------------------------------------------ menus
  async showWorlds() {
    let list = [];
    try { list = await storage.listWorlds(); } catch (e) { console.error(e); }
    this.ui.worlds(list);
  }
  closeScreens() {
    if (this.ui.screenName && ['chest', 'furnace'].includes(this.ui.screenName)) this.command({ c: 'close' });
    this.ui.hide();
    this.paused = false;
    if (this.me && this.me.deathTime > 0) this.ui.death();
  }
  openPause() {
    if (!this.session) return;
    const s = this.session;
    if (!s.client) this.paused = !this.isMultiplayer();
    const status = s.client ? `Connected to ${s.hostLabel}` : s.server && s.server.open ? `Hosting on LAN · ${s.server.playerCount()} other player(s) · IP ${this.localIpCache || '…'}` : 'Single player';
    this.ui.pause({ host: !s.client, lan: !!(s.server && s.server.open), client: !!s.client, status, canMode: !s.client, mode: this.me.mode });
    this.autosave();
  }
  openInventory() { if (this.me && !this.me.deathTime) this.ui.inventory(); }
  discover(onFound, onLost) { return discoverGames(onFound, onLost); }
  localIp() { return getTransport().localIp().then((ip) => (this.localIpCache = ip)); }
  toggleLan() {
    const s = this.session;
    if (!s || s.client) return;
    if (!s.server) s.server = this.makeServer(s);
    if (s.server.open) s.server.stop(); else s.server.start();
    this.updateLanBadge();
  }
  toggleMode() {
    const me = this.me;
    me.mode = me.mode === 'creative' ? 'survival' : 'creative';
    if (me.mode === 'survival') me.flying = false;
    this.ui.refreshStats();
  }
  updateLanBadge() {
    const s = this.session;
    if (!s) return;
    if (s.client) this.ui.setLanBadge('LAN: ' + s.hostLabel);
    else if (s.server && s.server.open) this.ui.setLanBadge(`LAN ${this.localIpCache || ''} · ${s.server.playerCount() + 1}P`);
    else this.ui.setLanBadge('');
  }

  // ------------------------------------------------------------------ sessions
  localSink(me) {
    return {
      inv: () => this.ui.invChanged(),
      hp: () => this.ui.refreshStats(),
      msg: (t) => this.ui.message(t),
      open: (kind, data) => { if (kind === 'workbench') this.ui.crafting(); else this.ui.container(kind, data.state); },
      cont: (st) => { if (this.ui.screenName === 'chest' || this.ui.screenName === 'furnace') this.ui.updateContainer(st); },
      sleep: (st, wake) => this.setSleeping(st, wake),
      teleport: (x, y, z) => { me.x = me.px = x; me.y = me.py = y; me.z = me.pz = z; me.vx = me.vy = me.vz = 0; },
      knock: (vx, vy, vz) => { me.vx += vx; me.vy += vy; me.vz += vz; },
      mode: (m) => { me.mode = m; this.ui.refreshStats(); }
    };
  }
  setSleeping(st, wake) {
    const me = this.me;
    me.sleeping = st;
    if (st) {
      me.x = me.px = st.x + 0.5; me.y = me.py = st.y + 0.56; me.z = me.pz = st.z + 0.5; me.vx = me.vy = me.vz = 0;
      me.yaw = [Math.PI, Math.PI / 2, 0, -Math.PI / 2][st.d]; me.pitch = 0;
      this.ui.closeAll && this.ui.closeAll();
    } else if (wake) { me.x = me.px = wake[0]; me.y = me.py = wake[1]; me.z = me.pz = wake[2]; }
    this.ui.setSleeping(!!st);
  }

  newSession(world, game, me, extra = {}) {
    if (this.session) this.endSession();
    const renderer = new Renderer(this.canvas, world);
    renderer.renderDist = this.settings.renderDist; renderer.fov = this.settings.fov;
    this.particles = new Particles(world);
    const s = Object.assign({ world, game, me, renderer, running: true, server: null, client: null, lastSave: performance.now() }, extra);
    this.session = s;
    game.fxListeners.push((fx) => this.onFx(fx));
    this.ui.showHUD(true);
    this.ui.hide();
    this.applySettings();
    this.ui.refreshHotbar(); this.ui.refreshStats();
    keepAwake(true);
    this.acc = 0;
    return s;
  }
  endSession() {
    const s = this.session;
    if (!s) return;
    s.running = false;
    if (s.server) s.server.stop();
    if (s.client) s.client.close();
    s.renderer.dispose();
    this.session = null;
    this.ui.showHUD(false);
    this.ui.setLanBadge('');
    this.ui.setSleeping(false);
    keepAwake(false);
  }
  makeServer(s) {
    return new Server(s.game, { worldName: s.meta.name, hostName: this.settings.name, playerData: s.meta.playerData || {}, onChange: () => this.updateLanBadge() });
  }

  async createWorld(opts) {
    this.ui.loading('Generating world', 0);
    await sleep(30);
    const world = new World();
    world.name = opts.name; world.mode = opts.mode;
    const t0 = performance.now();
    if (opts.type === 'flat') generateFlat(world, opts.seed);
    else generate(world, opts.seed, (p) => { /* synchronous; progress shown after */ });
    console.log('worldgen ms', Math.round(performance.now() - t0));
    world.time = 1000;
    const game = new Game(world, { authority: true, difficulty: opts.difficulty });
    game.spawnAnimals(opts.type === 'flat' ? 20 : 45);
    const id = 'w' + Date.now().toString(36);
    const meta = { name: opts.name, seed: opts.seed, mode: opts.mode, type: opts.type, difficulty: opts.difficulty, created: Date.now() };
    this.startHost(world, game, meta, id, null);
    await this.save();
  }

  async loadWorld(id) {
    this.ui.loading('Loading world', 0.2);
    await sleep(30);
    const world = new World();
    let meta;
    try { meta = await storage.loadWorldData(id, world); }
    catch (e) { console.error(e); this.ui.error('Could not load this world: ' + e.message, () => this.showWorlds()); return; }
    this.ui.loading('Lighting world', 0.6);
    await sleep(20);
    world.seed = meta.seed; world.name = meta.name; world.mode = meta.mode; world.time = meta.time || 0; world.spawn = meta.spawn || world.spawn;
    if (meta.biomes) world.biomes = inflateSync(storage.b64decode(meta.biomes));
    world.fullLight();
    const game = new Game(world, { authority: true, difficulty: meta.difficulty || 'normal' });
    if (meta.nextId) setNextId(meta.nextId);
    game.loadState(meta.state);
    this.startHost(world, game, meta, id, meta.player);
  }

  startHost(world, game, meta, id, saved) {
    const sp = saved ? [saved.x, saved.y, saved.z] : [world.spawn[0], world.spawn[1], world.spawn[2]];
    const me = new Player(this.settings.name, sp[0], sp[1], sp[2]);
    me.mode = saved && saved.mode ? saved.mode : world.mode;
    me.color = this.playerColor();
    if (saved) { me.inv.load(saved.inv); me.health = saved.hp || 20; me.sel = saved.sel || 0; me.yaw = saved.yaw || 0; me.pitch = saved.pitch || 0; me.spawnPoint = saved.sp || null; me.flying = !!saved.fly; }
    else if (me.mode === 'survival') { /* empty inventory, like the original */ }
    else this.fillCreativeHotbar(me);
    me.sink = this.localSink(me);
    me.savePrev();
    game.addEntity(me);
    const s = this.newSession(world, game, me, { meta, worldId: id });
    s.server = this.makeServer(s);
    s.server.start();
    this.localIp().then(() => this.updateLanBadge());
    this.updateLanBadge();
  }
  fillCreativeHotbar(me) {
    const def = [[B.STONE, 0], [B.COBBLE, 0], [B.PLANKS, 0], [B.LOG, 0], [B.GLASS, 0], [B.BRICKS, 0], [B.TORCH, 0], [B.WOOL, 14], [B.SAND, 0]];
    def.forEach(([id, m], i) => (me.inv.slots[i] = { id, count: 64, meta: m, dmg: 0 }));
  }

  async save() {
    const s = this.session;
    if (!s || s.client || !s.worldId) return;
    const w = s.world, me = s.me;
    const meta = s.meta;
    meta.time = w.time; meta.spawn = w.spawn; meta.mode = w.mode;
    meta.player = { x: me.x, y: me.y, z: me.z, yaw: me.yaw, pitch: me.pitch, hp: me.health, inv: me.inv.toJSON(), sel: me.sel, mode: me.mode, sp: me.spawnPoint, fly: me.flying };
    if (me.deathTime > 0) { const sp = s.game.validSpawn(me); Object.assign(meta.player, { x: sp[0], y: sp[1], z: sp[2], hp: 20 }); }
    if (s.server) { for (const c of s.server.clients.values()) if (c.player) s.server.savePlayer(c.player); meta.playerData = s.server.playerData; }
    meta.state = s.game.saveState();
    if (w.biomes && !meta.biomes) meta.biomes = storage.b64encode(deflateSync(w.biomes));
    meta.nextId = (me.id || 0) + 100000;
    try { await storage.saveWorld(s.worldId, meta, w); s.lastSave = performance.now(); }
    catch (e) { console.error('save failed', e); this.ui.message('Saving failed: ' + e.message); }
  }
  autosave() { if (this.session && !this.session.client) this.save(); }

  async deleteWorld(id) { await storage.deleteWorld(id); this.showWorlds(); }

  async quit() {
    if (this.session && !this.session.client) { this.ui.loading('Saving world', 0.5); await this.save(); }
    this.endSession();
    this.paused = false;
    this.ui.title();
  }

  // ------------------------------------------------------------------ joining a LAN game
  joinGame(host, port) {
    this.ui.loading('Connecting to ' + host, 0);
    const world = new World();
    const game = new Game(world, { authority: false });
    let me = null, chunks = 0;
    const total = (WX / 16) * (WZ / 16);
    let started = false;
    let ss = null;
    const ents = (list) => {
      for (const r of list) {
        const [id, type, x, y, z, yaw, pitch, ex] = r;
        if (me && id === me.id) continue;
        if (game.getEntity(id)) continue;
        const e = type === 'painting' ? createEntity('painting', x, y, z, ex) : createEntity(type, x, y, z, ex);
        if (!e) continue;
        e.id = id; e.yaw = e.pyaw = yaw; e.pitch = pitch; e.ryaw = yaw;
        e.tx = x; e.ty = y; e.tz = z; e.tyaw = yaw;
        if (type === 'painting') { e.x = e.bx + 0.5; e.y = e.by; e.z = e.bz + 0.5; }
        e.savePrev();
        if (type === 'player') game.players.set(id, e); else game.entities.set(id, e);
      }
    };
    const client = new Client(host, port, {
      name: this.settings.name, color: this.settings.color,
      handlers: {
        welcome: (m) => {
          world.seed = m.seed; world.time = m.time; world.mode = m.worldMode; world.spawn = m.spawn; world.name = m.world; world.nightMode = !!m.night;
          if (m.biomes) world.biomes = inflateSync(storage.b64decode(m.biomes));
          me = new Player(m.name, m.pos[0], m.pos[1], m.pos[2]);
          me.id = m.id; me.mode = m.mode; me.health = m.hp; me.inv.load(m.inv); me.color = this.playerColor();
          me.savePrev();
          this.ui.loading('Downloading world', 0);
        },
        chunk: (cx, cz, data, left) => {
          world.importChunk(cx, cz, data);
          chunks++;
          if (!started) this.ui.loading('Downloading world', chunks / total);
        },
        ready: () => {
          this.ui.loading('Lighting world', 1);
          setTimeout(() => {
            world.fullLight();
            ss = this.newSession(world, game, me, { client, hostLabel: host, meta: { name: world.name } });
            started = true;
            this.updateLanBadge();
            if (pendingSpawns.length) { ents(pendingSpawns); pendingSpawns.length = 0; }
          }, 20);
        },
        bulk: (changes) => {
          if (started) world.bulkSet(changes);
          else for (const [x, y, z, id, meta] of changes) if (world.inBounds(x, y, z)) world.rawSet(x, y, z, id, meta);
        },
        night: (on) => { world.nightMode = on; },
        blocks: (l) => {
          for (const [x, y, z, id, meta] of l) {
            if (started) {
              const old = world.getBlock(x, y, z);
              world.setBlock(x, y, z, id, meta);
            } else if (world.inBounds(x, y, z)) world.rawSet(x, y, z, id, meta);
          }
        },
        spawn: (list) => { if (started) ents(list); else pendingSpawns.push(...list); },
        remove: (ids) => { for (const id of ids) { game.entities.delete(id); game.players.delete(id); } },
        ents: (l) => {
          for (const r of l) {
            const e = game.getEntity(r[0]);
            if (!e) continue;
            e.tx = r[1]; e.ty = r[2]; e.tz = r[3]; e.tyaw = r[4]; e.pitch = r[5];
            if (r[6] && !e.hurtFlag) e.hurtTime = 10;
            e.hurtFlag = !!r[6];
            if (r[7] && !e.deathTime) e.deathTime = 1;
            if (!r[7] && e.deathTime && e.type === 'player') e.deathTime = 0;
            if (r[8] !== undefined) e.applyExtra(r[8]);
          }
        },
        time: (v) => { world.time = v; },
        fx: (e) => { e._remote = true; game.fx(e); },
        inv: (slots, sel) => { if (!me) return; me.inv.load(slots); this.ui.invChanged(); },
        hp: (v, air, dead) => {
          if (!me) return;
          if (v < me.health) { me.hurtTime = 10; }
          me.health = v; me.air = air;
          if (dead && !me.deathTime) { me.deathTime = 1; this.ui.death(); }
          if (!dead && me.deathTime) { me.deathTime = 0; this.ui.hide(); }
          this.ui.refreshStats();
        },
        msg: (t) => this.ui.message(t),
        open: (kind, data) => { if (kind === 'workbench') this.ui.crafting(); else this.ui.container(kind, data.state); },
        cont: (st) => { if (this.ui.screenName === 'chest' || this.ui.screenName === 'furnace') this.ui.updateContainer(st); },
        sleep: (st, wake) => this.setSleeping(st, wake),
        tp: (x, y, z) => { if (!me) return; me.x = me.px = x; me.y = me.py = y; me.z = me.pz = z; me.vx = me.vy = me.vz = 0; },
        knock: (v) => { if (me) { me.vx += v[0]; me.vy += v[1]; me.vz += v[2]; } },
        mode: (m) => { if (me) { me.mode = m; this.ui.refreshStats(); } },
        closed: (reason) => {
          const wasStarted = started;
          this.endSession();
          this.ui.error(reason, () => this.ui.title());
          started = false;
        }
      }
    });
    const pendingSpawns = [];
    client.connect();
  }

  // ------------------------------------------------------------------ effects
  onFx(fx) {
    const me = this.me;
    if (!me) return;
    const dist = Math.hypot((fx.x || me.x) - me.x, (fx.y || me.y) - me.y, (fx.z || me.z) - me.z);
    switch (fx.k) {
      case 'break': {
        const pb = this.predictedBreak;
        if (this.session.client && pb && pb[0] === fx.x && pb[1] === fx.y && pb[2] === fx.z) break;
        this.particles.blockBreak(fx.x, fx.y, fx.z, fx.id, fx.m);
        audio.play('break', { mat: blocks[fx.id] ? blocks[fx.id].sound : 'stone', dist });
        break;
      }
      case 'place': audio.play('place', { mat: blocks[fx.id] ? blocks[fx.id].sound : 'stone', dist }); break;
      case 'hurt':
        if (fx.id === me.id) { audio.play('hurt'); this.hurtFlash = 1; }
        else audio.play(fx.type === 'player' ? 'hurt' : (['pig', 'cow', 'sheep', 'chicken', 'zombie', 'skeleton', 'spider'].includes(fx.type) ? fx.type : 'mobhurt'), { dist, vol: 0.8 });
        break;
      case 'explode': this.particles.explosion(fx.x, fx.y, fx.z, fx.p); audio.play('explode', { dist: dist / 3 }); this.shake = Math.max(this.shake || 0, Math.max(0, 1 - dist / 16)); break;
      case 'snd': audio.play(fx.s, { dist, minGap: 40 }); break;
      case 'pickup': audio.play('pop', { dist, vol: 0.6 }); break;
      case 'swing': { const e = this.game.getEntity(fx.id); if (e) e.swing = 1; break; }
      case 'bonemeal': this.particles.sparkle(fx.x, fx.y, fx.z); break;
      case 'poof': this.particles.poof(fx.x, fx.y, fx.z, fx.tile); break;
    }
  }

  // ------------------------------------------------------------------ main loop
  tick() {
    const s = this.session;
    if (!s || !s.running) return;
    this.input.update();
    const me = s.me;
    if (this.ctrl.breaking && s.client) this.predictedBreak = [this.ctrl.breaking.x, this.ctrl.breaking.y, this.ctrl.breaking.z];
    this.ctrl.tick();
    if (s.client) {
      this.clientTick(s);
      s.client.send({ t: 'pos', x: +me.x.toFixed(3), y: +me.y.toFixed(3), z: +me.z.toFixed(3), yaw: +me.yaw.toFixed(3), pitch: +me.pitch.toFixed(3), g: me.onGround ? 1 : 0, sn: me.sneak ? 1 : 0, f: me.flying ? 1 : 0 });
    } else if (!this.paused) {
      s.game.serverTick();
      if (s.server) s.server.tick();
      if (performance.now() - s.lastSave > 90000) this.save();
    }
    this.particles.tick();
    // ambient particles: torch flames, reactor glow, underwater bubbles
    if (s.game.tick % 4 === 0 || s.client) this.ambient(s);
    if (me.deathTime > 0 && this.ui.screenName !== 'death') this.ui.death();
    if (me.hurtTime > 0 && s.client) me.hurtTime--;
    if (this.hurtFlash > 0) this.hurtFlash -= 0.1;
    if (this.shake > 0) this.shake -= 0.08;
  }
  clientTick(s) {
    const g = s.game;
    g.tick++;
    s.world.time++;
    g.updateSkyDarken();
    const step = (e) => {
      e.savePrev();
      if (e.tx !== undefined) {
        const k = e.type === 'player' ? 0.5 : 0.4;
        e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k; e.z += (e.tz - e.z) * k;
        if (Math.abs(e.tx - e.x) > 8 || Math.abs(e.tz - e.z) > 8) { e.x = e.tx; e.y = e.ty; e.z = e.tz; }
        let d = e.tyaw - e.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        e.yaw += d * 0.5;
        if (e.type !== 'player') e.ryaw = e.yaw;
      }
      e.age++;
      if (e.hurtTime > 0) e.hurtTime--;
      if (e.deathTime > 0 && e.type !== 'player') e.deathTime++;
      if (e.swing > 0) e.swing = Math.max(0, e.swing - 0.15);
      if (e.type === 'tnt') e.fuse--;
      const mv = Math.hypot(e.x - e.px, e.z - e.pz);
      e.walkAmt += (Math.min(1, mv * 4) - e.walkAmt) * 0.4; e.walkAnim += mv * 4;
      e.onGround = true;
    };
    for (const e of g.entities.values()) step(e);
    for (const p of g.players.values()) step(p);
  }
  ambient(s) {
    const me = s.me, w = s.world;
    const cx = Math.floor(me.x), cy = Math.floor(me.y), cz = Math.floor(me.z);
    for (let i = 0; i < 30; i++) {
      const x = cx + ((Math.random() * 24) | 0) - 12, y = cy + ((Math.random() * 16) | 0) - 8, z = cz + ((Math.random() * 24) | 0) - 12;
      const id = w.getBlock(x, y, z);
      if (id === B.TORCH) {
        const m = w.getMeta(x, y, z);
        let ox = 0.5, oz = 0.5, oy = 0.7;
        if (m === 1) ox = 0.25; else if (m === 2) ox = 0.75; else if (m === 3) oz = 0.25; else if (m === 4) oz = 0.75;
        if (m >= 1 && m <= 4) oy = 0.9;
        this.particles.flame(x + ox, y + oy, z + oz);
        this.particles.smokeAt(x + ox, y + oy + 0.1, z + oz);
      } else if (id === B.LIT_FURNACE && Math.random() < 0.5) this.particles.flame(x + 0.5, y + 0.3, z + 0.5);
      else if (id === B.FIRE) this.particles.smokeAt(x + Math.random(), y + 0.8, z + Math.random());
      else if (id === B.LAVA || id === B.STILL_LAVA) { if (Math.random() < 0.05 && w.getBlock(x, y + 1, z) === 0) this.particles.flame(x + Math.random(), y + 1, z + Math.random()); }
      else if (id === B.REACTOR && w.getMeta(x, y, z) === 1) this.particles.sparkle(x - 1, y - 1, z - 1, [255, 140, 60]);
    }
    if (isWater(w.getBlock(cx, Math.floor(me.y + me.eyeH), cz)) && Math.random() < 0.3) this.particles.bubble(me.x + (Math.random() - 0.5), me.y + 1, me.z + (Math.random() - 0.5));
  }

  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(250, t - this.last);
    this.last = t;
    const s = this.session;
    if (!s || !s.running) return;
    this.acc += dt;
    while (this.acc >= TICK_MS) { this.tick(); this.acc -= TICK_MS; if (!this.session) return; }
    const alpha = this.acc / TICK_MS;
    const me = s.me;
    const r = s.renderer;
    // camera
    const eye = this.ctrl.eye(alpha);
    let bobY = 0, bobX = 0;
    if (me.onGround && !me.flying) {
      const b = this.ctrl.prevBob + (this.ctrl.camBob - this.ctrl.prevBob) * alpha;
      bobY = Math.abs(Math.cos(b * Math.PI)) * 0.05 * me.walkAmt; bobX = Math.sin(b * Math.PI) * 0.03 * me.walkAmt;
    }
    const sh = (this.shake || 0) * 0.15;
    const headId = s.world.getBlock(Math.floor(eye[0]), Math.floor(eye[1]), Math.floor(eye[2]));
    const cam = {
      x: eye[0] + Math.cos(me.yaw) * bobX + (Math.random() - 0.5) * sh, y: eye[1] + bobY + (Math.random() - 0.5) * sh, z: eye[2] + Math.sin(me.yaw) * bobX,
      yaw: me.yaw, pitch: me.pitch + (me.hurtTime > 0 ? Math.sin(me.hurtTime) * 0.02 : 0),
      underwater: isWater(headId), inLava: isLava(headId)
    };
    // aim/selection
    const crosshair = this.settings.splitControls || (this.input.mouseLocked);
    const aim = crosshair ? 'center' : (this.input.look ? this.input.lastAim : null);
    if (aim && !this.menuOpen()) this.ctrl.updateTarget(aim); else { this.ctrl.target = null; this.ctrl.targetEnt = null; }
    const tgt = this.ctrl.target;
    r.updateMeshes(eye[0], eye[1], eye[2], this.settings.renderDist > 80 ? 8 : 6);
    const labels = [];
    r.render(cam, {
      selection: tgt && !me.deathTime ? [tgt.x, tgt.y, tgt.z, tgt.box] : null,
      buildDyn: (mesh, c) => { buildEntities(mesh, s.game, me, alpha, c, r.renderDist); this.particles.build(mesh, c); },
      buildDynT: (mesh) => buildOverlay(mesh, this.ctrl),
      buildHand: (mesh) => this.ctrl.buildHand(mesh, alpha),
      screenTint: this.hurtFlash > 0 ? [0.8, 0, 0, this.hurtFlash * 0.35] : (cam.underwater ? [0.1, 0.2, 0.6, 0.15] : null),
      darken: me.sleeping ? Math.min(1, (s.game.sleepTicks || 0) / 100) : 0
    });
    // name tags for other players
    if (r.lastVP) {
      const vp = r.lastVP, W = this.canvas.clientWidth, H = this.canvas.clientHeight;
      for (const p of s.game.players.values()) {
        if (p === me || !p._label) continue;
        const [x, y, z] = p._label;
        const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12], cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13], cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
        if (cw <= 0.1) continue;
        const sx = (cx / cw * 0.5 + 0.5) * W, sy = (1 - (cy / cw * 0.5 + 0.5)) * H;
        if (sx < -50 || sy < -50 || sx > W + 50 || sy > H + 50 || cw > 64) continue;
        labels.push([p.name, sx, sy]);
      }
    }
    this.ui.updateLabels(labels);
    this.ui.setFlying(me.flying);
    if (s.game.tick % 5 === 0) { this.ui.refreshStats(); this.ui.refreshHotbar(); }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

window.addEventListener('error', (e) => { console.error('ERR', e.message, e.filename, e.lineno); });
const app = new App();
window.__app = app;
window.__recipes = recipes;
window.__classes = { Pig: MOB_CLASSES.pig };
window.__allMobs = MOB_CLASSES;
app.boot();
