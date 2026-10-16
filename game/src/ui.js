// DOM user interface: menus, HUD, inventory/crafting/furnace/chest screens.
import { iconURL, tileURL } from './icons.js';
import { itemName, recipes, canCraft, CREATIVE, getItem, smelting, fuelTime, maxStack } from './items.js';
import * as audio from './audio.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function slotHTML(s, extra = '') {
  if (!s) return `<div class="slot empty" ${extra}></div>`;
  const it = getItem(s.id);
  let bar = '';
  if (it && it.durability && s.dmg) {
    const f = 1 - s.dmg / it.durability;
    bar = `<i class="dur"><b style="width:${Math.max(0, f * 100)}%;background:hsl(${f * 120},90%,45%)"></b></i>`;
  }
  return `<div class="slot" ${extra}><img src="${iconURL(s.id, s.meta)}">${s.count > 1 ? `<span>${s.count}</span>` : ''}${bar}</div>`;
}

export class UI {
  constructor(app) {
    this.app = app;
    this.root = $('#ui');
    this.screen = null;
    this.screenName = null;
    this.buildHUD();
    this.msgTimer = null;
  }

  click() { audio.unlockAudio(); audio.play('click'); }

  // ------------------------------------------------------------------ HUD
  buildHUD() {
    const hud = el('div', 'hud hidden');
    hud.id = 'hud';
    hud.innerHTML = `
      <div class="msgs"></div>
      <button class="hbtn pause" data-act="pause">II</button>
      <button class="hbtn chatb" data-act="chat">T</button>
      <div class="lanbadge hidden"></div>
      <div class="cross"></div>
      <div class="bottom">
        <div class="stats"><div class="hearts"></div><div class="bubbles"></div></div>
        <div class="hotbar"></div>
      </div>
      <div class="dpad">
        <div class="dbtn up" data-k="fwd"></div><div class="dbtn left" data-k="left"></div>
        <div class="dbtn jump" data-k="jump"></div><div class="dbtn right" data-k="right"></div>
        <div class="dbtn down" data-k="back"></div>
      </div>
      <div class="dbtn sneak" data-k="sneak"></div>
      <div class="flybtns hidden"><div class="dbtn flyup" data-k="jump"></div><div class="dbtn flydown" data-k="sneak"></div></div>
      <div class="sleepover hidden"><button data-act="wake">Leave Bed</button></div>
      <div class="labels"></div>`;
    this.root.appendChild(hud);
    this.hud = hud;
    hud.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b) return;
      this.click();
      const a = b.dataset.act;
      if (a === 'pause') this.app.openPause();
      else if (a === 'chat') this.showChat();
      else if (a === 'wake') this.app.command({ c: 'wake' });
    });
    // hotbar
    const hb = $('.hotbar', hud);
    for (let i = 0; i < 9; i++) { const s = el('div', 'hslot'); s.dataset.i = i; hb.appendChild(s); }
    const more = el('div', 'hslot more', '<b>•••</b>'); hb.appendChild(more);
    let pressT = null, longFired = false;
    hb.addEventListener('pointerdown', (ev) => {
      const s = ev.target.closest('.hslot'); if (!s) return;
      ev.preventDefault(); ev.stopPropagation();
      longFired = false;
      if (s.classList.contains('more')) return;
      const i = +s.dataset.i;
      pressT = setTimeout(() => { longFired = true; if (i === this.app.me.sel) this.app.command({ c: 'drop', s: i, all: false }); }, 550);
    });
    hb.addEventListener('pointerup', (ev) => {
      clearTimeout(pressT);
      const s = ev.target.closest('.hslot'); if (!s) return;
      ev.preventDefault(); ev.stopPropagation();
      if (longFired) return;
      this.click();
      if (s.classList.contains('more')) { this.app.openInventory(); return; }
      this.app.selectSlot(+s.dataset.i);
    });
    hb.addEventListener('pointercancel', () => clearTimeout(pressT));
  }
  showHUD(on) { this.hud.classList.toggle('hidden', !on); }
  setTouchControls(on, size = 1) {
    this.hud.classList.toggle('notouch', !on);
    this.hud.style.setProperty('--dp', size);
  }
  setCrosshair(on) { $('.cross', this.hud).classList.toggle('hidden', !on); }
  setFlying(on) { $('.flybtns', this.hud).classList.toggle('hidden', !on); }
  setLanBadge(text) { const b = $('.lanbadge', this.hud); b.classList.toggle('hidden', !text); b.textContent = text || ''; }
  setSleeping(on) { $('.sleepover', this.hud).classList.toggle('hidden', !on); }

  refreshHotbar() {
    const me = this.app.me;
    if (!me) return;
    const slots = this.hud.querySelectorAll('.hotbar .hslot:not(.more)');
    slots.forEach((s, i) => {
      const it = me.inv.slots[i];
      const key = it ? `${it.id}:${it.meta}:${it.count}:${it.dmg || 0}` : '';
      if (s._k !== key) {
        s._k = key;
        s.innerHTML = it ? slotHTML(it) : '';
      }
      s.classList.toggle('sel', i === me.sel);
    });
  }
  refreshStats() {
    const me = this.app.me;
    if (!me) return;
    const surv = me.mode !== 'creative';
    const hearts = $('.hearts', this.hud), bubbles = $('.bubbles', this.hud);
    hearts.classList.toggle('hidden', !surv);
    const hp = Math.max(0, Math.ceil(me.health));
    const key = hp + ':' + (me.hurtTime > 0);
    if (hearts._k !== key) {
      hearts._k = key;
      let h = '';
      for (let i = 0; i < 10; i++) {
        const v = hp - i * 2;
        h += `<img src="${tileURL(v >= 2 ? 'heart_full' : v === 1 ? 'heart_half' : 'heart_empty')}"${hp <= 4 ? ' class="shake"' : ''}>`;
      }
      hearts.innerHTML = h;
      hearts.classList.toggle('flash', me.hurtTime > 0);
    }
    const air = me.air;
    const showAir = surv && air < 300;
    bubbles.classList.toggle('hidden', !showAir);
    if (showAir) {
      const n = Math.max(0, Math.ceil(air / 30));
      if (bubbles._k !== n) { bubbles._k = n; let h = ''; for (let i = 0; i < n; i++) h += `<img src="${tileURL('bubble')}">`; bubbles.innerHTML = h; }
    }
  }
  message(text) {
    const box = $('.msgs', this.hud);
    const m = el('div', 'msg', esc(text));
    box.appendChild(m);
    while (box.children.length > 6) box.firstChild.remove();
    setTimeout(() => m.classList.add('fade'), 6000);
    setTimeout(() => m.remove(), 7500);
  }
  updateLabels(list) {
    const box = $('.labels', this.hud);
    let h = '';
    for (const [name, x, y] of list) h += `<div class="nametag" style="left:${x}px;top:${y}px">${esc(name)}</div>`;
    if (box._h !== h) { box._h = h; box.innerHTML = h; }
  }

  // ------------------------------------------------------------------ screens
  show(name, html, cls = '') {
    this.hide();
    const s = el('div', 'screen ' + cls, html);
    s.dataset.name = name;
    this.root.appendChild(s);
    this.screen = s; this.screenName = name;
    this.hud.classList.add('under');
    s.addEventListener('pointerdown', (e) => e.stopPropagation());
    return s;
  }
  hide() { if (this.screen) { this.screen.remove(); this.screen = null; this.screenName = null; } this.hud.classList.remove('under'); }
  isOpen() { return !!this.screen; }

  bind(s, handlers) {
    s.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b || b.disabled) return;
      this.click();
      const fn = handlers[b.dataset.act];
      if (fn) fn(b, ev);
    });
  }

  title() {
    const s = this.show('title', `
      <div class="title-bg"></div>
      <div class="logo">POCKETCRAFT<small>Pocket Edition v0.5.0 alpha · fan remake</small></div>
      <div class="menu">
        <button data-act="start">Start Game</button>
        <button data-act="join">Join Game</button>
        <button data-act="options">Options</button>
      </div>
      <div class="foot">Independent clean-room remake for personal use. Not affiliated with Mojang or Microsoft.</div>`, 'title');
    this.bind(s, { start: () => this.app.showWorlds(), join: () => this.join(), options: () => this.options(() => this.title()) });
  }

  worlds(list) {
    const rows = list.map((w) => `
      <div class="wrow" data-act="play" data-id="${esc(w.id)}">
        <div><b>${esc(w.name)}</b><small>${w.mode === 'creative' ? 'Creative' : 'Survival'} · ${new Date(w.lastPlayed || 0).toLocaleString()}</small></div>
        <button class="small danger" data-act="del" data-id="${esc(w.id)}">✕</button>
      </div>`).join('');
    const s = this.show('worlds', `
      <h1>Select World</h1>
      <div class="wlist">${rows || '<p class="dim">No worlds yet.</p>'}</div>
      <div class="row"><button data-act="back">Back</button><button data-act="create">Create New</button></div>`);
    this.bind(s, {
      back: () => this.title(),
      create: () => this.create(),
      play: (b, ev) => { if (ev.target.closest('[data-act="del"]')) return; this.app.loadWorld(b.dataset.id); },
      del: (b, ev) => {
        ev.stopPropagation();
        const w = list.find((x) => x.id === b.dataset.id);
        this.confirm(`Delete "${w ? w.name : ''}"? This cannot be undone.`, () => this.app.deleteWorld(b.dataset.id), () => this.app.showWorlds());
      }
    });
  }

  confirm(text, yes, no) {
    const s = this.show('confirm', `<h1>Are you sure?</h1><p>${esc(text)}</p><div class="row"><button data-act="no">Cancel</button><button class="danger" data-act="yes">Yes</button></div>`);
    this.bind(s, { yes, no });
  }

  create() {
    const n = this.app.settings.worldCounter || 1;
    const s = this.show('create', `
      <h1>Create New World</h1>
      <label>World name<input id="wname" maxlength="32" value="My World${n > 1 ? ' ' + n : ''}"></label>
      <label>Seed (optional)<input id="wseed" maxlength="20" placeholder="random"></label>
      <div class="toggles">
        <button data-act="mode" id="wmode" data-v="survival">Mode: Survival</button>
        <button data-act="type" id="wtype" data-v="normal">Terrain: Normal</button>
        <button data-act="diff" id="wdiff" data-v="normal">Difficulty: Normal</button>
      </div>
      <p class="dim" id="wmodedesc">Survival: gather resources, craft, and stay alive at night.</p>
      <div class="row"><button data-act="back">Cancel</button><button data-act="go">Create World</button></div>`);
    this.bind(s, {
      back: () => this.app.showWorlds(),
      mode: (b) => { b.dataset.v = b.dataset.v === 'survival' ? 'creative' : 'survival'; b.textContent = 'Mode: ' + (b.dataset.v === 'survival' ? 'Survival' : 'Creative'); $('#wmodedesc').textContent = b.dataset.v === 'survival' ? 'Survival: gather resources, craft, and stay alive at night.' : 'Creative: unlimited blocks, flying, no damage.'; },
      type: (b) => { b.dataset.v = b.dataset.v === 'normal' ? 'flat' : 'normal'; b.textContent = 'Terrain: ' + (b.dataset.v === 'normal' ? 'Normal' : 'Flat'); },
      diff: (b) => { b.dataset.v = b.dataset.v === 'normal' ? 'peaceful' : 'normal'; b.textContent = 'Difficulty: ' + (b.dataset.v === 'normal' ? 'Normal' : 'Peaceful'); },
      go: () => {
        const name = $('#wname').value.trim() || 'World';
        const seedStr = $('#wseed').value.trim();
        let seed;
        if (!seedStr) seed = (Math.random() * 2 ** 31) | 0;
        else if (/^-?\d+$/.test(seedStr)) seed = parseInt(seedStr, 10) | 0;
        else { seed = 0; for (const c of seedStr) seed = (Math.imul(seed, 31) + c.charCodeAt(0)) | 0; }
        this.app.settings.worldCounter = n + 1;
        this.app.createWorld({ name, seed, mode: $('#wmode').dataset.v, type: $('#wtype').dataset.v, difficulty: $('#wdiff').dataset.v });
      }
    });
  }

  join() {
    const s = this.show('join', `
      <h1>Join Game</h1>
      <p class="dim">Games on your local Wi-Fi network appear below. Both devices must be on the same network.</p>
      <div class="glist"><p class="dim scanning">Scanning for games…</p></div>
      <label>Or enter the host's IP address<input id="jip" placeholder="192.168.1.20" inputmode="decimal" value="${esc(this.app.settings.lastIp || '')}"></label>
      <div class="row"><button data-act="back">Back</button><button data-act="ip">Join by IP</button></div>
      <p class="dim myip"></p>`);
    const games = new Map();
    const render = () => {
      const l = $('.glist', s);
      if (!games.size) { l.innerHTML = '<p class="dim scanning">Scanning for games…</p>'; return; }
      l.innerHTML = [...games.values()].map((g) => `<div class="wrow" data-act="game" data-host="${esc(g.host)}" data-port="${g.port}"><div><b>${esc(g.info.w || g.name)}</b><small>Host: ${esc(g.info.h || '?')}${g.host.startsWith('svc:') ? '' : ' · ' + esc(g.host)}</small></div><span class="go">▶</span></div>`).join('');
    };
    const stop = this.app.discover((g) => { games.set(g.name, g); render(); }, (name) => { games.delete(name); render(); });
    this.app.localIp().then((ip) => { const e = $('.myip', s); if (e) e.textContent = 'Your IP: ' + ip; });
    this.bind(s, {
      back: () => { stop(); this.title(); },
      game: (b) => { stop(); this.app.joinGame(b.dataset.host, +b.dataset.port); },
      ip: () => { const ip = $('#jip').value.trim(); if (!ip) return; this.app.settings.lastIp = ip; this.app.saveSettings(); stop(); const [h, p] = ip.split(':'); this.app.joinGame(h, p ? +p : undefined); }
    });
  }

  options(back) {
    const st = this.app.settings;
    const s = this.show('options', `
      <h1>Options</h1>
      <div class="opts">
        <label>Player name<input id="oname" maxlength="16" value="${esc(st.name)}"></label>
        <label>Look sensitivity <span id="osensv">${st.sens.toFixed(1)}</span><input id="osens" type="range" min="0.3" max="3" step="0.1" value="${st.sens}"></label>
        <label>Field of view <span id="ofovv">${st.fov}</span><input id="ofov" type="range" min="50" max="100" step="1" value="${st.fov}"></label>
        <label>Sound volume <span id="osndv">${Math.round(st.sound * 100)}%</span><input id="osnd" type="range" min="0" max="1" step="0.05" value="${st.sound}"></label>
        <label>Controls size <span id="odpv">${st.dpad.toFixed(1)}</span><input id="odp" type="range" min="0.7" max="1.6" step="0.1" value="${st.dpad}"></label>
        <div class="toggles">
          <button data-act="rd" id="ord">Render distance: ${st.renderDist <= 48 ? 'Short' : st.renderDist <= 80 ? 'Normal' : 'Far'}</button>
          <button data-act="inv" id="oinv">Invert Y: ${st.invertY ? 'ON' : 'OFF'}</button>
          <button data-act="cross" id="ocross">Crosshair aiming: ${st.splitControls ? 'ON' : 'OFF'}</button>
          <button data-act="color" id="ocolor">Shirt color</button>
        </div>
      </div>
      <div class="row"><button data-act="done">Done</button></div>`);
    const upd = () => { this.app.applySettings(); };
    const range = (id, key, fmt) => { const i = $('#' + id); i.addEventListener('input', () => { st[key] = parseFloat(i.value); $('#' + id + 'v').textContent = fmt(st[key]); upd(); }); };
    range('osens', 'sens', (v) => v.toFixed(1));
    range('ofov', 'fov', (v) => v);
    range('osnd', 'sound', (v) => Math.round(v * 100) + '%');
    range('odp', 'dpad', (v) => v.toFixed(1));
    $('#ocolor').style.background = `rgb(${this.app.playerColor().join(',')})`;
    this.bind(s, {
      rd: (b) => { st.renderDist = st.renderDist <= 48 ? 80 : st.renderDist <= 80 ? 128 : 48; b.textContent = 'Render distance: ' + (st.renderDist <= 48 ? 'Short' : st.renderDist <= 80 ? 'Normal' : 'Far'); upd(); },
      inv: (b) => { st.invertY = !st.invertY; b.textContent = 'Invert Y: ' + (st.invertY ? 'ON' : 'OFF'); upd(); },
      cross: (b) => { st.splitControls = !st.splitControls; b.textContent = 'Crosshair aiming: ' + (st.splitControls ? 'ON' : 'OFF'); upd(); },
      color: (b) => { st.color = (st.color + 1) % 8; b.style.background = `rgb(${this.app.playerColor().join(',')})`; upd(); },
      done: () => { st.name = ($('#oname').value.trim() || st.name).slice(0, 16); this.app.saveSettings(); upd(); back(); }
    });
  }

  pause(info) {
    const s = this.show('pause', `
      <h1>Game Menu</h1>
      <div class="menu">
        <button data-act="resume">Back to Game</button>
        <button data-act="options">Options</button>
        ${info.host ? `<button data-act="lan">LAN game: ${info.lan ? 'Visible' : 'Hidden'}</button>` : ''}
        ${info.canMode ? `<button data-act="mode">Game mode: ${info.mode === 'creative' ? 'Creative' : 'Survival'}</button>` : ''}
        <button data-act="quit">${info.client ? 'Disconnect' : 'Save and Quit to Title'}</button>
      </div>
      <p class="dim">${esc(info.status || '')}</p>`);
    this.bind(s, {
      resume: () => this.app.closeScreens(),
      options: () => this.options(() => this.app.openPause()),
      lan: () => { this.app.toggleLan(); this.app.openPause(); },
      mode: () => { this.app.toggleMode(); this.app.openPause(); },
      quit: () => this.app.quit()
    });
  }

  loading(text, progress) {
    if (this.screenName !== 'loading') this.show('loading', `<div class="ltxt"></div><div class="lbar"><b></b></div>`, 'loading');
    $('.ltxt', this.screen).textContent = text;
    $('.lbar b', this.screen).style.width = Math.round((progress || 0) * 100) + '%';
  }
  error(text, back) {
    const s = this.show('error', `<h1>Oops</h1><p>${esc(text)}</p><div class="row"><button data-act="ok">OK</button></div>`);
    this.bind(s, { ok: back });
  }
  death() {
    const s = this.show('death', `<h1>You died!</h1><div class="menu"><button data-act="respawn">Respawn</button><button data-act="quit">Main menu</button></div>`, 'death');
    this.bind(s, { respawn: () => { this.app.command({ c: 'respawn' }); this.app.closeScreens(); }, quit: () => this.app.quit() });
  }
  showChat() {
    const s = this.show('chat', `<div class="chatbox"><input id="chatin" maxlength="100" placeholder="Say something…"><button data-act="send">Send</button><button data-act="close">✕</button></div>`, 'chat');
    const inp = $('#chatin', s);
    setTimeout(() => inp.focus(), 50);
    const send = () => { const t = inp.value.trim(); if (t) this.app.command({ c: 'chat', t }); this.app.closeScreens(); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); if (e.key === 'Escape') this.app.closeScreens(); e.stopPropagation(); });
    this.bind(s, { send, close: () => this.app.closeScreens() });
  }

  // ------------------------------------------------------------------ inventory & crafting
  inventory(tab) {
    const me = this.app.me;
    const creative = me.mode === 'creative';
    tab = tab || (creative ? 'creative' : 'inv');
    const tabs = creative
      ? `<button class="tab ${tab === 'creative' ? 'on' : ''}" data-act="tab" data-t="creative">Items</button><button class="tab ${tab === 'craft' ? 'on' : ''}" data-act="tab" data-t="craft">Crafting</button>`
      : `<button class="tab ${tab === 'inv' ? 'on' : ''}" data-act="tab" data-t="inv">Inventory</button><button class="tab ${tab === 'craft' ? 'on' : ''}" data-act="tab" data-t="craft">Crafting</button>`;
    const s = this.show('inventory', `
      <div class="ihead">${tabs}<button class="tab close" data-act="close">✕</button></div>
      <div class="ibody"></div>
      <div class="ihot"></div>`, 'inv');
    this.invTab = tab;
    this.invTable = false;
    this.renderInvBody();
    this.bind(s, {
      tab: (b) => { this.invTab = b.dataset.t; s.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t === b)); this.renderInvBody(); },
      close: () => this.app.closeScreens()
    });
    this.bindSlots(s);
  }
  crafting() {
    const s = this.show('inventory', `
      <div class="ihead"><button class="tab on">Crafting Table</button><button class="tab close" data-act="close">✕</button></div>
      <div class="ibody"></div>
      <div class="ihot"></div>`, 'inv');
    this.invTab = 'craft';
    this.invTable = true;
    this.renderInvBody();
    this.bind(s, { close: () => this.app.closeScreens() });
    this.bindSlots(s);
  }
  renderInvBody() {
    const s = this.screen; if (!s) return;
    const me = this.app.me;
    const body = $('.ibody', s);
    const tab = this.invTab;
    if (tab === 'inv') {
      let h = '<div class="grid g9">';
      for (let i = 9; i < 36; i++) h += slotHTML(me.inv.slots[i], `data-inv="${i}"`);
      h += '</div><p class="dim">Tap an item to move it to the selected hotbar slot. Hold a hotbar slot to drop.</p><div class="row"><button class="small" data-act2="drop1">Drop 1</button><button class="small" data-act2="dropall">Drop stack</button></div>';
      body.innerHTML = h;
    } else if (tab === 'creative') {
      let h = '<div class="grid g9 creative">';
      CREATIVE.forEach(([id, m], k) => { h += slotHTML({ id, meta: m, count: 1 }, `data-cr="${k}" title="${esc(itemName(id, m))}"`); });
      h += '</div><div class="row"><button class="small" data-act2="clear">Clear selected slot</button></div>';
      body.innerHTML = h;
    } else if (tab === 'craft') {
      const table = this.invTable;
      const cats = ['Blocks', 'Tools', 'Food', 'Decoration', 'Items'];
      this.craftCat = this.craftCat || 'Blocks';
      let h = '<div class="cats">' + cats.map((c) => `<button class="tab small ${c === this.craftCat ? 'on' : ''}" data-cat="${c}">${c}</button>`).join('') + '</div><div class="rlist">';
      const list = recipes.filter((r) => r.cat === this.craftCat && (table || !r.table));
      // craftable first
      list.sort((a, b) => (canCraft(me.inv, b, table) ? 1 : 0) - (canCraft(me.inv, a, table) ? 1 : 0));
      for (const r of list) {
        const ok = canCraft(me.inv, r, table);
        const ins = r.in.map(([id, n, m]) => {
          const have = me.inv.count(id, m);
          return `<span class="ing ${have >= n ? '' : 'miss'}"><img src="${iconURL(id, m < 0 ? 0 : m)}">${n}</span>`;
        }).join('');
        h += `<div class="recipe ${ok ? 'ok' : ''}" data-rec="${r.id}"><img class="out" src="${iconURL(r.out[0], r.out[2])}"><div class="rn"><b>${esc(itemName(r.out[0], r.out[2]))}${r.out[1] > 1 ? ' ×' + r.out[1] : ''}</b><div class="ings">${ins}</div></div></div>`;
      }
      if (!list.length) h += '<p class="dim">Nothing here.</p>';
      h += '</div>';
      if (!table) h += '<p class="dim">Use a Crafting Table for more recipes.</p>';
      body.innerHTML = h;
    }
    this.renderHotRow();
  }
  renderHotRow() {
    const s = this.screen; if (!s) return;
    const row = $('.ihot', s); if (!row) return;
    const me = this.app.me;
    let h = '<div class="grid g9 hot">';
    for (let i = 0; i < 9; i++) h += slotHTML(me.inv.slots[i], `data-hot="${i}" class="${i === me.sel ? 'sel' : ''}"`).replace('class="slot', `class="slot ${i === me.sel ? 'sel' : ''}`);
    h += '</div>';
    row.innerHTML = h;
  }
  bindSlots(s) {
    s.addEventListener('click', (ev) => {
      const me = this.app.me;
      const t = ev.target.closest('[data-inv],[data-hot],[data-cr],[data-rec],[data-cat],[data-act2]');
      if (!t) return;
      this.click();
      if (t.dataset.inv !== undefined) this.app.command({ c: 'invMove', a: +t.dataset.inv, b: me.sel });
      else if (t.dataset.hot !== undefined) { this.app.selectSlot(+t.dataset.hot); this.renderHotRow(); }
      else if (t.dataset.cr !== undefined) { const [id, m] = CREATIVE[+t.dataset.cr]; this.app.command({ c: 'creative', id, m, s: me.sel }); }
      else if (t.dataset.rec !== undefined) { this.app.command({ c: 'craft', r: +t.dataset.rec, n: 1, table: this.invTable }); }
      else if (t.dataset.cat !== undefined) { this.craftCat = t.dataset.cat; this.renderInvBody(); }
      else if (t.dataset.act2 === 'clear') this.app.command({ c: 'creative', id: 0, s: me.sel });
      else if (t.dataset.act2 === 'drop1') this.app.command({ c: 'drop', s: me.sel, all: false });
      else if (t.dataset.act2 === 'dropall') this.app.command({ c: 'drop', s: me.sel, all: true });
    });
  }
  invChanged() {
    this.refreshHotbar();
    if (this.screenName === 'inventory') this.renderInvBody();
    else if (this.screenName === 'chest' || this.screenName === 'furnace') this.renderContainer();
  }

  // ------------------------------------------------------------------ containers
  container(kind, state) {
    this.contKind = kind;
    this.contState = state;
    const s = this.show(kind, `
      <div class="ihead"><button class="tab on">${kind === 'chest' ? 'Chest' : 'Furnace'}</button><button class="tab close" data-act="close">✕</button></div>
      <div class="ibody"></div>`, 'inv');
    this.renderContainer();
    this.bind(s, { close: () => this.app.closeScreens() });
    s.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-cs],[data-ps],[data-fs]');
      if (!t) return;
      this.click();
      if (t.dataset.cs !== undefined) this.app.command({ c: 'cont', act: 'take', s: +t.dataset.cs });
      else if (t.dataset.fs !== undefined) this.app.command({ c: 'cont', act: 'take', from: t.dataset.fs });
      else if (t.dataset.ps !== undefined) {
        const i = +t.dataset.ps;
        if (kind === 'chest') this.app.command({ c: 'cont', act: 'put', s: i });
        else {
          const it = this.app.me.inv.slots[i];
          if (!it) return;
          const smelt = smelting.has(it.id), fuel = fuelTime(it.id) > 0;
          const to = this._fuelMode ? (fuel ? 'fuel' : 'input') : (smelt ? 'input' : 'fuel');
          this.app.command({ c: 'cont', act: 'put', s: i, to });
        }
      }
    });
  }
  updateContainer(state) { this.contState = state; this.renderContainer(); }
  renderContainer() {
    const s = this.screen; if (!s) return;
    const st = this.contState;
    const me = this.app.me;
    const body = $('.ibody', s);
    const P = (a) => (a ? { id: a[0], count: a[1], meta: a[2], dmg: a[3] } : null);
    let h = '';
    if (this.contKind === 'chest') {
      h += '<div class="grid g9">';
      for (let i = 0; i < 27; i++) h += slotHTML(P(st.slots[i]), `data-cs="${i}"`);
      h += '</div><p class="dim">Tap to move items between the chest and your inventory.</p>';
    } else {
      const burn = Math.round((st.burn || 0) * 100), cook = Math.round((st.cook || 0) * 100);
      h += `<div class="furnace">
        <div class="fcol">${slotHTML(P(st.input), 'data-fs="input"')}<div class="flame"><b style="height:${burn}%"></b></div>${slotHTML(P(st.fuel), 'data-fs="fuel"')}</div>
        <div class="arrow"><b style="width:${cook}%"></b></div>
        <div class="fcol">${slotHTML(P(st.output), 'data-fs="output"')}</div>
      </div>
      <div class="row"><button class="small ${this._fuelMode ? '' : 'on'}" data-fm="0">Tap items → Ingredient</button><button class="small ${this._fuelMode ? 'on' : ''}" data-fm="1">Tap items → Fuel</button></div>`;
    }
    h += '<div class="grid g9 pinv">';
    for (let i = 9; i < 36; i++) h += slotHTML(me.inv.slots[i], `data-ps="${i}"`);
    for (let i = 0; i < 9; i++) h += slotHTML(me.inv.slots[i], `data-ps="${i}"`);
    h += '</div>';
    body.innerHTML = h;
    body.querySelectorAll('[data-fm]').forEach((b) => b.addEventListener('click', () => { this._fuelMode = b.dataset.fm === '1'; this.renderContainer(); }));
  }
}
