// Bridge to the native shell (Android WebView / iOS WKWebView) for TCP sockets,
// LAN discovery (mDNS/Bonjour) and file storage. Falls back to a WebSocket dev relay in browsers.

const listeners = new Map(); // ev -> Set(fn)
const pending = new Map();
let reqId = 1;

export const platform = (() => {
  if (window.AndroidBridge) return 'android';
  if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.bridge) return 'ios';
  return 'web';
})();
export const isNative = platform !== 'web';

function post(obj) {
  const s = JSON.stringify(obj);
  if (platform === 'android') window.AndroidBridge.postMessage(s);
  else if (platform === 'ios') window.webkit.messageHandlers.bridge.postMessage(s);
}

function dispatch(e) {
  if (e.ev === 'reply') {
    const p = pending.get(e.req);
    if (p) { pending.delete(e.req); e.error ? p.reject(new Error(e.error)) : p.resolve(e.data); }
    return;
  }
  const set = listeners.get(e.ev);
  if (set) for (const fn of set) { try { fn(e); } catch (err) { console.error(err); } }
}
// native side calls this with an array of events
window.__nativeEvents = (arr) => { for (const e of arr) dispatch(e); };

export function on(ev, fn) { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev).add(fn); return () => listeners.get(ev).delete(fn); }
export function send(op, args = {}) { post(Object.assign({ op }, args)); }
export function request(op, args = {}) {
  return new Promise((resolve, reject) => {
    const req = reqId++;
    pending.set(req, { resolve, reject });
    post(Object.assign({ op, req }, args));
    setTimeout(() => { if (pending.has(req)) { pending.delete(req); reject(new Error('timeout ' + op)); } }, 30000);
  });
}

// ------------------------------------------------------------------ transport abstraction
// Server: listen(port), onAccept(cid), onMessage(cid, str), onClose(cid), send(cid, str), close(cid)
// Client: connect(host, port) -> cid
let cidSeq = 1;

class NativeTransport {
  constructor() {
    this.handlers = { accept: null, msg: null, close: null, open: null, error: null };
    on('accept', (e) => this.handlers.accept && this.handlers.accept(e.cid, e.addr));
    on('msg', (e) => this.handlers.msg && this.handlers.msg(e.cid, e.data));
    on('close', (e) => this.handlers.close && this.handlers.close(e.cid));
    on('open', (e) => this.handlers.open && this.handlers.open(e.cid));
    on('error', (e) => this.handlers.error && this.handlers.error(e.cid, e.msg));
  }
  host(port) { send('host', { port }); }
  unhost() { send('unhost'); }
  connect(host, port) { const cid = 'c' + (cidSeq++); send('connect', { cid, host, port }); return cid; }
  send(cid, data) { send('send', { cid, data }); }
  close(cid) { send('close', { cid }); }
  advertise(name, port, info) { send('advertise', { name, port, info: JSON.stringify(info) }); }
  unadvertise() { send('unadvertise'); }
  discover(onFound, onLost) {
    this._f = on('found', (e) => { let info = {}; try { info = JSON.parse(e.info || '{}'); } catch (_) { } onFound({ name: e.name, host: e.host, port: e.port, info }); });
    this._l = on('lost', (e) => onLost && onLost(e.name));
    send('discover');
  }
  undiscover() { if (this._f) this._f(); if (this._l) this._l(); send('undiscover'); }
  localIp() { return request('ip').catch(() => '?'); }
}

// Browser dev transport through tools/devserver.js (WebSocket relay that mimics LAN hosting)
class WebTransport {
  constructor() {
    this.handlers = { accept: null, msg: null, close: null, open: null, error: null };
    this.ws = null; this.queue = []; this.ready = false;
    this.url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + (location.host || 'localhost:8080') + '/relay';
  }
  ensure() {
    if (this.ws) return;
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => { this.ready = true; for (const m of this.queue) this.ws.send(m); this.queue = []; };
    this.ws.onmessage = (ev) => {
      const e = JSON.parse(ev.data);
      if (e.ev === 'found') { this._found && this._found({ name: e.name, host: e.host, port: e.port, info: e.info || {} }); return; }
      if (e.ev === 'lost') { this._lost && this._lost(e.name); return; }
      if (e.ev === 'ip') { this._ip && this._ip(e.ip); return; }
      const h = this.handlers[e.ev];
      if (h) e.ev === 'msg' ? h(e.cid, e.data) : e.ev === 'error' ? h(e.cid, e.msg) : h(e.cid, e.addr);
    };
    this.ws.onclose = () => { this.ready = false; this.ws = null; };
  }
  raw(o) { this.ensure(); const s = JSON.stringify(o); if (this.ready) this.ws.send(s); else this.queue.push(s); }
  host(port) { this.raw({ op: 'host', port }); }
  unhost() { this.raw({ op: 'unhost' }); }
  connect(host, port) { const cid = 'c' + (cidSeq++) + '_' + Math.random().toString(36).slice(2, 6); this.raw({ op: 'connect', cid, host, port }); return cid; }
  send(cid, data) { this.raw({ op: 'send', cid, data }); }
  close(cid) { this.raw({ op: 'close', cid }); }
  advertise(name, port, info) { this.raw({ op: 'advertise', name, port, info }); }
  unadvertise() { this.raw({ op: 'unadvertise' }); }
  discover(onFound, onLost) { this._found = onFound; this._lost = onLost; this.raw({ op: 'discover' }); }
  undiscover() { this._found = null; this.raw({ op: 'undiscover' }); }
  localIp() { return new Promise((res) => { this._ip = res; this.raw({ op: 'ip' }); setTimeout(() => res('127.0.0.1'), 2000); }); }
}

let transport = null;
export function getTransport() {
  if (!transport) transport = isNative ? new NativeTransport() : new WebTransport();
  return transport;
}

export function keepAwake(on) { if (isNative) send('keepAwake', { on: !!on }); }
export function haptic(ms = 15) { if (isNative) send('haptic', { ms }); else if (navigator.vibrate) navigator.vibrate(ms); }
