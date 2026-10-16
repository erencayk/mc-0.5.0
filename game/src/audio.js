// Procedural sound effects with WebAudio (no recorded assets).
let ctx = null, master = null, noiseBuf = null;
let volume = 0.8;
const last = new Map();

export function setVolume(v) { volume = v; if (master) master.gain.value = v; }
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function env(g, t, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}
function noise(type, freq, q, dur, peak, delay = 0, pan = 0) {
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); env(g, t, 0.005, peak, dur);
  s.connect(f); f.connect(g);
  if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(master); } else g.connect(master);
  s.start(t, Math.random() * 0.5, dur + 0.05);
}
function tone(type, f0, f1, dur, peak, delay = 0) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); env(g, t, 0.005, peak, dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

const MAT = {
  stone: ['bandpass', 1800, 1.2], wood: ['bandpass', 700, 2.5], grass: ['lowpass', 1200, 0.7], gravel: ['bandpass', 1100, 0.8],
  sand: ['highpass', 2500, 0.6], cloth: ['lowpass', 700, 0.5], glass: ['highpass', 3500, 4], metal: ['bandpass', 2600, 6]
};

// play(name, {mat, vol, dist})
export function play(name, o = {}) {
  if (!ctx || volume <= 0) return;
  const now = performance.now();
  const key = name + (o.mat || '');
  if (o.minGap && now - (last.get(key) || 0) < o.minGap) return;
  last.set(key, now);
  const att = o.dist !== undefined ? Math.max(0, 1 - o.dist / 24) : 1;
  if (att <= 0) return;
  const v = (o.vol || 1) * att;
  const m = MAT[o.mat] || MAT.stone;
  switch (name) {
    case 'dig': noise(m[0], m[1] * (0.8 + Math.random() * 0.4), m[2], 0.09, 0.35 * v); break;
    case 'break': noise(m[0], m[1] * 0.9, m[2], 0.2, 0.5 * v); noise(m[0], m[1] * 0.6, m[2], 0.15, 0.3 * v, 0.04); if (o.mat === 'glass') { tone('triangle', 2400, 900, 0.25, 0.1 * v); } break;
    case 'place': noise(m[0], m[1], m[2], 0.12, 0.45 * v); break;
    case 'step': noise(m[0], m[1] * 0.8, m[2], 0.06, 0.15 * v); break;
    case 'hurt': tone('sawtooth', 220, 110, 0.18, 0.18 * v); noise('lowpass', 600, 1, 0.12, 0.2 * v); break;
    case 'mobhurt': tone('square', 300 + Math.random() * 200, 150, 0.15, 0.1 * v); break;
    case 'pig': tone('sawtooth', 300, 180, 0.2, 0.08 * v); tone('sawtooth', 280, 160, 0.15, 0.06 * v, 0.18); break;
    case 'cow': tone('sawtooth', 140, 100, 0.6, 0.1 * v); break;
    case 'sheep': tone('square', 400, 380, 0.4, 0.05 * v); break;
    case 'chicken': tone('square', 1200, 900, 0.08, 0.05 * v); tone('square', 1300, 1000, 0.08, 0.05 * v, 0.1); break;
    case 'zombie': tone('sawtooth', 120, 80, 0.8, 0.09 * v); break;
    case 'skeleton': noise('bandpass', 2500, 8, 0.1, 0.2 * v); noise('bandpass', 2200, 8, 0.1, 0.2 * v, 0.12); break;
    case 'spider': noise('bandpass', 900, 3, 0.25, 0.15 * v); break;
    case 'explode': noise('lowpass', 400, 0.5, 1.6, 1.0 * v); noise('lowpass', 150, 0.5, 2.2, 0.9 * v, 0.02); break;
    case 'fuse': noise('highpass', 4000, 1, 1.2, 0.15 * v); break;
    case 'pop': tone('sine', 600 + Math.random() * 400, 1400, 0.07, 0.2 * v); break;
    case 'click': tone('square', 1200, 1000, 0.03, 0.06 * v); break;
    case 'bow': tone('triangle', 500, 250, 0.2, 0.15 * v); noise('bandpass', 1500, 2, 0.1, 0.15 * v); break;
    case 'arrowhit': noise('bandpass', 900, 3, 0.08, 0.25 * v); break;
    case 'hit': noise('bandpass', 700, 1.5, 0.08, 0.3 * v); break;
    case 'door': noise('bandpass', 500, 3, 0.25, 0.3 * v); tone('sawtooth', 200, 170, 0.2, 0.04 * v); break;
    case 'chestopen': noise('bandpass', 400, 2, 0.35, 0.3 * v); break;
    case 'eat': for (let i = 0; i < 3; i++) noise('bandpass', 1500, 1, 0.07, 0.3 * v, i * 0.12); break;
    case 'splash': noise('lowpass', 1500, 0.7, 0.5, 0.4 * v); break;
    case 'fizz': noise('highpass', 3000, 1, 0.5, 0.25 * v); break;
    case 'toolbreak': noise('highpass', 3000, 5, 0.3, 0.3 * v); tone('triangle', 1800, 600, 0.3, 0.1 * v); break;
    case 'ignite': noise('highpass', 2000, 1, 0.3, 0.3 * v); break;
    case 'throw': noise('bandpass', 1000, 1, 0.15, 0.15 * v); break;
    case 'craft': tone('sine', 800, 1200, 0.08, 0.1 * v); tone('sine', 1200, 1600, 0.08, 0.1 * v, 0.08); break;
    case 'shear': noise('highpass', 5000, 2, 0.1, 0.3 * v); break;
    case 'plop': tone('sine', 400, 200, 0.1, 0.2 * v); break;
    case 'reactor': tone('sawtooth', 60, 50, 1.4, 0.15 * v); noise('lowpass', 200, 1, 1.2, 0.2 * v); break;
    case 'levelup': tone('sine', 500, 900, 0.3, 0.1 * v); break;
  }
}
