// World persistence: native file storage on devices, IndexedDB in browsers.
import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate';
import { isNative, request } from './bridge.js';

export function b64encode(u8) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}
export function b64decode(str) {
  const s = atob(str);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

// ---------------------------------------------------------------- IndexedDB backend
let dbp = null;
function idb() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open('pocketcraft', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function idbOp(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('files', mode);
    const st = tx.objectStore('files');
    const r = fn(st);
    tx.oncomplete = () => res(r && r.result);
    tx.onerror = () => rej(tx.error);
  });
}
const fs = isNative ? {
  write: (path, data) => request('fsWrite', { path, data }),
  read: (path) => request('fsRead', { path }),
  list: (dir) => request('fsList', { dir }).then((a) => a || []),
  del: (path) => request('fsDelete', { path })
} : {
  write: (path, data) => idbOp('readwrite', (st) => st.put(data, path)),
  read: (path) => idbOp('readonly', (st) => st.get(path)),
  list: async (dir) => { const keys = await idbOp('readonly', (st) => st.getAllKeys()); return (keys || []).filter((k) => k.startsWith(dir + '/')).map((k) => k.slice(dir.length + 1)); },
  del: (path) => idbOp('readwrite', (st) => st.delete(path))
};

// ---------------------------------------------------------------- worlds
export async function listWorlds() {
  const names = await fs.list('worlds');
  const out = [];
  for (const n of names) {
    if (!n.endsWith('.json')) continue;
    try { const m = JSON.parse(await fs.read('worlds/' + n)); m.id = n.slice(0, -5); out.push(m); } catch (e) { console.warn('bad world', n, e); }
  }
  out.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
  return out;
}

export async function saveWorld(id, meta, world) {
  // blocks + meta interleaved per column chunk, deflated
  const raw = new Uint8Array(world.blocks.length * 2);
  raw.set(world.blocks, 0); raw.set(world.meta, world.blocks.length);
  const z = deflateSync(raw, { level: 6 });
  meta.lastPlayed = Date.now();
  meta.format = 1;
  await fs.write('worlds/' + id + '.dat', b64encode(z));
  await fs.write('worlds/' + id + '.json', JSON.stringify(meta));
}

export async function loadWorldData(id, world) {
  const meta = JSON.parse(await fs.read('worlds/' + id + '.json'));
  const d = await fs.read('worlds/' + id + '.dat');
  if (!d) throw new Error('world data missing');
  const raw = inflateSync(b64decode(d));
  world.blocks.set(raw.subarray(0, world.blocks.length));
  world.meta.set(raw.subarray(world.blocks.length, world.blocks.length * 2));
  return meta;
}

export async function deleteWorld(id) {
  await fs.del('worlds/' + id + '.dat');
  await fs.del('worlds/' + id + '.json');
}

// ---------------------------------------------------------------- settings (small, localStorage)
const DEFAULTS = { name: '', sens: 1, invertY: false, renderDist: 80, sound: 0.8, fov: 70, dpad: 1, color: 0, showCross: true, splitControls: false };
export function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem('pc_settings') || '{}'); } catch (e) { }
  return Object.assign({}, DEFAULTS, s);
}
export function saveSettings(s) { try { localStorage.setItem('pc_settings', JSON.stringify(s)); } catch (e) { } }

export { deflateSync, inflateSync, strToU8, strFromU8 };
