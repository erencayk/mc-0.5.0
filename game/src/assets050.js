// Optional original look: the player can import THEIR OWN copy of the 0.5.0 APK.
// The images are read from that file on the device and stored locally; nothing from the
// original game ships with PocketCraft.
import { unzipSync } from 'fflate';
import { isNative, request } from './bridge.js';
import { b64encode, b64decode } from './storage.js';

export const WANTED = [
  'assets/terrain.png', 'assets/gui/items.png', 'assets/gui/gui.png', 'assets/gui/gui2.png', 'assets/gui/icons.png',
  'assets/gui/touchgui.png', 'assets/gui/title.png', 'assets/gui/background.png', 'assets/gui/bg32.png', 'assets/font/default8.png',
  'assets/particles.png', 'assets/art/kz.png', 'assets/item/chest.png', 'assets/item/arrows.png',
  'assets/mob/char.png', 'assets/mob/chicken.png', 'assets/mob/cow.png', 'assets/mob/creeper.png', 'assets/mob/pig.png',
  'assets/mob/pigzombie.png', 'assets/mob/sheep.png', 'assets/mob/sheep_fur.png', 'assets/mob/skeleton.png',
  'assets/mob/spider.png', 'assets/mob/zombie.png'
];
const REQUIRED = ['assets/terrain.png', 'assets/gui/items.png'];

export const images = {}; // short name (e.g. 'terrain', 'mob/pig') -> HTMLImageElement
export function has(name) { return !!images[name]; }
export function active() { return has('terrain') && has('gui/items'); }

const shortName = (p) => p.replace(/^assets\//, '').replace(/^gui\/(items|gui|gui2|icons|touchgui|title|background|bg32)\.png$/, 'gui/$1').replace(/\.png$/, '');

function loadImg(bytes) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('bad image'));
    im.src = url;
  });
}

// ---------------------------------------------------------------- persistence
const fs = isNative ? {
  write: (p, d) => request('fsWrite', { path: p, data: d }),
  read: (p) => request('fsRead', { path: p }),
  del: (p) => request('fsDelete', { path: p })
} : {
  write: async (p, d) => { try { (await idb()).put(d, p); } catch (e) { } },
  read: async (p) => { try { return await (await idb()).get(p); } catch (e) { return null; } },
  del: async (p) => { try { (await idb()).delete(p); } catch (e) { } }
};
let _db = null;
function idb() {
  if (_db) return _db;
  _db = new Promise((res, rej) => {
    const r = indexedDB.open('pocketcraft', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => {
      const db = r.result;
      const op = (mode, fn) => new Promise((ok, err) => { const tx = db.transaction('files', mode); const q = fn(tx.objectStore('files')); tx.oncomplete = () => ok(q && q.result); tx.onerror = () => err(tx.error); });
      res({ put: (v, k) => op('readwrite', (s) => s.put(v, k)), get: (k) => op('readonly', (s) => s.get(k)), delete: (k) => op('readwrite', (s) => s.delete(k)) });
    };
    r.onerror = () => rej(r.error);
  });
  return _db;
}

// ---------------------------------------------------------------- import / load
export async function importApk(arrayBuffer) {
  let files;
  try { files = unzipSync(new Uint8Array(arrayBuffer), { filter: (f) => WANTED.includes(f.name) }); }
  catch (e) { throw new Error('This file is not a valid APK'); }
  for (const r of REQUIRED) if (!files[r]) throw new Error('This APK does not contain the 0.5.0 textures (' + r + ')');
  const bundle = {};
  for (const [path, bytes] of Object.entries(files)) bundle[shortName(path)] = b64encode(bytes);
  await fs.write('assets050.json', JSON.stringify(bundle));
  await applyBundle(bundle);
  return Object.keys(bundle).length;
}

export async function loadStored() {
  try {
    const s = await fs.read('assets050.json');
    if (!s) return false;
    await applyBundle(JSON.parse(s));
    return active();
  } catch (e) { console.warn('stored assets unreadable', e); return false; }
}

export async function forget() {
  await fs.del('assets050.json');
  for (const k of Object.keys(images)) delete images[k];
}

async function applyBundle(bundle) {
  for (const [name, b64] of Object.entries(bundle)) {
    try { images[name] = await loadImg(b64decode(b64)); } catch (e) { console.warn('asset', name, e); }
  }
}

// opens a file picker and resolves with the chosen file's bytes
export function pickFile() {
  return new Promise((resolve, reject) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0];
      inp.remove();
      if (!f) { reject(new Error('No file selected')); return; }
      try { resolve(await f.arrayBuffer()); } catch (e) { reject(e); }
    });
    inp.click();
  });
}
