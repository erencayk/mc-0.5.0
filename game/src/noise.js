// Seeded gradient noise (classic improved-Perlin style) + helpers.
export function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Noise {
  constructor(seed) {
    const r = mulberry(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  static fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  static grad3(h, x, y, z) {
    const g = h & 15;
    const u = g < 8 ? x : y;
    const v = g < 4 ? y : (g === 12 || g === 14 ? x : z);
    return ((g & 1) ? -u : u) + ((g & 2) ? -v : v);
  }
  noise3(x, y, z) {
    const P = this.perm;
    let X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    x -= X; y -= Y; z -= Z; X &= 255; Y &= 255; Z &= 255;
    const u = Noise.fade(x), v = Noise.fade(y), w = Noise.fade(z);
    const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z, Bq = P[X + 1] + Y, BA = P[Bq] + Z, BB = P[Bq + 1] + Z;
    const g = Noise.grad3;
    const l = (a, b, t) => a + t * (b - a);
    return l(
      l(l(g(P[AA], x, y, z), g(P[BA], x - 1, y, z), u), l(g(P[AB], x, y - 1, z), g(P[BB], x - 1, y - 1, z), u), v),
      l(l(g(P[AA + 1], x, y, z - 1), g(P[BA + 1], x - 1, y, z - 1), u), l(g(P[AB + 1], x, y - 1, z - 1), g(P[BB + 1], x - 1, y - 1, z - 1), u), v),
      w);
  }
  noise2(x, y) { return this.noise3(x, y, 0.5); }
  fbm2(x, y, oct = 4, lac = 2, gain = 0.5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += this.noise2(x * f, y * f) * a; n += a; a *= gain; f *= lac; }
    return s / n;
  }
}
