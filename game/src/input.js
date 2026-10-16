// Touch (pocket-style D-pad + tap/hold on the world) and keyboard/mouse input.
import { unlockAudio } from './audio.js';

export class Input {
  constructor(app) {
    this.app = app;
    this.canvas = app.canvas;
    this.keys = new Set();
    this.dpad = { fwd: false, back: false, left: false, right: false, jump: false, sneak: false };
    this.sneakToggle = false;
    this.look = null; // active look touch {id, x, y, sx, sy, t, moved}
    this.mouseLocked = false;
    this.mouseButtons = 0;
    this.touchMode = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.lastAim = null;
    this.bindCanvas();
    this.bindKeys();
    this.bindDpad();
  }
  get ctrl() { return this.app.ctrl; }
  sens() { return this.app.settings.sens; }
  inGame() { return this.app.inGame() && !this.app.menuOpen(); }

  // ------------------------------------------------------------------ canvas: look + tap/hold
  bindCanvas() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      unlockAudio();
      if (!this.inGame()) return;
      if (e.pointerType === 'mouse') { this.mouseDown(e); return; }
      this.touchMode = true;
      this.app.ui.setTouchControls(true, this.app.settings.dpad);
      if (this.look) return; // only one look finger
      c.setPointerCapture && c.setPointerCapture(e.pointerId);
      const aim = this.aimFor(e.clientX, e.clientY);
      this.look = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0, holding: false };
      // holding starts breaking after a short delay so taps don't destroy plants
      this.look.timer = setTimeout(() => { if (this.look && this.look.id === e.pointerId) { this.look.holding = true; this.ctrl.pressStart(this.aimFor(this.look.x, this.look.y)); } }, 220);
      this.lastAim = aim;
    });
    c.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') { this.mouseMove(e); return; }
      const L = this.look;
      if (!L || L.id !== e.pointerId) return;
      const dx = e.clientX - L.x, dy = e.clientY - L.y;
      L.x = e.clientX; L.y = e.clientY;
      L.moved += Math.abs(dx) + Math.abs(dy);
      if (this.inGame()) this.rotate(dx * 0.0055, dy * 0.0055);
      const aim = this.aimFor(L.x, L.y);
      this.lastAim = aim;
      if (L.holding) this.ctrl.pressMove(aim);
    });
    const end = (e) => {
      if (e.pointerType === 'mouse') { this.mouseUp(e); return; }
      const L = this.look;
      if (!L || L.id !== e.pointerId) return;
      clearTimeout(L.timer);
      const dt = performance.now() - L.t;
      const tap = dt < 260 && L.moved < 14;
      const aim = this.aimFor(L.x, L.y);
      if (this.inGame()) {
        if (L.holding) this.ctrl.pressEnd(aim, false);
        else if (tap) { this.ctrl.pressEnd(aim, true); }
        else this.ctrl.pressEnd(aim, false);
      }
      this.look = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    document.addEventListener('pointerlockchange', () => {
      this.mouseLocked = document.pointerLockElement === c;
      if (!this.mouseLocked && this.app.inGame() && !this.app.menuOpen() && !this.touchMode) this.app.openPause();
    });
    c.addEventListener('wheel', (e) => {
      if (!this.inGame()) return;
      const me = this.app.me; if (!me) return;
      this.app.selectSlot((me.sel + (e.deltaY > 0 ? 1 : 8)) % 9);
      e.preventDefault();
    }, { passive: false });
  }
  aimFor(x, y) {
    if (this.app.settings.splitControls || this.mouseLocked) return 'center';
    const r = this.canvas.getBoundingClientRect();
    return [x - r.left, y - r.top];
  }
  rotate(dyaw, dpitch) {
    const me = this.app.me;
    if (!me || me.sleeping) return;
    const s = this.sens();
    me.yaw += dyaw * s;
    me.pitch += dpitch * s * (this.app.settings.invertY ? -1 : 1);
    me.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, me.pitch));
  }

  // ------------------------------------------------------------------ mouse
  mouseDown(e) {
    this.touchMode = false;
    this.app.ui.setTouchControls(false);
    if (!this.mouseLocked) { this.canvas.requestPointerLock && this.canvas.requestPointerLock(); return; }
    if (e.button === 0) { if (this.ctrl.attackPress('center')) this.ctrl.pressStart('center'); }
    else if (e.button === 2) { this.ctrl.use('center'); this.rightHeld = setInterval(() => this.inGame() && this.ctrl.use('center'), 250); }
  }
  mouseUp(e) {
    if (e.button === 0) this.ctrl.pressEnd('center', false);
    else if (e.button === 2) clearInterval(this.rightHeld);
  }
  mouseMove(e) {
    if (!this.mouseLocked || !this.inGame()) return;
    this.rotate(e.movementX * 0.0025, e.movementY * 0.0025);
  }

  // ------------------------------------------------------------------ keyboard
  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT')) return;
      const k = e.code;
      if (k === 'Escape') { if (this.app.menuOpen()) this.app.closeScreens(); else if (this.app.inGame()) this.app.openPause(); return; }
      if (!this.app.inGame()) return;
      if (k === 'KeyE') { if (this.app.menuOpen()) this.app.closeScreens(); else this.app.openInventory(); e.preventDefault(); return; }
      if (this.app.menuOpen()) return;
      if (k === 'KeyT') { this.app.ui.showChat(); e.preventDefault(); return; }
      if (k === 'Space' && !this.keys.has('Space')) this.ctrl.jumpTap();
      if (k === 'KeyQ') { const me = this.app.me; this.app.command({ c: 'drop', s: me.sel, all: e.ctrlKey }); }
      if (k === 'KeyF') { const me = this.app.me; if (me.mode === 'creative') { me.flying = !me.flying; me.vy = 0; } }
      if (k.startsWith('Digit')) { const n = +k.slice(5); if (n >= 1 && n <= 9) this.app.selectSlot(n - 1); }
      this.keys.add(k);
      if (k === 'Space' || k.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); for (const k in this.dpad) this.dpad[k] = false; });
  }

  // ------------------------------------------------------------------ on-screen D-pad
  bindDpad() {
    const hud = this.app.ui.hud;
    const active = new Map(); // pointerId -> key
    const set = (k, v) => {
      if (k === 'sneak') { if (v) { this.sneakToggle = !this.sneakToggle; hud.querySelector('.sneak').classList.toggle('on', this.sneakToggle); } return; }
      if (k === 'jump' && v && !this.dpad.jump) this.ctrl.jumpTap();
      this.dpad[k] = v;
    };
    const fly = (k) => k === 'jump' || k === 'sneak';
    const onDown = (e) => {
      const b = e.target.closest('.dbtn');
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      unlockAudio();
      const k = b.dataset.k;
      // fly-down button acts as a held key, not a toggle
      if (b.classList.contains('flydown')) { active.set(e.pointerId, 'flydown'); this.dpad.sneak = true; b.classList.add('on'); return; }
      active.set(e.pointerId, k);
      b.classList.add('on');
      set(k, true);
      b.setPointerCapture && b.setPointerCapture(e.pointerId);
    };
    const onMove = (e) => {
      if (!active.has(e.pointerId)) return;
      // slide between d-pad buttons
      const t = document.elementFromPoint(e.clientX, e.clientY);
      const b = t && t.closest && t.closest('.dpad .dbtn');
      const cur = active.get(e.pointerId);
      if (b && b.dataset.k !== cur && cur !== 'sneak' && cur !== 'flydown' && b.closest('.dpad')) {
        set(cur, false); hud.querySelectorAll(`.dpad [data-k="${cur}"]`).forEach((x) => x.classList.remove('on'));
        active.set(e.pointerId, b.dataset.k); set(b.dataset.k, true); b.classList.add('on');
      }
    };
    const onUp = (e) => {
      if (!active.has(e.pointerId)) return;
      const k = active.get(e.pointerId);
      active.delete(e.pointerId);
      if (k === 'flydown') { this.dpad.sneak = false; hud.querySelector('.flydown').classList.remove('on'); return; }
      if (k !== 'sneak') { set(k, false); hud.querySelectorAll(`[data-k="${k}"]`).forEach((x) => x.classList.remove('on')); }
      else hud.querySelector('.sneak').classList.toggle('on', this.sneakToggle);
    };
    hud.addEventListener('pointerdown', onDown);
    hud.addEventListener('pointermove', onMove);
    hud.addEventListener('pointerup', onUp);
    hud.addEventListener('pointercancel', onUp);
  }

  // produce movement input each tick
  update() {
    const c = this.ctrl;
    const K = this.keys, D = this.dpad;
    let fwd = 0, strafe = 0;
    if (K.has('KeyW') || K.has('ArrowUp') || D.fwd) fwd += 1;
    if (K.has('KeyS') || K.has('ArrowDown') || D.back) fwd -= 1;
    if (K.has('KeyA') || K.has('ArrowLeft') || D.left) strafe -= 1;
    if (K.has('KeyD') || K.has('ArrowRight') || D.right) strafe += 1;
    c.input.fwd = fwd; c.input.strafe = strafe;
    c.input.jump = K.has('Space') || D.jump;
    const me = this.app.me;
    c.input.sneak = K.has('ShiftLeft') || K.has('ShiftRight') || D.sneak || (this.sneakToggle && !(me && me.flying));
    if (me && me.flying && this.sneakToggle) { this.sneakToggle = false; this.app.ui.hud.querySelector('.sneak').classList.remove('on'); }
  }
}
