(() => {
  // game/src/textures.js
  var TILE = 16;
  var ATLAS_TILES = 32;
  var ATLAS_SIZE = TILE * ATLAS_TILES;
  var tileIndex = /* @__PURE__ */ new Map();
  var tileList = [];
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = s + 1831565813 >>> 0;
      let t = s;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  var Px = class {
    constructor(name) {
      this.d = new Uint8ClampedArray(TILE * TILE * 4);
      this.r = rng(hashStr(name));
    }
    set(x, y, c, a = 255) {
      if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
      const i = (y * TILE + x) * 4;
      this.d[i] = c[0];
      this.d[i + 1] = c[1];
      this.d[i + 2] = c[2];
      this.d[i + 3] = c.length > 3 ? c[3] : a;
    }
    get(x, y) {
      const i = (y * TILE + x) * 4;
      return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
    }
    clear(x, y) {
      this.set(x, y, [0, 0, 0, 0]);
    }
    fill(c) {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) this.set(x, y, c);
    }
    // per-pixel brightness jitter around a base color
    noise(base, amt = 18) {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const k = (this.r() - 0.5) * 2 * amt;
        this.set(x, y, [base[0] + k, base[1] + k, base[2] + k]);
      }
    }
    speckle(c, chance, amt = 10) {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        if (this.r() < chance) {
          const k = (this.r() - 0.5) * amt;
          this.set(x, y, [c[0] + k, c[1] + k, c[2] + k]);
        }
      }
    }
    blob(cx, cy, rad, c, amt = 12) {
      for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
        if (x * x + y * y <= rad * rad + this.r() * 1.5) {
          const k = (this.r() - 0.5) * amt;
          this.set(cx + x, cy + y, [c[0] + k, c[1] + k, c[2] + k]);
        }
      }
    }
    rect(x0, y0, w, h, c) {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c);
    }
    tint(m) {
      for (let i = 0; i < this.d.length; i += 4) {
        this.d[i] *= m[0];
        this.d[i + 1] *= m[1];
        this.d[i + 2] *= m[2];
      }
    }
    // draw a 16-row string sprite. Each char maps to a palette color, '.' = transparent
    sprite(rows, pal, ox = 0, oy = 0) {
      for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
        const ch = rows[y][x];
        if (ch === "." || ch === " ") continue;
        const c = pal[ch];
        if (c) this.set(ox + x, oy + y, c);
      }
    }
  };
  function shade(c, f) {
    return [c[0] * f, c[1] * f, c[2] * f];
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function def(name, fn) {
    tileIndex.set(name, tileList.length);
    tileList.push({ name, fn });
  }
  function tex(name) {
    const i = tileIndex.get(name);
    if (i === void 0) throw new Error("missing texture " + name);
    return i;
  }
  var STONE = [125, 125, 125];
  var DIRT = [134, 96, 67];
  var GRASS = [104, 160, 64];
  var SAND = [219, 207, 163];
  var OAK = [160, 130, 80];
  var COBBLE = [118, 118, 118];
  function stone(p, base = STONE) {
    p.noise(base, 14);
    for (let i = 0; i < 9; i++) {
      const x = p.r() * 16 | 0, y = p.r() * 16 | 0, l = 2 + (p.r() * 3 | 0);
      for (let j = 0; j < l; j++) p.set(x + j, y, shade(base, 0.82));
    }
  }
  function ore(p, c, c2) {
    stone(p);
    const n = 4 + (p.r() * 2 | 0);
    for (let i = 0; i < n; i++) {
      const x = 2 + (p.r() * 12 | 0), y = 2 + (p.r() * 12 | 0);
      p.set(x, y, c);
      p.set(x + 1, y, c2 || shade(c, 0.8));
      p.set(x, y + 1, shade(c, 0.85));
      if (p.r() < 0.6) p.set(x + 1, y + 1, c);
    }
  }
  function dirt(p) {
    p.noise(DIRT, 16);
    p.speckle([110, 78, 54], 0.12);
    p.speckle([150, 112, 80], 0.08);
  }
  function cobble(p, base = COBBLE, moss = false) {
    p.noise(shade(base, 0.7), 6);
    const stones = [[1, 1, 5, 4], [7, 0, 6, 4], [13, 1, 3, 5], [0, 6, 4, 5], [5, 5, 6, 5], [11, 7, 5, 4], [0, 12, 6, 4], [7, 11, 5, 5], [12, 12, 4, 4]];
    for (const [x, y, w, h] of stones) {
      const f = 0.85 + p.r() * 0.3;
      for (let yy = 0; yy < h - 1; yy++) for (let xx = 0; xx < w - 1; xx++) {
        const k = (p.r() - 0.5) * 16;
        let c = shade(base, f);
        c = [c[0] + k, c[1] + k, c[2] + k];
        if (yy === 0 || xx === 0) c = shade(c, 1.15);
        if (moss && p.r() < 0.35) c = [70 + k, 110 + k, 60 + k];
        p.set(x + xx, y + yy, c);
      }
    }
  }
  function planks(p, base = OAK) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const band = y % 4 === 3;
      const grain = Math.sin((x + (y >> 2) * 5) * 1.3) * 6 + (p.r() - 0.5) * 10;
      let c = shade(base, band ? 0.72 : 1);
      p.set(x, y, [c[0] + grain, c[1] + grain, c[2] + grain]);
    }
    for (let r = 0; r < 4; r++) {
      const x = (r * 7 + 3) % 16;
      p.set(x, r * 4 + 1, shade(base, 0.7));
      p.set(x, r * 4 + 2, shade(base, 0.7));
    }
  }
  function logSide(p, bark, dark) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const stripe = x % 4 === 0 || (x + (y >> 3 & 1)) % 5 === 0 ? 0.75 : 1;
      const k = (p.r() - 0.5) * 14;
      const c = shade(bark, stripe);
      p.set(x, y, [c[0] + k, c[1] + k, c[2] + k]);
    }
    if (dark) for (let i = 0; i < 10; i++) p.set(p.r() * 16 | 0, p.r() * 16 | 0, dark);
  }
  function logTop(p, bark, inner) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5, d = Math.max(Math.abs(dx), Math.abs(dy));
      let c;
      if (d > 6.5) c = bark;
      else c = shade(inner, Math.floor(d) % 2 === 0 ? 1 : 0.85);
      const k = (p.r() - 0.5) * 8;
      p.set(x, y, [c[0] + k, c[1] + k, c[2] + k]);
    }
  }
  function leaves(p, base) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (p.r() < 0.2) {
        p.clear(x, y);
        continue;
      }
      const k = (p.r() - 0.5) * 40;
      p.set(x, y, [base[0] + k, base[1] + k, base[2] + k]);
    }
  }
  function wool(p, c) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const k = (p.r() - 0.5) * 14 + ((x + y & 3) === 0 ? -8 : 0);
      p.set(x, y, [c[0] + k, c[1] + k, c[2] + k]);
    }
  }
  function metalBlock(p, c) {
    p.noise(c, 6);
    for (let i = 0; i < 16; i++) {
      p.set(i, 0, shade(c, 1.25));
      p.set(0, i, shade(c, 1.2));
      p.set(i, 15, shade(c, 0.7));
      p.set(15, i, shade(c, 0.75));
    }
    for (let i = 2; i < 14; i++) if ((i & 3) === 1) {
      p.set(i, i, shade(c, 1.3));
      p.set(i + 1, i, shade(c, 1.15));
    }
  }
  function bricks(p, brick, mortar, rows = 4) {
    const h = 16 / rows;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const row = Math.floor(y / h);
      const off = row & 1 ? h : 0;
      const mortarLine = y % h === h - 1 || (x + off) % (h * 2) === 0;
      const k = (p.r() - 0.5) * 16;
      const c = mortarLine ? mortar : brick;
      p.set(x, y, [c[0] + k, c[1] + k, c[2] + k]);
    }
  }
  function plantCross(p, stemCol, flowerCol, centerCol) {
    for (let y = 7; y < 16; y++) p.set(7 + (y & 4 ? 1 : 0), y, stemCol);
    p.set(6, 11, stemCol);
    p.set(5, 10, stemCol);
    p.set(9, 12, stemCol);
    p.set(10, 11, stemCol);
    if (flowerCol) {
      p.blob(7, 5, 2, flowerCol, 20);
      if (centerCol) p.set(7, 5, centerCol);
    }
  }
  var DYE_COLORS = [
    [222, 222, 222],
    [219, 125, 62],
    [179, 80, 188],
    [107, 138, 201],
    [177, 166, 39],
    [65, 174, 56],
    [208, 132, 153],
    [64, 64, 64],
    [154, 161, 161],
    [46, 110, 137],
    [126, 61, 181],
    [46, 56, 141],
    [79, 50, 31],
    [53, 70, 27],
    [150, 52, 48],
    [25, 22, 22]
  ];
  var WOOL_COLORS = DYE_COLORS;
  def("stone", (p) => stone(p));
  def("grass_top", (p) => {
    p.noise(GRASS, 22);
    p.speckle([86, 140, 50], 0.2);
  });
  def("grass_side", (p) => {
    dirt(p);
    for (let x = 0; x < 16; x++) {
      const h = 3 + (p.r() * 3 | 0);
      for (let y = 0; y < h; y++) {
        const k = (p.r() - 0.5) * 20;
        p.set(x, y, [GRASS[0] + k, GRASS[1] + k, GRASS[2] + k]);
      }
    }
  });
  def("grass_side_snow", (p) => {
    dirt(p);
    for (let x = 0; x < 16; x++) {
      const h = 3 + (p.r() * 3 | 0);
      for (let y = 0; y < h; y++) p.set(x, y, [240 - p.r() * 20, 245 - p.r() * 15, 250]);
    }
  });
  def("dirt", (p) => dirt(p));
  def("cobblestone", (p) => cobble(p));
  def("mossy_cobblestone", (p) => cobble(p, COBBLE, true));
  def("planks", (p) => planks(p));
  def("bedrock", (p) => {
    p.noise([70, 70, 70], 35);
    p.speckle([30, 30, 30], 0.25);
    p.speckle([140, 140, 140], 0.1);
  });
  def("sand", (p) => {
    p.noise(SAND, 12);
    p.speckle([200, 188, 140], 0.15);
  });
  def("gravel", (p) => {
    p.noise([128, 122, 120], 10);
    for (let i = 0; i < 28; i++) p.blob(p.r() * 16 | 0, p.r() * 16 | 0, 1, p.r() < 0.5 ? [100, 92, 90] : [160, 152, 150], 20);
  });
  def("sandstone_top", (p) => {
    p.noise([216, 203, 156], 8);
  });
  def("sandstone_side", (p) => {
    p.noise([216, 203, 156], 8);
    for (let x = 0; x < 16; x++) {
      p.set(x, 3, [196, 182, 134]);
      p.set(x, 4, [226, 214, 170]);
      p.set(x, 11, [196, 182, 134]);
    }
  });
  def("sandstone_bottom", (p) => {
    p.noise([210, 196, 148], 12);
    for (let x = 0; x < 16; x++) p.set(x, 12, [190, 175, 128]);
  });
  def("coal_ore", (p) => ore(p, [40, 40, 40]));
  def("iron_ore", (p) => ore(p, [216, 175, 147]));
  def("gold_ore", (p) => ore(p, [250, 230, 80]));
  def("diamond_ore", (p) => ore(p, [100, 230, 225]));
  def("redstone_ore", (p) => ore(p, [200, 20, 20]));
  def("lapis_ore", (p) => ore(p, [30, 70, 180]));
  def("log_oak", (p) => logSide(p, [104, 82, 50], [80, 62, 36]));
  def("log_spruce", (p) => logSide(p, [60, 42, 24], [44, 30, 16]));
  def("log_birch", (p) => {
    p.noise([220, 220, 210], 8);
    for (let i = 0; i < 10; i++) {
      const x = p.r() * 14 | 0, y = p.r() * 16 | 0;
      p.set(x, y, [50, 50, 45]);
      p.set(x + 1, y, [70, 70, 60]);
    }
  });
  def("log_top", (p) => logTop(p, [104, 82, 50], [180, 146, 90]));
  def("leaves_oak", (p) => leaves(p, [60, 140, 40]));
  def("leaves_spruce", (p) => leaves(p, [50, 96, 60]));
  def("leaves_birch", (p) => leaves(p, [110, 150, 70]));
  def("glass", (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      if (edge) p.set(x, y, [200, 230, 240]);
      else if ((x - y === 3 || x - y === 4) && x > 2 && x < 9) p.set(x, y, [255, 255, 255, 180]);
      else p.clear(x, y);
    }
  });
  def("lapis_block", (p) => {
    p.noise([38, 67, 138], 18);
    p.speckle([60, 100, 190], 0.2);
  });
  def("gold_block", (p) => metalBlock(p, [245, 210, 60]));
  def("iron_block", (p) => metalBlock(p, [220, 220, 220]));
  def("diamond_block", (p) => metalBlock(p, [110, 225, 220]));
  def("bricks", (p) => bricks(p, [150, 74, 58], [170, 160, 150]));
  def("stone_bricks", (p) => bricks(p, [122, 122, 122], [90, 90, 90], 2));
  def("nether_bricks", (p) => bricks(p, [60, 28, 34], [30, 14, 18]));
  def("netherrack", (p) => {
    p.noise([110, 52, 50], 20);
    p.speckle([140, 70, 66], 0.15);
    p.speckle([80, 34, 34], 0.15);
  });
  def("obsidian", (p) => {
    p.noise([22, 16, 32], 8);
    p.speckle([60, 40, 90], 0.12);
  });
  def("glowing_obsidian", (p) => {
    p.noise([110, 20, 20], 25);
    p.speckle([255, 140, 40], 0.18);
    p.speckle([40, 10, 20], 0.12);
  });
  def("reactor_core", (p) => {
    p.fill([60, 60, 60]);
    for (let i = 0; i < 16; i++) {
      p.set(i, 0, [200, 200, 200]);
      p.set(i, 15, [200, 200, 200]);
      p.set(0, i, [200, 200, 200]);
      p.set(15, i, [200, 200, 200]);
    }
    p.rect(3, 3, 10, 10, [40, 40, 50]);
    p.rect(5, 5, 6, 6, [110, 230, 225]);
    p.rect(6, 6, 4, 4, [230, 230, 230]);
    for (let i = 1; i < 15; i += 3) {
      p.set(i, 1, [240, 240, 240]);
      p.set(1, i, [240, 240, 240]);
    }
  });
  def("reactor_core_active", (p) => {
    p.fill([120, 40, 30]);
    for (let i = 0; i < 16; i++) {
      p.set(i, 0, [255, 200, 60]);
      p.set(i, 15, [255, 200, 60]);
      p.set(0, i, [255, 200, 60]);
      p.set(15, i, [255, 200, 60]);
    }
    p.rect(3, 3, 10, 10, [200, 60, 20]);
    p.rect(5, 5, 6, 6, [255, 230, 120]);
  });
  def("reactor_core_used", (p) => {
    p.fill([40, 40, 40]);
    for (let i = 0; i < 16; i++) {
      p.set(i, 0, [110, 110, 110]);
      p.set(i, 15, [110, 110, 110]);
      p.set(0, i, [110, 110, 110]);
      p.set(15, i, [110, 110, 110]);
    }
    p.rect(3, 3, 10, 10, [25, 25, 30]);
    p.rect(5, 5, 6, 6, [70, 70, 70]);
  });
  def("glowstone", (p) => {
    p.noise([170, 130, 70], 10);
    for (let i = 0; i < 14; i++) p.blob(p.r() * 16 | 0, p.r() * 16 | 0, 1, [255, 230, 150], 30);
  });
  def("tnt_side", (p) => {
    p.noise([200, 50, 40], 10);
    for (let x = 0; x < 16; x++) for (let y = 6; y < 10; y++) p.set(x, y, [230, 230, 230]);
    const t = ["XXX.X..X.XXX", ".X..XX.X..X.", ".X..X.XX..X.", ".X..X..X..X."];
    p.sprite(t, { X: [30, 30, 30] }, 2, 6);
  });
  def("tnt_top", (p) => {
    p.noise([200, 50, 40], 10);
    p.blob(7, 7, 2, [60, 60, 60], 5);
  });
  def("tnt_bottom", (p) => p.noise([190, 45, 36], 10));
  def("bookshelf", (p) => {
    planks(p);
    const cols = [[150, 40, 40], [40, 80, 150], [60, 130, 60], [140, 110, 50], [110, 60, 140]];
    for (const y0 of [1, 9]) for (let x = 1; x < 15; x++) {
      const c = cols[p.r() * cols.length | 0];
      const h = 5 + (p.r() * 2 | 0);
      for (let y = 0; y < h; y++) p.set(x, y0 + 6 - h + y, shade(c, y === 0 ? 1.2 : 1));
    }
  });
  def("crafting_top", (p) => {
    planks(p, [170, 130, 80]);
    for (let i = 0; i < 16; i++) {
      p.set(i, 0, [90, 60, 30]);
      p.set(i, 15, [90, 60, 30]);
      p.set(0, i, [90, 60, 30]);
      p.set(15, i, [90, 60, 30]);
      p.set(i, 7, [110, 76, 40]);
      p.set(7, i, [110, 76, 40]);
    }
  });
  def("crafting_side", (p) => {
    planks(p);
    p.rect(3, 4, 2, 7, [140, 140, 140]);
    p.rect(2, 3, 4, 2, [140, 140, 140]);
    p.rect(10, 5, 2, 6, [110, 80, 40]);
    p.rect(9, 3, 4, 3, [160, 160, 170]);
  });
  def("crafting_front", (p) => {
    planks(p);
    p.rect(2, 2, 12, 2, [110, 76, 40]);
    p.rect(4, 6, 2, 8, [120, 120, 120]);
    p.rect(9, 6, 3, 2, [180, 180, 180]);
    p.rect(10, 8, 1, 6, [110, 80, 40]);
  });
  def("furnace_side", (p) => {
    stone(p, [118, 118, 118]);
    for (let i = 0; i < 16; i++) {
      p.set(i, 0, [90, 90, 90]);
      p.set(i, 15, [90, 90, 90]);
    }
  });
  def("furnace_top", (p) => {
    stone(p, [128, 128, 128]);
    p.rect(3, 3, 10, 10, [100, 100, 100]);
  });
  function furnaceFront(p, lit) {
    stone(p, [118, 118, 118]);
    p.rect(3, 2, 10, 5, [90, 90, 90]);
    p.rect(3, 9, 10, 5, [30, 30, 30]);
    if (lit) {
      for (let x = 4; x < 12; x++) {
        p.set(x, 12, [255, 200, 40]);
        if (p.r() < 0.7) p.set(x, 11, [255, 130, 20]);
        if (p.r() < 0.4) p.set(x, 10, [220, 60, 10]);
      }
    }
    for (let x = 3; x < 13; x++) p.set(x, 8, [70, 70, 70]);
  }
  def("furnace_front", (p) => furnaceFront(p, false));
  def("furnace_front_lit", (p) => furnaceFront(p, true));
  def("chest_top", (p) => {
    planks(p, [150, 105, 50]);
    for (let i = 0; i < 16; i++) {
      p.set(i, 0, [70, 45, 20]);
      p.set(i, 15, [70, 45, 20]);
      p.set(0, i, [70, 45, 20]);
      p.set(15, i, [70, 45, 20]);
    }
  });
  def("chest_side", (p) => {
    planks(p, [150, 105, 50]);
    for (let i = 0; i < 16; i++) {
      p.set(i, 0, [70, 45, 20]);
      p.set(i, 15, [70, 45, 20]);
      p.set(0, i, [70, 45, 20]);
      p.set(15, i, [70, 45, 20]);
      p.set(i, 5, [70, 45, 20]);
    }
  });
  def("chest_front", (p) => {
    planks(p, [150, 105, 50]);
    for (let i = 0; i < 16; i++) {
      p.set(i, 0, [70, 45, 20]);
      p.set(i, 15, [70, 45, 20]);
      p.set(0, i, [70, 45, 20]);
      p.set(15, i, [70, 45, 20]);
      p.set(i, 5, [70, 45, 20]);
    }
    p.rect(7, 4, 2, 4, [200, 200, 200]);
    p.set(7, 6, [60, 60, 60]);
  });
  def("wool", (p) => wool(p, DYE_COLORS[0]));
  for (let i = 1; i < 16; i++) def("wool_" + i, (p) => wool(p, DYE_COLORS[i]));
  def("sapling_oak", (p) => {
    plantCross(p, [90, 60, 30], null);
    p.blob(7, 6, 4, [60, 140, 40], 30);
    p.blob(5, 9, 2, [70, 150, 50], 30);
  });
  def("sapling_spruce", (p) => {
    plantCross(p, [60, 40, 20], null);
    for (let y = 2; y < 12; y++) {
      const w = y - 1 >> 1;
      for (let x = -w; x <= w; x++) p.set(7 + x, y, [50, 96, 60 + p.r() * 20]);
    }
  });
  def("sapling_birch", (p) => {
    plantCross(p, [200, 200, 190], null);
    p.blob(7, 6, 4, [110, 150, 70], 30);
  });
  def("tallgrass", (p) => {
    for (let i = 0; i < 9; i++) {
      const x = 1 + (p.r() * 14 | 0), h = 5 + (p.r() * 9 | 0);
      for (let y = 0; y < h; y++) p.set(x + (y > h / 2 && p.r() < 0.3 ? 1 : 0), 15 - y, [70 + p.r() * 40, 140 + p.r() * 40, 50]);
    }
  });
  def("deadbush", (p) => {
    for (let i = 0; i < 6; i++) {
      const x = 3 + (p.r() * 10 | 0);
      for (let y = 6; y < 16; y++) p.set(x + y * i % 3 - 1, y, [120, 80, 40]);
    }
  });
  def("dandelion", (p) => plantCross(p, [60, 130, 40], [250, 230, 40], [255, 180, 20]));
  def("rose", (p) => plantCross(p, [60, 130, 40], [210, 20, 20], [250, 200, 30]));
  def("mushroom_brown", (p) => {
    p.rect(7, 9, 2, 6, [220, 210, 190]);
    p.rect(4, 6, 8, 3, [150, 110, 80]);
    p.rect(5, 5, 6, 1, [170, 130, 100]);
  });
  def("mushroom_red", (p) => {
    p.rect(7, 9, 2, 6, [220, 210, 190]);
    p.rect(4, 5, 8, 4, [210, 30, 30]);
    p.rect(5, 4, 6, 1, [220, 40, 40]);
    p.set(5, 6, [255, 255, 255]);
    p.set(9, 5, [255, 255, 255]);
    p.set(10, 7, [255, 255, 255]);
  });
  def("torch", (p) => {
    p.rect(7, 6, 2, 10, [140, 100, 50]);
    p.rect(7, 5, 2, 1, [255, 255, 160]);
    p.rect(7, 4, 2, 1, [255, 200, 50]);
    p.set(7, 3, [255, 150, 40]);
  });
  def("ladder", (p) => {
    for (let y = 0; y < 16; y++) {
      p.set(2, y, [130, 95, 50]);
      p.set(3, y, [110, 80, 40]);
      p.set(12, y, [130, 95, 50]);
      p.set(13, y, [110, 80, 40]);
    }
    for (const y of [2, 6, 10, 14]) for (let x = 2; x < 14; x++) p.set(x, y, [150, 112, 60]);
  });
  def("door_wood_upper", (p) => {
    planks(p, [150, 112, 60]);
    p.rect(3, 3, 4, 4, [170, 220, 240, 0]);
    p.rect(9, 3, 4, 4, [170, 220, 240, 0]);
    for (let i = 0; i < 16; i++) {
      p.set(0, i, [100, 70, 35]);
      p.set(15, i, [100, 70, 35]);
      p.set(i, 0, [100, 70, 35]);
    }
  });
  def("door_wood_lower", (p) => {
    planks(p, [150, 112, 60]);
    for (let i = 0; i < 16; i++) {
      p.set(0, i, [100, 70, 35]);
      p.set(15, i, [100, 70, 35]);
      p.set(i, 15, [100, 70, 35]);
    }
    p.rect(3, 3, 10, 4, [130, 96, 50]);
    p.rect(3, 9, 10, 4, [130, 96, 50]);
    p.set(12, 1, [60, 60, 60]);
    p.set(12, 0, [60, 60, 60]);
  });
  def("trapdoor", (p) => {
    planks(p, [150, 112, 60]);
    for (let i = 0; i < 16; i++) {
      p.set(0, i, [100, 70, 35]);
      p.set(15, i, [100, 70, 35]);
      p.set(i, 0, [100, 70, 35]);
      p.set(i, 15, [100, 70, 35]);
    }
    p.rect(3, 3, 4, 4, [0, 0, 0, 0]);
    p.rect(9, 3, 4, 4, [0, 0, 0, 0]);
    p.rect(3, 9, 4, 4, [0, 0, 0, 0]);
    p.rect(9, 9, 4, 4, [0, 0, 0, 0]);
  });
  def("wheat_0", (p) => {
    for (let x = 2; x < 15; x += 3) {
      p.set(x, 15, [60, 160, 40]);
      p.set(x, 14, [70, 170, 50]);
    }
  });
  for (let s = 1; s < 8; s++) def("wheat_" + s, (p) => {
    const h = 2 + s * 1.7;
    for (let x = 1; x < 16; x += 2) for (let y = 0; y < h; y++) {
      const ripe = s === 7;
      const c = ripe ? [190 + p.r() * 30, 160 + p.r() * 30, 50] : [60 + s * 12, 160 - s * 4, 40];
      p.set(x + (y > h * 0.6 && x & 2 ? 1 : 0), 15 - y, c);
    }
  });
  def("farmland_dry", (p) => {
    dirt(p);
    for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x++) p.set(x, y, [100, 70, 48]);
  });
  def("farmland_wet", (p) => {
    p.noise([86, 58, 38], 10);
    for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x++) p.set(x, y, [62, 40, 26]);
  });
  def("snow", (p) => {
    p.noise([240, 245, 250], 6);
  });
  def("ice", (p) => {
    p.noise([150, 180, 250], 10);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const c = p.get(x, y);
      p.set(x, y, [c[0], c[1], c[2], 170]);
    }
    for (let i = 0; i < 6; i++) p.set(3 + i, 2 + i, [220, 235, 255, 200]);
  });
  def("cactus_side", (p) => {
    p.fill([0, 0, 0, 0]);
    for (let y = 0; y < 16; y++) for (let x = 1; x < 15; x++) {
      const k = (p.r() - 0.5) * 20;
      p.set(x, y, [20 + k, 120 + k, 30 + k]);
    }
    for (let y = 1; y < 16; y += 4) {
      p.set(1, y, [220, 220, 180]);
      p.set(14, y + 2, [220, 220, 180]);
      p.set(5, y + 1, [10, 80, 20]);
      p.set(10, y + 3, [10, 80, 20]);
    }
  });
  def("cactus_top", (p) => {
    p.fill([0, 0, 0, 0]);
    for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) p.set(x, y, [40 + p.r() * 20, 140, 50]);
    p.rect(6, 6, 4, 4, [140, 170, 90]);
  });
  def("cactus_bottom", (p) => {
    p.fill([0, 0, 0, 0]);
    for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) p.set(x, y, [150, 170, 110]);
  });
  def("clay", (p) => {
    p.noise([160, 166, 178], 8);
  });
  def("sugarcane", (p) => {
    for (const x of [3, 8, 12]) for (let y = 0; y < 16; y++) {
      const knot = (y + x) % 6 === 0;
      p.set(x, y, knot ? [160, 200, 110] : [120, 180, 80]);
      p.set(x + 1, y, knot ? [140, 180, 90] : [100, 160, 64]);
    }
    p.set(5, 3, [100, 170, 70]);
    p.set(6, 2, [100, 170, 70]);
    p.set(10, 8, [100, 170, 70]);
  });
  def("pumpkin_top", (p) => {
    p.noise([200, 120, 20], 10);
    for (let x = 0; x < 16; x += 4) for (let y = 0; y < 16; y++) p.set(x, y, [170, 96, 10]);
    p.rect(6, 6, 4, 4, [110, 90, 40]);
  });
  def("pumpkin_side", (p) => {
    p.noise([210, 125, 22], 10);
    for (let x = 1; x < 16; x += 4) for (let y = 0; y < 16; y++) p.set(x, y, [176, 100, 12]);
  });
  def("pumpkin_face", (p) => {
    p.noise([210, 125, 22], 10);
    for (let x = 1; x < 16; x += 4) for (let y = 0; y < 16; y++) p.set(x, y, [176, 100, 12]);
    p.rect(3, 4, 3, 3, [40, 20, 0]);
    p.rect(10, 4, 3, 3, [40, 20, 0]);
    p.rect(3, 10, 10, 2, [40, 20, 0]);
    p.rect(5, 12, 2, 1, [40, 20, 0]);
    p.rect(9, 12, 2, 1, [40, 20, 0]);
  });
  def("melon_side", (p) => {
    p.noise([110, 150, 30], 10);
    for (let x = 0; x < 16; x += 3) for (let y = 0; y < 16; y++) if (p.r() < 0.85) p.set(x, y, [70, 110, 20]);
  });
  def("melon_top", (p) => {
    p.noise([110, 150, 30], 10);
    p.blob(8, 8, 3, [90, 130, 30]);
    for (let a = 0; a < 6; a++) {
      p.set(8 + Math.round(Math.cos(a) * 6), 8 + Math.round(Math.sin(a) * 6), [70, 110, 20]);
    }
  });
  for (let s = 0; s < 8; s++) def("stem_" + s, (p) => {
    const h = 2 + s * 2;
    const c = s === 7 ? [180, 140, 40] : [80 + s * 12, 160 - s * 6, 40];
    for (let y = 0; y < h; y++) p.set(7 + (y & 1), 15 - y, c);
    if (s > 3) {
      p.set(6, 15 - h + 2, c);
      p.set(9, 15 - h + 3, c);
    }
  });
  def("stem_connected", (p) => {
    for (let y = 4; y < 16; y++) p.set(7, y, [180, 140, 40]);
    for (let x = 7; x < 16; x++) p.set(x, 4 + (x - 7 >> 2), [180, 140, 40]);
  });
  def("cobweb", (p) => {
    for (let i = 0; i < 16; i++) {
      p.set(i, i, [230, 230, 230, 220]);
      p.set(15 - i, i, [230, 230, 230, 220]);
      p.set(i, 8, [220, 220, 220, 200]);
      p.set(8, i, [220, 220, 220, 200]);
    }
    for (let a = 0; a < 40; a++) {
      const ang = a / 40 * Math.PI * 2;
      for (const r of [3, 6]) p.set(8 + Math.round(Math.cos(ang) * r), 8 + Math.round(Math.sin(ang) * r), [210, 210, 210, 180]);
    }
  });
  def("bed_head_top", (p) => {
    wool(p, [170, 30, 30]);
    p.rect(1, 1, 14, 6, [235, 235, 235]);
  });
  def("bed_foot_top", (p) => {
    wool(p, [170, 30, 30]);
  });
  def("bed_side_head", (p) => {
    p.fill([0, 0, 0, 0]);
    p.rect(0, 7, 16, 3, [170, 30, 30]);
    p.rect(0, 10, 16, 3, [150, 112, 60]);
    p.rect(0, 13, 2, 3, [120, 90, 50]);
    p.rect(0, 7, 6, 2, [235, 235, 235]);
  });
  def("bed_side_foot", (p) => {
    p.fill([0, 0, 0, 0]);
    p.rect(0, 7, 16, 3, [170, 30, 30]);
    p.rect(0, 10, 16, 3, [150, 112, 60]);
    p.rect(14, 13, 2, 3, [120, 90, 50]);
  });
  def("bed_end", (p) => {
    p.fill([0, 0, 0, 0]);
    p.rect(0, 7, 16, 3, [170, 30, 30]);
    p.rect(0, 10, 16, 3, [150, 112, 60]);
    p.rect(0, 13, 2, 3, [120, 90, 50]);
    p.rect(14, 13, 2, 3, [120, 90, 50]);
  });
  def("water", (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const k = Math.sin((x + y * 0.5) * 0.9) * 10 + (p.r() - 0.5) * 10;
      p.set(x, y, [40 + k, 80 + k, 210 + k, 170]);
    }
  });
  def("lava", (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const k = Math.sin(x * 0.7) * Math.cos(y * 0.6) * 30 + (p.r() - 0.5) * 20;
      p.set(x, y, [230 + k, 110 + k * 1.5, 20]);
    }
  });
  def("fire", (p) => {
    for (let x = 0; x < 16; x++) {
      const h = 6 + p.r() * 10;
      for (let y = 0; y < h; y++) p.set(x, 15 - y, mix([255, 230, 60], [220, 50, 10], y / h));
    }
  });
  for (let i = 0; i < 10; i++) def("destroy_" + i, (p) => {
    const n = (i + 1) * 9;
    for (let k = 0; k < n; k++) {
      let x = p.r() * 16 | 0, y = p.r() * 16 | 0;
      const len = 2 + (p.r() * 3 | 0);
      for (let j = 0; j < len; j++) {
        p.set(x, y, [0, 0, 0, 150]);
        x += p.r() < 0.5 ? 1 : 0;
        y += p.r() < 0.5 ? 1 : -1;
      }
    }
  });
  def("white", (p) => p.fill([255, 255, 255]));
  def("cloud", (p) => p.fill([255, 255, 255, 200]));
  var IRON = [216, 216, 216];
  var WOODC = [150, 112, 60];
  var STONEC = [130, 130, 130];
  var GOLD = [250, 220, 60];
  var DIAM = [100, 230, 225];
  var MATS = { wood: WOODC, stone: STONEC, iron: IRON, gold: GOLD, diamond: DIAM };
  var STICK = [120, 85, 40];
  var SHAPES = {
    sword: [".............HH.", "............HHH.", "...........HHH..", "..........HHH...", ".........HHH....", "........HHH.....", ".......HHH......", "..S...HHH.......", "...S.HHH........", "....SHH.........", ".....SS.........", "....S.SS........", "...S....S.......", "..SS............", ".SS.............", "................"],
    shovel: ["............HH..", "...........HHHH.", "..........HHHHH.", "...........HHH..", "..........S.H...", ".........S......", "........S.......", ".......S........", "......S.........", ".....S..........", "....S...........", "...S............", "..S.............", ".SS.............", "................", "................"],
    pickaxe: ["......HHHHH.....", ".....H.....HH...", "..........SHHH..", ".........S..HH..", "........S....H..", ".......S.....H..", "......S.......H.", ".....S..........", "....S...........", "...S............", "..S.............", ".S..............", "................", "................", "................", "................"],
    axe: ["........HH......", ".......HHHH.....", "......HHHHHS....", ".......HHHS.....", "........HS......", ".......S........", "......S.........", ".....S..........", "....S...........", "...S............", "..S.............", ".S..............", "................", "................", "................", "................"],
    hoe: [".......HHHH.....", ".........SH.....", "........S.......", ".......S........", "......S.........", ".....S..........", "....S...........", "...S............", "..S.............", ".S..............", "................", "................", "................", "................", "................", "................"]
  };
  for (const tool of Object.keys(SHAPES)) for (const m of Object.keys(MATS)) {
    def(`${m}_${tool}`, (p) => p.sprite(SHAPES[tool], { H: MATS[m], S: STICK }, 0, 0));
  }
  function itemDef(name, rows, pal) {
    def(name, (p) => p.sprite(rows, pal));
  }
  itemDef("stick", ["................", "..............S.", ".............S..", "............S...", "...........S....", "..........S.....", ".........S......", "........S.......", ".......S........", "......S.........", ".....S..........", "....S...........", "...S............", "..S.............", "................", "................"], { S: STICK });
  itemDef("coal", ["................", "................", ".....KKKK.......", "....KKkKKK......", "...KKKKKKkK.....", "...KkKKKKKKK....", "..KKKKKkKKKK....", "..KKKKKKKKKK....", "..KKkKKKKKkK....", "...KKKKKKKK.....", "....KKKkKK......", ".....KKKK.......", "................", "................", "................", "................"], { K: [35, 35, 35], k: [80, 80, 80] });
  function ingot(c) {
    return (p) => p.sprite(["................", "................", "................", "................", "................", ".......LLLLL....", ".....LLHHHHHL...", "...LLHHHHHHLD...", "..LHHHHHHHLDD...", "..LDDHHHHLDD....", "...LDDDDLDD.....", ".....LDDDD......", "................", "................", "................", "................"], { L: shade(c, 1.2), H: c, D: shade(c, 0.7) });
  }
  def("iron_ingot", ingot(IRON));
  def("gold_ingot", ingot(GOLD));
  itemDef("diamond", ["................", "................", ".....LLLLL......", "....LHHHHHL.....", "...LHHLHHHHL....", "..LHHLHHHHHHL...", "..DHHHHHHHHHD...", "...DHHHHHHHD....", "....DHHHHHD.....", ".....DHHHD......", "......DHD.......", ".......D........", "................", "................", "................", "................"], { L: [200, 255, 255], H: DIAM, D: [40, 150, 150] });
  itemDef("apple", ["................", ".......S........", "......S.........", "....RRSRRR......", "...RRRRRRRR.....", "..RRWRRRRRRR....", "..RWRRRRRRRR....", "..RRRRRRRRRR....", "..RRRRRRRRRR....", "..RRRRRRRRRD....", "...RRRRRRRD.....", "....RRDRRD......", "................", "................", "................", "................"], { R: [210, 20, 30], D: [140, 10, 20], W: [255, 200, 200], S: [90, 60, 30] });
  itemDef("bow", ["..........WWW...", ".........W..S...", "........W...S...", ".......W....S...", "......W.....S...", ".....W.....S....", "....W.....S.....", "...W.....S......", "..W.....S.......", ".W.....S........", ".W....S.........", ".W...S..........", ".WSSS...........", "................", "................", "................"], { W: [120, 85, 40], S: [230, 230, 230] });
  itemDef("arrow", ["............FF..", "...........FFF..", "............F...", "...........S....", "..........S.....", ".........S......", "........S.......", ".......S........", "......S.........", ".....S..........", "....S...........", "..HH............", "..HHH...........", "...H............", "................", "................"], { F: [240, 240, 240], S: STICK, H: [120, 120, 120] });
  itemDef("bowl", ["................", "................", "................", "................", "................", "................", "..BBBBBBBBBBBB..", "..BbbbbbbbbbbB..", "...BbbbbbbbbB...", "....BBBBBBBB....", "......BBBB......", "................", "................", "................", "................", "................"], { B: [110, 76, 40], b: [150, 110, 60] });
  itemDef("mushroom_stew", ["................", "................", "................", "................", "................", "....RRRRRRRR....", "..BRRSSSSSRRRB..", "..BSSSSRSSSSSB..", "...BSSSSSSSSB...", "....BBBBBBBB....", "......BBBB......", "................", "................", "................", "................", "................"], { B: [110, 76, 40], S: [190, 140, 100], R: [150, 100, 70] });
  itemDef("string", ["................", "..........WW....", ".........W..W...", "........W.......", ".......W........", "......W.........", ".....W..........", "....W...........", "...W............", "..W.............", "..W.............", "...WW...........", "................", "................", "................", "................"], { W: [240, 240, 240] });
  itemDef("feather", ["..........WW....", ".........WWWW...", "........WWWWW...", ".......WWWWW....", "......WWWWW.....", ".....WWWWG......", "....WWWWG.......", "....WWWG........", "...WWWG.........", "...WWG..........", "..WG............", "..G.............", ".G..............", "................", "................", "................"], { W: [235, 235, 235], G: [150, 150, 150] });
  itemDef("gunpowder", ["................", "................", "................", "......GGG.......", "....GGgGGGG.....", "...GGGGGgGGG....", "..GGgGGGGGGgG...", "..GGGGGgGGGGG...", "...GGGGGGGGG....", "....GGGgGGG.....", "................", "................", "................", "................", "................", "................"], { G: [80, 80, 80], g: [140, 140, 140] });
  itemDef("seeds", ["................", "................", "................", "....G...G.......", "......G....G....", "..G.......G.....", ".....G..G.......", "...G.......G....", ".......G...G....", "....G..G........", "..........G.....", "......G.........", "................", "................", "................", "................"], { G: [80, 160, 50] });
  itemDef("pumpkin_seeds", ["................", "................", "................", "....S...S.......", "......S....S....", "..S.......S.....", ".....S..S.......", "...S.......S....", ".......S...S....", "....S..S........", "..........S.....", "......S.........", "................", "................", "................", "................"], { S: [230, 220, 160] });
  itemDef("melon_seeds", ["................", "................", "................", "....S...S.......", "......S....S....", "..S.......S.....", ".....S..S.......", "...S.......S....", ".......S...S....", "....S..S........", "..........S.....", "......S.........", "................", "................", "................", "................"], { S: [40, 30, 20] });
  itemDef("wheat", ["..........Y.Y...", ".........YYY....", "........YYY.Y...", ".......YYY......", "......YYY.......", ".....GYY........", "....GG..........", "...GG...........", "..GG............", ".GG.............", "................", "................", "................", "................", "................", "................"], { Y: [220, 190, 60], G: [180, 160, 60] });
  itemDef("bread", ["................", "................", "................", "................", "......BBBBB.....", "....BBbBbBBBB...", "...BbbBbbBbbBB..", "..BBBBBBBBBBBB..", "..DBBBBBBBBBBD..", "...DDDDDDDDDD...", "................", "................", "................", "................", "................", "................"], { B: [190, 130, 50], b: [230, 180, 90], D: [130, 80, 30] });
  itemDef("flint", ["................", ".......FF.......", "......FFFF......", ".....FFfFFF.....", "....FFFFFfF.....", "....FfFFFFFF....", "...FFFFFfFFF....", "...FFFFFFFFF....", "....FFFfFFF.....", ".....FFFFF......", "................", "................", "................", "................", "................", "................"], { F: [60, 60, 60], f: [130, 130, 130] });
  itemDef("porkchop_raw", ["................", "................", ".....PPPPP......", "....PPWPPPPP....", "...PPPPPPPPPP...", "..PPPPPPPWPPP...", "..PPPPPPPPPP....", "...PPPPPPPP.....", "....DPPPPD......", ".....DDDD.......", "................", "................", "................", "................", "................", "................"], { P: [240, 140, 140], W: [255, 230, 230], D: [200, 100, 100] });
  itemDef("porkchop_cooked", ["................", "................", ".....PPPPP......", "....PPWPPPPP....", "...PPPPPPPPPP...", "..PPPPPPPWPPP...", "..PPPPPPPPPP....", "...PPPPPPPP.....", "....DPPPPD......", ".....DDDD.......", "................", "................", "................", "................", "................", "................"], { P: [180, 110, 60], W: [230, 200, 160], D: [130, 70, 30] });
  itemDef("beef_raw", ["................", "................", "....RRRRRR......", "...RRWRRRRR.....", "..RRRRRRWRRR....", "..RRRRRRRRRRR...", "..RRWRRRRRRRR...", "...RRRRRRRRR....", "....RRRRRRR.....", ".....RRRRR......", "................", "................", "................", "................", "................", "................"], { R: [200, 50, 50], W: [255, 210, 210] });
  itemDef("steak", ["................", "................", "....RRRRRR......", "...RRWRRRRR.....", "..RRRRRRWRRR....", "..RRRRRRRRRRR...", "..RRWRRRRRRRR...", "...RRRRRRRRR....", "....RRRRRRR.....", ".....RRRRR......", "................", "................", "................", "................", "................", "................"], { R: [130, 70, 40], W: [200, 160, 120] });
  itemDef("chicken_raw", ["................", "................", "......PPPP......", ".....PPPPPP.....", "....PPPPPPPP....", "....PPPPPPPP....", ".....PPPPPP.....", "......PPPP......", ".......BB.......", "......B..B......", "......B..B......", "................", "................", "................", "................", "................"], { P: [240, 200, 180], B: [240, 240, 230] });
  itemDef("chicken_cooked", ["................", "................", "......PPPP......", ".....PPPPPP.....", "....PPPPPPPP....", "....PPPPPPPP....", ".....PPPPPP.....", "......PPPP......", ".......BB.......", "......B..B......", "......B..B......", "................", "................", "................", "................", "................"], { P: [200, 140, 70], B: [240, 240, 230] });
  itemDef("painting", ["FFFFFFFFFFFFFFFF", "FBBBBBBBBBBBBBBF", "FBBBBBYYBBBBBBBF", "FBBBBYYYYBBBBBBF", "FBBBBBYYBBBBBBBF", "FBBBBBBBBBBBBBBF", "FBBGGBBBBBBGBBBF", "FBGGGGBBBBGGGBBF", "FGGGGGGBBGGGGGBF", "FGGGGGGGGGGGGGGF", "FGGGGGGGGGGGGGGF", "FGGgGGGGGGGgGGGF", "FGGGGGGGgGGGGGGF", "FGGGGGGGGGGGGGGF", "FFFFFFFFFFFFFFFF", "................"], { F: [140, 100, 50], B: [120, 170, 230], Y: [250, 230, 80], G: [70, 150, 60], g: [50, 110, 40] });
  itemDef("door_item", ["....WWWWWWW.....", "....WwwWwwW.....", "....WwwWwwW.....", "....WWWWWWW.....", "....WWWWWWW.....", "....WWWWWWW.....", "....WWWWWWW.....", "....WWWWWWWG....", "....WWWWWWW.....", "....WWWWWWW.....", "....WWWWWWW.....", "....WWWWWWW.....", "....WWWWWWW.....", "....WWWWWWW.....", "....WWWWWWW.....", "................"], { W: [150, 112, 60], w: [190, 220, 230], G: [60, 60, 60] });
  itemDef("sugarcane_item", ["................", ".........G......", "........GGG.....", ".......G.G......", "......G..G......", ".....G..GG......", "........G.G.....", ".......GG..G....", ".......G........", "......GG........", "......G.........", ".....GG.........", ".....G..........", "................", "................", "................"], { G: [130, 190, 90] });
  itemDef("sugar", ["................", "................", "................", "................", ".......WW.......", ".....WWWWWW.....", "...WWWwWWWWWW...", "..WWWWWWWWwWWW..", "..WWwWWWWWWWWW..", "...WWWWWWwWWW...", "................", "................", "................", "................", "................", "................"], { W: [250, 250, 250], w: [210, 210, 220] });
  itemDef("paper", ["................", "..WWWWWWWWWWW...", "..WWWWWWWWWWWW..", "...WWWWWWWWWWW..", "...WWWWWWWWWWW..", "...WWWWWWWWWW...", "..WWWWWWWWWWW...", "..WWWWWWWWWWW...", "..WWWWWWWWWWWW..", "...WWWWWWWWWWW..", "...WWWWWWWWWW...", "..WWWWWWWWWWW...", "................", "................", "................", "................"], { W: [235, 235, 220] });
  itemDef("book", ["................", "...LLLLLLLLLL...", "..LLLLLLLLLLLW..", "..LLLLLLLLLLLW..", "..LLLGGGLLLLLW..", "..LLLLLLLLLLLW..", "..LLLLLLLLLLLW..", "..LLLLLLLLLLLW..", "..LLLLLLLLLLLW..", "..LLLLLLLLLLLW..", "..LLLLLLLLLLLW..", "...WWWWWWWWWWW..", "................", "................", "................", "................"], { L: [110, 60, 30], W: [235, 235, 220], G: [230, 200, 60] });
  itemDef("egg", ["................", "................", ".......EE.......", "......EEEE......", ".....EEEEEE.....", ".....EEEEEE.....", "....EEEEEEEE....", "....EEEEEEEE....", "....EEEEEEED....", ".....EEEEED.....", "......DDDD......", "................", "................", "................", "................", "................"], { E: [240, 230, 200], D: [200, 180, 150] });
  itemDef("glowstone_dust", ["................", "................", "................", "......YY........", "....YYyYYY......", "...YYYYYyYY.....", "..YyYYYYYYYY....", "..YYYYyYYYYY....", "...YYYYYYYY.....", "....YYYyYY......", "................", "................", "................", "................", "................", "................"], { Y: [250, 220, 120], y: [255, 250, 200] });
  itemDef("bone", ["................", "............WW..", "...........WWWW.", "............WW..", "...........W....", "..........W.....", ".........W......", "........W.......", ".......W........", "......W.........", ".....W..........", "..WW............", ".WWWW...........", "..WW............", "................", "................"], { W: [240, 240, 225] });
  itemDef("bed_item", ["................", "................", "................", "................", "................", "..WWWRRRRRRRRR..", "..WWWRRRRRRRRR..", "..WWWRRRRRRRRR..", "..PPPPPPPPPPPP..", "..P..........P..", "................", "................", "................", "................", "................", "................"], { W: [240, 240, 240], R: [180, 30, 30], P: [150, 112, 60] });
  itemDef("shears", ["................", "................", "..II.....II.....", "...II...II......", "....II.II.......", ".....III........", "......I.........", ".....R.R........", "....R...R.......", "...R.....R......", "...R.....R......", "....RRRRR.......", "................", "................", "................", "................"], { I: IRON, R: [150, 30, 30] });
  itemDef("melon_slice", ["................", "................", "................", "..GRRRRRRRRRRG..", "...GRRrRRrRRG...", "....GRRRRRRG....", ".....GRRrRG.....", "......GRRG......", ".......GG.......", "................", "................", "................", "................", "................", "................", "................"], { G: [80, 150, 40], R: [230, 60, 60], r: [30, 20, 20] });
  itemDef("snowball", ["................", "................", "................", ".......WWW......", ".....WWWWWWW....", ".....WWWwWWW....", "....WWWWWWWWW...", "....WWwWWWWWW...", ".....WWWWWwW....", ".....WWWWWWW....", ".......WWW......", "................", "................", "................", "................", "................"], { W: [250, 250, 255], w: [210, 220, 235] });
  itemDef("clay_ball", ["................", "................", "................", ".......CCC......", ".....CCCCCCC....", ".....CCCcCCC....", "....CCCCCCCCC...", "....CCcCCCCCC...", ".....CCCCCcC....", ".....CCCCCCC....", ".......CCC......", "................", "................", "................", "................", "................"], { C: [160, 166, 178], c: [130, 136, 150] });
  itemDef("brick", ["................", "................", "................", "................", "................", "......BBBBBBB...", "....BBBBBBBBD...", "..BBBBBBBBBDD...", "..BBBBBBBBDD....", "..DDDDDDDDD.....", "................", "................", "................", "................", "................", "................"], { B: [170, 80, 60], D: [110, 50, 40] });
  itemDef("leather", ["................", "................", "...LLL...LLL....", "...LLLLLLLLL....", "....LLLLLLL.....", "...LLLLLLLLL....", "...LLLLLLLLL....", "....LLLLLLL.....", "...LLLLLLLLL....", "...LLL...LLL....", "................", "................", "................", "................", "................", "................"], { L: [150, 80, 40] });
  itemDef("flint_steel", ["................", "...........II...", "..........I..I..", "..........I..I..", "...........II...", ".........I......", "........I.......", "................", "....FFF.........", "...FFFFF........", "...FfFFF........", "....FFF.........", "................", "................", "................", "................"], { I: IRON, F: [60, 60, 60], f: [130, 130, 130] });
  itemDef("bucket", ["................", "................", "...IIIIIIIIII...", "...I........I...", "...IIIIIIIIII...", "...IiiiiiiiiI...", "....IiiiiiiI....", "....IiiiiiiI....", ".....IiiiiI.....", ".....IIIIII.....", "................", "................", "................", "................", "................", "................"], { I: [150, 150, 150], i: [210, 210, 210] });
  for (let i = 0; i < 16; i++) {
    const c = i === 15 ? [245, 245, 235] : i === 0 ? [30, 30, 40] : DYE_COLORS[15 - i];
    def("dye_" + i, (p) => p.sprite(["................", "................", ".......DD.......", "......DDDD......", ".....DDdDDD.....", "....DDDDDDDD....", "....DDDDDdDD....", "....DdDDDDDD....", ".....DDDDDD.....", "......DDDD......", "................", "................", "................", "................", "................", "................"], { D: c, d: shade(c, 1.3) }));
  }
  def("heart_full", (p) => p.sprite(["................", "................", "...KK...KK......", "..KRRK.KRRK.....", ".KRWRRKRRRRK....", ".KRRRRRRRRRK....", ".KRRRRRRRRRK....", "..KRRRRRRRK.....", "...KRRRRRK......", "....KRRRK.......", ".....KRK........", "......K.........", "................", "................", "................", "................"], { K: [20, 0, 0], R: [220, 20, 20], W: [255, 200, 200] }));
  def("heart_half", (p) => p.sprite(["................", "................", "...KK...KK......", "..KRRK.K..K.....", ".KRWRRK....K....", ".KRRRR.....K....", ".KRRRR.....K....", "..KRRR....K.....", "...KRR...K......", "....KR..K.......", ".....K.K........", "......K.........", "................", "................", "................", "................"], { K: [20, 0, 0], R: [220, 20, 20], W: [255, 200, 200] }));
  def("heart_empty", (p) => p.sprite(["................", "................", "...KK...KK......", "..K..K.K..K.....", ".K....K....K....", ".K.........K....", ".K.........K....", "..K.......K.....", "...K.....K......", "....K...K.......", ".....K.K........", "......K.........", "................", "................", "................", "................"], { K: [20, 0, 0] }));
  def("bubble", (p) => p.sprite(["................", "................", "....BBBB........", "...B....B.......", "..B..WW..B......", "..B..W...B......", "..B......B......", "..B......B......", "...B....B.......", "....BBBB........", "................", "................", "................", "................", "................", "................"], { B: [60, 120, 230], W: [255, 255, 255] }));
  def("particle", (p) => {
    p.rect(6, 6, 4, 4, [255, 255, 255]);
  });
  def("smoke", (p) => {
    p.blob(8, 8, 4, [200, 200, 200], 30);
  });
  var PAINTINGS = [];
  function paintingDef(name, w, h, fn) {
    const tiles = [];
    for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
      const tn = `painting_${name}_${tx}_${ty}`;
      tiles.push(tn);
      def(tn, (p) => fn(p, tx, ty));
    }
    PAINTINGS.push({ name, w, h, tiles });
  }
  function frame(p, tx, ty, w, h) {
    const F = [110, 80, 40];
    for (let i = 0; i < 16; i++) {
      if (ty === 0) p.set(i, 0, F);
      if (ty === h - 1) p.set(i, 15, F);
      if (tx === 0) p.set(0, i, F);
      if (tx === w - 1) p.set(15, i, F);
    }
  }
  function scene(w, h, draw) {
    return (p, tx, ty) => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const gx = (tx * 16 + x) / (w * 16), gy = (ty * 16 + y) / (h * 16);
        p.set(x, y, draw(gx, gy, p.r()));
      }
      frame(p, tx, ty, w, h);
    };
  }
  paintingDef("sunrise", 1, 1, scene(1, 1, (x, y, r) => y > 0.65 ? [60, 130, 60 + r * 20] : Math.hypot(x - 0.5, y - 0.6) < 0.22 ? [255, 210, 80] : mix([250, 150, 90], [120, 160, 230], 1 - y)));
  paintingDef("lake", 1, 1, scene(1, 1, (x, y, r) => y > 0.55 ? [40, 90 + r * 20, 180] : y > 0.45 ? [70, 120, 60] : [150, 190, 240]));
  paintingDef("tower", 1, 2, scene(1, 2, (x, y, r) => Math.abs(x - 0.5) < 0.15 && y > 0.25 ? [130 + r * 20, 130, 130] : y > 0.85 ? [80, 140, 60] : [100 + y * 80, 140 + y * 50, 220]));
  paintingDef("hills", 2, 1, scene(2, 1, (x, y, r) => y > 0.6 + Math.sin(x * 9) * 0.12 ? [70, 140 + r * 20, 60] : Math.hypot(x - 0.8, y - 0.25) < 0.1 ? [255, 240, 120] : [130, 180, 240]));
  paintingDef("night", 2, 1, scene(2, 1, (x, y, r) => y > 0.75 ? [20, 40, 20] : r < 0.03 ? [255, 255, 255] : Math.hypot(x - 0.25, y - 0.3) < 0.12 ? [230, 230, 200] : [15, 20, 60 + y * 40]));
  paintingDef("desert", 2, 2, scene(2, 2, (x, y, r) => y > 0.6 ? [220, 200, 140 + r * 20] : Math.abs(x - 0.6) < (y - 0.25) * 0.5 && y > 0.25 ? [200, 170, 100] : [240, 190, 120]));
  paintingDef("sea", 4, 2, scene(4, 2, (x, y, r) => y > 0.5 + Math.sin(x * 30) * 0.03 ? [30, 70 + r * 30, 150] : Math.hypot(x - 0.2, y - 0.25) < 0.08 ? [255, 250, 200] : [170, 210, 250]));
  paintingDef("forest", 4, 3, scene(4, 3, (x, y, r) => {
    const tree = Math.sin(x * 40) > 0.2 && y > 0.3 + Math.abs(Math.sin(x * 20)) * 0.2;
    return y > 0.85 ? [80, 60, 30] : tree ? [30, 100 + r * 40, 40] : [140, 190, 240];
  }));
  var atlasCanvas = null;
  function buildAtlas() {
    const c = document.createElement("canvas");
    c.width = c.height = ATLAS_SIZE;
    const ctx2 = c.getContext("2d");
    const img = ctx2.createImageData(TILE, TILE);
    tileList.forEach((t, i) => {
      const p = new Px(t.name);
      t.fn(p);
      img.data.set(p.d);
      ctx2.putImageData(img, i % ATLAS_TILES * TILE, Math.floor(i / ATLAS_TILES) * TILE);
    });
    if (tileList.length > ATLAS_TILES * ATLAS_TILES) throw new Error("atlas overflow");
    atlasCanvas = c;
    return c;
  }
  function tileUV(i) {
    const u = i % ATLAS_TILES / ATLAS_TILES, v = Math.floor(i / ATLAS_TILES) / ATLAS_TILES;
    return [u, v, 1 / ATLAS_TILES];
  }

  // game/src/blocks.js
  var B = {
    AIR: 0,
    STONE: 1,
    GRASS: 2,
    DIRT: 3,
    COBBLE: 4,
    PLANKS: 5,
    SAPLING: 6,
    BEDROCK: 7,
    WATER: 8,
    STILL_WATER: 9,
    LAVA: 10,
    STILL_LAVA: 11,
    SAND: 12,
    GRAVEL: 13,
    GOLD_ORE: 14,
    IRON_ORE: 15,
    COAL_ORE: 16,
    LOG: 17,
    LEAVES: 18,
    GLASS: 20,
    LAPIS_ORE: 21,
    LAPIS_BLOCK: 22,
    SANDSTONE: 24,
    BED: 26,
    COBWEB: 30,
    TALLGRASS: 31,
    DEADBUSH: 32,
    WOOL: 35,
    DANDELION: 37,
    ROSE: 38,
    BROWN_MUSHROOM: 39,
    RED_MUSHROOM: 40,
    GOLD_BLOCK: 41,
    IRON_BLOCK: 42,
    DOUBLE_SLAB: 43,
    SLAB: 44,
    BRICKS: 45,
    TNT: 46,
    BOOKSHELF: 47,
    MOSSY_COBBLE: 48,
    OBSIDIAN: 49,
    TORCH: 50,
    FIRE: 51,
    WOOD_STAIRS: 53,
    CHEST: 54,
    DIAMOND_ORE: 56,
    DIAMOND_BLOCK: 57,
    WORKBENCH: 58,
    WHEAT: 59,
    FARMLAND: 60,
    FURNACE: 61,
    LIT_FURNACE: 62,
    WOOD_DOOR: 64,
    LADDER: 65,
    COBBLE_STAIRS: 67,
    REDSTONE_ORE: 73,
    LIT_REDSTONE_ORE: 74,
    SNOW_LAYER: 78,
    ICE: 79,
    SNOW: 80,
    CACTUS: 81,
    CLAY: 82,
    SUGARCANE: 83,
    FENCE: 85,
    PUMPKIN: 86,
    NETHERRACK: 87,
    GLOWSTONE: 89,
    TRAPDOOR: 96,
    STONE_BRICKS: 98,
    MELON: 103,
    PUMPKIN_STEM: 104,
    MELON_STEM: 105,
    FENCE_GATE: 107,
    BRICK_STAIRS: 108,
    STONEBRICK_STAIRS: 109,
    NETHER_BRICK: 112,
    NETHERBRICK_STAIRS: 114,
    SANDSTONE_STAIRS: 128,
    GLOWING_OBSIDIAN: 246,
    REACTOR: 247,
    INVISIBLE_BEDROCK: 95
  };
  var R = {
    NONE: 0,
    CUBE: 1,
    CROSS: 2,
    TORCH: 3,
    LIQUID: 4,
    SLAB: 5,
    STAIRS: 6,
    DOOR: 7,
    LADDER: 8,
    FENCE: 9,
    BED: 10,
    CACTUS: 11,
    CROPS: 12,
    FARMLAND: 13,
    SNOW: 14,
    STEM: 15,
    GATE: 16,
    TRAPDOOR: 17,
    FIRE: 18
  };
  var FACE_DIRS = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];
  var blocks = new Array(256).fill(null);
  var defaults = {
    render: R.CUBE,
    solid: true,
    opaque: true,
    lightOpacity: 15,
    light: 0,
    hardness: 1,
    tool: null,
    level: -1,
    pass: 0,
    replaceable: false,
    sound: "stone",
    flammable: false,
    friction: 0.6,
    gravity: false,
    needsSupport: false
  };
  function reg(id, name, props) {
    const b = Object.assign({ id, name }, defaults, props);
    if (b.render !== R.CUBE && props.opaque === void 0) b.opaque = false;
    if (!b.opaque && props.lightOpacity === void 0) b.lightOpacity = b.render === R.LIQUID ? 2 : 0;
    blocks[id] = b;
    return b;
  }
  function texFn(spec) {
    if (typeof spec === "string") {
      let t = -1;
      return () => t < 0 ? t = tex(spec) : t;
    }
    if (typeof spec === "function") return spec;
    const cache2 = {};
    const get = (n) => cache2[n] !== void 0 ? cache2[n] : cache2[n] = tex(n);
    return (face2) => get(face2 === 1 ? spec.top || spec.side : face2 === 0 ? spec.bottom || spec.top || spec.side : spec.side);
  }
  function dropSelf(id) {
    return (meta) => [[id, 1, 0]];
  }
  var T = (n) => tex(n);
  reg(B.AIR, "Air", { render: R.NONE, solid: false, opaque: false, lightOpacity: 0, hardness: 0, replaceable: true });
  reg(B.STONE, "Stone", { tex: "stone", hardness: 1.5, tool: "pickaxe", level: 0, drop: () => [[B.COBBLE, 1, 0]] });
  reg(B.GRASS, "Grass Block", { tex: (f, m, snowy) => f === 1 ? T("grass_top") : f === 0 ? T("dirt") : T(snowy ? "grass_side_snow" : "grass_side"), hardness: 0.6, tool: "shovel", sound: "grass", drop: () => [[B.DIRT, 1, 0]], tintTop: true });
  reg(B.DIRT, "Dirt", { tex: "dirt", hardness: 0.5, tool: "shovel", sound: "gravel" });
  reg(B.COBBLE, "Cobblestone", { tex: "cobblestone", hardness: 2, tool: "pickaxe", level: 0 });
  reg(B.PLANKS, "Wooden Planks", { tex: "planks", hardness: 2, tool: "axe", sound: "wood", flammable: true });
  reg(B.SAPLING, "Sapling", { render: R.CROSS, solid: false, tex: (f, m) => T(["sapling_oak", "sapling_spruce", "sapling_birch"][m & 3] || "sapling_oak"), hardness: 0, pass: 1, sound: "grass", needsSupport: true, drop: (m) => [[B.SAPLING, 1, m & 3]], metaItem: true });
  reg(B.BEDROCK, "Bedrock", { tex: "bedrock", hardness: -1 });
  reg(B.INVISIBLE_BEDROCK, "Invisible Bedrock", { render: R.NONE, tex: "bedrock", hardness: -1, opaque: false, lightOpacity: 0 });
  for (const [id, still, name] of [[B.WATER, false, "Water"], [B.STILL_WATER, true, "Water"]]) {
    reg(id, name, { render: R.LIQUID, solid: false, tex: "water", pass: 2, hardness: 100, replaceable: true, liquid: "water", lightOpacity: 2, drop: () => [] });
  }
  for (const [id, still, name] of [[B.LAVA, false, "Lava"], [B.STILL_LAVA, true, "Lava"]]) {
    reg(id, name, { render: R.LIQUID, solid: false, tex: "lava", pass: 0, hardness: 100, replaceable: true, liquid: "lava", light: 15, lightOpacity: 15, drop: () => [] });
  }
  reg(B.SAND, "Sand", { tex: "sand", hardness: 0.5, tool: "shovel", sound: "sand", gravity: true });
  reg(B.GRAVEL, "Gravel", { tex: "gravel", hardness: 0.6, tool: "shovel", sound: "gravel", gravity: true, drop: (m, r) => r() < 0.1 ? [[318, 1, 0]] : [[B.GRAVEL, 1, 0]] });
  reg(B.GOLD_ORE, "Gold Ore", { tex: "gold_ore", hardness: 3, tool: "pickaxe", level: 2 });
  reg(B.IRON_ORE, "Iron Ore", { tex: "iron_ore", hardness: 3, tool: "pickaxe", level: 1 });
  reg(B.COAL_ORE, "Coal Ore", { tex: "coal_ore", hardness: 3, tool: "pickaxe", level: 0, drop: () => [[263, 1, 0]] });
  reg(B.LOG, "Wood", {
    tex: (f, m) => f === 0 || f === 1 ? T("log_top") : T(["log_oak", "log_spruce", "log_birch"][m & 3] || "log_oak"),
    hardness: 2,
    tool: "axe",
    sound: "wood",
    flammable: true,
    drop: (m) => [[B.LOG, 1, m & 3]],
    metaItem: true
  });
  reg(B.LEAVES, "Leaves", {
    tex: (f, m) => T(["leaves_oak", "leaves_spruce", "leaves_birch"][m & 3] || "leaves_oak"),
    opaque: false,
    lightOpacity: 1,
    pass: 1,
    hardness: 0.2,
    sound: "grass",
    flammable: true,
    tool: "shears",
    leaves: true,
    drop: (m, r) => {
      const d = [];
      if (r() < 0.05) d.push([B.SAPLING, 1, m & 3]);
      if ((m & 3) === 0 && r() < 5e-3) d.push([260, 1, 0]);
      return d;
    },
    metaItem: true
  });
  reg(B.GLASS, "Glass", { tex: "glass", opaque: false, pass: 1, hardness: 0.3, sound: "glass", drop: () => [] });
  reg(B.LAPIS_ORE, "Lapis Lazuli Ore", { tex: "lapis_ore", hardness: 3, tool: "pickaxe", level: 1, drop: (m, r) => [[351, 4 + (r() * 5 | 0), 4]] });
  reg(B.LAPIS_BLOCK, "Lapis Lazuli Block", { tex: "lapis_block", hardness: 3, tool: "pickaxe", level: 1 });
  reg(B.SANDSTONE, "Sandstone", { tex: { top: "sandstone_top", bottom: "sandstone_bottom", side: "sandstone_side" }, hardness: 0.8, tool: "pickaxe", level: 0 });
  reg(B.BED, "Bed", { render: R.BED, solid: true, tex: "bed_foot_top", hardness: 0.2, sound: "wood", drop: () => [[355, 1, 0]], aabb: [0, 0, 0, 1, 9 / 16, 1] });
  reg(B.COBWEB, "Cobweb", { render: R.CROSS, solid: false, tex: "cobweb", pass: 1, hardness: 4, tool: "sword", drop: () => [[287, 1, 0]], web: true });
  reg(B.TALLGRASS, "Tall Grass", { render: R.CROSS, solid: false, tex: "tallgrass", pass: 1, hardness: 0, replaceable: true, sound: "grass", tint: true, needsSupport: true, drop: (m, r) => r() < 0.125 ? [[295, 1, 0]] : [] });
  reg(B.DEADBUSH, "Dead Bush", { render: R.CROSS, solid: false, tex: "deadbush", pass: 1, hardness: 0, replaceable: true, sound: "grass", needsSupport: true, drop: () => [] });
  reg(B.WOOL, "Wool", { tex: (f, m) => T(m ? "wool_" + m : "wool"), hardness: 0.8, sound: "cloth", flammable: true, drop: (m) => [[B.WOOL, 1, m]], metaItem: true });
  reg(B.DANDELION, "Dandelion", { render: R.CROSS, solid: false, tex: "dandelion", pass: 1, hardness: 0, sound: "grass", needsSupport: true });
  reg(B.ROSE, "Rose", { render: R.CROSS, solid: false, tex: "rose", pass: 1, hardness: 0, sound: "grass", needsSupport: true });
  reg(B.BROWN_MUSHROOM, "Brown Mushroom", { render: R.CROSS, solid: false, tex: "mushroom_brown", pass: 1, hardness: 0, light: 1, sound: "grass", needsSupport: true });
  reg(B.RED_MUSHROOM, "Red Mushroom", { render: R.CROSS, solid: false, tex: "mushroom_red", pass: 1, hardness: 0, sound: "grass", needsSupport: true });
  reg(B.GOLD_BLOCK, "Block of Gold", { tex: "gold_block", hardness: 3, tool: "pickaxe", level: 2, sound: "metal" });
  reg(B.IRON_BLOCK, "Block of Iron", { tex: "iron_block", hardness: 5, tool: "pickaxe", level: 1, sound: "metal" });
  var SLAB_TEX = [
    { top: "stone", side: "stone" },
    { top: "sandstone_top", side: "sandstone_side", bottom: "sandstone_bottom" },
    { top: "planks", side: "planks" },
    { top: "cobblestone", side: "cobblestone" },
    { top: "bricks", side: "bricks" },
    { top: "stone_bricks", side: "stone_bricks" }
  ];
  var slabTex = (f, m) => {
    const s = SLAB_TEX[m & 7] || SLAB_TEX[0];
    return T(f === 1 ? s.top : f === 0 ? s.bottom || s.top : s.side);
  };
  var SLAB_NAMES = ["Stone Slab", "Sandstone Slab", "Wooden Slab", "Cobblestone Slab", "Brick Slab", "Stone Brick Slab"];
  reg(B.DOUBLE_SLAB, "Double Slab", { tex: slabTex, hardness: 2, tool: "pickaxe", level: 0, drop: (m) => [[B.SLAB, 2, m & 7]] });
  reg(B.SLAB, "Slab", { render: R.SLAB, tex: slabTex, hardness: 2, tool: "pickaxe", level: 0, opaque: false, lightOpacity: 15, drop: (m) => [[B.SLAB, 1, m & 7]], metaItem: true, aabbFn: (m) => m & 8 ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1] });
  reg(B.BRICKS, "Bricks", { tex: "bricks", hardness: 2, tool: "pickaxe", level: 0 });
  reg(B.TNT, "TNT", { tex: { top: "tnt_top", bottom: "tnt_bottom", side: "tnt_side" }, hardness: 0, sound: "grass", tnt: true });
  reg(B.BOOKSHELF, "Bookshelf", { tex: (f) => f < 2 ? T("planks") : T("bookshelf"), hardness: 1.5, tool: "axe", sound: "wood", flammable: true, drop: () => [[340, 3, 0]] });
  reg(B.MOSSY_COBBLE, "Moss Stone", { tex: "mossy_cobblestone", hardness: 2, tool: "pickaxe", level: 0 });
  reg(B.OBSIDIAN, "Obsidian", { tex: "obsidian", hardness: 50, tool: "pickaxe", level: 3 });
  reg(B.TORCH, "Torch", { render: R.TORCH, solid: false, tex: "torch", light: 14, hardness: 0, pass: 1, sound: "wood", needsSupport: true, drop: () => [[B.TORCH, 1, 0]] });
  reg(B.FIRE, "Fire", { render: R.FIRE, solid: false, tex: "fire", light: 15, hardness: 0, pass: 1, replaceable: true, drop: () => [], fire: true });
  var stairs = (id, name, t, props = {}) => reg(id, name, Object.assign({ render: R.STAIRS, tex: typeof t === "function" ? t : texFn(t), hardness: 2, tool: "pickaxe", level: 0, lightOpacity: 15, drop: () => [[id, 1, 0]] }, props));
  stairs(B.WOOD_STAIRS, "Wooden Stairs", "planks", { tool: "axe", level: -1, sound: "wood" });
  stairs(B.COBBLE_STAIRS, "Cobblestone Stairs", "cobblestone");
  stairs(B.BRICK_STAIRS, "Brick Stairs", "bricks");
  stairs(B.STONEBRICK_STAIRS, "Stone Brick Stairs", "stone_bricks");
  stairs(B.NETHERBRICK_STAIRS, "Nether Brick Stairs", "nether_bricks");
  stairs(B.SANDSTONE_STAIRS, "Sandstone Stairs", { top: "sandstone_top", side: "sandstone_side", bottom: "sandstone_bottom" });
  var facingTex = (front, side, top) => (f, m) => {
    const fr = m & 7 || 3;
    if (f === 1 || f === 0) return T(top);
    return T(f === fr ? front : side);
  };
  reg(B.CHEST, "Chest", { tex: facingTex("chest_front", "chest_side", "chest_top"), hardness: 2.5, tool: "axe", sound: "wood", container: "chest", opaque: true });
  reg(B.DIAMOND_ORE, "Diamond Ore", { tex: "diamond_ore", hardness: 3, tool: "pickaxe", level: 2, drop: () => [[264, 1, 0]] });
  reg(B.DIAMOND_BLOCK, "Block of Diamond", { tex: "diamond_block", hardness: 5, tool: "pickaxe", level: 2, sound: "metal" });
  reg(B.WORKBENCH, "Crafting Table", { tex: (f) => f === 1 ? T("crafting_top") : f === 0 ? T("planks") : f === 2 || f === 4 ? T("crafting_front") : T("crafting_side"), hardness: 2.5, tool: "axe", sound: "wood", flammable: true });
  reg(B.WHEAT, "Crops", { render: R.CROPS, solid: false, tex: (f, m) => T("wheat_" + Math.min(7, m & 7)), pass: 1, hardness: 0, sound: "grass", needsSupport: true, drop: (m, r) => (m & 7) >= 7 ? [[296, 1, 0], [295, 1 + (r() * 3 | 0), 0]] : [[295, 1, 0]] });
  reg(B.FARMLAND, "Farmland", { render: R.FARMLAND, tex: (f, m) => f === 1 ? T(m > 0 ? "farmland_wet" : "farmland_dry") : T("dirt"), hardness: 0.6, tool: "shovel", sound: "gravel", lightOpacity: 15, drop: () => [[B.DIRT, 1, 0]], aabb: [0, 0, 0, 1, 15 / 16, 1] });
  reg(B.FURNACE, "Furnace", { tex: facingTex("furnace_front", "furnace_side", "furnace_top"), hardness: 3.5, tool: "pickaxe", level: 0, container: "furnace" });
  reg(B.LIT_FURNACE, "Furnace", { tex: facingTex("furnace_front_lit", "furnace_side", "furnace_top"), hardness: 3.5, tool: "pickaxe", level: 0, light: 13, container: "furnace", drop: () => [[B.FURNACE, 1, 0]] });
  reg(B.WOOD_DOOR, "Wooden Door", { render: R.DOOR, tex: (f, m) => T(m & 8 ? "door_wood_upper" : "door_wood_lower"), hardness: 3, tool: "axe", sound: "wood", pass: 1, drop: (m) => m & 8 ? [] : [[324, 1, 0]], door: true });
  reg(B.LADDER, "Ladder", { render: R.LADDER, solid: false, tex: "ladder", hardness: 0.4, tool: "axe", pass: 1, sound: "wood", climbable: true, needsSupport: true });
  reg(B.REDSTONE_ORE, "Redstone Ore", { tex: "redstone_ore", hardness: 3, tool: "pickaxe", level: 2, drop: () => [] });
  reg(B.LIT_REDSTONE_ORE, "Redstone Ore", { tex: "redstone_ore", hardness: 3, tool: "pickaxe", level: 2, light: 9, drop: () => [] });
  reg(B.SNOW_LAYER, "Snow", { render: R.SNOW, solid: false, tex: "snow", hardness: 0.1, tool: "shovel", replaceable: true, sound: "cloth", needsSupport: true, drop: () => [[332, 1, 0]] });
  reg(B.ICE, "Ice", { tex: "ice", opaque: false, pass: 2, lightOpacity: 3, hardness: 0.5, tool: "pickaxe", sound: "glass", friction: 0.98, drop: () => [] });
  reg(B.SNOW, "Snow Block", { tex: "snow", hardness: 0.2, tool: "shovel", sound: "cloth", drop: () => [[332, 4, 0]] });
  reg(B.CACTUS, "Cactus", { render: R.CACTUS, tex: { top: "cactus_top", bottom: "cactus_bottom", side: "cactus_side" }, hardness: 0.4, sound: "cloth", pass: 1, lightOpacity: 0, aabb: [1 / 16, 0, 1 / 16, 15 / 16, 15 / 16, 15 / 16], cactus: true, needsSupport: true, drop: () => [[B.CACTUS, 1, 0]] });
  reg(B.CLAY, "Clay", { tex: "clay", hardness: 0.6, tool: "shovel", sound: "gravel", drop: () => [[337, 4, 0]] });
  reg(B.SUGARCANE, "Sugar Cane", { render: R.CROSS, solid: false, tex: "sugarcane", pass: 1, hardness: 0, sound: "grass", tint: false, needsSupport: true, drop: () => [[338, 1, 0]] });
  reg(B.FENCE, "Fence", { render: R.FENCE, tex: "planks", hardness: 2, tool: "axe", sound: "wood", lightOpacity: 0, fence: true });
  reg(B.PUMPKIN, "Pumpkin", { tex: facingTex("pumpkin_face", "pumpkin_side", "pumpkin_top"), hardness: 1, tool: "axe", sound: "wood", drop: () => [[B.PUMPKIN, 1, 0]] });
  reg(B.NETHERRACK, "Netherrack", { tex: "netherrack", hardness: 0.4, tool: "pickaxe", level: 0 });
  reg(B.GLOWSTONE, "Glowstone", { tex: "glowstone", hardness: 0.3, light: 15, sound: "glass", drop: (m, r) => [[348, 2 + (r() * 3 | 0), 0]] });
  reg(B.TRAPDOOR, "Trapdoor", { render: R.TRAPDOOR, tex: "trapdoor", hardness: 3, tool: "axe", sound: "wood", pass: 1, lightOpacity: 0, trapdoor: true });
  reg(B.STONE_BRICKS, "Stone Bricks", { tex: "stone_bricks", hardness: 1.5, tool: "pickaxe", level: 0 });
  reg(B.MELON, "Melon", { tex: { top: "melon_top", side: "melon_side" }, hardness: 1, tool: "axe", sound: "wood", drop: (m, r) => [[360, 3 + (r() * 5 | 0), 0]] });
  reg(B.PUMPKIN_STEM, "Pumpkin Stem", { render: R.STEM, solid: false, tex: (f, m) => T("stem_" + (m & 7)), pass: 1, hardness: 0, sound: "grass", needsSupport: true, stem: B.PUMPKIN, drop: (m, r) => r() < (m & 7) / 15 + 0.1 ? [[361, 1, 0]] : [] });
  reg(B.MELON_STEM, "Melon Stem", { render: R.STEM, solid: false, tex: (f, m) => T("stem_" + (m & 7)), pass: 1, hardness: 0, sound: "grass", needsSupport: true, stem: B.MELON, drop: (m, r) => r() < (m & 7) / 15 + 0.1 ? [[362, 1, 0]] : [] });
  reg(B.FENCE_GATE, "Fence Gate", { render: R.GATE, tex: "planks", hardness: 2, tool: "axe", sound: "wood", lightOpacity: 0, gate: true, drop: () => [[B.FENCE_GATE, 1, 0]] });
  reg(B.NETHER_BRICK, "Nether Brick", { tex: "nether_bricks", hardness: 2, tool: "pickaxe", level: 0 });
  reg(B.GLOWING_OBSIDIAN, "Glowing Obsidian", { tex: "glowing_obsidian", hardness: 10, tool: "pickaxe", level: 3, light: 12, drop: () => [[B.OBSIDIAN, 1, 0]] });
  reg(B.REACTOR, "Nether Reactor Core", {
    tex: (f, m) => T(m === 1 ? "reactor_core_active" : m === 2 ? "reactor_core_used" : "reactor_core"),
    hardness: 3,
    tool: "pickaxe",
    level: 0,
    lightFn: (m) => m === 1 ? 15 : 0,
    drop: () => [[264, 3, 0], [265, 6, 0]],
    reactor: true
  });
  for (const b of blocks) {
    if (!b) continue;
    b.texFn = b.tex ? texFn(b.tex) : () => 0;
    if (!b.drop) b.drop = dropSelf(b.id);
  }
  var OPAQUE = new Uint8Array(256);
  var SOLID = new Uint8Array(256);
  var LIGHT_OPACITY = new Uint8Array(256);
  var LIGHT_EMIT = new Uint8Array(256);
  var RENDER = new Uint8Array(256);
  var REPLACEABLE = new Uint8Array(256);
  var LIQUID = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const b = blocks[i];
    if (!b) {
      OPAQUE[i] = 1;
      SOLID[i] = 1;
      LIGHT_OPACITY[i] = 15;
      RENDER[i] = R.CUBE;
      continue;
    }
    OPAQUE[i] = b.opaque ? 1 : 0;
    SOLID[i] = b.solid ? 1 : 0;
    LIGHT_OPACITY[i] = b.lightOpacity;
    LIGHT_EMIT[i] = b.light;
    RENDER[i] = b.render;
    REPLACEABLE[i] = b.replaceable ? 1 : 0;
    LIQUID[i] = b.liquid === "water" ? 1 : b.liquid === "lava" ? 2 : 0;
  }
  var isWater = (id) => id === B.WATER || id === B.STILL_WATER;
  var isLava = (id) => id === B.LAVA || id === B.STILL_LAVA;
  function blockName(id, meta) {
    if (id === B.SLAB || id === B.DOUBLE_SLAB) return SLAB_NAMES[meta & 7] || "Slab";
    if (id === B.WOOL) return WOOL_NAMES[meta & 15] + " Wool";
    if (id === B.LOG) return ["Oak Wood", "Spruce Wood", "Birch Wood"][meta & 3] || "Wood";
    if (id === B.SAPLING) return ["Oak Sapling", "Spruce Sapling", "Birch Sapling"][meta & 3] || "Sapling";
    if (id === B.LEAVES) return ["Oak Leaves", "Spruce Leaves", "Birch Leaves"][meta & 3] || "Leaves";
    return blocks[id] ? blocks[id].name : "Unknown";
  }
  var WOOL_NAMES = ["White", "Orange", "Magenta", "Light Blue", "Yellow", "Lime", "Pink", "Gray", "Light Gray", "Cyan", "Purple", "Blue", "Brown", "Green", "Red", "Black"];
  function collisionBoxes(world, x, y, z, id, meta) {
    const b = blocks[id];
    if (!b || !b.solid) return null;
    switch (b.render) {
      case R.SLAB:
        return [b.aabbFn(meta)];
      case R.STAIRS: {
        const top = (meta & 4) !== 0;
        const boxes = [top ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1]];
        const d = meta & 3;
        const y0 = top ? 0 : 0.5, y1 = top ? 0.5 : 1;
        if (d === 0) boxes.push([0.5, y0, 0, 1, y1, 1]);
        else if (d === 1) boxes.push([0, y0, 0, 0.5, y1, 1]);
        else if (d === 2) boxes.push([0, y0, 0.5, 1, y1, 1]);
        else boxes.push([0, y0, 0, 1, y1, 0.5]);
        return boxes;
      }
      case R.DOOR:
        return [doorBox(world, x, y, z, meta)];
      case R.FENCE:
        return [fenceBox(world, x, y, z, true)];
      case R.GATE:
        return meta & 4 ? null : [meta & 1 ? [0.375, 0, 0, 0.625, 1.5, 1] : [0, 0, 0.375, 1, 1.5, 0.625]];
      case R.TRAPDOOR:
        return [trapdoorBox(meta)];
      default:
        return [b.aabb || [0, 0, 0, 1, 1, 1]];
    }
  }
  function selectionBox(world, x, y, z, id, meta) {
    const b = blocks[id];
    switch (b.render) {
      case R.CROSS:
      case R.CROPS:
      case R.STEM:
        return [0.15, 0, 0.15, 0.85, b.render === R.CROSS ? 0.85 : 0.4 + (meta & 7) / 14, 0.85];
      case R.TORCH: {
        const w = 0.15;
        if (meta === 1) return [0, 0.2, 0.5 - w, w * 2, 0.8, 0.5 + w];
        if (meta === 2) return [1 - w * 2, 0.2, 0.5 - w, 1, 0.8, 0.5 + w];
        if (meta === 3) return [0.5 - w, 0.2, 0, 0.5 + w, 0.8, w * 2];
        if (meta === 4) return [0.5 - w, 0.2, 1 - w * 2, 0.5 + w, 0.8, 1];
        return [0.4, 0, 0.4, 0.6, 0.6, 0.6];
      }
      case R.LADDER: {
        const t = 0.125;
        if (meta === 2) return [0, 0, 1 - t, 1, 1, 1];
        if (meta === 3) return [0, 0, 0, 1, 1, t];
        if (meta === 4) return [1 - t, 0, 0, 1, 1, 1];
        return [0, 0, 0, t, 1, 1];
      }
      case R.SNOW:
        return [0, 0, 0, 1, 0.125, 1];
      case R.FENCE:
        return fenceBox(world, x, y, z, false);
      case R.GATE:
        return meta & 1 ? [0.375, 0, 0, 0.625, 1, 1] : [0, 0, 0.375, 1, 1, 0.625];
      case R.LIQUID:
        return null;
      case R.SLAB:
        return b.aabbFn(meta);
      case R.DOOR:
        return doorBox(world, x, y, z, meta);
      case R.TRAPDOOR:
        return trapdoorBox(meta);
      case R.FIRE:
        return null;
      default:
        return b.aabb || [0, 0, 0, 1, 1, 1];
    }
  }
  function connectsFence(world, x, y, z) {
    const id = world.getBlock(x, y, z);
    return id === B.FENCE || id === B.FENCE_GATE || OPAQUE[id] === 1;
  }
  function fenceConnections(world, x, y, z) {
    return [connectsFence(world, x, y, z - 1), connectsFence(world, x, y, z + 1), connectsFence(world, x - 1, y, z), connectsFence(world, x + 1, y, z)];
  }
  function fenceBox(world, x, y, z, coll) {
    const [n, s, w, e] = fenceConnections(world, x, y, z);
    return [w ? 0 : 0.375, 0, n ? 0 : 0.375, e ? 1 : 0.625, coll ? 1.5 : 1, s ? 1 : 0.625];
  }
  function doorState(world, x, y, z, meta) {
    let lower = meta, upper = meta;
    if (meta & 8) {
      lower = world.getMeta(x, y - 1, z);
    } else {
      upper = world.getMeta(x, y + 1, z);
    }
    return { facing: lower & 3, open: (lower & 4) !== 0, hingeRight: (upper & 1) !== 0 };
  }
  function doorBox(world, x, y, z, meta) {
    const st = doorState(world, x, y, z, meta);
    let dir = st.facing;
    if (st.open) dir = dir + (st.hingeRight ? 3 : 1) & 3;
    const t = 3 / 16;
    if (dir === 0) return [0, 0, 0, t, 1, 1];
    if (dir === 1) return [0, 0, 0, 1, 1, t];
    if (dir === 2) return [1 - t, 0, 0, 1, 1, 1];
    return [0, 0, 1 - t, 1, 1, 1];
  }
  function trapdoorBox(meta) {
    const t = 3 / 16;
    if (meta & 4) {
      const d = meta & 3;
      if (d === 0) return [0, 0, 1 - t, 1, 1, 1];
      if (d === 1) return [0, 0, 0, 1, 1, t];
      if (d === 2) return [1 - t, 0, 0, 1, 1, 1];
      return [0, 0, 0, t, 1, 1];
    }
    return meta & 8 ? [0, 1 - t, 0, 1, 1, 1] : [0, 0, 0, 1, t, 1];
  }

  // game/src/world.js
  var WX = 256;
  var WZ = 256;
  var WY = 128;
  var SEA = 63;
  var N = WX * WZ * WY;
  var idx = (x, y, z) => (x << 8 | z) << 7 | y;
  var World = class {
    constructor() {
      this.blocks = new Uint8Array(N);
      this.meta = new Uint8Array(N);
      this.light = new Uint8Array(N);
      this.height = new Uint8Array(WX * WZ);
      this.tiles = /* @__PURE__ */ new Map();
      this.listeners = [];
      this.seed = 0;
      this.time = 0;
      this.spawn = [128, 70, 128];
      this.name = "World";
      this.mode = "survival";
      this.skyDarken = 0;
      this._rq = new Int32Array(1 << 20);
      this._aq = new Int32Array(1 << 21);
    }
    inBounds(x, y, z) {
      return x >= 0 && z >= 0 && y >= 0 && x < WX && z < WZ && y < WY;
    }
    getBlock(x, y, z) {
      if (y < 0) return B.BEDROCK;
      if (x < 0 || z < 0 || x >= WX || z >= WZ || y >= WY) return 0;
      return this.blocks[idx(x, y, z)];
    }
    // used by physics: world edges are solid walls
    getBlockColl(x, y, z) {
      if (x < 0 || z < 0 || x >= WX || z >= WZ) return B.INVISIBLE_BEDROCK;
      if (y < 0) return B.BEDROCK;
      if (y >= WY) return 0;
      return this.blocks[idx(x, y, z)];
    }
    getMeta(x, y, z) {
      if (!this.inBounds(x, y, z)) return 0;
      return this.meta[idx(x, y, z)];
    }
    getSky(x, y, z) {
      if (y >= WY) return 15;
      if (!this.inBounds(x, y, z)) return y < 0 ? 0 : 15;
      return this.light[idx(x, y, z)] >> 4;
    }
    getBlockLight(x, y, z) {
      if (!this.inBounds(x, y, z)) return 0;
      return this.light[idx(x, y, z)] & 15;
    }
    // combined brightness 0..15 with daylight
    getBrightness(x, y, z) {
      const sky = Math.max(0, this.getSky(x, y, z) - this.skyDarken);
      return Math.max(sky, this.getBlockLight(x, y, z));
    }
    topY(x, z) {
      return this.height[x << 8 | z];
    }
    // highest non-air block y
    surfaceY(x, z) {
      if (x < 0 || z < 0 || x >= WX || z >= WZ) return 0;
      const base = (x << 8 | z) << 7;
      for (let y = WY - 1; y >= 0; y--) if (this.blocks[base + y] !== 0) return y;
      return 0;
    }
    onChange(fn) {
      this.listeners.push(fn);
    }
    // set without lighting/notify (generation)
    rawSet(x, y, z, id, meta = 0) {
      const i = idx(x, y, z);
      this.blocks[i] = id;
      this.meta[i] = meta;
    }
    setBlock(x, y, z, id, meta = 0, notify = true) {
      if (!this.inBounds(x, y, z)) return false;
      const i = idx(x, y, z);
      const oldId = this.blocks[i], oldMeta = this.meta[i];
      if (oldId === id && oldMeta === meta) return false;
      this.blocks[i] = id;
      this.meta[i] = meta;
      if (oldId !== id) {
        if (blocks[oldId] && blocks[oldId].container && !(blocks[id] && blocks[id].container)) this.tiles.delete(i);
        this.relightAt(x, y, z, oldId, id);
      } else if (blocks[id] && blocks[id].lightFn) {
        this.relightAt(x, y, z, oldId, id);
      }
      if (notify) for (const l of this.listeners) l(x, y, z, id, meta, oldId, oldMeta);
      return true;
    }
    setMeta(x, y, z, meta, notify = true) {
      return this.setBlock(x, y, z, this.getBlock(x, y, z), meta, notify);
    }
    emitOf(i) {
      const id = this.blocks[i];
      const b = blocks[id];
      if (b && b.lightFn) return b.lightFn(this.meta[i]);
      return LIGHT_EMIT[id];
    }
    // ------------------------------------------------------------------ lighting
    computeHeight(x, z) {
      const base = (x << 8 | z) << 7;
      let y = WY - 1;
      while (y >= 0 && LIGHT_OPACITY[this.blocks[base + y]] === 0) y--;
      this.height[x << 8 | z] = y + 1;
    }
    fullLight() {
      const L = this.light;
      L.fill(0);
      const aq = this._aq;
      let qt = 0;
      const push = (i) => {
        aq[qt++ & aq.length - 1] = i;
      };
      for (let x = 0; x < WX; x++) for (let z = 0; z < WZ; z++) {
        this.computeHeight(x, z);
        const h = this.height[x << 8 | z];
        const base = (x << 8 | z) << 7;
        let lv = 15;
        for (let y = WY - 1; y >= 0; y--) {
          if (y < h) {
            const op = LIGHT_OPACITY[this.blocks[base + y]];
            lv = op >= 15 ? 0 : Math.max(0, lv - Math.max(1, op));
            if (lv === 0) break;
          }
          L[base + y] = lv << 4;
        }
      }
      this._bfsAdd(4, () => {
        for (let x = 0; x < WX; x++) for (let z = 0; z < WZ; z++) {
          const h = this.height[x << 8 | z];
          let mx = h;
          if (x > 0) mx = Math.max(mx, this.height[x - 1 << 8 | z]);
          if (x < WX - 1) mx = Math.max(mx, this.height[x + 1 << 8 | z]);
          if (z > 0) mx = Math.max(mx, this.height[x << 8 | z - 1]);
          if (z < WZ - 1) mx = Math.max(mx, this.height[x << 8 | z + 1]);
          const base = (x << 8 | z) << 7;
          for (let y = Math.max(0, h - 16); y < Math.min(mx + 1, WY); y++) if (L[base + y] >> 4) push(base + y);
        }
        return qt;
      });
      qt = 0;
      for (let i = 0; i < N; i++) {
        const id = this.blocks[i];
        if (id && (LIGHT_EMIT[id] || blocks[id].lightFn)) {
          const e = this.emitOf(i);
          if (e) {
            L[i] = L[i] & 240 | e;
            push(i);
          }
        }
      }
      this._bfsAdd(0, () => qt);
    }
    // add-phase flood fill. shift=4 for sky, 0 for block. seed() fills this._aq and returns count
    _bfsAdd(shift, seed) {
      const L = this.light, BL = this.blocks, aq = this._aq, M = aq.length - 1;
      let tail = seed(), head = 0;
      const mask = shift ? 15 : 240;
      while (head !== tail) {
        const i = aq[head++ & M];
        const lv = L[i] >> shift & 15;
        if (lv <= 1) continue;
        const y = i & 127, z = i >> 7 & 255, x = i >> 15;
        for (let d = 0; d < 6; d++) {
          let j;
          if (d === 0) {
            if (y === 0) continue;
            j = i - 1;
          } else if (d === 1) {
            if (y === 127) continue;
            j = i + 1;
          } else if (d === 2) {
            if (z === 0) continue;
            j = i - 128;
          } else if (d === 3) {
            if (z === 255) continue;
            j = i + 128;
          } else if (d === 4) {
            if (x === 0) continue;
            j = i - 32768;
          } else {
            if (x === 255) continue;
            j = i + 32768;
          }
          const op = LIGHT_OPACITY[BL[j]];
          if (op >= 15) continue;
          let nl;
          if (shift && d === 0 && lv === 15 && op === 0) nl = 15;
          else nl = lv - Math.max(1, op);
          if (nl > (L[j] >> shift & 15)) {
            L[j] = L[j] & mask | nl << shift;
            aq[tail++ & M] = j;
          }
        }
      }
    }
    // incremental relight of a set of cells for one channel
    _relight(shift, cells) {
      const L = this.light, BL = this.blocks, rq = this._rq, aq = this._aq, RM = rq.length - 1, AM = aq.length - 1;
      const mask = shift ? 15 : 240;
      let rt = 0, rh = 0, at = 0;
      const touched = this._touched;
      for (const i of cells) {
        const old = L[i] >> shift & 15;
        L[i] &= mask;
        rq[rt++ & RM] = i;
        rq[rt++ & RM] = old;
        touched.add(i);
      }
      while (rh !== rt) {
        const i = rq[rh++ & RM], lv = rq[rh++ & RM];
        const y = i & 127, z = i >> 7 & 255, x = i >> 15;
        for (let d = 0; d < 6; d++) {
          let j;
          if (d === 0) {
            if (y === 0) continue;
            j = i - 1;
          } else if (d === 1) {
            if (y === 127) continue;
            j = i + 1;
          } else if (d === 2) {
            if (z === 0) continue;
            j = i - 128;
          } else if (d === 3) {
            if (z === 255) continue;
            j = i + 128;
          } else if (d === 4) {
            if (x === 0) continue;
            j = i - 32768;
          } else {
            if (x === 255) continue;
            j = i + 32768;
          }
          const nl = L[j] >> shift & 15;
          if (nl === 0) continue;
          if (nl < lv || shift && d === 0 && lv === 15 && nl === 15) {
            L[j] &= mask;
            touched.add(j);
            rq[rt++ & RM] = j;
            rq[rt++ & RM] = nl;
          } else {
            aq[at++ & AM] = j;
          }
        }
      }
      for (const i of touched) {
        let src = 0;
        if (shift) {
          const y = i & 127, col = i >> 7;
          if (y >= this.height[col]) src = 15;
        } else src = this.emitOf(i);
        if (src > (L[i] >> shift & 15)) {
          L[i] = L[i] & mask | src << shift;
        }
        if (L[i] >> shift & 15) aq[at++ & AM] = i;
      }
      this._bfsAdd(shift, () => at);
    }
    relightAt(x, y, z, oldId, newId) {
      this._touched = /* @__PURE__ */ new Set();
      const col = x << 8 | z;
      const oldH = this.height[col];
      this.computeHeight(x, z);
      const newH = this.height[col];
      const base = col << 7;
      const i = base + y;
      const skyCells = [i];
      if (newH !== oldH) {
        const lo = Math.min(oldH, newH), hi = Math.max(oldH, newH);
        for (let yy = lo; yy < hi; yy++) skyCells.push(base + yy);
      }
      this._relight(4, skyCells);
      const affected = this._touched;
      this._touched = /* @__PURE__ */ new Set();
      this._relight(0, [i]);
      for (const t of this._touched) affected.add(t);
      this._lastTouched = affected;
      if (this.onLight) this.onLight(affected);
    }
    // ------------------------------------------------------------------ tile entities
    getTile(x, y, z) {
      return this.tiles.get(idx(x, y, z));
    }
    setTile(x, y, z, t) {
      this.tiles.set(idx(x, y, z), t);
    }
    // ------------------------------------------------------------------ serialization
    exportChunk(cx, cz) {
      const out = new Uint8Array(16 * 16 * WY * 2);
      let o = 0;
      for (let x = cx * 16; x < cx * 16 + 16; x++) for (let z = cz * 16; z < cz * 16 + 16; z++) {
        const base = (x << 8 | z) << 7;
        out.set(this.blocks.subarray(base, base + WY), o);
        o += WY;
        out.set(this.meta.subarray(base, base + WY), o);
        o += WY;
      }
      return out;
    }
    importChunk(cx, cz, data) {
      let o = 0;
      for (let x = cx * 16; x < cx * 16 + 16; x++) for (let z = cz * 16; z < cz * 16 + 16; z++) {
        const base = (x << 8 | z) << 7;
        this.blocks.set(data.subarray(o, o + WY), base);
        o += WY;
        this.meta.set(data.subarray(o, o + WY), base);
        o += WY;
      }
    }
  };

  // game/src/noise.js
  function mulberry(seed) {
    let s = seed >>> 0;
    return () => {
      s = s + 1831565813 >>> 0;
      let t = s;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var Noise = class _Noise {
    constructor(seed) {
      const r = mulberry(seed);
      const p = new Uint8Array(256);
      for (let i = 0; i < 256; i++) p[i] = i;
      for (let i = 255; i > 0; i--) {
        const j = r() * (i + 1) | 0;
        const t = p[i];
        p[i] = p[j];
        p[j] = t;
      }
      this.perm = new Uint8Array(512);
      for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    }
    static fade(t) {
      return t * t * t * (t * (t * 6 - 15) + 10);
    }
    static grad3(h, x, y, z) {
      const g = h & 15;
      const u = g < 8 ? x : y;
      const v = g < 4 ? y : g === 12 || g === 14 ? x : z;
      return (g & 1 ? -u : u) + (g & 2 ? -v : v);
    }
    noise3(x, y, z) {
      const P = this.perm;
      let X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
      x -= X;
      y -= Y;
      z -= Z;
      X &= 255;
      Y &= 255;
      Z &= 255;
      const u = _Noise.fade(x), v = _Noise.fade(y), w = _Noise.fade(z);
      const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z, Bq = P[X + 1] + Y, BA = P[Bq] + Z, BB = P[Bq + 1] + Z;
      const g = _Noise.grad3;
      const l = (a, b, t) => a + t * (b - a);
      return l(
        l(l(g(P[AA], x, y, z), g(P[BA], x - 1, y, z), u), l(g(P[AB], x, y - 1, z), g(P[BB], x - 1, y - 1, z), u), v),
        l(l(g(P[AA + 1], x, y, z - 1), g(P[BA + 1], x - 1, y, z - 1), u), l(g(P[AB + 1], x, y - 1, z - 1), g(P[BB + 1], x - 1, y - 1, z - 1), u), v),
        w
      );
    }
    noise2(x, y) {
      return this.noise3(x, y, 0.5);
    }
    fbm2(x, y, oct = 4, lac = 2, gain = 0.5) {
      let a = 1, f = 1, s = 0, n = 0;
      for (let i = 0; i < oct; i++) {
        s += this.noise2(x * f, y * f) * a;
        n += a;
        a *= gain;
        f *= lac;
      }
      return s / n;
    }
  };

  // game/src/worldgen.js
  var BIOME = { PLAINS: 0, FOREST: 1, DESERT: 2, TAIGA: 3, BEACH: 4, OCEAN: 5, SWAMP: 6 };
  function generate(world, seed, progress) {
    world.seed = seed;
    const r = mulberry(seed ^ 2654435769);
    const nH = new Noise(seed), nD = new Noise(seed + 1), nT = new Noise(seed + 2), nM = new Noise(seed + 3);
    const nC1 = new Noise(seed + 4), nC2 = new Noise(seed + 5), nR = new Noise(seed + 6), nS = new Noise(seed + 7);
    const biomes = new Uint8Array(WX * WZ);
    const heights = new Uint8Array(WX * WZ);
    world.biomes = biomes;
    for (let x = 0; x < WX; x++) for (let z = 0; z < WZ; z++) {
      const cont = nH.fbm2(x / 160, z / 160, 4);
      const detail = nD.fbm2(x / 40, z / 40, 3);
      const ridge = 1 - Math.abs(nR.fbm2(x / 90, z / 90, 3));
      const mount = Math.max(0, ridge - 0.55) * 2.2;
      const temp = nT.fbm2(x / 200, z / 200, 2) + (r() - 0.5) * 0.02;
      const humid = nM.fbm2(x / 180, z / 180, 2);
      let h = 66 + cont * 22 + detail * 6 + mount * mount * 38;
      const ed = Math.min(x, z, WX - 1 - x, WZ - 1 - z);
      if (ed < 12) h = h - (12 - ed) * 0.6;
      h = Math.max(4, Math.min(WY - 8, h));
      const hi = Math.floor(h);
      heights[x << 8 | z] = hi;
      let b;
      if (hi < SEA - 1) b = BIOME.OCEAN;
      else if (hi <= SEA + 1 && temp > -0.25) b = BIOME.BEACH;
      else if (temp > 0.22 && humid < 0.05) b = BIOME.DESERT;
      else if (temp < -0.22) b = BIOME.TAIGA;
      else if (humid > 0.25 && hi < SEA + 4) b = BIOME.SWAMP;
      else if (humid > 0.05) b = BIOME.FOREST;
      else b = BIOME.PLAINS;
      biomes[x << 8 | z] = b;
    }
    progress && progress(0.15);
    for (let x = 0; x < WX; x++) for (let z = 0; z < WZ; z++) {
      const col = x << 8 | z;
      const h = heights[col];
      const b = biomes[col];
      const base = col << 7;
      const dirtDepth = 3 + ((nS.noise2(x / 8, z / 8) + 1) * 1.5 | 0);
      for (let y = 0; y < WY; y++) {
        let id = 0;
        if (y === 0) id = B.BEDROCK;
        else if (y < 5 && r() < (5 - y) / 5) id = B.BEDROCK;
        else if (y < h - dirtDepth) id = B.STONE;
        else if (y < h) {
          if (b === BIOME.DESERT || b === BIOME.BEACH) id = y < h - 3 && b === BIOME.DESERT ? B.SANDSTONE : B.SAND;
          else if (b === BIOME.OCEAN) id = h < SEA - 6 && nS.noise2(x / 12, z / 12) > 0.3 ? B.GRAVEL : nS.noise2(x / 9 + 50, z / 9) > 0.45 ? B.CLAY : B.SAND;
          else id = B.DIRT;
        } else if (y === h) {
          if (b === BIOME.DESERT || b === BIOME.BEACH) id = B.SAND;
          else if (b === BIOME.OCEAN) id = B.SAND;
          else id = h < SEA ? B.DIRT : B.GRASS;
        } else if (y <= SEA) {
          id = B.STILL_WATER;
        }
        world.blocks[base + y] = id;
      }
      if (b === BIOME.TAIGA || b === BIOME.OCEAN && nT.fbm2(x / 200, z / 200, 2) < -0.25) {
        if (h >= SEA) {
          if (r() < 0.95) world.blocks[base + h + 1] = B.SNOW_LAYER;
        } else world.blocks[base + SEA] = B.ICE;
      }
    }
    progress && progress(0.3);
    const S = 4;
    const gx = WX / S + 1, gy = WY / S + 1, gz = WZ / S + 1;
    const g1 = new Float32Array(gx * gy * gz), g2 = new Float32Array(gx * gy * gz);
    for (let x = 0; x < gx; x++) for (let y = 0; y < gy; y++) for (let z = 0; z < gz; z++) {
      const i = (x * gy + y) * gz + z;
      g1[i] = nC1.noise3(x * S / 28, y * S / 16, z * S / 28);
      g2[i] = nC2.noise3(x * S / 28, y * S / 16, z * S / 28);
    }
    const sample = (g, x, y, z) => {
      const fx = x / S, fy = y / S, fz = z / S;
      const x0 = fx | 0, y0 = fy | 0, z0 = fz | 0;
      const tx = fx - x0, ty = fy - y0, tz = fz - z0;
      const at = (a, b, c) => g[(a * gy + b) * gz + c];
      const l = (a, b, t) => a + (b - a) * t;
      return l(
        l(l(at(x0, y0, z0), at(x0 + 1, y0, z0), tx), l(at(x0, y0 + 1, z0), at(x0 + 1, y0 + 1, z0), tx), ty),
        l(l(at(x0, y0, z0 + 1), at(x0 + 1, y0, z0 + 1), tx), l(at(x0, y0 + 1, z0 + 1), at(x0 + 1, y0 + 1, z0 + 1), tx), ty),
        tz
      );
    };
    for (let x = 1; x < WX - 1; x++) for (let z = 1; z < WZ - 1; z++) {
      const col = x << 8 | z;
      const h = heights[col];
      const base = col << 7;
      const top = Math.min(h - (biomes[col] === BIOME.OCEAN || h <= SEA + 1 ? 6 : 1), WY - 2);
      for (let y = 4; y <= top; y++) {
        const a = sample(g1, x, y, z), c = sample(g2, x, y, z);
        const t = 0.075 + (y < 20 ? 0.03 : 0);
        if (Math.abs(a) < t && Math.abs(c) < t) {
          const cur = world.blocks[base + y];
          if (cur === B.BEDROCK || cur === B.STILL_WATER) continue;
          if (world.blocks[base + y + 1] === B.STILL_WATER) continue;
          world.blocks[base + y] = y < 11 ? B.STILL_LAVA : 0;
          if (y === h - 1 || y === h) {
          }
        }
      }
    }
    for (let x = 0; x < WX; x++) for (let z = 0; z < WZ; z++) {
      const base = (x << 8 | z) << 7;
      const y = world.surfaceY(x, z);
      if (world.blocks[base + y] === B.DIRT && y >= SEA) world.blocks[base + y] = B.GRASS;
    }
    progress && progress(0.45);
    const ore2 = (id, count, size, maxY, minY = 1) => {
      for (let n = 0; n < count; n++) {
        let x = r() * WX, y = minY + r() * (maxY - minY), z = r() * WZ;
        for (let k = 0; k < size; k++) {
          const xi = x | 0, yi = y | 0, zi = z | 0;
          if (world.inBounds(xi, yi, zi) && world.blocks[idx(xi, yi, zi)] === B.STONE) world.blocks[idx(xi, yi, zi)] = id;
          x += r() * 2 - 1;
          y += r() * 2 - 1;
          z += r() * 2 - 1;
        }
      }
    };
    const chunks = WX / 16 * (WZ / 16);
    ore2(B.DIRT, chunks * 6, 24, 120);
    ore2(B.GRAVEL, chunks * 4, 24, 120);
    ore2(B.COAL_ORE, chunks * 20, 14, 120);
    ore2(B.IRON_ORE, chunks * 18, 8, 64);
    ore2(B.GOLD_ORE, chunks * 2, 8, 32);
    ore2(B.REDSTONE_ORE, chunks * 8, 7, 16);
    ore2(B.DIAMOND_ORE, chunks * 1.2, 7, 16);
    ore2(B.LAPIS_ORE, chunks * 1.2, 6, 32);
    progress && progress(0.55);
    for (let n = 0; n < 14; n++) {
      const cx = 16 + (r() * (WX - 32) | 0), cz = 16 + (r() * (WZ - 32) | 0);
      const lava = r() < 0.15;
      const sy = world.surfaceY(cx, cz);
      if (sy <= SEA + 1 || sy > 100) continue;
      const bm = biomes[cx << 8 | cz];
      if (!lava && bm === BIOME.DESERT) continue;
      const rad = 3 + r() * 4;
      for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
        const d = Math.sqrt(dx * dx + dz * dz) + nS.noise2((cx + dx) / 4, (cz + dz) / 4) * 2;
        if (d > rad) continue;
        const x = cx + dx, z = cz + dz;
        const depth = Math.max(1, Math.round((rad - d) * 0.7));
        for (let y = sy; y > sy - depth; y--) world.rawSet(x, y, z, lava ? B.STILL_LAVA : B.STILL_WATER);
        for (let y = sy + 1; y < sy + 6; y++) world.rawSet(x, y, z, 0);
        if (lava) world.rawSet(x, sy - depth, z, B.STONE);
      }
    }
    const isSoil = (id) => id === B.GRASS || id === B.DIRT;
    for (let x = 2; x < WX - 2; x++) for (let z = 2; z < WZ - 2; z++) {
      const col = x << 8 | z;
      const bm = biomes[col];
      const y = world.surfaceY(x, z);
      const ground = world.getBlock(x, y, z);
      const above = world.getBlock(x, y + 1, z);
      if (above !== 0 && above !== B.SNOW_LAYER) continue;
      const forestN = nM.noise2(x / 30, z / 30);
      let treeChance = bm === BIOME.FOREST ? 0.045 + forestN * 0.03 : bm === BIOME.PLAINS ? 3e-3 : bm === BIOME.TAIGA ? 0.03 : bm === BIOME.SWAMP ? 0.012 : 0;
      if (isSoil(ground) && r() < treeChance) {
        let type = 0;
        if (bm === BIOME.TAIGA) type = 1;
        else if (bm === BIOME.FOREST && r() < 0.25) type = 2;
        if (above === B.SNOW_LAYER) world.rawSet(x, y + 1, z, 0);
        growTree(world, x, y + 1, z, type, r);
        continue;
      }
      if (ground === B.GRASS) {
        const p = r();
        if (bm === BIOME.PLAINS && p < 0.12) world.rawSet(x, y + 1, z, B.TALLGRASS, 1);
        else if (bm === BIOME.FOREST && p < 0.05) world.rawSet(x, y + 1, z, B.TALLGRASS, 1);
        else if (bm === BIOME.SWAMP && p < 0.08) world.rawSet(x, y + 1, z, B.TALLGRASS, 1);
        else if (p < 0.135 && p >= 0.128 && bm !== BIOME.TAIGA) world.rawSet(x, y + 1, z, nS.noise2(x / 20, z / 20) > 0 ? B.DANDELION : B.ROSE);
        else if (p > 0.9995 && bm !== BIOME.TAIGA) world.rawSet(x, y + 1, z, B.PUMPKIN, 2 + (r() * 4 | 0));
        else if (p > 0.996 && (bm === BIOME.FOREST || bm === BIOME.SWAMP)) world.rawSet(x, y + 1, z, r() < 0.5 ? B.BROWN_MUSHROOM : B.RED_MUSHROOM);
      } else if (ground === B.SAND && bm === BIOME.DESERT) {
        const p = r();
        if (p < 6e-3) {
          const hgt = 1 + (r() * 3 | 0);
          for (let k = 1; k <= hgt; k++) world.rawSet(x, y + k, z, B.CACTUS);
        } else if (p < 0.012) world.rawSet(x, y + 1, z, B.DEADBUSH);
      }
      if ((ground === B.GRASS || ground === B.SAND || ground === B.DIRT) && y === SEA && r() < 0.12) {
        const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => world.getBlock(x + dx, y, z + dz) === B.STILL_WATER);
        if (nearWater) {
          const hgt = 1 + (r() * 3 | 0);
          for (let k = 1; k <= hgt; k++) world.rawSet(x, y + k, z, B.SUGARCANE);
        }
      }
    }
    for (let n = 0; n < 400; n++) {
      const x = r() * WX | 0, z = r() * WZ | 0, y = 10 + (r() * 50 | 0);
      if (world.getBlock(x, y, z) === 0 && world.getBlock(x, y - 1, z) === B.STONE) world.rawSet(x, y, z, r() < 0.5 ? B.BROWN_MUSHROOM : B.RED_MUSHROOM);
    }
    progress && progress(0.7);
    let best = null;
    for (let rad = 0; rad < 120 && !best; rad += 2) {
      for (let a = 0; a < 16 && !best; a++) {
        const x = Math.round(128 + Math.cos(a / 16 * Math.PI * 2) * rad), z = Math.round(128 + Math.sin(a / 16 * Math.PI * 2) * rad);
        const y = world.surfaceY(x, z);
        const g = world.getBlock(x, y, z);
        if ((g === B.GRASS || g === B.SAND) && y >= SEA) best = [x + 0.5, y + 1, z + 0.5];
      }
    }
    world.spawn = best || [128.5, world.surfaceY(128, 128) + 1, 128.5];
    world.fullLight();
    progress && progress(1);
  }
  function generateFlat(world, seed) {
    world.seed = seed;
    for (let x = 0; x < WX; x++) for (let z = 0; z < WZ; z++) {
      const base = (x << 8 | z) << 7;
      world.blocks[base] = B.BEDROCK;
      for (let y = 1; y < 3; y++) world.blocks[base + y] = B.DIRT;
      world.blocks[base + 3] = B.GRASS;
    }
    world.spawn = [128.5, 4, 128.5];
    world.fullLight();
  }
  function growTree(world, x, y, z, type, r) {
    const set = (xx, yy, zz, id, m2) => {
      if (!world.inBounds(xx, yy, zz)) return;
      const cur = world.getBlock(xx, yy, zz);
      if (id === B.LEAVES && cur !== 0 && cur !== B.SNOW_LAYER && cur !== B.TALLGRASS) return;
      world.rawSet(xx, yy, zz, id, m2);
    };
    if (y + 8 >= WY) return false;
    if (type === 1) {
      const h2 = 6 + (r() * 4 | 0);
      for (let k = 0; k < h2; k++) set(x, y + k, z, B.LOG, 1);
      let rad = 0;
      for (let yy = y + h2; yy >= y + 2; yy--) {
        for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
          if (Math.abs(dx) === rad && Math.abs(dz) === rad && rad > 0) continue;
          if (dx === 0 && dz === 0 && yy < y + h2) continue;
          set(x + dx, yy, z + dz, B.LEAVES, 1);
        }
        rad = rad >= 2 ? 1 : rad + 1;
      }
      set(x, y + h2, z, B.LEAVES, 1);
      return true;
    }
    const h = 4 + (r() * 3 | 0) + (type === 2 ? 1 : 0);
    const m = type === 2 ? 2 : 0;
    for (let yy = y + h - 3; yy <= y + h; yy++) {
      const rad = yy >= y + h - 1 ? 1 : 2;
      for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
        if (Math.abs(dx) === rad && Math.abs(dz) === rad && (yy === y + h || r() < 0.5)) continue;
        set(x + dx, yy, z + dz, B.LEAVES, m);
      }
    }
    for (let k = 0; k < h; k++) world.rawSet(x, y + k, z, B.LOG, m);
    if (world.getBlock(x, y - 1, z) === B.GRASS) world.rawSet(x, y - 1, z, B.DIRT);
    return true;
  }

  // game/src/mesher.js
  var STRIDE = 28;
  var FACE_SHADE = [0.5, 1, 0.8, 0.8, 0.6, 0.6];
  var QuadBuf = class {
    constructor() {
      this.cap = 4096;
      this.buf = new ArrayBuffer(this.cap * 4 * STRIDE);
      this.f = new Float32Array(this.buf);
      this.u8 = new Uint8Array(this.buf);
      this.n = 0;
    }
    reset() {
      this.n = 0;
    }
    grow() {
      this.cap *= 2;
      const nb = new ArrayBuffer(this.cap * 4 * STRIDE);
      new Uint8Array(nb).set(this.u8);
      this.buf = nb;
      this.f = new Float32Array(nb);
      this.u8 = new Uint8Array(nb);
    }
    vert(x, y, z, u, v, sky, blk, shade2, r, g, b) {
      const vi = this.n;
      if (vi >> 2 >= this.cap) this.grow();
      const fo = vi * 7, bo = vi * STRIDE + 20;
      const f = this.f, u82 = this.u8;
      f[fo] = x;
      f[fo + 1] = y;
      f[fo + 2] = z;
      f[fo + 3] = u;
      f[fo + 4] = v;
      u82[bo] = sky * 17;
      u82[bo + 1] = blk * 17;
      u82[bo + 2] = shade2 * 255;
      u82[bo + 3] = 255;
      u82[bo + 4] = r;
      u82[bo + 5] = g;
      u82[bo + 6] = b;
      u82[bo + 7] = 255;
      this.n++;
    }
    slice() {
      return new Uint8Array(this.buf, 0, this.n * STRIDE).slice();
    }
  };
  var opaqueBuf = new QuadBuf();
  var transBuf = new QuadBuf();
  function biomeTint(world, x, z, kind) {
    const b = world.biomes ? world.biomes[x << 8 | z] : BIOME.PLAINS;
    switch (b) {
      case BIOME.DESERT:
        return kind === 1 ? [255, 235, 160] : [250, 230, 150];
      case BIOME.TAIGA:
        return kind === 1 ? [190, 230, 220] : [200, 235, 225];
      case BIOME.SWAMP:
        return [170, 190, 120];
      case BIOME.FOREST:
        return kind === 1 ? [225, 255, 215] : [235, 255, 225];
      default:
        return [255, 255, 255];
    }
  }
  function buildSection(world, sx, sy, sz) {
    opaqueBuf.reset();
    transBuf.reset();
    const x0 = sx * 16, y0 = sy * 16, z0 = sz * 16;
    const BL = world.blocks, ME = world.meta, LI = world.light;
    let any = false;
    const lightAt2 = (x, y, z) => {
      if (y >= WY) return 240;
      if (y < 0 || x < 0 || z < 0 || x >= WX || z >= WZ) return x < 0 || z < 0 || x >= WX || z >= WZ ? 240 : 0;
      return LI[idx(x, y, z)];
    };
    const opq = (x, y, z) => {
      if (y < 0) return 1;
      if (y >= WY || x < 0 || z < 0 || x >= WX || z >= WZ) return 0;
      return OPAQUE[BL[idx(x, y, z)]];
    };
    const idAt = (x, y, z) => {
      if (y < 0) return B.BEDROCK;
      if (y >= WY || x < 0 || z < 0 || x >= WX || z >= WZ) return 0;
      return BL[idx(x, y, z)];
    };
    const CORNERS = [
      // per face: 4 corner offsets (in face plane) as [ax, ay, az] for vertex positions, plus tangent dirs
      // down (y-)
      [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]],
      // up
      [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
      // north z-
      [[1, 1, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0]],
      // south z+
      [[0, 1, 1], [0, 0, 1], [1, 0, 1], [1, 1, 1]],
      // west x-
      [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]],
      // east x+
      [[1, 1, 1], [1, 0, 1], [1, 0, 0], [1, 1, 0]]
    ];
    const UVS = [[0, 0], [0, 1], [1, 1], [1, 0]];
    function cubeFace(buf, x, y, z, f, tile, tint, yTop = 1) {
      const [dx, dy, dz] = FACE_DIRS[f];
      const nx = x + dx, ny = y + dy, nz = z + dz;
      const [tu, tv, ts] = tileUV(tile);
      const sh = FACE_SHADE[f];
      const cs = CORNERS[f];
      const lv = [0, 0, 0, 0], bv = [0, 0, 0, 0], ao = [0, 0, 0, 0];
      for (let c = 0; c < 4; c++) {
        const cx = cs[c][0], cy = cs[c][1], cz = cs[c][2];
        const ox = dx !== 0 ? 0 : cx ? 1 : -1;
        const oy = dy !== 0 ? 0 : cy ? 1 : -1;
        const oz = dz !== 0 ? 0 : cz ? 1 : -1;
        let s1x = nx, s1y = ny, s1z = nz, s2x = nx, s2y = ny, s2z = nz;
        if (dx !== 0) {
          s1y += oy;
          s2z += oz;
        } else if (dy !== 0) {
          s1x += ox;
          s2z += oz;
        } else {
          s1x += ox;
          s2y += oy;
        }
        const cxw = nx + ox, cyw = ny + oy, czw = nz + oz;
        const o1 = opq(s1x, s1y, s1z), o2 = opq(s2x, s2y, s2z), oc = opq(cxw, cyw, czw);
        const aoV = o1 && o2 ? 0 : 3 - (o1 + o2 + oc);
        const L0 = lightAt2(nx, ny, nz), L1 = o1 ? -1 : lightAt2(s1x, s1y, s1z), L2 = o2 ? -1 : lightAt2(s2x, s2y, s2z), L3 = oc || o1 && o2 ? -1 : lightAt2(cxw, cyw, czw);
        let ss = L0 >> 4, bs = L0 & 15, n = 1;
        if (L1 >= 0) {
          ss += L1 >> 4;
          bs += L1 & 15;
          n++;
        }
        if (L2 >= 0) {
          ss += L2 >> 4;
          bs += L2 & 15;
          n++;
        }
        if (L3 >= 0) {
          ss += L3 >> 4;
          bs += L3 & 15;
          n++;
        }
        lv[c] = ss / n;
        bv[c] = bs / n;
        ao[c] = aoV;
      }
      const AOF = [0.5, 0.65, 0.82, 1];
      const flip = ao[0] + ao[2] < ao[1] + ao[3];
      const order = flip ? [1, 2, 3, 0] : [0, 1, 2, 3];
      for (const c of order) {
        const p = cs[c];
        let vy = p[1];
        if (yTop !== 1 && vy === 1) vy = yTop;
        let uu = UVS[c][0], vv = UVS[c][1];
        if (f >= 2 && yTop !== 1) {
          if (vv === 0) vv = 1 - yTop;
        }
        buf.vert(x + p[0], y + vy, z + p[2], tu + uu * ts, tv + vv * ts, lv[c], bv[c], sh * AOF[ao[c]], tint[0], tint[1], tint[2]);
      }
    }
    function box(buf, x, y, z, bx, texFor, tint, cullFaces = true, lightSelf = false) {
      const [a0, b0, c0, a1, b1, c1] = bx;
      for (let f = 0; f < 6; f++) {
        const onEdge = f === 0 && b0 === 0 || f === 1 && b1 === 1 || f === 2 && c0 === 0 || f === 3 && c1 === 1 || f === 4 && a0 === 0 || f === 5 && a1 === 1;
        const [dx, dy, dz] = FACE_DIRS[f];
        if (cullFaces && onEdge && opq(x + dx, y + dy, z + dz)) continue;
        const tile = texFor(f);
        if (tile < 0) continue;
        const L = onEdge && !lightSelf ? lightAt2(x + dx, y + dy, z + dz) : lightAt2(x, y, z);
        const sky = L >> 4, bl = L & 15, sh = FACE_SHADE[f];
        const [tu, tv, ts] = tileUV(tile);
        let quad;
        if (f === 0 || f === 1) {
          const u0 = a0, u1 = a1, v0 = c0, v1 = c1;
          quad = f === 1 ? [[a0, b1, c0, u0, v0], [a0, b1, c1, u0, v1], [a1, b1, c1, u1, v1], [a1, b1, c0, u1, v0]] : [[a0, b0, c1, u0, v1], [a0, b0, c0, u0, v0], [a1, b0, c0, u1, v0], [a1, b0, c1, u1, v1]];
        } else if (f === 2) quad = [[a1, b1, c0, 1 - a1, 1 - b1], [a1, b0, c0, 1 - a1, 1 - b0], [a0, b0, c0, 1 - a0, 1 - b0], [a0, b1, c0, 1 - a0, 1 - b1]];
        else if (f === 3) quad = [[a0, b1, c1, a0, 1 - b1], [a0, b0, c1, a0, 1 - b0], [a1, b0, c1, a1, 1 - b0], [a1, b1, c1, a1, 1 - b1]];
        else if (f === 4) quad = [[a0, b1, c0, c0, 1 - b1], [a0, b0, c0, c0, 1 - b0], [a0, b0, c1, c1, 1 - b0], [a0, b1, c1, c1, 1 - b1]];
        else quad = [[a1, b1, c1, 1 - c1, 1 - b1], [a1, b0, c1, 1 - c1, 1 - b0], [a1, b0, c0, 1 - c0, 1 - b0], [a1, b1, c0, 1 - c0, 1 - b1]];
        for (const q of quad) buf.vert(x + q[0], y + q[1], z + q[2], tu + q[3] * ts, tv + q[4] * ts, sky, bl, sh, tint[0], tint[1], tint[2]);
      }
    }
    function crossQuads(buf, x, y, z, tile, tint, h = 1, ox = 0, oz = 0) {
      const L = lightAt2(x, y, z);
      const sky = L >> 4, bl = L & 15;
      const [tu, tv, ts] = tileUV(tile);
      const vTop = tv + (1 - h) * ts;
      const planes = [[0.15, 0.15, 0.85, 0.85], [0.15, 0.85, 0.85, 0.15]];
      for (const [ax, az, bx, bz] of planes) {
        for (let side = 0; side < 1; side++) {
          const pts = side === 0 ? [[ax, h, az, 0, vTop], [ax, 0, az, 0, tv + ts], [bx, 0, bz, 1, tv + ts], [bx, h, bz, 1, vTop]] : [[bx, h, bz, 1, vTop], [bx, 0, bz, 1, tv + ts], [ax, 0, az, 0, tv + ts], [ax, h, az, 0, vTop]];
          for (const p of pts) buf.vert(x + p[0] + ox, y + p[1], z + p[2] + oz, tu + p[3] * ts, p[4], sky, bl, 0.95, tint[0], tint[1], tint[2]);
        }
      }
    }
    function hashPlanes(buf, x, y, z, tile, inset = 0.25, h = 1) {
      const L = lightAt2(x, y, z);
      const sky = L >> 4, bl = L & 15;
      const [tu, tv, ts] = tileUV(tile);
      const vt = tv + (1 - h) * ts;
      for (const k of [inset, 1 - inset]) {
        for (const axis of [0, 1]) for (let side = 0; side < 1; side++) {
          let pts;
          if (axis === 0) pts = [[k, h, 0, 0, vt], [k, 0, 0, 0, tv + ts], [k, 0, 1, 1, tv + ts], [k, h, 1, 1, vt]];
          else pts = [[0, h, k, 0, vt], [0, 0, k, 0, tv + ts], [1, 0, k, 1, tv + ts], [1, h, k, 1, vt]];
          if (side) pts.reverse();
          for (const p of pts) buf.vert(x + p[0], y + p[1], z + p[2], tu + p[3] * ts, p[4], sky, bl, 0.9, 255, 255, 255);
        }
      }
    }
    function liquidHeight(x, y, z, lid) {
      const id = idAt(x, y, z);
      if (LIQUID[id] !== lid) return -1;
      if (LIQUID[idAt(x, y + 1, z)] === lid) return 1;
      const m = world.getMeta(x, y, z);
      if (m & 8) return 1;
      return (8 - (m & 7)) / 9;
    }
    function liquid(buf, x, y, z, id) {
      const lid = LIQUID[id];
      const tile = blocks[id].texFn(1, 0);
      const [tu, tv, ts] = tileUV(tile);
      const above = LIQUID[idAt(x, y + 1, z)] === lid;
      const ch = (cx, cz) => {
        if (above) return 1;
        let s = 0, n = 0;
        for (const [ddx, ddz] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
          const xx = x + cx + ddx, zz = z + cz + ddz;
          if (LIQUID[idAt(xx, y + 1, zz)] === lid) return 1;
          const h = liquidHeight(xx, y, zz, lid);
          if (h >= 0) {
            s += h;
            n++;
          } else if (!OPAQUE[idAt(xx, y, zz)]) {
            n++;
            s += 0;
          }
        }
        return n ? Math.max(0.05, s / n) : 0.9;
      };
      const h00 = ch(0, 0), h01 = ch(0, 1), h11 = ch(1, 1), h10 = ch(1, 0);
      const tint = [255, 255, 255];
      const L0 = lightAt2(x, y, z);
      if (!above) {
        const L = lightAt2(x, y + 1, z);
        const sky = Math.max(L >> 4, L0 >> 4), bl = Math.max(L & 15, L0 & 15);
        const top = [[0, h00, 0, 0, 0], [0, h01, 1, 0, 1], [1, h11, 1, 1, 1], [1, h10, 0, 1, 0]];
        for (const p of top) buf.vert(x + p[0], y + p[1] - 1e-3, z + p[2], tu + p[3] * ts, tv + p[4] * ts, sky, bl, 1, ...tint);
      }
      for (let f = 0; f < 6; f++) {
        if (f === 1) continue;
        const [dx, dy, dz] = FACE_DIRS[f];
        const nid = idAt(x + dx, y + dy, z + dz);
        if (LIQUID[nid] === lid || OPAQUE[nid]) continue;
        if (f === 0 && nid !== 0 && !OPAQUE[nid] && LIQUID[nid]) continue;
        const L = lightAt2(x + dx, y + dy, z + dz);
        const sky = L >> 4, bl = L & 15, sh = FACE_SHADE[f];
        let q;
        if (f === 0) q = [[0, 0, 1, 0, 1], [0, 0, 0, 0, 0], [1, 0, 0, 1, 0], [1, 0, 1, 1, 1]];
        else if (f === 2) q = [[1, h10, 0, 0, 1 - h10], [1, 0, 0, 0, 1], [0, 0, 0, 1, 1], [0, h00, 0, 1, 1 - h00]];
        else if (f === 3) q = [[0, h01, 1, 0, 1 - h01], [0, 0, 1, 0, 1], [1, 0, 1, 1, 1], [1, h11, 1, 1, 1 - h11]];
        else if (f === 4) q = [[0, h00, 0, 0, 1 - h00], [0, 0, 0, 0, 1], [0, 0, 1, 1, 1], [0, h01, 1, 1, 1 - h01]];
        else q = [[1, h11, 1, 0, 1 - h11], [1, 0, 1, 0, 1], [1, 0, 0, 1, 1], [1, h10, 0, 1, 1 - h10]];
        for (const p of q) buf.vert(x + p[0], y + p[1], z + p[2], tu + p[3] * ts, tv + p[4] * ts, sky, bl, sh, ...tint);
      }
    }
    const WHITE = [255, 255, 255];
    for (let x = x0; x < x0 + 16; x++) for (let z = z0; z < z0 + 16; z++) {
      const colBase = (x << 8 | z) << 7;
      for (let y = y0; y < y0 + 16; y++) {
        const id = BL[colBase + y];
        if (id === 0) continue;
        const rt = RENDER[id];
        if (rt === R.NONE) continue;
        const b = blocks[id];
        const meta = ME[colBase + y];
        any = true;
        const buf = b.pass === 2 ? transBuf : opaqueBuf;
        switch (rt) {
          case R.CUBE: {
            const snowy = id === B.GRASS && (idAt(x, y + 1, z) === B.SNOW_LAYER || idAt(x, y + 1, z) === B.SNOW);
            for (let f = 0; f < 6; f++) {
              const [dx, dy, dz] = FACE_DIRS[f];
              const nid = idAt(x + dx, y + dy, z + dz);
              if (OPAQUE[nid]) continue;
              if (!b.opaque && nid === id && (b.pass !== 1 || b.leaves || id === B.GLASS)) continue;
              if (id === B.ICE && LIQUID[nid] === 1) continue;
              let tint = WHITE;
              if (b.leaves) tint = biomeTint(world, x, z, 1);
              else if (id === B.GRASS && f === 1) tint = biomeTint(world, x, z, 0);
              cubeFace(buf, x, y, z, f, b.texFn(f, meta, snowy), tint);
            }
            break;
          }
          case R.CROSS: {
            const tint = b.tint ? biomeTint(world, x, z, 0) : WHITE;
            let ox = 0, oz = 0;
            if (id === B.TALLGRASS) {
              const h = x * 3129871 ^ z * 116129781 ^ y;
              ox = (h >> 16 & 15) / 15 * 0.3 - 0.15;
              oz = (h >> 20 & 15) / 15 * 0.3 - 0.15;
            }
            crossQuads(buf, x, y, z, b.texFn(0, meta), tint, 1, ox, oz);
            break;
          }
          case R.STEM: {
            const tile = (meta & 7) === 7 && hasFruitNeighbour(world, x, y, z, b.stem) ? tex("stem_connected") : b.texFn(0, meta);
            crossQuads(buf, x, y, z, tile, WHITE, 1);
            break;
          }
          case R.CROPS:
            hashPlanes(buf, x, y, z, b.texFn(0, meta));
            break;
          case R.FIRE:
            hashPlanes(buf, x, y, z, b.texFn(0, meta), 0.1);
            crossQuads(buf, x, y, z, b.texFn(0, meta), WHITE);
            break;
          case R.LIQUID:
            liquid(buf, x, y, z, id);
            break;
          case R.TORCH:
            torch(buf, x, y, z, meta, b);
            break;
          case R.SLAB: {
            const top = (meta & 8) !== 0;
            box(buf, x, y, z, top ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1], (f) => b.texFn(f, meta), WHITE);
            break;
          }
          case R.STAIRS: {
            const top = (meta & 4) !== 0, d = meta & 3;
            box(buf, x, y, z, top ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1], (f) => b.texFn(f, meta), WHITE);
            const y0b = top ? 0 : 0.5, y1b = top ? 0.5 : 1;
            const bx = d === 0 ? [0.5, y0b, 0, 1, y1b, 1] : d === 1 ? [0, y0b, 0, 0.5, y1b, 1] : d === 2 ? [0, y0b, 0.5, 1, y1b, 1] : [0, y0b, 0, 1, y1b, 0.5];
            box(buf, x, y, z, bx, (f) => b.texFn(f, meta), WHITE);
            break;
          }
          case R.FARMLAND:
            box(buf, x, y, z, [0, 0, 0, 1, 15 / 16, 1], (f) => b.texFn(f, meta), WHITE);
            break;
          case R.SNOW:
            box(buf, x, y, z, [0, 0, 0, 1, 0.125, 1], () => b.texFn(0, meta), WHITE);
            break;
          case R.CACTUS: {
            const e = 1 / 16;
            box(buf, x, y, z, [e, 0, e, 1 - e, 1, 1 - e], (f) => b.texFn(f, meta), WHITE, false);
            break;
          }
          case R.LADDER: {
            const t = 0.06;
            const bx = meta === 2 ? [0, 0, 1 - t, 1, 1, 1 - t + 1e-3] : meta === 3 ? [0, 0, t - 1e-3, 1, 1, t] : meta === 4 ? [1 - t, 0, 0, 1 - t + 1e-3, 1, 1] : [t - 1e-3, 0, 0, t, 1, 1];
            box(buf, x, y, z, bx, (f) => f < 2 ? -1 : b.texFn(f, meta), WHITE, false, true);
            break;
          }
          case R.FENCE: {
            const [n, s, w, e] = fenceConnections(world, x, y, z);
            const tf = (f) => b.texFn(f, meta);
            box(buf, x, y, z, [0.375, 0, 0.375, 0.625, 1, 0.625], tf, WHITE);
            for (const [yy0, yy1] of [[0.375, 0.5625], [0.75, 0.9375]]) {
              if (n) box(buf, x, y, z, [0.4375, yy0, 0, 0.5625, yy1, 0.375], tf, WHITE, false, true);
              if (s) box(buf, x, y, z, [0.4375, yy0, 0.625, 0.5625, yy1, 1], tf, WHITE, false, true);
              if (w) box(buf, x, y, z, [0, yy0, 0.4375, 0.375, yy1, 0.5625], tf, WHITE, false, true);
              if (e) box(buf, x, y, z, [0.625, yy0, 0.4375, 1, yy1, 0.5625], tf, WHITE, false, true);
            }
            break;
          }
          case R.GATE: {
            const tf = (f) => b.texFn(f, meta);
            const open = (meta & 4) !== 0, alongX = (meta & 1) === 0;
            if (alongX) {
              box(buf, x, y, z, [0, 0.3125, 0.4375, 0.125, 1, 0.5625], tf, WHITE, false, true);
              box(buf, x, y, z, [0.875, 0.3125, 0.4375, 1, 1, 0.5625], tf, WHITE, false, true);
              if (!open) for (const [yy0, yy1] of [[0.375, 0.5625], [0.75, 0.9375]]) box(buf, x, y, z, [0.125, yy0, 0.4375, 0.875, yy1, 0.5625], tf, WHITE, false, true);
              else for (const [yy0, yy1] of [[0.375, 0.5625], [0.75, 0.9375]]) {
                box(buf, x, y, z, [0, yy0, 0.5625, 0.125, yy1, 0.9375], tf, WHITE, false, true);
                box(buf, x, y, z, [0.875, yy0, 0.5625, 1, yy1, 0.9375], tf, WHITE, false, true);
              }
            } else {
              box(buf, x, y, z, [0.4375, 0.3125, 0, 0.5625, 1, 0.125], tf, WHITE, false, true);
              box(buf, x, y, z, [0.4375, 0.3125, 0.875, 0.5625, 1, 1], tf, WHITE, false, true);
              if (!open) for (const [yy0, yy1] of [[0.375, 0.5625], [0.75, 0.9375]]) box(buf, x, y, z, [0.4375, yy0, 0.125, 0.5625, yy1, 0.875], tf, WHITE, false, true);
              else for (const [yy0, yy1] of [[0.375, 0.5625], [0.75, 0.9375]]) {
                box(buf, x, y, z, [0.5625, yy0, 0, 0.9375, yy1, 0.125], tf, WHITE, false, true);
                box(buf, x, y, z, [0.5625, yy0, 0.875, 0.9375, yy1, 1], tf, WHITE, false, true);
              }
            }
            break;
          }
          case R.DOOR: {
            const st = doorState(world, x, y, z, meta);
            let dir = st.facing;
            if (st.open) dir = dir + (st.hingeRight ? 3 : 1) & 3;
            const t = 3 / 16;
            const bx = dir === 0 ? [0, 0, 0, t, 1, 1] : dir === 1 ? [0, 0, 0, 1, 1, t] : dir === 2 ? [1 - t, 0, 0, 1, 1, 1] : [0, 0, 1 - t, 1, 1, 1];
            box(buf, x, y, z, bx, (f) => b.texFn(f, meta), WHITE, false, true);
            break;
          }
          case R.TRAPDOOR: {
            const t = 3 / 16;
            let bx;
            if (meta & 4) {
              const d = meta & 3;
              bx = d === 0 ? [0, 0, 1 - t, 1, 1, 1] : d === 1 ? [0, 0, 0, 1, 1, t] : d === 2 ? [1 - t, 0, 0, 1, 1, 1] : [0, 0, 0, t, 1, 1];
            } else bx = meta & 8 ? [0, 1 - t, 0, 1, 1, 1] : [0, 0, 0, 1, t, 1];
            box(buf, x, y, z, bx, () => b.texFn(0, meta), WHITE, false, true);
            break;
          }
          case R.BED:
            bed(buf, x, y, z, meta);
            break;
        }
      }
    }
    function torch(buf, x, y, z, meta, b) {
      const tile = b.texFn(0, meta);
      const [tu, tv, ts] = tileUV(tile);
      const L = lightAt2(x, y, z);
      const sky = L >> 4, bl = 15;
      const w = 1 / 16;
      let bx = 0.5, bz = 0.5, by = 0, tx = 0, tz = 0;
      if (meta === 1) {
        bx = 0.1;
        tx = 0.3;
        by = 0.2;
      } else if (meta === 2) {
        bx = 0.9;
        tx = -0.3;
        by = 0.2;
      } else if (meta === 3) {
        bz = 0.1;
        tz = 0.3;
        by = 0.2;
      } else if (meta === 4) {
        bz = 0.9;
        tz = -0.3;
        by = 0.2;
      }
      const h = 10 / 16;
      const u0 = tu + 7 / 16 * ts, u1 = tu + 9 / 16 * ts, vT = tv + 6 / 16 * ts, vB = tv + ts;
      const top = [bx + tx * h * 0.6, by + h, bz + tz * h * 0.6];
      const bot = [bx, by, bz];
      const sides = [[-w, -w, w, -w], [w, -w, w, w], [w, w, -w, w], [-w, w, -w, -w]];
      for (const [ax, az, cx, cz] of sides) {
        const pts = [[top[0] + ax, top[1], top[2] + az, u0, vT], [bot[0] + ax, bot[1], bot[2] + az, u0, vB], [bot[0] + cx, bot[1], bot[2] + cz, u1, vB], [top[0] + cx, top[1], top[2] + cz, u1, vT]];
        for (const p of pts) buf.vert(x + p[0], y + p[1], z + p[2], p[3], p[4], sky, bl, 1, 255, 255, 255);
      }
      const ut0 = tu + 7 / 16 * ts, ut1 = tu + 9 / 16 * ts, vt0 = tv + 4 / 16 * ts, vt1 = tv + 6 / 16 * ts;
      const cap = [[-w, -w, ut0, vt0], [-w, w, ut0, vt1], [w, w, ut1, vt1], [w, -w, ut1, vt0]];
      for (const c of cap) buf.vert(x + top[0] + c[0], y + top[1], z + top[2] + c[1], c[2], c[3], sky, bl, 1, 255, 255, 255);
    }
    function bed(buf, x, y, z, meta) {
      const head = (meta & 8) !== 0, d = meta & 3;
      const tTop = tex(head ? "bed_head_top" : "bed_foot_top");
      const tSide = tex(head ? "bed_side_head" : "bed_side_foot");
      const tEnd = tex("bed_end"), tWood = tex("planks");
      const dirFace = [3, 4, 2, 5][d];
      const backFace = [2, 5, 3, 4][d];
      box(buf, x, y, z, [0, 3 / 16, 0, 1, 9 / 16, 1], (f) => {
        if (f === 1) return tTop;
        if (f === 0) return tWood;
        if (f === dirFace) return head ? tEnd : -1;
        if (f === backFace) return head ? -1 : tEnd;
        return tSide;
      }, WHITE, false, true);
      const legs = [[0, 0], [13 / 16, 0], [0, 13 / 16], [13 / 16, 13 / 16]];
      for (const [lx, lz] of legs) box(buf, x, y, z, [lx, 0, lz, lx + 3 / 16, 3 / 16, lz + 3 / 16], () => tWood, WHITE, false, true);
    }
    return { any, opaque: opaqueBuf.n ? opaqueBuf.slice() : null, trans: transBuf.n ? transBuf.slice() : null, nOpaque: opaqueBuf.n, nTrans: transBuf.n };
  }
  function hasFruitNeighbour(world, x, y, z, fruit) {
    return world.getBlock(x + 1, y, z) === fruit || world.getBlock(x - 1, y, z) === fruit || world.getBlock(x, y, z + 1) === fruit || world.getBlock(x, y, z - 1) === fruit;
  }

  // game/src/mat.js
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    const o = new Float32Array(16);
    o[0] = f / aspect;
    o[5] = f;
    o[10] = (far + near) * nf;
    o[11] = -1;
    o[14] = 2 * far * near * nf;
    return o;
  }
  function mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  function identity() {
    const o = new Float32Array(16);
    o[0] = o[5] = o[10] = o[15] = 1;
    return o;
  }
  function translate(m, x, y, z) {
    const t = identity();
    t[12] = x;
    t[13] = y;
    t[14] = z;
    return mul(m, t);
  }
  function rotX(m, a) {
    const c = Math.cos(a), s = Math.sin(a);
    const t = identity();
    t[5] = c;
    t[6] = s;
    t[9] = -s;
    t[10] = c;
    return mul(m, t);
  }
  function rotY(m, a) {
    const c = Math.cos(a), s = Math.sin(a);
    const t = identity();
    t[0] = c;
    t[2] = -s;
    t[8] = s;
    t[10] = c;
    return mul(m, t);
  }
  function viewMatrix(x, y, z, yaw, pitch) {
    let m = identity();
    m = rotX(m, pitch);
    m = rotY(m, yaw);
    return translate(m, -x, -y, -z);
  }
  function frustum(m) {
    const p = [];
    const row = (i) => [m[i], m[4 + i], m[8 + i], m[12 + i]];
    const r0 = row(0), r1 = row(1), r22 = row(2), r32 = row(3);
    const add = (a, b, s) => {
      const v = [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2], a[3] + s * b[3]];
      const l = Math.hypot(v[0], v[1], v[2]);
      return v.map((q) => q / l);
    };
    p.push(add(r32, r0, 1), add(r32, r0, -1), add(r32, r1, 1), add(r32, r1, -1), add(r32, r22, 1), add(r32, r22, -1));
    return p;
  }
  function boxInFrustum(planes, x0, y0, z0, x1, y1, z1) {
    for (const p of planes) {
      const x = p[0] > 0 ? x1 : x0, y = p[1] > 0 ? y1 : y0, z = p[2] > 0 ? z1 : z0;
      if (p[0] * x + p[1] * y + p[2] * z + p[3] < 0) return false;
    }
    return true;
  }

  // game/src/renderer.js
  var VS = `
attribute vec3 aPos; attribute vec2 aUV; attribute vec4 aLight; attribute vec4 aTint;
uniform mat4 uMVP; uniform vec3 uCam; uniform float uDay; uniform float uFogNear; uniform float uFogFar; uniform float uBright;
varying vec2 vUV; varying vec3 vCol; varying float vFog; varying float vAlpha;
void main(){
  gl_Position = uMVP * vec4(aPos, 1.0);
  vUV = aUV;
  float l = max(aLight.x * uDay, aLight.y);
  float b = l / (4.0 - 3.0 * l);
  b = mix(b, 1.0, uBright * 0.15);
  b = max(b, 0.04);
  vec3 blk = vec3(1.0, 0.92, 0.8) * (aLight.y > aLight.x * uDay ? 1.0 : 0.0);
  vec3 tintc = mix(vec3(1.0), blk, 0.25);
  vCol = aTint.rgb * b * aLight.z * tintc;
  vAlpha = aTint.a;
  float d = length(aPos - uCam);
  vFog = clamp((d - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
}`;
  var FS = `
precision mediump float;
uniform sampler2D uTex; uniform vec3 uFogCol; uniform float uAlphaTest; uniform vec4 uColorMul;
varying vec2 vUV; varying vec3 vCol; varying float vFog; varying float vAlpha;
void main(){
  vec4 t = texture2D(uTex, vUV);
  if (t.a < uAlphaTest) discard;
  vec3 c = t.rgb * vCol * uColorMul.rgb;
  gl_FragColor = vec4(mix(c, uFogCol, vFog), t.a * vAlpha * uColorMul.a);
}`;
  var LVS = `attribute vec3 aPos; uniform mat4 uMVP; void main(){ gl_Position = uMVP * vec4(aPos,1.0); }`;
  var LFS = `precision mediump float; uniform vec4 uCol; void main(){ gl_FragColor = uCol; }`;
  function compile(gl, vs, fs2) {
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs2));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, a = {};
    const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < nu; i++) {
      const n = gl.getActiveUniform(p, i).name;
      u[n] = gl.getUniformLocation(p, n);
    }
    const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < na; i++) {
      const n = gl.getActiveAttrib(p, i).name;
      a[n] = gl.getAttribLocation(p, n);
    }
    return { p, u, a };
  }
  var MAX_QUADS = 16384;
  var DynMesh = class {
    constructor() {
      this.cap = 2048;
      this.ab = new ArrayBuffer(this.cap * 4 * STRIDE);
      this.f = new Float32Array(this.ab);
      this.u8 = new Uint8Array(this.ab);
      this.n = 0;
    }
    reset() {
      this.n = 0;
    }
    vert(x, y, z, u, v, sky, blk, shade2, r, g, b, a = 255) {
      if (this.n >> 2 >= this.cap) {
        this.cap *= 2;
        const nb = new ArrayBuffer(this.cap * 4 * STRIDE);
        new Uint8Array(nb).set(this.u8);
        this.ab = nb;
        this.f = new Float32Array(nb);
        this.u8 = new Uint8Array(nb);
      }
      const fo = this.n * 7, bo = this.n * STRIDE + 20;
      this.f[fo] = x;
      this.f[fo + 1] = y;
      this.f[fo + 2] = z;
      this.f[fo + 3] = u;
      this.f[fo + 4] = v;
      this.u8[bo] = sky * 17;
      this.u8[bo + 1] = blk * 17;
      this.u8[bo + 2] = shade2 * 255;
      this.u8[bo + 3] = 255;
      this.u8[bo + 4] = r;
      this.u8[bo + 5] = g;
      this.u8[bo + 6] = b;
      this.u8[bo + 7] = a;
      this.n++;
    }
    // quad from 4 points (each [x,y,z]) with uv rect
    quad(p0, p1, p2, p3, u0, v0, u1, v1, sky, blk, shade2, col = [255, 255, 255], a = 255) {
      this.vert(p0[0], p0[1], p0[2], u0, v0, sky, blk, shade2, col[0], col[1], col[2], a);
      this.vert(p1[0], p1[1], p1[2], u0, v1, sky, blk, shade2, col[0], col[1], col[2], a);
      this.vert(p2[0], p2[1], p2[2], u1, v1, sky, blk, shade2, col[0], col[1], col[2], a);
      this.vert(p3[0], p3[1], p3[2], u1, v0, sky, blk, shade2, col[0], col[1], col[2], a);
    }
  };
  var Renderer = class {
    constructor(canvas, world) {
      this.canvas = canvas;
      const gl = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance" }) || canvas.getContext("experimental-webgl");
      if (!gl) throw new Error("WebGL not available");
      this.gl = gl;
      this.world = world;
      this.prog = compile(gl, VS, FS);
      this.lprog = compile(gl, LVS, LFS);
      this.atlas = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.atlas);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const ind = new Uint16Array(MAX_QUADS * 6);
      for (let q = 0; q < MAX_QUADS; q++) {
        const v = q * 4, o = q * 6;
        ind[o] = v;
        ind[o + 1] = v + 1;
        ind[o + 2] = v + 2;
        ind[o + 3] = v;
        ind[o + 4] = v + 2;
        ind[o + 5] = v + 3;
      }
      this.ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ind, gl.STATIC_DRAW);
      this.dynBuf = gl.createBuffer();
      this.lineBuf = gl.createBuffer();
      this.sections = /* @__PURE__ */ new Map();
      this.dirty = /* @__PURE__ */ new Set();
      this.renderDist = 96;
      this.dyn = new DynMesh();
      this.dynT = new DynMesh();
      this.fov = 70;
      this.buildClouds();
      for (let sx = 0; sx < WX / 16; sx++) for (let sy = 0; sy < WY / 16; sy++) for (let sz = 0; sz < WZ / 16; sz++) this.dirty.add(this.key(sx, sy, sz));
      world.onChange((x, y, z) => this.markBlock(x, y, z));
      world.onLight = (cells) => {
        for (const i of cells) {
          const y = i & 127, z = i >> 7 & 255, x = i >> 15;
          this.dirty.add(this.key(x >> 4, y >> 4, z >> 4));
        }
      };
    }
    key(sx, sy, sz) {
      return sx << 10 | sz << 3 | sy;
    }
    markBlock(x, y, z) {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const xx = x + dx, yy = y + dy, zz = z + dz;
        if (xx < 0 || yy < 0 || zz < 0 || xx >= WX || yy >= WY || zz >= WZ) continue;
        this.dirty.add(this.key(xx >> 4, yy >> 4, zz >> 4));
      }
    }
    markAll() {
      for (let sx = 0; sx < WX / 16; sx++) for (let sy = 0; sy < WY / 16; sy++) for (let sz = 0; sz < WZ / 16; sz++) this.dirty.add(this.key(sx, sy, sz));
    }
    // rebuild dirty sections, nearest first, within time budget (ms)
    updateMeshes(cx, cy, cz, budgetMs) {
      if (!this.dirty.size) return 0;
      const t0 = performance.now();
      const rd = this.renderDist + 16;
      const list = [];
      for (const k of this.dirty) {
        const sx = k >> 10, sz = k >> 3 & 127, sy = k & 7;
        const dx = sx * 16 + 8 - cx, dy = sy * 16 + 8 - cy, dz = sz * 16 + 8 - cz;
        const d = dx * dx + dy * dy * 0.5 + dz * dz;
        if (d > rd * rd) continue;
        list.push([d, k]);
      }
      list.sort((a, b) => a[0] - b[0]);
      let built = 0;
      for (const [, k] of list) {
        this.buildSectionMesh(k);
        this.dirty.delete(k);
        built++;
        if (performance.now() - t0 > budgetMs) break;
      }
      return built;
    }
    buildSectionMesh(k) {
      const gl = this.gl;
      const sx = k >> 10, sz = k >> 3 & 127, sy = k & 7;
      const res = buildSection(this.world, sx, sy, sz);
      let s = this.sections.get(k);
      if (!res.opaque && !res.trans) {
        if (s) {
          if (s.vbo) gl.deleteBuffer(s.vbo);
          if (s.tvbo) gl.deleteBuffer(s.tvbo);
          this.sections.delete(k);
        }
        return;
      }
      if (!s) {
        s = { sx, sy, sz, vbo: null, n: 0, tvbo: null, tn: 0 };
        this.sections.set(k, s);
      }
      const up = (data, n, which) => {
        if (!data) {
          if (s[which]) {
            gl.deleteBuffer(s[which]);
            s[which] = null;
          }
          return 0;
        }
        if (!s[which]) s[which] = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, s[which]);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        return n;
      };
      s.n = up(res.opaque, res.nOpaque, "vbo");
      s.tn = up(res.trans, res.nTrans, "tvbo");
    }
    bindAttribs(prog, offsetVerts = 0) {
      const gl = this.gl, a = prog.a, o = offsetVerts * STRIDE;
      gl.enableVertexAttribArray(a.aPos);
      gl.vertexAttribPointer(a.aPos, 3, gl.FLOAT, false, STRIDE, o);
      gl.enableVertexAttribArray(a.aUV);
      gl.vertexAttribPointer(a.aUV, 2, gl.FLOAT, false, STRIDE, o + 12);
      gl.enableVertexAttribArray(a.aLight);
      gl.vertexAttribPointer(a.aLight, 4, gl.UNSIGNED_BYTE, true, STRIDE, o + 20);
      gl.enableVertexAttribArray(a.aTint);
      gl.vertexAttribPointer(a.aTint, 4, gl.UNSIGNED_BYTE, true, STRIDE, o + 24);
    }
    drawBuffer(vbo, nVerts) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      for (let start = 0; start < nVerts; start += MAX_QUADS * 4) {
        const cnt = Math.min(MAX_QUADS * 4, nVerts - start);
        this.bindAttribs(this.prog, start);
        gl.drawElements(gl.TRIANGLES, (cnt >> 2) * 6, gl.UNSIGNED_SHORT, 0);
      }
    }
    drawDyn(mesh) {
      if (!mesh.n) return;
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.dynBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(mesh.ab, 0, mesh.n * STRIDE), gl.STREAM_DRAW);
      for (let start = 0; start < mesh.n; start += MAX_QUADS * 4) {
        const cnt = Math.min(MAX_QUADS * 4, mesh.n - start);
        this.bindAttribs(this.prog, start);
        gl.drawElements(gl.TRIANGLES, (cnt >> 2) * 6, gl.UNSIGNED_SHORT, 0);
      }
    }
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr || 2);
      const w = Math.floor(this.canvas.clientWidth * dpr), h = Math.floor(this.canvas.clientHeight * dpr);
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
    }
    buildClouds() {
      this.clouds = [];
      let s = 1234567;
      const rnd2 = () => {
        s = s * 16807 % 2147483647;
        return s / 2147483647;
      };
      for (let cx = -8; cx < 40; cx++) for (let cz = -8; cz < 40; cz++) if (rnd2() < 0.22) this.clouds.push([cx * 12, cz * 12, 12 + (rnd2() * 2 | 0) * 12]);
    }
    // sky color from time of day
    skyState(time) {
      const t = (time % 24e3 + 24e3) % 24e3 / 24e3;
      const ang = (t - 0.25) * Math.PI * 2;
      let day = Math.cos(ang) * 2 + 0.5;
      day = Math.max(0, Math.min(1, day));
      const dayC = [0.53, 0.72, 1], nightC = [0.02, 0.03, 0.08];
      const sky = dayC.map((c, i) => nightC[i] + (c - nightC[i]) * day);
      const sunset = Math.max(0, 1 - Math.abs(Math.cos(ang)) * 3) * (Math.sin(ang) > -0.4 ? 1 : 0);
      const fog = [sky[0] * 0.9 + 0.08 * day + sunset * 0.25, sky[1] * 0.92 + 0.06 * day, sky[2] * 0.95 + 0.04 * day];
      return { day, sky, fog, ang, sunset };
    }
    render(cam, scene2) {
      const gl = this.gl;
      this.resize();
      const W = this.canvas.width, H = this.canvas.height;
      gl.viewport(0, 0, W, H);
      const st = this.skyState(this.world.time);
      let fogCol = st.fog;
      let fogNear = this.renderDist * 0.55, fogFar = this.renderDist;
      if (cam.underwater) {
        fogCol = [0.05, 0.1, 0.35];
        fogNear = 0;
        fogFar = 18;
      }
      if (cam.inLava) {
        fogCol = [0.6, 0.15, 0];
        fogNear = 0;
        fogFar = 3;
      }
      gl.clearColor(fogCol[0], fogCol[1], fogCol[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const proj = perspective(this.fov * Math.PI / 180, W / H, 0.05, 400);
      const view = viewMatrix(cam.x, cam.y, cam.z, cam.yaw, cam.pitch);
      const vp = mul(proj, view);
      this.lastVP = vp;
      const planes = frustum(vp);
      const P = this.prog;
      gl.useProgram(P.p);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.atlas);
      gl.uniform1i(P.u.uTex, 0);
      gl.uniform3f(P.u.uCam, cam.x, cam.y, cam.z);
      gl.uniform1f(P.u.uDay, Math.max(0.2, st.day) * (1 - (scene2.darken || 0)));
      gl.uniform1f(P.u.uBright, scene2.brightness || 0);
      gl.uniform3f(P.u.uFogCol, fogCol[0], fogCol[1], fogCol[2]);
      gl.uniform4f(P.u.uColorMul, 1, 1, 1, 1);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      this.drawSky(cam, proj, st);
      gl.uniform3f(P.u.uCam, cam.x, cam.y, cam.z);
      gl.uniform1f(P.u.uFogNear, fogNear);
      gl.uniform1f(P.u.uFogFar, fogFar);
      gl.uniformMatrix4fv(P.u.uMVP, false, vp);
      gl.disable(gl.BLEND);
      gl.uniform1f(P.u.uAlphaTest, 0.5);
      const rd2 = (this.renderDist + 24) * (this.renderDist + 24);
      const visible = [];
      for (const s of this.sections.values()) {
        const x0 = s.sx * 16, y0 = s.sy * 16, z0 = s.sz * 16;
        const dx = x0 + 8 - cam.x, dz = z0 + 8 - cam.z;
        if (dx * dx + dz * dz > rd2) continue;
        if (!boxInFrustum(planes, x0, y0, z0, x0 + 16, y0 + 16, z0 + 16)) continue;
        visible.push(s);
        if (s.n) this.drawBuffer(s.vbo, s.n);
      }
      this.dyn.reset();
      if (scene2.buildDyn) scene2.buildDyn(this.dyn, cam);
      this.drawDyn(this.dyn);
      this.drawClouds(cam, vp, st, fogNear, fogFar);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1f(P.u.uAlphaTest, 0.01);
      gl.uniformMatrix4fv(P.u.uMVP, false, vp);
      visible.sort((a, b) => {
        const da = (a.sx * 16 + 8 - cam.x) ** 2 + (a.sy * 16 + 8 - cam.y) ** 2 + (a.sz * 16 + 8 - cam.z) ** 2;
        const db = (b.sx * 16 + 8 - cam.x) ** 2 + (b.sy * 16 + 8 - cam.y) ** 2 + (b.sz * 16 + 8 - cam.z) ** 2;
        return db - da;
      });
      gl.depthMask(false);
      for (const s of visible) if (s.tn) this.drawBuffer(s.tvbo, s.tn);
      this.dynT.reset();
      if (scene2.buildDynT) scene2.buildDynT(this.dynT, cam);
      gl.blendFunc(gl.DST_COLOR, gl.SRC_COLOR);
      this.drawDyn(this.dynT);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(true);
      if (scene2.selection) this.drawSelection(scene2.selection, vp);
      if (scene2.buildHand) {
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.useProgram(P.p);
        const hp = perspective(70 * Math.PI / 180, W / H, 0.01, 10);
        gl.uniformMatrix4fv(P.u.uMVP, false, hp);
        gl.uniform3f(P.u.uCam, 0, 0, 0);
        gl.uniform1f(P.u.uFogNear, 100);
        gl.uniform1f(P.u.uFogFar, 200);
        gl.uniform1f(P.u.uAlphaTest, 0.5);
        gl.disable(gl.BLEND);
        this.dyn.reset();
        scene2.buildHand(this.dyn);
        this.drawDyn(this.dyn);
      }
      if (scene2.screenTint) this.drawScreenTint(scene2.screenTint);
    }
    drawSky(cam, proj, st) {
      const gl = this.gl, P = this.prog;
      let v = viewMatrix(0, 0, 0, cam.yaw, cam.pitch);
      const mvp = mul(proj, v);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.uniformMatrix4fv(P.u.uMVP, false, mvp);
      gl.uniform1f(P.u.uFogNear, 1e3);
      gl.uniform1f(P.u.uFogFar, 2e3);
      gl.uniform1f(P.u.uAlphaTest, 0.01);
      gl.uniform3f(P.u.uCam, 0, 0, 0);
      const d = this.dyn;
      d.reset();
      const [tu, tv, ts] = tileUV(tex("white"));
      const a = st.ang;
      const sun = [Math.sin(a), Math.cos(a), 0];
      const disc = (dir, size, col) => {
        const c = [dir[0] * 100, dir[1] * 100, dir[2] * 100];
        const up = [0, 0, 1];
        const r = [dir[1] * up[2] - dir[2] * up[1], dir[2] * up[0] - dir[0] * up[2], dir[0] * up[1] - dir[1] * up[0]];
        const u = [r[1] * dir[2] - r[2] * dir[1], r[2] * dir[0] - r[0] * dir[2], r[0] * dir[1] - r[1] * dir[0]];
        const p = (sx, sy) => [c[0] + (r[0] * sx + u[0] * sy) * size, c[1] + (r[1] * sx + u[1] * sy) * size, c[2] + (r[2] * sx + u[2] * sy) * size];
        d.quad(p(-1, 1), p(-1, -1), p(1, -1), p(1, 1), tu, tv, tu + ts, tv + ts, 15, 15, 1, col);
      };
      disc(sun, 12, [255, 240, 160]);
      disc([-sun[0], -sun[1], 0], 8, [220, 220, 240]);
      if (st.day < 0.6) {
        if (!this.stars) {
          this.stars = [];
          let s = 99;
          const rnd2 = () => {
            s = s * 16807 % 2147483647;
            return s / 2147483647;
          };
          for (let i = 0; i < 400; i++) {
            const th = rnd2() * Math.PI * 2, ph = Math.acos(rnd2() * 2 - 1);
            this.stars.push([Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th), 0.25 + rnd2() * 0.35]);
          }
        }
        const alpha = (1 - st.day / 0.6) * 255;
        for (const s of this.stars) {
          const x = s[0] * Math.cos(a) + s[1] * Math.sin(a), y = -s[0] * Math.sin(a) + s[1] * Math.cos(a);
          const dir = [x, y, s[2]];
          const c = [dir[0] * 100, dir[1] * 100, dir[2] * 100];
          const sz = s[3];
          d.quad([c[0] - sz, c[1] + sz, c[2]], [c[0] - sz, c[1] - sz, c[2]], [c[0] + sz, c[1] - sz, c[2]], [c[0] + sz, c[1] + sz, c[2]], tu, tv, tu + ts, tv + ts, 15, 15, 1, [255, 255, 255], alpha);
        }
      }
      this.drawDyn(d);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    drawClouds(cam, vp, st, fogNear, fogFar) {
      const gl = this.gl, P = this.prog;
      const d = this.dyn;
      d.reset();
      const [tu, tv, ts] = tileUV(tex("white"));
      const off = performance.now() / 1e3 * 0.6 % (48 * 12);
      const y = 122;
      const br = Math.max(0.25, st.day);
      const col = [255 * br, 255 * br, 255 * br];
      for (const [cx, cz, w] of this.clouds) {
        const x = cx + off - 96, z = cz - 96;
        if (Math.abs(x - cam.x) > 220 || Math.abs(z - cam.z) > 220) continue;
        d.quad([x, y, z], [x, y, z + 12], [x + w, y, z + 12], [x + w, y, z], tu, tv, tu + ts, tv + ts, 15, 0, 1, col, 200);
      }
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1f(P.u.uFogNear, fogNear * 2);
      gl.uniform1f(P.u.uFogFar, Math.max(fogFar * 2.4, 200));
      gl.uniform1f(P.u.uAlphaTest, 0.01);
      gl.depthMask(false);
      this.drawDyn(d);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.uniform1f(P.u.uFogNear, fogNear);
      gl.uniform1f(P.u.uFogFar, fogFar);
      gl.uniform1f(P.u.uAlphaTest, 0.5);
    }
    drawSelection(sel, vp) {
      const gl = this.gl, L = this.lprog;
      const [x, y, z, bx] = sel;
      const e = 2e-3;
      const x0 = x + bx[0] - e, y0 = y + bx[1] - e, z0 = z + bx[2] - e, x1 = x + bx[3] + e, y1 = y + bx[4] + e, z1 = z + bx[5] + e;
      const v = new Float32Array([
        x0,
        y0,
        z0,
        x1,
        y0,
        z0,
        x1,
        y0,
        z0,
        x1,
        y0,
        z1,
        x1,
        y0,
        z1,
        x0,
        y0,
        z1,
        x0,
        y0,
        z1,
        x0,
        y0,
        z0,
        x0,
        y1,
        z0,
        x1,
        y1,
        z0,
        x1,
        y1,
        z0,
        x1,
        y1,
        z1,
        x1,
        y1,
        z1,
        x0,
        y1,
        z1,
        x0,
        y1,
        z1,
        x0,
        y1,
        z0,
        x0,
        y0,
        z0,
        x0,
        y1,
        z0,
        x1,
        y0,
        z0,
        x1,
        y1,
        z0,
        x1,
        y0,
        z1,
        x1,
        y1,
        z1,
        x0,
        y0,
        z1,
        x0,
        y1,
        z1
      ]);
      gl.useProgram(L.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
      gl.bufferData(gl.ARRAY_BUFFER, v, gl.STREAM_DRAW);
      gl.disableVertexAttribArray(this.prog.a.aUV);
      gl.disableVertexAttribArray(this.prog.a.aLight);
      gl.disableVertexAttribArray(this.prog.a.aTint);
      gl.enableVertexAttribArray(L.a.aPos);
      gl.vertexAttribPointer(L.a.aPos, 3, gl.FLOAT, false, 12, 0);
      gl.uniformMatrix4fv(L.u.uMVP, false, vp);
      gl.uniform4f(L.u.uCol, 0, 0, 0, 0.6);
      gl.enable(gl.BLEND);
      gl.lineWidth(2);
      gl.drawArrays(gl.LINES, 0, 24);
      gl.disable(gl.BLEND);
      gl.useProgram(this.prog.p);
    }
    drawScreenTint(c) {
      const gl = this.gl, L = this.lprog;
      gl.useProgram(L.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0]), gl.STREAM_DRAW);
      gl.disableVertexAttribArray(this.prog.a.aUV);
      gl.disableVertexAttribArray(this.prog.a.aLight);
      gl.disableVertexAttribArray(this.prog.a.aTint);
      gl.enableVertexAttribArray(L.a.aPos);
      gl.vertexAttribPointer(L.a.aPos, 3, gl.FLOAT, false, 12, 0);
      gl.uniformMatrix4fv(L.u.uMVP, false, identity());
      gl.uniform4f(L.u.uCol, c[0], c[1], c[2], c[3]);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      gl.useProgram(this.prog.p);
    }
    dispose() {
      const gl = this.gl;
      for (const s of this.sections.values()) {
        if (s.vbo) gl.deleteBuffer(s.vbo);
        if (s.tvbo) gl.deleteBuffer(s.tvbo);
      }
      this.sections.clear();
    }
  };

  // game/src/items.js
  var I = {
    IRON_SHOVEL: 256,
    IRON_PICKAXE: 257,
    IRON_AXE: 258,
    FLINT_STEEL: 259,
    APPLE: 260,
    BOW: 261,
    ARROW: 262,
    COAL: 263,
    DIAMOND: 264,
    IRON_INGOT: 265,
    GOLD_INGOT: 266,
    IRON_SWORD: 267,
    WOOD_SWORD: 268,
    WOOD_SHOVEL: 269,
    WOOD_PICKAXE: 270,
    WOOD_AXE: 271,
    STONE_SWORD: 272,
    STONE_SHOVEL: 273,
    STONE_PICKAXE: 274,
    STONE_AXE: 275,
    DIAMOND_SWORD: 276,
    DIAMOND_SHOVEL: 277,
    DIAMOND_PICKAXE: 278,
    DIAMOND_AXE: 279,
    STICK: 280,
    BOWL: 281,
    MUSHROOM_STEW: 282,
    GOLD_SWORD: 283,
    GOLD_SHOVEL: 284,
    GOLD_PICKAXE: 285,
    GOLD_AXE: 286,
    STRING: 287,
    FEATHER: 288,
    GUNPOWDER: 289,
    WOOD_HOE: 290,
    STONE_HOE: 291,
    IRON_HOE: 292,
    DIAMOND_HOE: 293,
    GOLD_HOE: 294,
    SEEDS: 295,
    WHEAT: 296,
    BREAD: 297,
    FLINT: 318,
    PORKCHOP: 319,
    COOKED_PORKCHOP: 320,
    PAINTING: 321,
    DOOR: 324,
    SNOWBALL: 332,
    LEATHER: 334,
    BRICK: 336,
    CLAY_BALL: 337,
    SUGARCANE: 338,
    PAPER: 339,
    BOOK: 340,
    EGG: 344,
    GLOWSTONE_DUST: 348,
    DYE: 351,
    BONE: 352,
    SUGAR: 353,
    BED: 355,
    SHEARS: 359,
    MELON_SLICE: 360,
    PUMPKIN_SEEDS: 361,
    MELON_SEEDS: 362,
    BEEF: 363,
    STEAK: 364,
    CHICKEN: 365,
    COOKED_CHICKEN: 366
  };
  var items = /* @__PURE__ */ new Map();
  var TIERS = {
    wood: { tier: 0, speed: 2, dur: 60, dmg: 4 },
    stone: { tier: 1, speed: 4, dur: 132, dmg: 5 },
    iron: { tier: 2, speed: 6, dur: 251, dmg: 6 },
    diamond: { tier: 3, speed: 8, dur: 1562, dmg: 7 },
    gold: { tier: 0, speed: 12, dur: 33, dmg: 4 }
  };
  function item(id, name, icon, props = {}) {
    const it = Object.assign({ id, name, icon, maxStack: 64 }, props);
    items.set(id, it);
    return it;
  }
  var toolIds = {
    wood: [I.WOOD_SWORD, I.WOOD_SHOVEL, I.WOOD_PICKAXE, I.WOOD_AXE, I.WOOD_HOE],
    stone: [I.STONE_SWORD, I.STONE_SHOVEL, I.STONE_PICKAXE, I.STONE_AXE, I.STONE_HOE],
    iron: [I.IRON_SWORD, I.IRON_SHOVEL, I.IRON_PICKAXE, I.IRON_AXE, I.IRON_HOE],
    gold: [I.GOLD_SWORD, I.GOLD_SHOVEL, I.GOLD_PICKAXE, I.GOLD_AXE, I.GOLD_HOE],
    diamond: [I.DIAMOND_SWORD, I.DIAMOND_SHOVEL, I.DIAMOND_PICKAXE, I.DIAMOND_AXE, I.DIAMOND_HOE]
  };
  var matName = { wood: "Wooden", stone: "Stone", iron: "Iron", gold: "Golden", diamond: "Diamond" };
  var kinds = ["sword", "shovel", "pickaxe", "axe", "hoe"];
  for (const m of Object.keys(toolIds)) {
    toolIds[m].forEach((id, k) => {
      const kind = kinds[k];
      const t = TIERS[m];
      item(id, `${matName[m]} ${kind[0].toUpperCase() + kind.slice(1)}`, `${m}_${kind}`, {
        maxStack: 1,
        tool: kind,
        tier: t.tier,
        speed: t.speed,
        durability: t.dur,
        damage: kind === "sword" ? t.dmg : kind === "axe" ? t.dmg - 1 : kind === "pickaxe" ? t.dmg - 2 : t.dmg - 3
      });
    });
  }
  item(I.FLINT_STEEL, "Flint and Steel", "flint_steel", { maxStack: 1, durability: 65, use: "ignite" });
  item(I.APPLE, "Apple", "apple", { food: 4 });
  item(I.BOW, "Bow", "bow", { maxStack: 1, durability: 385, use: "bow" });
  item(I.ARROW, "Arrow", "arrow");
  item(I.COAL, "Coal", "coal");
  item(I.DIAMOND, "Diamond", "diamond");
  item(I.IRON_INGOT, "Iron Ingot", "iron_ingot");
  item(I.GOLD_INGOT, "Gold Ingot", "gold_ingot");
  item(I.STICK, "Stick", "stick");
  item(I.BOWL, "Bowl", "bowl");
  item(I.MUSHROOM_STEW, "Mushroom Stew", "mushroom_stew", { maxStack: 1, food: 10, leaves: I.BOWL });
  item(I.STRING, "String", "string");
  item(I.FEATHER, "Feather", "feather");
  item(I.GUNPOWDER, "Gunpowder", "gunpowder");
  item(I.SEEDS, "Seeds", "seeds", { plant: B.WHEAT });
  item(I.WHEAT, "Wheat", "wheat");
  item(I.BREAD, "Bread", "bread", { food: 5 });
  item(I.FLINT, "Flint", "flint");
  item(I.PORKCHOP, "Raw Porkchop", "porkchop_raw", { food: 3 });
  item(I.COOKED_PORKCHOP, "Cooked Porkchop", "porkchop_cooked", { food: 8 });
  item(I.PAINTING, "Painting", "painting", { use: "painting" });
  item(I.DOOR, "Wooden Door", "door_item", { maxStack: 1, use: "door" });
  item(I.SNOWBALL, "Snowball", "snowball", { maxStack: 16, use: "throw" });
  item(I.LEATHER, "Leather", "leather");
  item(I.BRICK, "Brick", "brick");
  item(I.CLAY_BALL, "Clay", "clay_ball");
  item(I.SUGARCANE, "Sugar Canes", "sugarcane_item", { plantCane: true });
  item(I.PAPER, "Paper", "paper");
  item(I.BOOK, "Book", "book");
  item(I.EGG, "Egg", "egg", { maxStack: 16, use: "throw" });
  item(I.GLOWSTONE_DUST, "Glowstone Dust", "glowstone_dust");
  item(I.BONE, "Bone", "bone");
  item(I.SUGAR, "Sugar", "sugar");
  item(I.BED, "Bed", "bed_item", { maxStack: 1, use: "bed" });
  item(I.SHEARS, "Shears", "shears", { maxStack: 1, durability: 238, tool: "shears", speed: 5 });
  item(I.MELON_SLICE, "Melon", "melon_slice", { food: 2 });
  item(I.PUMPKIN_SEEDS, "Pumpkin Seeds", "pumpkin_seeds", { plant: B.PUMPKIN_STEM });
  item(I.MELON_SEEDS, "Melon Seeds", "melon_seeds", { plant: B.MELON_STEM });
  item(I.BEEF, "Raw Beef", "beef_raw", { food: 3 });
  item(I.STEAK, "Steak", "steak", { food: 8 });
  item(I.CHICKEN, "Raw Chicken", "chicken_raw", { food: 2 });
  item(I.COOKED_CHICKEN, "Cooked Chicken", "chicken_cooked", { food: 6 });
  var DYE_NAMES = ["Ink Sac", "Rose Red", "Cactus Green", "Cocoa Beans", "Lapis Lazuli", "Purple Dye", "Cyan Dye", "Light Gray Dye", "Gray Dye", "Pink Dye", "Lime Dye", "Dandelion Yellow", "Light Blue Dye", "Magenta Dye", "Orange Dye", "Bone Meal"];
  item(I.DYE, "Dye", "dye_0", { iconFn: (m) => "dye_" + (m & 15), nameFn: (m) => DYE_NAMES[m & 15] });
  function isBlockItem(id) {
    return id > 0 && id < 256 && !!blocks[id];
  }
  function getItem(id) {
    return items.get(id);
  }
  function itemName(id, meta = 0) {
    if (id < 256) return blockName(id, meta);
    const it = items.get(id);
    if (!it) return "Unknown";
    return it.nameFn ? it.nameFn(meta) : it.name;
  }
  function maxStack(id) {
    if (id < 256) return 64;
    const it = items.get(id);
    return it ? it.maxStack : 64;
  }
  function itemIconTile(id, meta = 0) {
    const it = items.get(id);
    if (!it) return 0;
    return tex(it.iconFn ? it.iconFn(meta) : it.icon);
  }
  function blockIconIsFlat(id) {
    const b = blocks[id];
    if (!b) return true;
    return [2, 3, 8, 12, 15, 7, 18, 17].includes(b.render);
  }
  var recipes = [];
  function rec(cat, out, ins, table = true) {
    recipes.push({ id: recipes.length, cat, out, in: ins, table });
  }
  var ANY = -1;
  rec("Blocks", [B.PLANKS, 4, 0], [[B.LOG, 1, ANY]], false);
  rec("Items", [I.STICK, 4, 0], [[B.PLANKS, 2, ANY]], false);
  rec("Blocks", [B.WORKBENCH, 1, 0], [[B.PLANKS, 4, ANY]], false);
  rec("Blocks", [B.TORCH, 4, 0], [[I.STICK, 1, 0], [I.COAL, 1, ANY]], false);
  rec("Blocks", [B.SANDSTONE, 1, 0], [[B.SAND, 4, 0]], false);
  rec("Blocks", [B.STONE_BRICKS, 4, 0], [[B.STONE, 4, 0]], false);
  rec("Blocks", [B.WOOL, 1, 0], [[I.STRING, 4, 0]], false);
  rec("Blocks", [B.SNOW, 1, 0], [[I.SNOWBALL, 4, 0]], false);
  rec("Blocks", [B.CLAY, 1, 0], [[I.CLAY_BALL, 4, 0]], false);
  rec("Blocks", [B.BRICKS, 1, 0], [[I.BRICK, 4, 0]], false);
  rec("Blocks", [B.GLOWSTONE, 1, 0], [[I.GLOWSTONE_DUST, 4, 0]], false);
  rec("Blocks", [B.FURNACE, 1, 0], [[B.COBBLE, 8, 0]]);
  rec("Blocks", [B.CHEST, 1, 0], [[B.PLANKS, 8, ANY]]);
  rec("Blocks", [B.TNT, 1, 0], [[I.GUNPOWDER, 5, 0], [B.SAND, 4, 0]]);
  rec("Blocks", [B.BOOKSHELF, 1, 0], [[B.PLANKS, 6, ANY], [I.BOOK, 3, 0]]);
  rec("Blocks", [B.GOLD_BLOCK, 1, 0], [[I.GOLD_INGOT, 9, 0]]);
  rec("Blocks", [B.IRON_BLOCK, 1, 0], [[I.IRON_INGOT, 9, 0]]);
  rec("Blocks", [B.DIAMOND_BLOCK, 1, 0], [[I.DIAMOND, 9, 0]]);
  rec("Blocks", [B.LAPIS_BLOCK, 1, 0], [[I.DYE, 9, 4]]);
  rec("Blocks", [B.MELON, 1, 0], [[I.MELON_SLICE, 9, 0]]);
  rec("Blocks", [B.REACTOR, 1, 0], [[I.DIAMOND, 3, 0], [I.IRON_INGOT, 6, 0]]);
  rec("Items", [I.GOLD_INGOT, 9, 0], [[B.GOLD_BLOCK, 1, 0]]);
  rec("Items", [I.IRON_INGOT, 9, 0], [[B.IRON_BLOCK, 1, 0]]);
  rec("Items", [I.DIAMOND, 9, 0], [[B.DIAMOND_BLOCK, 1, 0]]);
  rec("Items", [I.DYE, 9, 4], [[B.LAPIS_BLOCK, 1, 0]]);
  var slabMats = [[B.STONE, 0], [B.SANDSTONE, 1], [B.PLANKS, 2], [B.COBBLE, 3], [B.BRICKS, 4], [B.STONE_BRICKS, 5]];
  for (const [mat, m] of slabMats) rec("Blocks", [B.SLAB, 6, m], [[mat, 3, mat === B.PLANKS ? ANY : 0]]);
  var stairMats = [[B.PLANKS, B.WOOD_STAIRS], [B.COBBLE, B.COBBLE_STAIRS], [B.BRICKS, B.BRICK_STAIRS], [B.STONE_BRICKS, B.STONEBRICK_STAIRS], [B.SANDSTONE, B.SANDSTONE_STAIRS], [B.NETHER_BRICK, B.NETHERBRICK_STAIRS]];
  for (const [mat, s] of stairMats) rec("Blocks", [s, 4, 0], [[mat, 6, mat === B.PLANKS ? ANY : 0]]);
  rec("Decoration", [B.FENCE, 2, 0], [[I.STICK, 6, 0]]);
  rec("Decoration", [B.FENCE_GATE, 1, 0], [[I.STICK, 4, 0], [B.PLANKS, 2, ANY]]);
  rec("Decoration", [B.LADDER, 3, 0], [[I.STICK, 7, 0]]);
  rec("Decoration", [I.DOOR, 1, 0], [[B.PLANKS, 6, ANY]]);
  rec("Decoration", [B.TRAPDOOR, 2, 0], [[B.PLANKS, 6, ANY]]);
  rec("Decoration", [I.BED, 1, 0], [[B.WOOL, 3, ANY], [B.PLANKS, 3, ANY]]);
  rec("Decoration", [I.PAINTING, 1, 0], [[I.STICK, 8, 0], [B.WOOL, 1, ANY]]);
  for (let c = 1; c < 16; c++) rec("Decoration", [B.WOOL, 1, c], [[I.DYE, 1, 15 - c], [B.WOOL, 1, 0]], false);
  var toolMats = { wood: [B.PLANKS, ANY], stone: [B.COBBLE, 0], iron: [I.IRON_INGOT, 0], gold: [I.GOLD_INGOT, 0], diamond: [I.DIAMOND, 0] };
  for (const m of Object.keys(toolMats)) {
    const [mat, mm2] = toolMats[m];
    const [sw, sh, pk, ax, ho] = toolIds[m];
    rec("Tools", [pk, 1, 0], [[mat, 3, mm2], [I.STICK, 2, 0]]);
    rec("Tools", [ax, 1, 0], [[mat, 3, mm2], [I.STICK, 2, 0]]);
    rec("Tools", [sh, 1, 0], [[mat, 1, mm2], [I.STICK, 2, 0]]);
    rec("Tools", [ho, 1, 0], [[mat, 2, mm2], [I.STICK, 2, 0]]);
    rec("Tools", [sw, 1, 0], [[mat, 2, mm2], [I.STICK, 1, 0]]);
  }
  rec("Tools", [I.BOW, 1, 0], [[I.STICK, 3, 0], [I.STRING, 3, 0]]);
  rec("Tools", [I.ARROW, 4, 0], [[I.FLINT, 1, 0], [I.STICK, 1, 0], [I.FEATHER, 1, 0]]);
  rec("Tools", [I.SHEARS, 1, 0], [[I.IRON_INGOT, 2, 0]], false);
  rec("Tools", [I.FLINT_STEEL, 1, 0], [[I.IRON_INGOT, 1, 0], [I.FLINT, 1, 0]], false);
  rec("Items", [I.BOWL, 4, 0], [[B.PLANKS, 3, ANY]]);
  rec("Food", [I.BREAD, 1, 0], [[I.WHEAT, 3, 0]]);
  rec("Food", [I.MUSHROOM_STEW, 1, 0], [[I.BOWL, 1, 0], [B.BROWN_MUSHROOM, 1, 0], [B.RED_MUSHROOM, 1, 0]], false);
  rec("Items", [I.SUGAR, 1, 0], [[I.SUGARCANE, 1, 0]], false);
  rec("Items", [I.PAPER, 3, 0], [[I.SUGARCANE, 3, 0]]);
  rec("Items", [I.BOOK, 1, 0], [[I.PAPER, 3, 0]], false);
  rec("Items", [I.PUMPKIN_SEEDS, 4, 0], [[B.PUMPKIN, 1, 0]], false);
  rec("Items", [I.MELON_SEEDS, 1, 0], [[I.MELON_SLICE, 1, 0]], false);
  rec("Items", [I.DYE, 3, 15], [[I.BONE, 1, 0]], false);
  rec("Items", [I.DYE, 2, 1], [[B.ROSE, 1, 0]], false);
  rec("Items", [I.DYE, 2, 11], [[B.DANDELION, 1, 0]], false);
  rec("Items", [I.DYE, 2, 14], [[I.DYE, 1, 1], [I.DYE, 1, 11]], false);
  rec("Items", [I.DYE, 2, 9], [[I.DYE, 1, 1], [I.DYE, 1, 15]], false);
  rec("Items", [I.DYE, 2, 10], [[I.DYE, 1, 2], [I.DYE, 1, 15]], false);
  rec("Items", [I.DYE, 2, 8], [[I.DYE, 1, 0], [I.DYE, 1, 15]], false);
  rec("Items", [I.DYE, 2, 7], [[I.DYE, 1, 8], [I.DYE, 1, 15]], false);
  rec("Items", [I.DYE, 2, 12], [[I.DYE, 1, 4], [I.DYE, 1, 15]], false);
  rec("Items", [I.DYE, 2, 6], [[I.DYE, 1, 4], [I.DYE, 1, 2]], false);
  rec("Items", [I.DYE, 2, 5], [[I.DYE, 1, 4], [I.DYE, 1, 1]], false);
  rec("Items", [I.DYE, 2, 13], [[I.DYE, 1, 5], [I.DYE, 1, 9]], false);
  var smelting = /* @__PURE__ */ new Map([
    [B.COBBLE, [B.STONE, 1, 0]],
    [B.SAND, [B.GLASS, 1, 0]],
    [B.IRON_ORE, [I.IRON_INGOT, 1, 0]],
    [B.GOLD_ORE, [I.GOLD_INGOT, 1, 0]],
    [B.LOG, [I.COAL, 1, 1]],
    [B.CACTUS, [I.DYE, 1, 2]],
    [I.PORKCHOP, [I.COOKED_PORKCHOP, 1, 0]],
    [I.BEEF, [I.STEAK, 1, 0]],
    [I.CHICKEN, [I.COOKED_CHICKEN, 1, 0]],
    [I.CLAY_BALL, [I.BRICK, 1, 0]],
    [B.DIAMOND_ORE, [I.DIAMOND, 1, 0]],
    [B.NETHERRACK, [B.NETHER_BRICK, 1, 0]],
    [B.COAL_ORE, [I.COAL, 1, 0]],
    [B.LAPIS_ORE, [I.DYE, 1, 4]]
  ]);
  function fuelTime(id) {
    if (id === I.COAL) return 1600;
    if (id === B.LOG || id === B.PLANKS || id === B.WORKBENCH || id === B.CHEST || id === B.BOOKSHELF || id === B.FENCE || id === B.WOOD_STAIRS || id === B.TRAPDOOR || id === B.FENCE_GATE) return 300;
    if (id === B.SLAB) return 150;
    if (id === I.STICK || id === B.SAPLING || id === I.BOWL) return 100;
    if (id === I.WOOD_AXE || id === I.WOOD_PICKAXE || id === I.WOOD_SHOVEL || id === I.WOOD_SWORD || id === I.WOOD_HOE || id === I.BOW) return 200;
    if (id === B.LAVA || id === B.STILL_LAVA) return 2e4;
    return 0;
  }
  var CREATIVE = [];
  function cr(id, meta = 0) {
    CREATIVE.push([id, meta]);
  }
  [
    B.STONE,
    B.COBBLE,
    B.MOSSY_COBBLE,
    B.STONE_BRICKS,
    B.BRICKS,
    B.SANDSTONE,
    B.GRASS,
    B.DIRT,
    B.SAND,
    B.GRAVEL,
    B.CLAY,
    B.PLANKS
  ].forEach((i) => cr(i));
  [0, 1, 2].forEach((m) => cr(B.LOG, m));
  [0, 1, 2].forEach((m) => cr(B.LEAVES, m));
  [
    B.GLASS,
    B.OBSIDIAN,
    B.BEDROCK,
    B.NETHERRACK,
    B.NETHER_BRICK,
    B.GLOWSTONE,
    B.GLOWING_OBSIDIAN,
    B.REACTOR,
    B.COAL_ORE,
    B.IRON_ORE,
    B.GOLD_ORE,
    B.DIAMOND_ORE,
    B.LAPIS_ORE,
    B.REDSTONE_ORE,
    B.IRON_BLOCK,
    B.GOLD_BLOCK,
    B.DIAMOND_BLOCK,
    B.LAPIS_BLOCK,
    B.SNOW,
    B.ICE,
    B.SNOW_LAYER,
    B.CACTUS,
    B.PUMPKIN,
    B.MELON,
    B.TNT,
    B.BOOKSHELF,
    B.WORKBENCH,
    B.FURNACE,
    B.CHEST
  ].forEach((i) => cr(i));
  for (let m = 0; m < 6; m++) cr(B.SLAB, m);
  [
    B.WOOD_STAIRS,
    B.COBBLE_STAIRS,
    B.BRICK_STAIRS,
    B.STONEBRICK_STAIRS,
    B.SANDSTONE_STAIRS,
    B.NETHERBRICK_STAIRS,
    B.FENCE,
    B.FENCE_GATE,
    B.LADDER,
    B.TRAPDOOR,
    I.DOOR,
    I.BED,
    I.PAINTING,
    B.TORCH
  ].forEach((i) => cr(i));
  for (let m = 0; m < 16; m++) cr(B.WOOL, m);
  [0, 1, 2].forEach((m) => cr(B.SAPLING, m));
  [B.TALLGRASS, B.DEADBUSH, B.DANDELION, B.ROSE, B.BROWN_MUSHROOM, B.RED_MUSHROOM, B.COBWEB, I.SUGARCANE, I.SEEDS, I.PUMPKIN_SEEDS, I.MELON_SEEDS].forEach((i) => cr(i));
  for (const m of ["wood", "stone", "iron", "gold", "diamond"]) toolIds[m].forEach((i) => cr(i));
  [
    I.BOW,
    I.ARROW,
    I.SHEARS,
    I.FLINT_STEEL,
    I.SNOWBALL,
    I.EGG,
    I.COAL,
    I.IRON_INGOT,
    I.GOLD_INGOT,
    I.DIAMOND,
    I.STICK,
    I.BOWL,
    I.STRING,
    I.FEATHER,
    I.GUNPOWDER,
    I.FLINT,
    I.LEATHER,
    I.BRICK,
    I.CLAY_BALL,
    I.PAPER,
    I.BOOK,
    I.GLOWSTONE_DUST,
    I.BONE,
    I.SUGAR,
    I.WHEAT,
    I.APPLE,
    I.BREAD,
    I.MUSHROOM_STEW,
    I.MELON_SLICE,
    I.PORKCHOP,
    I.COOKED_PORKCHOP,
    I.BEEF,
    I.STEAK,
    I.CHICKEN,
    I.COOKED_CHICKEN
  ].forEach((i) => cr(i));
  for (let m = 0; m < 16; m++) cr(I.DYE, m);
  var Inventory = class {
    constructor(size) {
      this.size = size;
      this.slots = new Array(size).fill(null);
    }
    // slot: {id, count, meta, dmg}
    add(id, count, meta = 0, dmg = 0) {
      const ms = maxStack(id);
      for (let i = 0; i < this.size && count > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === id && s.meta === meta && s.count < ms && !s.dmg && !dmg) {
          const n = Math.min(ms - s.count, count);
          s.count += n;
          count -= n;
        }
      }
      for (let i = 0; i < this.size && count > 0; i++) {
        if (!this.slots[i]) {
          const n = Math.min(ms, count);
          this.slots[i] = { id, count: n, meta, dmg };
          count -= n;
        }
      }
      return count;
    }
    count(id, meta = -1) {
      let n = 0;
      for (const s of this.slots) if (s && s.id === id && (meta < 0 || s.meta === meta)) n += s.count;
      return n;
    }
    remove(id, count, meta = -1) {
      for (let i = this.size - 1; i >= 0 && count > 0; i--) {
        const s = this.slots[i];
        if (s && s.id === id && (meta < 0 || s.meta === meta)) {
          const n = Math.min(s.count, count);
          s.count -= n;
          count -= n;
          if (s.count <= 0) this.slots[i] = null;
        }
      }
      return count === 0;
    }
    toJSON() {
      return this.slots.map((s) => s ? [s.id, s.count, s.meta, s.dmg || 0] : 0);
    }
    load(arr) {
      this.slots = new Array(this.size).fill(null);
      if (!arr) return;
      arr.forEach((s, i) => {
        if (s && i < this.size) this.slots[i] = { id: s[0], count: s[1], meta: s[2] || 0, dmg: s[3] || 0 };
      });
    }
  };
  function canCraft(inv, r, haveTable) {
    if (r.table && !haveTable) return false;
    for (const [id, n, m] of r.in) if (inv.count(id, m) < n) return false;
    return true;
  }

  // game/src/entities.js
  var NEXT_ID = 1;
  function setNextId(n) {
    NEXT_ID = Math.max(NEXT_ID, n);
  }
  var Entity = class {
    constructor(type, x, y, z) {
      this.id = NEXT_ID++;
      this.type = type;
      this.x = x;
      this.y = y;
      this.z = z;
      this.px = x;
      this.py = y;
      this.pz = z;
      this.vx = 0;
      this.vy = 0;
      this.vz = 0;
      this.yaw = 0;
      this.pitch = 0;
      this.pyaw = 0;
      this.w = 0.6;
      this.h = 1.8;
      this.onGround = false;
      this.inWater = false;
      this.inLava = false;
      this.horizCollide = false;
      this.health = 10;
      this.maxHealth = 10;
      this.hurtTime = 0;
      this.deathTime = 0;
      this.invuln = 0;
      this.fire = 0;
      this.air = 300;
      this.fallDist = 0;
      this.age = 0;
      this.removed = false;
      this.walkAnim = 0;
      this.walkAmt = 0;
      this.stepHeight = 0.5;
      this.noGravity = false;
      this.living = false;
    }
    get bbox() {
      const hw = this.w / 2;
      return [this.x - hw, this.y, this.z - hw, this.x + hw, this.y + this.h, this.z + hw];
    }
    dist2(o) {
      const dx = this.x - o.x, dy = this.y - o.y, dz = this.z - o.z;
      return dx * dx + dy * dy + dz * dz;
    }
    savePrev() {
      this.px = this.x;
      this.py = this.y;
      this.pz = this.z;
      this.pyaw = this.yaw;
    }
    // network snapshot fields beyond position
    extra() {
      return null;
    }
    applyExtra(x) {
    }
    toSave() {
      return { t: this.type, x: this.x, y: this.y, z: this.z, yaw: this.yaw, hp: this.health, ex: this.extra() };
    }
  };
  function gatherBoxes(world, x0, y0, z0, x1, y1, z1) {
    const out = [];
    const bx0 = Math.floor(x0), by0 = Math.floor(y0) - 1, bz0 = Math.floor(z0), bx1 = Math.floor(x1), by1 = Math.floor(y1), bz1 = Math.floor(z1);
    for (let x = bx0; x <= bx1; x++) for (let z = bz0; z <= bz1; z++) for (let y = by0; y <= by1; y++) {
      const id = world.getBlockColl(x, y, z);
      if (!id || !SOLID[id]) continue;
      const boxes = collisionBoxes(world, x, y, z, id, world.getMeta(x, y, z));
      if (!boxes) continue;
      for (const b of boxes) out.push([x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]);
    }
    return out;
  }
  function clipAxis(boxes, bb, d, axis) {
    const a0 = axis, a1 = axis + 3;
    const o1 = (axis + 1) % 3, o2 = (axis + 2) % 3;
    for (const b of boxes) {
      if (bb[o1 + 3] <= b[o1] || bb[o1] >= b[o1 + 3] || bb[o2 + 3] <= b[o2] || bb[o2] >= b[o2 + 3]) continue;
      if (d > 0 && bb[a1] <= b[a0]) {
        const m = b[a0] - bb[a1];
        if (m < d) d = m;
      } else if (d < 0 && bb[a0] >= b[a1]) {
        const m = b[a1] - bb[a0];
        if (m > d) d = m;
      }
    }
    return d;
  }
  function moveEntity(world, e, dx, dy, dz, sneaking = false) {
    const hw = e.w / 2;
    let bb = [e.x - hw, e.y, e.z - hw, e.x + hw, e.y + e.h, e.z + hw];
    const ox = dx, oy = dy, oz = dz;
    if (sneaking && e.onGround) {
      const step = 0.05;
      const hasFloor = (bx, bz) => gatherBoxes(world, bb[0] + bx, bb[1] - 1, bb[2] + bz, bb[3] + bx, bb[1] - 0.01, bb[5] + bz).some((b) => b[4] > bb[1] - 1 && b[0] < bb[3] + bx && b[3] > bb[0] + bx && b[2] < bb[5] + bz && b[5] > bb[2] + bz);
      while (dx !== 0 && !hasFloor(dx, 0)) {
        if (Math.abs(dx) < step) dx = 0;
        else dx -= Math.sign(dx) * step;
      }
      while (dz !== 0 && !hasFloor(0, dz)) {
        if (Math.abs(dz) < step) dz = 0;
        else dz -= Math.sign(dz) * step;
      }
      while (dx !== 0 && dz !== 0 && !hasFloor(dx, dz)) {
        if (Math.abs(dx) < step) dx = 0;
        else dx -= Math.sign(dx) * step;
        if (Math.abs(dz) < step) dz = 0;
        else dz -= Math.sign(dz) * step;
      }
    }
    const boxes = gatherBoxes(world, Math.min(bb[0], bb[0] + dx) - 1, Math.min(bb[1], bb[1] + dy) - 1, Math.min(bb[2], bb[2] + dz) - 1, Math.max(bb[3], bb[3] + dx) + 1, Math.max(bb[4], bb[4] + dy) + 1, Math.max(bb[5], bb[5] + dz) + 1);
    const orig = bb.slice();
    const tryMove = (bb2, dx2, dy2, dz2) => {
      dy2 = clipAxis(boxes, bb2, dy2, 1);
      bb2[1] += dy2;
      bb2[4] += dy2;
      dx2 = clipAxis(boxes, bb2, dx2, 0);
      bb2[0] += dx2;
      bb2[3] += dx2;
      dz2 = clipAxis(boxes, bb2, dz2, 2);
      bb2[2] += dz2;
      bb2[5] += dz2;
      return [dx2, dy2, dz2];
    };
    let [rx, ry, rz] = tryMove(bb, dx, dy, dz);
    const onGroundNow = oy !== ry && oy < 0;
    if (e.stepHeight > 0 && (onGroundNow || e.onGround) && (rx !== dx || rz !== dz)) {
      const bb2 = orig.slice();
      let sy = clipAxis(boxes, bb2, e.stepHeight, 1);
      bb2[1] += sy;
      bb2[4] += sy;
      const sx = clipAxis(boxes, bb2, dx, 0);
      bb2[0] += sx;
      bb2[3] += sx;
      const sz = clipAxis(boxes, bb2, dz, 2);
      bb2[2] += sz;
      bb2[5] += sz;
      const down = clipAxis(boxes, bb2, -sy + (dy < 0 ? dy : 0), 1);
      bb2[1] += down;
      bb2[4] += down;
      if (sx * sx + sz * sz > rx * rx + rz * rz + 1e-6) {
        bb = bb2;
        rx = sx;
        rz = sz;
        ry = sy + down;
      }
    }
    e.x = (bb[0] + bb[3]) / 2;
    e.y = bb[1];
    e.z = (bb[2] + bb[5]) / 2;
    e.horizCollide = rx !== dx || rz !== dz;
    e.vertCollide = ry !== oy;
    e.onGround = oy !== ry && oy < 0;
    if (rx !== dx) e.vx = 0;
    if (rz !== dz) e.vz = 0;
    if (ry !== oy) e.vy = 0;
    return e.onGround;
  }
  function liquidAt(world, e) {
    const hw = e.w / 2 - 1e-3;
    let water = false, lava = false, web = false, ladder = false, cactus = false;
    const x0 = Math.floor(e.x - hw), x1 = Math.floor(e.x + hw), z0 = Math.floor(e.z - hw), z1 = Math.floor(e.z + hw);
    const y0 = Math.floor(e.y + 0.1), y1 = Math.floor(e.y + e.h * 0.6);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) {
      const id = world.getBlock(x, y, z);
      if (isWater(id)) water = true;
      else if (isLava(id)) lava = true;
      else if (id === B.COBWEB) web = true;
    }
    for (let x = Math.floor(e.x - hw - 0.05); x <= Math.floor(e.x + hw + 0.05); x++) for (let z = Math.floor(e.z - hw - 0.05); z <= Math.floor(e.z + hw + 0.05); z++) {
      for (let y = Math.floor(e.y); y <= Math.floor(e.y + e.h - 0.1); y++) {
        const id = world.getBlock(x, y, z);
        if (id === B.CACTUS) cactus = true;
      }
    }
    const lid = world.getBlock(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z));
    const lid2 = world.getBlock(Math.floor(e.x), Math.floor(e.y + 1), Math.floor(e.z));
    if (lid === B.LADDER || lid2 === B.LADDER) ladder = true;
    return { water, lava, web, ladder, cactus };
  }
  function livingPhysics(world, e, input, flying = false, sneak = false) {
    const env2 = liquidAt(world, e);
    e.inWater = env2.water;
    e.inLava = env2.lava;
    let { fwd = 0, strafe = 0, jump = false, speed = 0.1 } = input;
    const yaw = e.yaw;
    const accel = (a) => {
      let d = fwd * fwd + strafe * strafe;
      if (d < 1e-4) return;
      d = Math.sqrt(d);
      if (d < 1) d = 1;
      const f = a / d;
      const s = Math.sin(yaw), c = Math.cos(yaw);
      e.vx += (fwd * s + strafe * c) * f;
      e.vz += (-fwd * c + strafe * s) * f;
    };
    if (flying) {
      accel(speed * 1);
      e.vy *= 0.6;
      if (jump) e.vy += 0.15;
      if (sneak) e.vy -= 0.15;
      moveEntity(world, e, e.vx, e.vy, e.vz);
      e.vx *= 0.91;
      e.vz *= 0.91;
      e.fallDist = 0;
      return env2;
    }
    if (env2.water || env2.lava) {
      const y0 = e.y;
      accel(0.02);
      if (jump) e.vy += 0.04;
      moveEntity(world, e, e.vx, e.vy, e.vz, false);
      const drag = env2.water ? 0.8 : 0.5;
      e.vx *= drag;
      e.vy *= drag;
      e.vz *= drag;
      e.vy -= 0.02;
      if (e.horizCollide && jump) e.vy = 0.3;
      e.fallDist = 0;
    } else {
      let slip = 0.91;
      if (e.onGround) {
        const bid = world.getBlock(Math.floor(e.x), Math.floor(e.y - 0.5), Math.floor(e.z));
        slip = (blocks[bid] ? blocks[bid].friction : 0.6) * 0.91;
      }
      const a = e.onGround ? speed * (0.16277136 / (slip * slip * slip)) : 0.02;
      accel(a);
      if (env2.ladder) {
        e.vx = Math.max(-0.15, Math.min(0.15, e.vx));
        e.vz = Math.max(-0.15, Math.min(0.15, e.vz));
        e.fallDist = 0;
        if (e.vy < -0.15) e.vy = -0.15;
        if (sneak && e.vy < 0) e.vy = 0;
      }
      if (jump && e.onGround) {
        e.vy = 0.42;
      }
      if (env2.web) {
        e.vx *= 0.25;
        e.vy *= 0.05;
        e.vz *= 0.25;
        e.fallDist = 0;
      }
      const preVy = e.vy;
      moveEntity(world, e, e.vx, e.vy, e.vz, sneak);
      if (env2.ladder && (e.horizCollide || jump)) e.vy = 0.2;
      if (!e.onGround && preVy < 0) e.fallDist -= preVy;
      e.vy -= 0.08;
      e.vy *= 0.98;
      e.vx *= slip;
      e.vz *= slip;
    }
    return env2;
  }
  var Living = class extends Entity {
    constructor(type, x, y, z) {
      super(type, x, y, z);
      this.living = true;
      this.ryaw = 0;
      this.attackCooldown = 0;
      this.knock = null;
    }
    damage(game, amount, src) {
      if (this.health <= 0 || this.invuln > 0 || this.removed) return false;
      if (this.type === "player" && this.mode === "creative" && !(src && src.void)) return false;
      this.health -= amount;
      this.hurtTime = 10;
      this.invuln = 10;
      if (src && src.entity) {
        const dx = this.x - src.entity.x, dz = this.z - src.entity.z, d = Math.hypot(dx, dz) || 1;
        const k = src.knock !== void 0 ? src.knock : 0.4;
        this.vx += dx / d * k;
        this.vz += dz / d * k;
        this.vy = Math.max(this.vy, 0.3);
        if (this.onHurtBy) this.onHurtBy(game, src.entity);
      }
      game.fx({ k: "hurt", id: this.id, type: this.type, x: this.x, y: this.y, z: this.z });
      if (this.health <= 0) this.die(game, src);
      return true;
    }
    die(game, src) {
      this.deathTime = 1;
      if (this.type === "player" && game.authority) {
        game.playerDied(this);
        return;
      }
      if (this.drops && game.authority) {
        for (const [id, n, m] of this.drops(game.rand)) if (n > 0) game.spawnItem(this.x, this.y + 0.5, this.z, id, n, m || 0);
      }
    }
    baseTick(game) {
      this.age++;
      if (this.hurtTime > 0) this.hurtTime--;
      if (this.invuln > 0) this.invuln--;
      if (this.attackCooldown > 0) this.attackCooldown--;
      if (this.deathTime > 0) {
        this.deathTime++;
        if (this.deathTime > 20 && this.type !== "player") this.removed = true;
        return false;
      }
      const w = game.world;
      if (this.inLava) {
        this.fire = 300;
        if (this.age % 10 === 0) this.damage(game, 4, { lava: true });
      }
      if (this.fire > 0) {
        if (this.inWater) this.fire = 0;
        else {
          this.fire--;
          if (this.fire % 20 === 0) this.damage(game, 1, { fire: true });
        }
      }
      const headId = w.getBlock(Math.floor(this.x), Math.floor(this.y + this.h * 0.85), Math.floor(this.z));
      if (isWater(headId)) {
        if (!this.waterBreather) {
          this.air--;
          if (this.air <= -20) {
            this.air = 0;
            this.damage(game, 2, { drown: true });
          }
        }
      } else this.air = 300;
      if (blocks[headId] && blocks[headId].opaque && SOLID[headId] && this.age % 10 === 0 && this.type !== "player_remote") this.damage(game, 1, { suffocate: true });
      if (this.y < -64) this.damage(game, 100, { void: true });
      return true;
    }
    landed(game) {
      if (this.fallDist > 3) {
        const dmg = Math.ceil(this.fallDist - 3);
        if (!this.inWater) this.damage(game, dmg, { fall: true });
      }
      this.fallDist = 0;
    }
  };
  var PLAYER_COLORS = [[56, 120, 180], [180, 60, 60], [60, 150, 70], [200, 160, 40], [140, 70, 170], [40, 160, 160], [220, 110, 40], [90, 90, 90]];
  var Player = class extends Living {
    constructor(name, x, y, z) {
      super("player", x, y, z);
      this.name = name;
      this.health = 20;
      this.maxHealth = 20;
      this.inv = new Inventory(36);
      this.sel = 0;
      this.mode = "survival";
      this.flying = false;
      this.sneak = false;
      this.sleeping = null;
      this.sleepTimer = 0;
      this.spawnPoint = null;
      this.color = PLAYER_COLORS[0];
      this.eyeH = 1.62;
      this.swing = 0;
      this.remote = false;
      this.sendState = null;
      this.openContainer = null;
    }
    held() {
      return this.inv.slots[this.sel];
    }
    extra() {
      const h = this.held();
      return { n: this.name, c: this.color, h: h ? [h.id, h.meta] : 0, s: this.sneak ? 1 : 0, sl: this.sleeping ? 1 : 0, d: this.deathTime > 0 ? 1 : 0 };
    }
    applyExtra(x) {
      if (!x) return;
      this.name = x.n;
      this.color = x.c;
      this.held = () => x.h ? { id: x.h[0], meta: x.h[1] } : null;
      this.heldNet = x.h;
      this.sneak = !!x.s;
      this.sleepingNet = !!x.sl;
      this.deadNet = !!x.d;
    }
  };
  var rnd = (game) => game.rand();
  var Mob = class extends Living {
    constructor(type, x, y, z) {
      super(type, x, y, z);
      this.target = null;
      this.wanderTimer = 0;
      this.panic = 0;
      this.moveSpeed = 0.1;
      this.input = { fwd: 0, strafe: 0, jump: false, speed: 0.1 };
      this.persistent = false;
    }
    lookAt(x, z) {
      const dx = x - this.x, dz = z - this.z;
      let want = Math.atan2(dx, -dz);
      let d = want - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += Math.max(-0.3, Math.min(0.3, d));
    }
    walkTo(game, tx, tz, speedMul = 1) {
      this.lookAt(tx, tz);
      const d = Math.hypot(tx - this.x, tz - this.z);
      this.input.fwd = d > 0.5 ? 1 : 0;
      this.input.speed = this.moveSpeed * speedMul;
      if (this.horizCollide && this.onGround) this.input.jump = true;
      if (this.inWater) this.input.jump = true;
      const ax = this.x + Math.sin(this.yaw) * 0.8, az = this.z - Math.cos(this.yaw) * 0.8;
      const below = game.world.getBlock(Math.floor(ax), Math.floor(this.y - 0.5), Math.floor(az));
      const below2 = game.world.getBlock(Math.floor(ax), Math.floor(this.y - 1.5), Math.floor(az));
      const below3 = game.world.getBlock(Math.floor(ax), Math.floor(this.y - 2.5), Math.floor(az));
      if (isLava(below) || below === 0 && below2 === 0 && below3 === 0 && !this.fearless) {
        this.input.fwd = 0;
        this.target = null;
      }
      return d;
    }
    tick(game) {
      this.input.fwd = 0;
      this.input.jump = false;
      this.input.strafe = 0;
      if (!this.baseTick(game)) {
        livingPhysics(game.world, this, this.input);
        return;
      }
      this.ai(game);
      const wasGround = this.onGround;
      livingPhysics(game.world, this, this.input);
      if (this.onGround && !wasGround) this.landed(game);
      let d = this.yaw - this.ryaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.ryaw += d * 0.4;
      const mv = Math.hypot(this.x - this.px, this.z - this.pz);
      this.walkAmt += (Math.min(1, mv * 4) - this.walkAmt) * 0.4;
      this.walkAnim += mv * 4;
    }
    wander(game, chance = 8e-3, range = 8) {
      if (this.target) {
        const d = this.walkTo(game, this.target[0], this.target[1], this.panic > 0 ? 1.6 : 1);
        if (d < 0.8 || --this.wanderTimer <= 0) this.target = null;
      } else if (rnd(game) < chance || this.panic > 0) {
        this.target = [this.x + (rnd(game) - 0.5) * range * 2, this.z + (rnd(game) - 0.5) * range * 2];
        this.wanderTimer = 100;
      }
    }
    nearestPlayer(game, range, survivalOnly = true) {
      let best = null, bd = range * range;
      for (const p of game.players.values()) {
        if (p.deathTime > 0 || p.removed) continue;
        if (survivalOnly && p.mode === "creative") continue;
        const d = this.dist2(p);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      return best;
    }
  };
  var Animal = class extends Mob {
    constructor(type, x, y, z) {
      super(type, x, y, z);
      this.persistent = true;
      this.health = this.maxHealth = 10;
    }
    onHurtBy() {
      this.panic = 60;
      this.target = null;
    }
    ai(game) {
      if (this.panic > 0) this.panic--;
      const p = this.temptItem ? this.nearestPlayer(game, 8, false) : null;
      if (p && this.panic <= 0) {
        const h = p.held && p.held();
        if (h && this.temptItem.includes(h.id)) {
          if (this.dist2(p) > 4) this.walkTo(game, p.x, p.z, 0.9);
          else this.lookAt(p.x, p.z);
          return;
        }
      }
      this.wander(game, 0.01, 6);
    }
  };
  var Pig = class extends Animal {
    constructor(x, y, z) {
      super("pig", x, y, z);
      this.w = 0.9;
      this.h = 0.9;
      this.temptItem = [I.WHEAT];
    }
    drops(r) {
      return [[this.fire > 0 ? I.COOKED_PORKCHOP : I.PORKCHOP, r() * 3 | 0]];
    }
  };
  var Cow = class extends Animal {
    constructor(x, y, z) {
      super("cow", x, y, z);
      this.w = 0.9;
      this.h = 1.3;
      this.temptItem = [I.WHEAT];
    }
    drops(r) {
      return [[I.LEATHER, r() * 3 | 0], [this.fire > 0 ? I.STEAK : I.BEEF, 1 + (r() * 3 | 0)]];
    }
  };
  var Chicken = class extends Animal {
    constructor(x, y, z) {
      super("chicken", x, y, z);
      this.w = 0.4;
      this.h = 0.7;
      this.health = this.maxHealth = 4;
      this.temptItem = [I.SEEDS, I.PUMPKIN_SEEDS, I.MELON_SEEDS];
      this.eggTimer = 6e3 + Math.random() * 6e3;
      this.fearless = true;
    }
    drops(r) {
      return [[I.FEATHER, r() * 3 | 0], [this.fire > 0 ? I.COOKED_CHICKEN : I.CHICKEN, 1]];
    }
    tick(game) {
      super.tick(game);
      if (!this.onGround && this.vy < 0) {
        this.vy *= 0.6;
        this.fallDist = 0;
      }
      if (game.authority && --this.eggTimer <= 0) {
        game.spawnItem(this.x, this.y + 0.3, this.z, I.EGG, 1, 0);
        this.eggTimer = 6e3 + game.rand() * 6e3;
        game.fx({ k: "snd", s: "plop", x: this.x, y: this.y, z: this.z });
      }
    }
  };
  var Sheep = class extends Animal {
    constructor(x, y, z, color = 0) {
      super("sheep", x, y, z);
      this.w = 0.9;
      this.h = 1.3;
      this.temptItem = [I.WHEAT];
      this.sheared = false;
      this.woolColor = color;
      this.woolColorRGB = WOOL_COLORS[color];
      this.eatTimer = 0;
    }
    extra() {
      return { c: this.woolColor, s: this.sheared ? 1 : 0 };
    }
    applyExtra(x) {
      if (!x) return;
      this.woolColor = x.c;
      this.woolColorRGB = WOOL_COLORS[x.c & 15];
      this.sheared = !!x.s;
    }
    drops() {
      return this.sheared ? [] : [[B.WOOL, 1, this.woolColor]];
    }
    ai(game) {
      super.ai(game);
      if (this.sheared && game.rand() < 2e-3) {
        const bx = Math.floor(this.x), by = Math.floor(this.y - 0.5), bz = Math.floor(this.z);
        if (game.world.getBlock(bx, by, bz) === B.GRASS) {
          game.setBlock(bx, by, bz, B.DIRT);
          this.sheared = false;
          game.dirtyEntity(this);
        }
      }
    }
  };
  var Monster = class extends Mob {
    constructor(type, x, y, z) {
      super(type, x, y, z);
      this.health = this.maxHealth = 20;
      this.attackDmg = 3;
      this.burnsInDay = false;
      this.angryAt = null;
    }
    hostileNow(game) {
      return true;
    }
    ai(game) {
      if (this.burnsInDay && game.isDay() && game.world.getSky(Math.floor(this.x), Math.floor(this.y + 1.6), Math.floor(this.z)) >= 15 && !this.inWater) {
        if (this.fire <= 0 && game.rand() < 0.05) this.fire = 160;
      }
      let p = this.angryAt && !this.angryAt.removed && this.angryAt.deathTime === 0 ? this.angryAt : null;
      if (!p && this.hostileNow(game)) p = this.nearestPlayer(game, 16);
      if (p && p.mode === "creative") p = null;
      if (p) this.chase(game, p);
      else this.wander(game, 6e-3, 8);
    }
    chase(game, p) {
      const d = this.walkTo(game, p.x, p.z, 1.2);
      this.pitch = 0;
      if (d < 1.4 && Math.abs(p.y - this.y) < 2 && this.attackCooldown <= 0) {
        this.attackCooldown = 20;
        this.swing = 1;
        p.damage(game, this.attackDmg, { entity: this });
      }
    }
  };
  var Zombie = class extends Monster {
    constructor(x, y, z) {
      super("zombie", x, y, z);
      this.burnsInDay = true;
      this.attackDmg = 4;
      this.moveSpeed = 0.085;
    }
    // classic pocket zombies dropped feathers
    drops(r) {
      return [[I.FEATHER, r() * 3 | 0]];
    }
  };
  var PigZombie = class extends Monster {
    constructor(x, y, z) {
      super("pigzombie", x, y, z);
      this.attackDmg = 5;
      this.moveSpeed = 0.1;
      this.fireImmune = true;
      this.persistent = true;
    }
    hostileNow() {
      return false;
    }
    onHurtBy(game, ent) {
      if (ent && ent.type === "player") {
        this.angryAt = ent;
        for (const e of game.entities.values()) if (e.type === "pigzombie" && e.dist2(this) < 32 * 32) e.angryAt = ent;
      }
    }
    drops(r) {
      return [[I.COOKED_PORKCHOP, r() * 2 | 0], [I.GOLD_INGOT, r() < 0.1 ? 1 : 0]];
    }
    baseTick(game) {
      this.fire = 0;
      return super.baseTick(game);
    }
  };
  var Skeleton = class extends Monster {
    constructor(x, y, z) {
      super("skeleton", x, y, z);
      this.burnsInDay = true;
      this.shootTimer = 40;
      this.moveSpeed = 0.1;
    }
    drops(r) {
      return [[I.BONE, r() * 3 | 0], [I.ARROW, r() * 3 | 0]];
    }
    chase(game, p) {
      const d = Math.sqrt(this.dist2(p));
      if (d > 10) this.walkTo(game, p.x, p.z);
      else {
        this.lookAt(p.x, p.z);
        if (d < 5) {
          this.input.fwd = -0.6;
          this.input.speed = this.moveSpeed;
        }
      }
      if (--this.shootTimer <= 0 && d < 16) {
        this.shootTimer = 40 + (game.rand() * 30 | 0);
        if (game.canSee(this.x, this.y + 1.5, this.z, p.x, p.y + 1.5, p.z)) {
          const a = new Arrow(this.x, this.y + 1.5, this.z, this);
          const dx = p.x - this.x, dy = p.y + 1.2 - (this.y + 1.5), dz = p.z - this.z;
          const hd = Math.hypot(dx, dz);
          a.shoot(dx, dy + hd * 0.2, dz, 1.6, 12 * (game.rand() * 0.1));
          game.addEntity(a);
          game.fx({ k: "snd", s: "bow", x: this.x, y: this.y, z: this.z });
        }
      }
    }
  };
  var Spider = class extends Monster {
    constructor(x, y, z) {
      super("spider", x, y, z);
      this.w = 1.4;
      this.h = 0.9;
      this.health = this.maxHealth = 16;
      this.attackDmg = 2;
      this.moveSpeed = 0.12;
    }
    hostileNow(game) {
      return !game.isDay() || game.world.getBrightness(Math.floor(this.x), Math.floor(this.y + 0.5), Math.floor(this.z)) < 8;
    }
    drops(r) {
      return [[I.STRING, r() * 3 | 0]];
    }
    chase(game, p) {
      const d = this.walkTo(game, p.x, p.z, 1.1);
      if (this.horizCollide) {
        this.vy = 0.2;
        this.fallDist = 0;
      }
      if (d > 2 && d < 6 && this.onGround && game.rand() < 0.1) {
        const k = 0.4 / d;
        this.vx = (p.x - this.x) * k;
        this.vz = (p.z - this.z) * k;
        this.vy = 0.4;
      }
      if (d < 1.6 && Math.abs(p.y - this.y) < 2 && this.attackCooldown <= 0) {
        this.attackCooldown = 20;
        p.damage(game, this.attackDmg, { entity: this });
      }
    }
  };
  var Creeper = class extends Monster {
    constructor(x, y, z) {
      super("creeper", x, y, z);
      this.fuse = 0;
      this.moveSpeed = 0.09;
    }
    extra() {
      return { f: this.fuse };
    }
    applyExtra(x) {
      if (x) this.fuse = x.f;
    }
    drops(r) {
      return [[I.GUNPOWDER, r() * 3 | 0]];
    }
    chase(game, p) {
      const d = Math.sqrt(this.dist2(p));
      if (d < 3 || this.fuse > 0 && d < 7) {
        this.lookAt(p.x, p.z);
        if (this.fuse === 0) game.fx({ k: "snd", s: "fuse", x: this.x, y: this.y, z: this.z });
        this.fuse++;
        game.dirtyEntity(this);
        if (this.fuse >= 30) {
          this.removed = true;
          game.explode(this.x, this.y + 0.5, this.z, 3, this);
        }
      } else {
        if (this.fuse > 0) {
          this.fuse = Math.max(0, this.fuse - 1);
          game.dirtyEntity(this);
        }
        this.walkTo(game, p.x, p.z);
      }
    }
    ai(game) {
      const p = this.nearestPlayer(game, 16);
      if (!p && this.fuse > 0) {
        this.fuse--;
        game.dirtyEntity(this);
      }
      super.ai(game);
    }
  };
  var MOB_CLASSES = { pig: Pig, cow: Cow, chicken: Chicken, sheep: Sheep, zombie: Zombie, pigzombie: PigZombie, skeleton: Skeleton, spider: Spider, creeper: Creeper };
  var HOSTILE = /* @__PURE__ */ new Set(["zombie", "skeleton", "spider", "creeper"]);
  var ItemEntity = class extends Entity {
    constructor(x, y, z, id, count, meta = 0, dmg = 0) {
      super("item", x, y, z);
      this.w = 0.25;
      this.h = 0.25;
      this.item = { id, count, meta, dmg };
      this.pickupDelay = 10;
      this.stepHeight = 0;
      this.bob = Math.random() * Math.PI * 2;
    }
    extra() {
      return { i: [this.item.id, this.item.count, this.item.meta] };
    }
    applyExtra(x) {
      if (x && x.i) this.item = { id: x.i[0], count: x.i[1], meta: x.i[2] };
    }
    toSave() {
      const s = super.toSave();
      s.ex.dmg = this.item.dmg || 0;
      return s;
    }
    tick(game) {
      this.age++;
      if (this.pickupDelay > 0) this.pickupDelay--;
      const w = game.world;
      const env2 = liquidAt(w, this);
      if (env2.water) {
        this.vy += 0.01;
        this.vx *= 0.9;
        this.vz *= 0.9;
      }
      if (env2.lava) {
        this.removed = true;
        game.fx({ k: "snd", s: "fizz", x: this.x, y: this.y, z: this.z });
        return;
      }
      const id = w.getBlockColl(Math.floor(this.x), Math.floor(this.y + 0.1), Math.floor(this.z));
      if (SOLID[id] && blocks[id] && blocks[id].opaque) {
        this.vy = 0.2;
        this.y += 0.05;
      }
      this.vy -= 0.04;
      moveEntity(w, this, this.vx, this.vy, this.vz);
      const f = this.onGround ? 0.6 * 0.98 : 0.98;
      this.vx *= f;
      this.vz *= f;
      this.vy *= 0.98;
      if (this.onGround) this.vy *= -0.5;
      if (this.age > 6e3) this.removed = true;
      if (game.authority && this.age % 20 === 0) {
        for (const o of game.entities.values()) {
          if (o === this || o.type !== "item" || o.removed) continue;
          if (o.item.id === this.item.id && o.item.meta === this.item.meta && !o.item.dmg && !this.item.dmg && this.dist2(o) < 1 && o.item.count + this.item.count <= maxStack(this.item.id)) {
            this.item.count += o.item.count;
            o.removed = true;
            game.dirtyEntity(this);
          }
        }
      }
    }
  };
  var Arrow = class extends Entity {
    constructor(x, y, z, owner) {
      super("arrow", x, y, z);
      this.w = 0.3;
      this.h = 0.3;
      this.owner = owner ? owner.id : 0;
      this.stuck = false;
      this.dmg = 2;
      this.stepHeight = 0;
      this.fromPlayer = owner && owner.type === "player";
    }
    shoot(dx, dy, dz, speed, spread) {
      const d = Math.hypot(dx, dy, dz) || 1;
      this.vx = dx / d * speed + (Math.random() - 0.5) * spread * 75e-4 * 10;
      this.vy = dy / d * speed + (Math.random() - 0.5) * spread * 75e-4 * 10;
      this.vz = dz / d * speed + (Math.random() - 0.5) * spread * 75e-4 * 10;
      this.updateRot();
    }
    updateRot() {
      const h = Math.hypot(this.vx, this.vz);
      this.yaw = Math.atan2(this.vx, -this.vz);
      this.pitch = Math.atan2(this.vy, h);
    }
    extra() {
      return { p: this.pitch, s: this.stuck ? 1 : 0 };
    }
    applyExtra(x) {
      if (x) {
        this.pitch = x.p;
        this.stuck = !!x.s;
      }
    }
    tick(game) {
      this.age++;
      if (this.stuck) {
        if (this.age > 1200) this.removed = true;
        return;
      }
      const w = game.world;
      if (game.authority) {
        const steps = Math.ceil(Math.hypot(this.vx, this.vy, this.vz) / 0.3);
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const x = this.x + this.vx * t, y = this.y + this.vy * t, z = this.z + this.vz * t;
          for (const e of game.livingEntities()) {
            if (e.id === this.owner && this.age < 5) continue;
            if (e.deathTime > 0) continue;
            const hw = e.w / 2 + 0.15;
            if (x > e.x - hw && x < e.x + hw && z > e.z - hw && z < e.z + hw && y > e.y - 0.1 && y < e.y + e.h + 0.1) {
              const sp = Math.hypot(this.vx, this.vy, this.vz);
              const owner = game.entities.get(this.owner) || game.players.get(this.owner);
              e.damage(game, Math.ceil(sp * this.dmg), { entity: owner || this, knock: 0.3 });
              game.fx({ k: "snd", s: "hit", x, y, z });
              this.removed = true;
              return;
            }
          }
        }
      }
      const bx = Math.floor(this.x + this.vx), by = Math.floor(this.y + this.vy), bz = Math.floor(this.z + this.vz);
      const before = [this.vx, this.vy, this.vz];
      moveEntity(w, this, this.vx, this.vy, this.vz);
      if (this.vx !== before[0] || this.vy !== before[1] || this.vz !== before[2]) {
        this.stuck = true;
        this.age = 0;
        this.vx = this.vy = this.vz = 0;
        game.fx({ k: "snd", s: "arrowhit", x: this.x, y: this.y, z: this.z });
        game.dirtyEntity(this);
        return;
      }
      const inW = isWater(w.getBlock(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)));
      const drag = inW ? 0.8 : 0.99;
      this.vx *= drag;
      this.vy *= drag;
      this.vz *= drag;
      this.vy -= 0.05;
      this.updateRot();
      if (this.age > 1200) this.removed = true;
    }
  };
  var Thrown = class extends Entity {
    constructor(kind, x, y, z, owner) {
      super(kind, x, y, z);
      this.w = 0.25;
      this.h = 0.25;
      this.owner = owner ? owner.id : 0;
      this.stepHeight = 0;
    }
    tick(game) {
      this.age++;
      const w = game.world;
      if (game.authority) {
        for (const e of game.livingEntities()) {
          if (e.id === this.owner && this.age < 5) continue;
          const hw = e.w / 2 + 0.2;
          if (this.x > e.x - hw && this.x < e.x + hw && this.z > e.z - hw && this.z < e.z + hw && this.y > e.y && this.y < e.y + e.h) {
            e.damage(game, 1e-4, { entity: this, knock: 0.25 });
            e.health = Math.min(e.maxHealth, Math.ceil(e.health));
            this.hit(game);
            return;
          }
        }
      }
      const before = [this.vx, this.vy, this.vz];
      moveEntity(w, this, this.vx, this.vy, this.vz);
      if (this.vx !== before[0] || this.vy !== before[1] || this.vz !== before[2]) {
        this.hit(game);
        return;
      }
      this.vx *= 0.99;
      this.vy *= 0.99;
      this.vz *= 0.99;
      this.vy -= 0.03;
      if (this.age > 400) this.removed = true;
    }
    hit(game) {
      this.removed = true;
      game.fx({ k: "poof", x: this.x, y: this.y, z: this.z, tile: this.type === "egg" ? "egg" : "snowball" });
      if (this.type === "egg" && game.authority && game.rand() < 0.125) {
        const c = new Chicken(this.x, this.y, this.z);
        c.scale = 1;
        game.addEntity(c);
      }
    }
  };
  var PrimedTNT = class extends Entity {
    constructor(x, y, z, fuse = 80) {
      super("tnt", x, y, z);
      this.w = 0.98;
      this.h = 0.98;
      this.fuse = fuse;
      this.vy = 0.2;
      this.stepHeight = 0;
    }
    extra() {
      return { f: this.fuse };
    }
    applyExtra(x) {
      if (x) this.fuse = x.f;
    }
    tick(game) {
      this.vy -= 0.04;
      moveEntity(game.world, this, this.vx, this.vy, this.vz);
      this.vx *= 0.98;
      this.vy *= 0.98;
      this.vz *= 0.98;
      if (this.onGround) {
        this.vx *= 0.7;
        this.vz *= 0.7;
        this.vy *= -0.5;
      }
      if (game.authority && --this.fuse <= 0) {
        this.removed = true;
        game.explode(this.x, this.y + 0.49, this.z, 4, this);
      } else if (!game.authority) this.fuse--;
    }
  };
  var FallingBlock = class extends Entity {
    constructor(x, y, z, block, meta) {
      super("falling", x, y, z);
      this.w = 0.98;
      this.h = 0.98;
      this.block = block;
      this.meta = meta;
      this.stepHeight = 0;
    }
    extra() {
      return { b: this.block, m: this.meta };
    }
    applyExtra(x) {
      if (x) {
        this.block = x.b;
        this.meta = x.m;
      }
    }
    tick(game) {
      this.age++;
      this.vy -= 0.04;
      moveEntity(game.world, this, this.vx, this.vy, this.vz);
      this.vy *= 0.98;
      if (!game.authority) return;
      if (this.onGround || this.age > 600) {
        this.removed = true;
        const bx = Math.floor(this.x), by = Math.floor(this.y + 0.5), bz = Math.floor(this.z);
        const cur = game.world.getBlock(bx, by, bz);
        if (blocks[cur].replaceable || cur === 0) game.setBlock(bx, by, bz, this.block, this.meta);
        else game.spawnItem(this.x, this.y + 0.5, this.z, this.block, 1, 0);
      }
    }
  };
  var Painting = class extends Entity {
    // bx,by,bz = cell in front of the wall holding the bottom-left tile; dir = facing (2..5)
    constructor(bx, by, bz, dir, art) {
      super("painting", bx + 0.5, by, bz + 0.5);
      this.bx = bx;
      this.by = by;
      this.bz = bz;
      this.dir = dir;
      this.art = art;
      this.noGravity = true;
      this.w = 0;
      this.h = 0;
    }
    extra() {
      return { b: [this.bx, this.by, this.bz, this.dir, this.art] };
    }
    applyExtra(x) {
      if (x && x.b) [this.bx, this.by, this.bz, this.dir, this.art] = x.b;
    }
    cells() {
      const art = PAINTINGS[this.art % PAINTINGS.length];
      const out = [];
      for (let ty = 0; ty < art.h; ty++) for (let tx = 0; tx < art.w; tx++) {
        let x = this.bx, z = this.bz;
        if (this.dir === 2) x -= tx;
        else if (this.dir === 3) x += tx;
        else if (this.dir === 4) z += tx;
        else z -= tx;
        out.push([x, this.by + ty, z]);
      }
      return out;
    }
    wallOf(c) {
      const [x, y, z] = c;
      if (this.dir === 2) return [x, y, z + 1];
      if (this.dir === 3) return [x, y, z - 1];
      if (this.dir === 4) return [x + 1, y, z];
      return [x - 1, y, z];
    }
    valid(world) {
      for (const c of this.cells()) {
        const id = world.getBlock(c[0], c[1], c[2]);
        if (id !== 0 && !blocks[id].replaceable) return false;
        const w = this.wallOf(c);
        const wid = world.getBlock(w[0], w[1], w[2]);
        if (!SOLID[wid] || !blocks[wid].opaque) return false;
      }
      return true;
    }
    tick(game) {
      this.age++;
      if (game.authority && this.age % 20 === 0 && !this.valid(game.world)) {
        this.removed = true;
        game.spawnItem(this.x, this.y + 0.5, this.z, I.PAINTING, 1, 0);
      }
    }
    hitTest(ox, oy, oz, dx, dy, dz, maxD) {
      let best = null;
      for (const c of this.cells()) {
        const w = this.wallOf(c);
        const cx = c[0], cy = c[1], cz = c[2];
        let b;
        const t = 0.0625;
        if (this.dir === 2) b = [cx, cy, cz + 1 - t, cx + 1, cy + 1, cz + 1];
        else if (this.dir === 3) b = [cx, cy, cz, cx + 1, cy + 1, cz + t];
        else if (this.dir === 4) b = [cx + 1 - t, cy, cz, cx + 1, cy + 1, cz + 1];
        else b = [cx, cy, cz, cx + t, cy + 1, cz + 1];
        const d = rayBox(ox, oy, oz, dx, dy, dz, b);
        if (d !== null && d < maxD && (best === null || d < best)) best = d;
      }
      return best;
    }
  };
  function rayBox(ox, oy, oz, dx, dy, dz, b) {
    let tmin = 0, tmax = 1e9;
    const o = [ox, oy, oz], d = [dx, dy, dz];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) {
        if (o[a] < b[a] || o[a] > b[a + 3]) return null;
        continue;
      }
      let t1 = (b[a] - o[a]) / d[a], t2 = (b[a + 3] - o[a]) / d[a];
      if (t1 > t2) {
        const t = t1;
        t1 = t2;
        t2 = t;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    return tmin;
  }
  function createEntity(type, x, y, z, ex) {
    let e;
    if (MOB_CLASSES[type]) e = new MOB_CLASSES[type](x, y, z);
    else if (type === "item") e = new ItemEntity(x, y, z, 1, 1, 0);
    else if (type === "arrow") e = new Arrow(x, y, z, null);
    else if (type === "snowball" || type === "egg") e = new Thrown(type, x, y, z, null);
    else if (type === "tnt") e = new PrimedTNT(x, y, z);
    else if (type === "falling") e = new FallingBlock(x, y, z, B.SAND, 0);
    else if (type === "painting") e = new Painting(0, 0, 0, 2, 0);
    else if (type === "player") e = new Player("?", x, y, z);
    else return null;
    if (ex) e.applyExtra(ex);
    if (type === "item" && ex && ex.dmg) e.item.dmg = ex.dmg;
    return e;
  }

  // game/src/game.js
  var DAY = 24e3;
  var REACH = 6;
  function yawQuadrant(yaw) {
    return (Math.round(yaw / (Math.PI / 2)) % 4 + 4) % 4;
  }
  var FRONT_FACING_PLAYER = [3, 4, 2, 5];
  var Game = class {
    constructor(world, opts = {}) {
      this.world = world;
      this.authority = opts.authority !== false;
      this.entities = /* @__PURE__ */ new Map();
      this.players = /* @__PURE__ */ new Map();
      this.local = null;
      this.rand = mulberry((world.seed ^ Date.now()) >>> 0);
      this.scheduled = /* @__PURE__ */ new Map();
      this.tick = 0;
      this.fxListeners = [];
      this.hooks = { blockChange: [], entityAdd: [], entityRemove: [], entityDirty: [] };
      this.difficulty = opts.difficulty || "normal";
      this.reactor = null;
      this.sleepTicks = 0;
      this.messages = [];
      if (this.authority) world.onChange((x, y, z, id, meta, oldId, oldMeta) => this.onBlockChanged(x, y, z, id, meta, oldId, oldMeta));
    }
    // ------------------------------------------------------------------ basics
    fx(e) {
      for (const f of this.fxListeners) f(e);
    }
    isDay() {
      const t = this.world.time % DAY;
      return t < 12500 || t > 23500;
    }
    addEntity(e) {
      if (e.type === "player") {
        this.players.set(e.id, e);
      } else this.entities.set(e.id, e);
      for (const h of this.hooks.entityAdd) h(e);
      return e;
    }
    removeEntity(e) {
      e.removed = true;
      if (e.type === "player") this.players.delete(e.id);
      else this.entities.delete(e.id);
      for (const h of this.hooks.entityRemove) h(e);
    }
    dirtyEntity(e) {
      for (const h of this.hooks.entityDirty) h(e);
    }
    *livingEntities() {
      for (const e of this.entities.values()) if (e.living && !e.removed) yield e;
      for (const p of this.players.values()) if (!p.removed && p.deathTime === 0) yield p;
    }
    getEntity(id) {
      return this.entities.get(id) || this.players.get(id);
    }
    spawnItem(x, y, z, id, count, meta = 0, dmg = 0, vel = true) {
      if (!this.authority || count <= 0) return null;
      const e = new ItemEntity(x, y, z, id, count, meta, dmg);
      if (vel) {
        e.vx = (this.rand() - 0.5) * 0.2;
        e.vy = 0.2;
        e.vz = (this.rand() - 0.5) * 0.2;
      }
      return this.addEntity(e);
    }
    msg(player, text) {
      if (player && player.sink) player.sink.msg(text);
    }
    broadcastMsg(text) {
      for (const p of this.players.values()) this.msg(p, text);
    }
    setBlock(x, y, z, id, meta = 0) {
      return this.world.setBlock(x, y, z, id, meta);
    }
    // ------------------------------------------------------------------ neighbour updates / scheduling
    schedule(x, y, z, delay) {
      if (!this.world.inBounds(x, y, z)) return;
      const k = idx(x, y, z);
      const due = this.tick + delay;
      const cur = this.scheduled.get(k);
      if (cur === void 0 || cur > due) this.scheduled.set(k, due);
    }
    onBlockChanged(x, y, z, id, meta, oldId, oldMeta) {
      for (const h of this.hooks.blockChange) h(x, y, z, id, meta);
      this.neighborChanged(x, y, z);
      for (const [dx, dy, dz] of FACE_DIRS) this.neighborChanged(x + dx, y + dy, z + dz);
    }
    neighborChanged(x, y, z) {
      const w = this.world;
      if (!w.inBounds(x, y, z)) return;
      const id = w.getBlock(x, y, z);
      if (!id) return;
      const b = blocks[id];
      if (b.liquid) {
        this.schedule(x, y, z, b.liquid === "water" ? 5 : 30);
        return;
      }
      if (b.gravity) {
        this.schedule(x, y, z, 2);
        return;
      }
      if (b.needsSupport || b.door || b.render === R.BED) this.schedule(x, y, z, 1);
      if (b.fire) this.schedule(x, y, z, 30);
    }
    // support rules; returns true if block at pos can stay
    canStay(x, y, z, id, meta) {
      const w = this.world;
      const below = w.getBlock(x, y - 1, z);
      const b = blocks[id];
      switch (id) {
        case B.SAPLING:
        case B.DANDELION:
        case B.ROSE:
        case B.TALLGRASS:
          return below === B.GRASS || below === B.DIRT || below === B.FARMLAND;
        case B.DEADBUSH:
          return below === B.SAND;
        case B.BROWN_MUSHROOM:
        case B.RED_MUSHROOM:
          return OPAQUE[below] === 1;
        case B.WHEAT:
        case B.PUMPKIN_STEM:
        case B.MELON_STEM:
          return below === B.FARMLAND;
        case B.SUGARCANE: {
          if (below === B.SUGARCANE) return true;
          if (below !== B.GRASS && below !== B.DIRT && below !== B.SAND) return false;
          return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => isWater(w.getBlock(x + dx, y - 1, z + dz)));
        }
        case B.CACTUS: {
          if (below !== B.SAND && below !== B.CACTUS) return false;
          return ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => SOLID[w.getBlock(x + dx, y, z + dz)]);
        }
        case B.SNOW_LAYER:
          return OPAQUE[below] === 1 || below === B.LEAVES;
        case B.TORCH: {
          if (meta === 5 || meta === 0) return OPAQUE[below] === 1 || below === B.FENCE || below === B.GLASS;
          const off = [null, [-1, 0], [1, 0], [0, -1], [0, 1]][meta];
          return off ? OPAQUE[w.getBlock(x + off[0], y, z + off[1])] === 1 : false;
        }
        case B.LADDER: {
          const off = { 2: [0, 1], 3: [0, -1], 4: [1, 0], 5: [-1, 0] }[meta];
          return off ? OPAQUE[w.getBlock(x + off[0], y, z + off[1])] === 1 : false;
        }
        case B.WOOD_DOOR: {
          if (meta & 8) return w.getBlock(x, y - 1, z) === B.WOOD_DOOR;
          return w.getBlock(x, y + 1, z) === B.WOOD_DOOR && SOLID[below] === 1;
        }
        case B.BED: {
          const d = meta & 3, off = [[0, 1], [-1, 0], [0, -1], [1, 0]][d];
          const s = meta & 8 ? -1 : 1;
          return w.getBlock(x + off[0] * s, y, z + off[1] * s) === B.BED;
        }
      }
      return true;
    }
    runScheduled() {
      if (!this.scheduled.size) return;
      const due = [];
      for (const [k, t] of this.scheduled) if (t <= this.tick) due.push(k);
      for (const k of due) {
        this.scheduled.delete(k);
        const y = k & 127, z = k >> 7 & 255, x = k >> 15;
        this.scheduledTick(x, y, z);
      }
    }
    scheduledTick(x, y, z) {
      const w = this.world;
      const id = w.getBlock(x, y, z);
      if (!id) return;
      const b = blocks[id];
      const meta = w.getMeta(x, y, z);
      if (b.liquid) {
        this.liquidTick(x, y, z, id, meta);
        return;
      }
      if (b.gravity) {
        const below = w.getBlock(x, y - 1, z);
        if (y > 0 && (below === 0 || REPLACEABLE[below] || blocks[below].fire)) {
          this.setBlock(x, y, z, 0);
          this.addEntity(new FallingBlock(x + 0.5, y, z + 0.5, id, meta));
        }
        return;
      }
      if (b.fire) {
        this.fireTick(x, y, z);
        return;
      }
      if (!this.canStay(x, y, z, id, meta)) this.breakBlock(x, y, z, null, true);
    }
    // ------------------------------------------------------------------ liquids
    liquidTick(x, y, z, id, meta) {
      const w = this.world;
      const water = isWater(id);
      const L = water ? 1 : 2;
      const sameLiquid = (i) => LIQUID[i] === L;
      const levelAt = (xx, yy, zz) => {
        const i = w.getBlock(xx, yy, zz);
        if (!sameLiquid(i)) return -1;
        const m = w.getMeta(xx, yy, zz);
        return m & 8 ? 0 : m & 7;
      };
      const drop = water ? 1 : 2;
      if (!water) {
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
          if (isWater(w.getBlock(x + dx, y + dy, z + dz))) {
            this.setBlock(x, y, z, (meta & 7) === 0 && !(meta & 8) ? B.OBSIDIAN : B.COBBLE);
            this.fx({ k: "snd", s: "fizz", x: x + 0.5, y: y + 0.5, z: z + 0.5 });
            return;
          }
        }
      }
      let level = meta & 8 ? 0 : meta & 7;
      const isSource = (meta & 7) === 0 && !(meta & 8);
      if (!isSource) {
        let best = 99, sources = 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const l = levelAt(x + dx, y, z + dz);
          if (l < 0) continue;
          const nm = w.getMeta(x + dx, y, z + dz);
          if ((nm & 7) === 0 && !(nm & 8)) sources++;
          best = Math.min(best, l + drop);
        }
        let nl = best;
        let falling = false;
        if (sameLiquid(w.getBlock(x, y + 1, z))) {
          nl = 1;
          falling = true;
        }
        if (water && sources >= 2 && (SOLID[w.getBlock(x, y - 1, z)] || isWater(w.getBlock(x, y - 1, z)) && (w.getMeta(x, y - 1, z) & 7) === 0)) {
          nl = 0;
          falling = false;
        }
        if (nl > 7) {
          this.setBlock(x, y, z, 0);
          return;
        }
        const newMeta = falling ? 8 | 1 : nl;
        if (newMeta !== meta) {
          this.setBlock(x, y, z, water ? B.WATER : B.LAVA, newMeta);
          level = falling ? 0 : nl;
          meta = newMeta;
        } else if (id === (water ? B.WATER : B.LAVA)) {
        }
      }
      const below = w.getBlock(x, y - 1, z);
      if (y > 0 && this.canFlowInto(below, L)) {
        if (LIQUID[below] && LIQUID[below] !== L) {
          this.setBlock(x, y - 1, z, water ? B.STONE : B.COBBLE);
          return;
        }
        this.flowInto(x, y - 1, z, water ? B.WATER : B.LAVA, 8 | 1);
        return;
      }
      if (sameLiquid(below) && !isSource) return;
      const nlv = (meta & 8 ? 0 : level) + drop;
      if (nlv > 7) return;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const costs = dirs.map(([dx, dz]) => {
        const nid = w.getBlock(x + dx, y, z + dz);
        if (!this.canFlowInto(nid, L) || sameLiquid(nid) && levelAt(x + dx, y, z + dz) <= nlv) return 1e3;
        return this.dropDistance(x + dx, y, z + dz, 1, L);
      });
      const min = Math.min(...costs);
      if (min >= 1e3) return;
      dirs.forEach(([dx, dz], i) => {
        if (costs[i] !== min) return;
        const nid = w.getBlock(x + dx, y, z + dz);
        if (LIQUID[nid] && LIQUID[nid] !== L) {
          this.setBlock(x + dx, y, z + dz, water ? B.COBBLE : B.COBBLE);
          return;
        }
        this.flowInto(x + dx, y, z + dz, water ? B.WATER : B.LAVA, nlv);
      });
    }
    canFlowInto(id, L) {
      if (id === 0) return true;
      if (LIQUID[id] === L) return true;
      if (LIQUID[id]) return true;
      const b = blocks[id];
      if (b.door || id === B.LADDER || id === B.SUGARCANE) return false;
      return !SOLID[id] && (b.replaceable || b.render === R.CROSS || b.render === R.TORCH || b.render === R.CROPS || b.render === R.STEM || b.render === R.SNOW);
    }
    dropDistance(x, y, z, depth, L) {
      const w = this.world;
      if (this.canFlowInto(w.getBlock(x, y - 1, z), L) && LIQUID[w.getBlock(x, y - 1, z)] !== L) return depth;
      if (depth >= 4) return 100;
      let best = 100;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nid = w.getBlock(x + dx, y, z + dz);
        if (!this.canFlowInto(nid, L) || LIQUID[nid] === L) continue;
        best = Math.min(best, this.dropDistance(x + dx, y, z + dz, depth + 1, L));
      }
      return best;
    }
    flowInto(x, y, z, id, meta) {
      const w = this.world;
      const cur = w.getBlock(x, y, z);
      if (LIQUID[cur] === LIQUID[id]) {
        const cm = w.getMeta(x, y, z);
        if ((cm & 7) === 0 && !(cm & 8)) return;
        if (!(meta & 8) && !(cm & 8) && (cm & 7) <= (meta & 7)) return;
        if (meta & 8 && cm & 8) return;
      } else if (cur !== 0) {
        this.breakBlock(x, y, z, null, true);
      }
      this.setBlock(x, y, z, id, meta);
    }
    // ------------------------------------------------------------------ fire
    fireTick(x, y, z) {
      const w = this.world;
      const below = w.getBlock(x, y - 1, z);
      const burnable = (xx, yy, zz) => blocks[w.getBlock(xx, yy, zz)] && blocks[w.getBlock(xx, yy, zz)].flammable;
      const anyFuel = burnable(x, y - 1, z) || FACE_DIRS.some(([dx, dy, dz]) => burnable(x + dx, y + dy, z + dz));
      if (below === B.NETHERRACK) {
        this.schedule(x, y, z, 40);
        return;
      }
      if (!anyFuel && !OPAQUE[below]) {
        this.setBlock(x, y, z, 0);
        return;
      }
      if (this.rand() < 0.25) {
        for (const [dx, dy, dz] of FACE_DIRS) {
          const xx = x + dx, yy = y + dy, zz = z + dz;
          if (burnable(xx, yy, zz) && this.rand() < 0.3) {
            if (w.getBlock(xx, yy, zz) === B.TNT) {
              this.setBlock(xx, yy, zz, 0);
              this.addEntity(new PrimedTNT(xx + 0.5, yy, zz + 0.5));
              continue;
            }
            this.setBlock(xx, yy, zz, this.rand() < 0.5 ? B.FIRE : 0);
          }
        }
      }
      if (this.rand() < 0.2 || !anyFuel) {
        this.setBlock(x, y, z, 0);
        return;
      }
      if (this.rand() < 0.3) {
        const xx = x + (this.rand() * 3 | 0) - 1, yy = y + (this.rand() * 3 | 0) - 1, zz = z + (this.rand() * 3 | 0) - 1;
        if (w.getBlock(xx, yy, zz) === 0 && FACE_DIRS.some(([dx, dy, dz]) => burnable(xx + dx, yy + dy, zz + dz))) this.setBlock(xx, yy, zz, B.FIRE);
      }
      this.schedule(x, y, z, 30 + (this.rand() * 10 | 0));
    }
    // ------------------------------------------------------------------ random ticks
    randomTicks() {
      const w = this.world;
      const n = 2048 * 3;
      for (let i = 0; i < n; i++) {
        const r = this.rand() * 2147483647 | 0;
        const x = r & 255, z = r >> 8 & 255, y = r >> 16 & 127;
        const id = w.blocks[idx(x, y, z)];
        if (!id) continue;
        switch (id) {
          case B.GRASS:
            this.tickGrass(x, y, z);
            break;
          case B.DIRT:
            break;
          case B.WHEAT:
            this.tickCrop(x, y, z);
            break;
          case B.PUMPKIN_STEM:
          case B.MELON_STEM:
            this.tickStem(x, y, z, id);
            break;
          case B.SAPLING:
            if (w.getBrightness(x, y + 1, z) >= 9 && this.rand() < 0.15) this.growSapling(x, y, z);
            break;
          case B.SUGARCANE:
          case B.CACTUS:
            this.tickTall(x, y, z, id);
            break;
          case B.LEAVES:
            this.tickLeaves(x, y, z);
            break;
          case B.FARMLAND:
            this.tickFarmland(x, y, z);
            break;
          case B.BROWN_MUSHROOM:
          case B.RED_MUSHROOM:
            this.tickMushroom(x, y, z, id);
            break;
          case B.ICE:
            if (w.getBlockLight(x, y + 1, z) > 11) this.setBlock(x, y, z, B.STILL_WATER);
            break;
          case B.SNOW_LAYER:
            if (w.getBlockLight(x, y, z) > 11) this.setBlock(x, y, z, 0);
            break;
        }
      }
    }
    tickGrass(x, y, z) {
      const w = this.world;
      const above = w.getBlock(x, y + 1, z);
      if (LIGHT_OPACITY[above] > 2 || w.getBrightness(x, y + 1, z) < 4 && LIGHT_OPACITY[above] > 0) {
        this.setBlock(x, y, z, B.DIRT);
        return;
      }
      if (w.getBrightness(x, y + 1, z) >= 9) {
        for (let k = 0; k < 2; k++) {
          const xx = x + (this.rand() * 3 | 0) - 1, yy = y + (this.rand() * 5 | 0) - 3, zz = z + (this.rand() * 3 | 0) - 1;
          if (w.getBlock(xx, yy, zz) === B.DIRT && w.getBrightness(xx, yy + 1, zz) >= 4 && LIGHT_OPACITY[w.getBlock(xx, yy + 1, zz)] <= 2) this.setBlock(xx, yy, zz, B.GRASS);
        }
      }
    }
    isWet(x, y, z) {
      const w = this.world;
      for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = 0; dy <= 1; dy++) if (isWater(w.getBlock(x + dx, y + dy, z + dz))) return true;
      return false;
    }
    tickFarmland(x, y, z) {
      const w = this.world;
      const m = w.getMeta(x, y, z);
      if (this.isWet(x, y, z)) {
        if (m < 7) w.setMeta(x, y, z, 7);
      } else if (m > 0) w.setMeta(x, y, z, m - 1);
      else {
        const above = w.getBlock(x, y + 1, z);
        if (above !== B.WHEAT && above !== B.PUMPKIN_STEM && above !== B.MELON_STEM) this.setBlock(x, y, z, B.DIRT);
      }
    }
    growthChance(x, y, z) {
      const m = this.world.getMeta(x, y - 1, z);
      return m > 0 ? 0.33 : 0.15;
    }
    tickCrop(x, y, z) {
      const w = this.world;
      if (w.getBrightness(x, y + 1, z) < 9) return;
      const m = w.getMeta(x, y, z);
      if (m < 7 && this.rand() < this.growthChance(x, y, z)) w.setMeta(x, y, z, m + 1);
    }
    tickStem(x, y, z, id) {
      const w = this.world;
      if (w.getBrightness(x, y + 1, z) < 9) return;
      const m = w.getMeta(x, y, z);
      if (this.rand() > this.growthChance(x, y, z)) return;
      if (m < 7) {
        w.setMeta(x, y, z, m + 1);
        return;
      }
      const fruit = blocks[id].stem;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx2, dz2]) => w.getBlock(x + dx2, y, z + dz2) === fruit)) return;
      const [dx, dz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][this.rand() * 4 | 0];
      const g = w.getBlock(x + dx, y - 1, z + dz);
      if (w.getBlock(x + dx, y, z + dz) === 0 && (g === B.FARMLAND || g === B.DIRT || g === B.GRASS)) this.setBlock(x + dx, y, z + dz, fruit, fruit === B.PUMPKIN ? 2 + (this.rand() * 4 | 0) : 0);
    }
    tickTall(x, y, z, id) {
      const w = this.world;
      if (w.getBlock(x, y + 1, z) !== 0) return;
      let h = 1;
      while (w.getBlock(x, y - h, z) === id) h++;
      if (h >= 3) return;
      const m = w.getMeta(x, y, z);
      if (m >= 15) {
        w.setMeta(x, y, z, 0, false);
        if (this.canStay(x, y + 1, z, id, 0)) this.setBlock(x, y + 1, z, id, 0);
      } else w.setMeta(x, y, z, m + 1, false);
    }
    tickLeaves(x, y, z) {
      const w = this.world;
      const m = w.getMeta(x, y, z);
      if (m & 4) return;
      const seen = /* @__PURE__ */ new Set();
      const q = [[x, y, z, 0]];
      while (q.length) {
        const [cx, cy, cz, d] = q.shift();
        for (const [dx, dy, dz] of FACE_DIRS) {
          const nx = cx + dx, ny = cy + dy, nz = cz + dz;
          const id = w.getBlock(nx, ny, nz);
          if (id === B.LOG) return;
          if (id === B.LEAVES && d < 4) {
            const k = nx << 16 | ny << 8 | nz;
            if (!seen.has(k)) {
              seen.add(k);
              q.push([nx, ny, nz, d + 1]);
            }
          }
        }
      }
      this.breakBlock(x, y, z, null, true);
    }
    tickMushroom(x, y, z, id) {
      const w = this.world;
      if (this.rand() > 0.04) return;
      let n = 0;
      for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = -1; dy <= 1; dy++) if (w.getBlock(x + dx, y + dy, z + dz) === id) n++;
      if (n >= 5) return;
      const xx = x + (this.rand() * 3 | 0) - 1, yy = y + (this.rand() * 2 | 0) - (this.rand() * 2 | 0), zz = z + (this.rand() * 3 | 0) - 1;
      if (w.getBlock(xx, yy, zz) === 0 && OPAQUE[w.getBlock(xx, yy - 1, zz)] && w.getBrightness(xx, yy, zz) < 13) this.setBlock(xx, yy, zz, id);
    }
    growSapling(x, y, z) {
      const w = this.world;
      const m = w.getMeta(x, y, z);
      if (!(m & 8)) {
        w.setMeta(x, y, z, m | 8, false);
        return false;
      }
      for (let k = 1; k < 6; k++) if (w.getBlock(x, y + k, z) !== 0 && w.getBlock(x, y + k, z) !== B.LEAVES) return false;
      w.setBlock(x, y, z, 0, 0, false);
      const before = /* @__PURE__ */ new Map();
      const box = [];
      for (let dx = -3; dx <= 3; dx++) for (let dy = 0; dy <= 11; dy++) for (let dz = -3; dz <= 3; dz++) box.push([x + dx, y + dy, z + dz, w.getBlock(x + dx, y + dy, z + dz)]);
      const saved = box.map(([bx, by, bz]) => w.inBounds(bx, by, bz) ? [w.blocks[idx(bx, by, bz)], w.meta[idx(bx, by, bz)]] : null);
      growTree(w, x, y, z, m & 3, this.rand);
      const changes = [];
      box.forEach(([bx, by, bz], i) => {
        if (!saved[i]) return;
        const k = idx(bx, by, bz);
        const nid = w.blocks[k], nm = w.meta[k];
        if (nid !== saved[i][0] || nm !== saved[i][1]) {
          changes.push([bx, by, bz, nid, nm]);
          w.blocks[k] = saved[i][0];
          w.meta[k] = saved[i][1];
        }
      });
      for (const [bx, by, bz, nid, nm] of changes) this.setBlock(bx, by, bz, nid, nm);
      this.setBlock(x, y, z, w.getBlock(x, y, z) || B.LOG, w.getMeta(x, y, z) || m & 3);
      return true;
    }
    // ------------------------------------------------------------------ explosions
    explode(x, y, z, power, src) {
      const w = this.world;
      this.fx({ k: "explode", x, y, z, p: power });
      if (!this.authority) return;
      const destroyed = /* @__PURE__ */ new Map();
      const res = (id) => {
        if (id === B.BEDROCK || id === B.INVISIBLE_BEDROCK) return 1e9;
        if (id === B.OBSIDIAN || id === B.GLOWING_OBSIDIAN) return 6e3;
        if (LIQUID[id]) return 500;
        const b = blocks[id];
        return b ? Math.max(0, b.hardness) * 5 : 0;
      };
      for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) for (let k = 0; k < 16; k++) {
        if (i !== 0 && i !== 15 && j !== 0 && j !== 15 && k !== 0 && k !== 15) continue;
        let dx = i / 15 * 2 - 1, dy = j / 15 * 2 - 1, dz = k / 15 * 2 - 1;
        const d = Math.hypot(dx, dy, dz);
        dx /= d;
        dy /= d;
        dz /= d;
        let f = power * (0.7 + this.rand() * 0.6);
        let px2 = x, py = y, pz = z;
        while (f > 0) {
          const bx = Math.floor(px2), by = Math.floor(py), bz = Math.floor(pz);
          const id = w.getBlock(bx, by, bz);
          if (id) {
            f -= (res(id) + 0.3) * 0.3;
            if (f > 0 && w.inBounds(bx, by, bz)) destroyed.set(idx(bx, by, bz), [bx, by, bz, id]);
          }
          px2 += dx * 0.3;
          py += dy * 0.3;
          pz += dz * 0.3;
          f -= 0.225;
        }
      }
      for (const [, [bx, by, bz, id]] of destroyed) {
        if (LIQUID[id]) continue;
        if (id === B.TNT) {
          w.setBlock(bx, by, bz, 0);
          const t = new PrimedTNT(bx + 0.5, by, bz + 0.5, 10 + (this.rand() * 20 | 0));
          this.addEntity(t);
          continue;
        }
        const meta = w.getMeta(bx, by, bz);
        if (this.rand() < 1 / power) this.dropBlock(bx, by, bz, id, meta, null);
        this.dropContainer(bx, by, bz);
        w.setBlock(bx, by, bz, 0);
      }
      const r = power * 2;
      for (const e of [...this.livingEntities(), ...this.entities.values()]) {
        if (e === src || e.removed) continue;
        const dx = e.x - x, dy = e.y + e.h / 2 - y, dz = e.z - z;
        const d = Math.hypot(dx, dy, dz);
        if (d > r) continue;
        const impact = 1 - d / r;
        if (e.living) e.damage(this, Math.floor((impact * impact + impact) / 2 * 8 * power + 1), { explosion: true, entity: src, knock: 0 });
        if (e.type === "item" && impact > 0.3) {
          e.removed = true;
          continue;
        }
        const k = impact / (d || 1);
        e.vx += dx * k;
        e.vy += dy * k + impact * 0.3;
        e.vz += dz * k;
        if (e.type === "player" && e.sink) e.sink.knock(dx * k, dy * k + impact * 0.3, dz * k);
      }
    }
    // ------------------------------------------------------------------ block breaking
    dropBlock(x, y, z, id, meta, player, tool) {
      const b = blocks[id];
      if (!b) return;
      let drops = b.drop(meta, this.rand);
      if (tool && tool.tool === "shears" && (id === B.LEAVES || id === B.TALLGRASS || id === B.COBWEB)) drops = [[id, 1, id === B.LEAVES ? meta & 3 : 0]];
      for (const [did, n, m] of drops) if (n > 0) this.spawnItem(x + 0.5, y + 0.3, z + 0.5, did, n, m);
    }
    dropContainer(x, y, z) {
      const t = this.world.getTile(x, y, z);
      if (!t) return;
      const slots = t.inv ? t.inv.slots : [t.input, t.fuel, t.output];
      for (const s of slots) if (s) this.spawnItem(x + 0.5, y + 0.5, z + 0.5, s.id, s.count, s.meta, s.dmg);
      this.world.tiles.delete(idx(x, y, z));
    }
    // remove a block with drops; player may be null for natural breaks
    breakBlock(x, y, z, player, drops = true) {
      const w = this.world;
      const id = w.getBlock(x, y, z);
      if (!id) return;
      const meta = w.getMeta(x, y, z);
      const b = blocks[id];
      const survival = !player || player.mode !== "creative";
      const held = player ? player.held() : null;
      const tool = held ? getItem(held.id) : null;
      let canHarvest = true;
      if (b.level >= 0 && b.tool === "pickaxe") canHarvest = !!(tool && tool.tool === "pickaxe" && tool.tier >= b.level);
      if (b.id === B.COBWEB) canHarvest = !!(tool && (tool.tool === "sword" || tool.tool === "shears"));
      if (player && drops && survival && canHarvest) {
        if (id === B.TNT) {
          w.setBlock(x, y, z, 0);
          this.addEntity(new PrimedTNT(x + 0.5, y, z + 0.5));
          return;
        }
        this.dropBlock(x, y, z, id, meta, player, tool);
      } else if (!player && drops) {
        this.dropBlock(x, y, z, id, meta, null, null);
      }
      if (b.container) this.dropContainer(x, y, z);
      this.fx({ k: "break", x, y, z, id, m: meta });
      if (b.door) {
        const other = meta & 8 ? y - 1 : y + 1;
        if (w.getBlock(x, other, z) === B.WOOD_DOOR) w.setBlock(x, other, z, 0);
      }
      if (id === B.BED) {
        const d = meta & 3, off = [[0, 1], [-1, 0], [0, -1], [1, 0]][d];
        const s = meta & 8 ? -1 : 1;
        if (w.getBlock(x + off[0] * s, y, z + off[1] * s) === B.BED) w.setBlock(x + off[0] * s, y, z + off[1] * s, 0);
      }
      if (id === B.ICE && survival && player && SOLID[w.getBlock(x, y - 1, z)]) {
        w.setBlock(x, y, z, B.WATER, 0);
        return;
      }
      w.setBlock(x, y, z, 0);
      if (id === B.REACTOR && this.reactor && this.reactor.x === x && this.reactor.y === y && this.reactor.z === z) this.reactor = null;
    }
    // ------------------------------------------------------------------ commands (from local UI or network)
    command(player, cmd) {
      if (!this.authority) return;
      try {
        this._command(player, cmd);
      } catch (e) {
        console.error("command failed", cmd, e);
      }
    }
    _command(p, cmd) {
      const w = this.world;
      const near = (x, y, z) => Math.hypot(x + 0.5 - p.x, y + 0.5 - (p.y + p.eyeH), z + 0.5 - p.z) <= REACH + 2;
      switch (cmd.c) {
        case "sel":
          p.sel = Math.max(0, Math.min(8, cmd.s | 0));
          this.dirtyEntity(p);
          break;
        case "swing":
          p.swing = 1;
          this.fx({ k: "swing", id: p.id });
          break;
        case "dig": {
          const { x, y, z } = cmd;
          if (!near(x, y, z) || p.deathTime) return;
          const id = w.getBlock(x, y, z);
          if (!id || blocks[id].hardness < 0 || blocks[id].liquid) return;
          this.breakBlock(x, y, z, p, true);
          if (p.mode !== "creative") this.damageTool(p, 1);
          break;
        }
        case "use":
          this.useOnBlock(p, cmd);
          break;
        case "useItem":
          this.useItem(p, cmd);
          break;
        case "attack": {
          const e = this.getEntity(cmd.id);
          if (!e || e === p || p.deathTime) return;
          if (Math.sqrt(e.dist2(p)) > REACH + 1) return;
          if (e.type === "painting") {
            this.removeEntity(e);
            if (p.mode !== "creative") this.spawnItem(e.x, e.y + 0.5, e.z, I.PAINTING, 1, 0);
            this.fx({ k: "snd", s: "wood", x: e.x, y: e.y, z: e.z });
            return;
          }
          if (!e.living) return;
          if (e.type === "player" && !this.pvp) return;
          const h = p.held();
          const it = h ? getItem(h.id) : null;
          const dmg = it && it.damage ? it.damage : 1;
          if (e.damage(this, dmg, { entity: p, knock: 0.4 })) {
            if (it && it.tool && p.mode !== "creative") this.damageTool(p, it.tool === "sword" ? 1 : 2);
          }
          break;
        }
        case "interact": {
          const e = this.getEntity(cmd.id);
          if (!e || Math.sqrt(e.dist2(p)) > REACH + 1) return;
          const h = p.held();
          if (e.type === "sheep" && h) {
            if (h.id === I.SHEARS && !e.sheared) {
              e.sheared = true;
              this.dirtyEntity(e);
              const n = 1 + (this.rand() * 3 | 0);
              for (let i = 0; i < n; i++) this.spawnItem(e.x, e.y + 1, e.z, B.WOOL, 1, e.woolColor);
              this.damageTool(p, 1);
              this.fx({ k: "snd", s: "shear", x: e.x, y: e.y, z: e.z });
            } else if (h.id === I.DYE && !e.sheared) {
              const c = 15 - (h.meta & 15);
              if (e.woolColor !== c) {
                e.applyExtra({ c, s: 0 });
                this.dirtyEntity(e);
                this.consume(p, 1);
              }
            }
          }
          break;
        }
        case "drop": {
          const s = p.inv.slots[cmd.s];
          if (!s) return;
          const n = cmd.all ? s.count : 1;
          const fx = Math.sin(p.yaw) * Math.cos(p.pitch), fz = -Math.cos(p.yaw) * Math.cos(p.pitch);
          const e = this.spawnItem(p.x + fx * 0.5, p.y + p.eyeH - 0.3, p.z + fz * 0.5, s.id, n, s.meta, s.dmg, false);
          if (e) {
            e.vx = fx * 0.3;
            e.vz = fz * 0.3;
            e.vy = 0.1 - Math.sin(p.pitch) * 0.3;
            e.pickupDelay = 40;
          }
          s.count -= n;
          if (s.count <= 0) p.inv.slots[cmd.s] = null;
          this.syncInv(p);
          break;
        }
        case "invMove": {
          const a = cmd.a | 0, b = cmd.b | 0;
          if (a < 0 || b < 0 || a >= 36 || b >= 36) return;
          const sa = p.inv.slots[a], sb = p.inv.slots[b];
          if (sa && sb && sa.id === sb.id && sa.meta === sb.meta && !sa.dmg && !sb.dmg && cmd.merge) {
            const ms = maxStack(sa.id);
            const n = Math.min(ms - sb.count, sa.count);
            sb.count += n;
            sa.count -= n;
            if (sa.count <= 0) p.inv.slots[a] = null;
          } else {
            p.inv.slots[a] = sb;
            p.inv.slots[b] = sa;
          }
          this.syncInv(p);
          this.dirtyEntity(p);
          break;
        }
        case "creative": {
          if (p.mode !== "creative") return;
          const slot = cmd.s === void 0 ? p.sel : cmd.s | 0;
          if (cmd.id === 0) p.inv.slots[slot] = null;
          else p.inv.slots[slot] = { id: cmd.id | 0, count: Math.min(maxStack(cmd.id), cmd.n || maxStack(cmd.id)), meta: cmd.m | 0, dmg: 0 };
          this.syncInv(p);
          this.dirtyEntity(p);
          break;
        }
        case "craft": {
          const r = recipes[cmd.r | 0];
          if (!r) return;
          const table = cmd.table && this.nearBlock(p, B.WORKBENCH, 6);
          let times = Math.max(1, Math.min(64, cmd.n | 0 || 1));
          let made = 0;
          while (times-- > 0 && canCraft(p.inv, r, table)) {
            for (const [id, n, m] of r.in) p.inv.remove(id, n, m);
            const left = p.inv.add(r.out[0], r.out[1], r.out[2]);
            if (left > 0) this.spawnItem(p.x, p.y + 1, p.z, r.out[0], left, r.out[2]);
            made++;
          }
          if (made) {
            this.syncInv(p);
            this.fx({ k: "snd", s: "craft", x: p.x, y: p.y, z: p.z, only: p.id });
          }
          break;
        }
        case "cont":
          this.containerAction(p, cmd);
          break;
        case "close":
          p.openContainer = null;
          break;
        case "respawn":
          if (p.deathTime > 0) this.respawn(p);
          break;
        case "fall":
          if (cmd.d > 0 && cmd.d < 200) p.damage(this, cmd.d | 0, { fall: true });
          break;
        case "wake":
          this.wake(p);
          break;
        case "mode":
          if (cmd.m === "creative" || cmd.m === "survival") {
            p.mode = cmd.m;
            if (p.sink) p.sink.mode(p.mode);
          }
          break;
        case "chat":
          if (typeof cmd.t === "string" && cmd.t.length < 200) this.broadcastMsg(`<${p.name}> ${cmd.t}`);
          break;
        case "bow":
          this.shootBow(p, cmd.charge || 0);
          break;
      }
    }
    nearBlock(p, id, r) {
      const w = this.world;
      const cx = Math.floor(p.x), cy = Math.floor(p.y), cz = Math.floor(p.z);
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) if (w.getBlock(cx + dx, cy + dy, cz + dz) === id) return true;
      return false;
    }
    consume(p, n = 1) {
      if (p.mode === "creative") return;
      const s = p.held();
      if (!s) return;
      s.count -= n;
      if (s.count <= 0) p.inv.slots[p.sel] = null;
      this.syncInv(p);
      this.dirtyEntity(p);
    }
    damageTool(p, n) {
      const s = p.held();
      if (!s) return;
      const it = getItem(s.id);
      if (!it || !it.durability) return;
      s.dmg = (s.dmg || 0) + n;
      if (s.dmg >= it.durability) {
        p.inv.slots[p.sel] = null;
        this.fx({ k: "snd", s: "toolbreak", x: p.x, y: p.y, z: p.z });
        this.dirtyEntity(p);
      }
      this.syncInv(p);
    }
    syncInv(p) {
      if (p.sink) p.sink.inv();
    }
    // ------------------------------------------------------------------ use on block / placement
    useOnBlock(p, cmd) {
      const w = this.world;
      const { x, y, z, f } = cmd;
      if (p.deathTime || !w.inBounds(x, y, z)) return;
      if (Math.hypot(x + 0.5 - p.x, y + 0.5 - (p.y + p.eyeH), z + 0.5 - p.z) > REACH + 2) return;
      const id = w.getBlock(x, y, z);
      const meta = w.getMeta(x, y, z);
      const held = p.held();
      const item2 = held ? held.id >= 256 ? getItem(held.id) : null : null;
      if (!p.sneak) {
        if (id === B.WOOD_DOOR) {
          const ly = meta & 8 ? y - 1 : y;
          const lm = w.getMeta(x, ly, z);
          w.setMeta(x, ly, z, lm ^ 4);
          w.setMeta(x, ly + 1, z, w.getMeta(x, ly + 1, z));
          this.markDirty(x, ly + 1, z);
          this.fx({ k: "snd", s: "door", x: x + 0.5, y: y + 0.5, z: z + 0.5 });
          return;
        }
        if (id === B.TRAPDOOR || id === B.FENCE_GATE) {
          let nm = meta ^ 4;
          if (id === B.FENCE_GATE && !(meta & 4)) {
            const q = yawQuadrant(p.yaw);
            nm = nm & ~1 | (q === 1 || q === 3 ? 1 : 0);
            if ((meta & 1) !== 0 !== (q === 1 || q === 3)) nm = meta & 1 | 4;
          }
          w.setMeta(x, y, z, nm);
          this.fx({ k: "snd", s: "door", x: x + 0.5, y: y + 0.5, z: z + 0.5 });
          return;
        }
        if (id === B.BED) {
          this.trySleep(p, x, y, z, meta);
          return;
        }
        if (id === B.CHEST || id === B.FURNACE || id === B.LIT_FURNACE) {
          this.openContainer(p, x, y, z, id);
          return;
        }
        if (id === B.WORKBENCH) {
          if (p.sink) p.sink.open("workbench", { x, y, z });
          return;
        }
        if (id === B.REACTOR) {
          this.activateReactor(p, x, y, z);
          return;
        }
      }
      if (held) {
        if (item2 && item2.tool === "hoe" && f !== 0 && (id === B.GRASS || id === B.DIRT) && w.getBlock(x, y + 1, z) === 0) {
          this.setBlock(x, y, z, B.FARMLAND, 0);
          this.fx({ k: "snd", s: "gravel", x: x + 0.5, y: y + 1, z: z + 0.5 });
          if (p.mode !== "creative") this.damageTool(p, 1);
          return;
        }
        if (held.id === I.DYE && (held.meta & 15) === 15) {
          if (this.boneMeal(x, y, z, id, meta)) {
            this.consume(p);
            this.fx({ k: "bonemeal", x, y, z });
          }
          return;
        }
        if (held.id === I.FLINT_STEEL) {
          if (id === B.TNT) {
            w.setBlock(x, y, z, 0);
            this.addEntity(new PrimedTNT(x + 0.5, y, z + 0.5));
            this.fx({ k: "snd", s: "fuse", x, y, z });
          } else {
            const [dx, dy, dz] = FACE_DIRS[f];
            if (w.getBlock(x + dx, y + dy, z + dz) === 0) {
              this.setBlock(x + dx, y + dy, z + dz, B.FIRE);
              this.schedule(x + dx, y + dy, z + dz, 20);
              this.fx({ k: "snd", s: "ignite", x, y, z });
            }
          }
          if (p.mode !== "creative") this.damageTool(p, 1);
          return;
        }
        if (held.id === I.PAINTING) {
          this.placePainting(p, x, y, z, f);
          return;
        }
        this.placeFromItem(p, held, item2, x, y, z, f, cmd);
      }
    }
    markDirty(x, y, z) {
      for (const h of this.hooks.blockChange) h(x, y, z, this.world.getBlock(x, y, z), this.world.getMeta(x, y, z));
    }
    boneMeal(x, y, z, id, meta) {
      const w = this.world;
      if (id === B.SAPLING) {
        w.setMeta(x, y, z, meta | 8, false);
        return this.growSapling(x, y, z) || true;
      }
      if (id === B.WHEAT) {
        if ((meta & 7) < 7) {
          w.setMeta(x, y, z, 7);
          return true;
        }
        return false;
      }
      if (id === B.PUMPKIN_STEM || id === B.MELON_STEM) {
        if ((meta & 7) < 7) {
          w.setMeta(x, y, z, 7);
          return true;
        }
        return false;
      }
      if (id === B.BROWN_MUSHROOM || id === B.RED_MUSHROOM) {
        let placed = 0;
        for (let k = 0; k < 8; k++) {
          const xx = x + (this.rand() * 5 | 0) - 2, zz = z + (this.rand() * 5 | 0) - 2;
          if (w.getBlock(xx, y, zz) === 0 && OPAQUE[w.getBlock(xx, y - 1, zz)]) {
            this.setBlock(xx, y, zz, id);
            placed++;
          }
        }
        return placed > 0;
      }
      if (id === B.GRASS) {
        for (let k = 0; k < 40; k++) {
          const xx = x + (this.rand() * 7 | 0) - 3, zz = z + (this.rand() * 7 | 0) - 3, yy = y + (this.rand() * 3 | 0) - 1;
          if (w.getBlock(xx, yy, zz) === B.GRASS && w.getBlock(xx, yy + 1, zz) === 0) {
            const r = this.rand();
            this.setBlock(xx, yy + 1, zz, r < 0.8 ? B.TALLGRASS : r < 0.9 ? B.DANDELION : B.ROSE, r < 0.8 ? 1 : 0);
          }
        }
        return true;
      }
      return false;
    }
    entityBlocks(x, y, z) {
      for (const e of this.livingEntities()) {
        const hw = e.w / 2;
        if (e.x + hw > x && e.x - hw < x + 1 && e.y + e.h > y && e.y < y + 1 && e.z + hw > z && e.z - hw < z + 1) return true;
      }
      return false;
    }
    placeFromItem(p, held, item2, x, y, z, f, cmd) {
      const w = this.world;
      const clicked = w.getBlock(x, y, z);
      let tx = x, ty = y, tz = z;
      const replaceClicked = clicked === 0 || blocks[clicked].replaceable && clicked !== held.id;
      if (!replaceClicked) {
        const [dx, dy, dz] = FACE_DIRS[f];
        tx += dx;
        ty += dy;
        tz += dz;
      }
      if (!w.inBounds(tx, ty, tz)) return;
      let placeId = 0, placeMeta = 0;
      const q = yawQuadrant(p.yaw);
      const hy = cmd.hy !== void 0 ? cmd.hy : 0.5;
      if (held.id < 256) {
        placeId = held.id;
        placeMeta = blocks[held.id].metaItem ? held.meta : 0;
      } else if (item2 && item2.plant) {
        if (f !== 1) return;
        placeId = item2.plant;
        if (w.getBlock(tx, ty - 1, tz) !== B.FARMLAND) return;
      } else if (item2 && item2.plantCane) placeId = B.SUGARCANE;
      else if (held.id === I.DOOR) {
        this.placeDoor(p, tx, ty, tz, q);
        return;
      } else if (held.id === I.BED) {
        this.placeBed(p, tx, ty, tz, q);
        return;
      } else return;
      const target = w.getBlock(tx, ty, tz);
      if (placeId === B.SLAB) {
        const sm = held.meta & 7;
        if (clicked === B.SLAB && (w.getMeta(x, y, z) & 7) === sm && (f === 1 && !(w.getMeta(x, y, z) & 8) || f === 0 && w.getMeta(x, y, z) & 8)) {
          this.setBlock(x, y, z, B.DOUBLE_SLAB, sm);
          this.consume(p);
          this.placeSound(B.SLAB, x, y, z);
          return;
        }
        if (target === B.SLAB && (w.getMeta(tx, ty, tz) & 7) === sm) {
          this.setBlock(tx, ty, tz, B.DOUBLE_SLAB, sm);
          this.consume(p);
          this.placeSound(B.SLAB, tx, ty, tz);
          return;
        }
        placeMeta = sm | (f === 0 || f > 1 && hy > 0.5 ? 8 : 0);
      }
      if (target !== 0 && !blocks[target].replaceable) return;
      const b = blocks[placeId];
      if (!b) return;
      switch (b.render) {
        case R.STAIRS:
          placeMeta = [2, 0, 3, 1][q] === void 0 ? 0 : { 0: 3, 1: 0, 2: 2, 3: 1 }[q];
          if (f === 0 || f > 1 && hy > 0.5) placeMeta |= 4;
          break;
        case R.TORCH:
          if (f === 0) return;
          placeMeta = f === 1 ? 5 : { 5: 1, 4: 2, 3: 3, 2: 4 }[f];
          break;
        case R.LADDER:
          if (f < 2) return;
          placeMeta = f;
          break;
        case R.TRAPDOOR:
          placeMeta = f >= 2 ? { 2: 0, 3: 1, 4: 2, 5: 3 }[f] : { 0: 1, 1: 2, 2: 0, 3: 3 }[q];
          if (f === 0 || f > 1 && hy > 0.5) placeMeta |= 8;
          break;
        case R.GATE:
          placeMeta = q === 1 || q === 3 ? 1 : 0;
          break;
      }
      if (b.container || placeId === B.PUMPKIN || placeId === B.FURNACE) placeMeta = FRONT_FACING_PLAYER[q];
      if (placeId === B.LEAVES) placeMeta = placeMeta & 3 | 4;
      if (!this.canStay(tx, ty, tz, placeId, placeMeta)) return;
      if (SOLID[placeId] && this.entityBlocks(tx, ty, tz)) return;
      this.setBlock(tx, ty, tz, placeId, placeMeta);
      if (b.container === "chest") w.setTile(tx, ty, tz, { kind: "chest", inv: new Inventory(27) });
      if (b.container === "furnace") w.setTile(tx, ty, tz, newFurnace());
      if (b.gravity) this.schedule(tx, ty, tz, 2);
      if (b.liquid) this.schedule(tx, ty, tz, 5);
      this.consume(p);
      this.placeSound(placeId, tx, ty, tz);
    }
    placeSound(id, x, y, z) {
      this.fx({ k: "place", id, x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    }
    placeDoor(p, x, y, z, q) {
      const w = this.world;
      if (w.getBlock(x, y, z) !== 0 && !blocks[w.getBlock(x, y, z)].replaceable) return;
      if (w.getBlock(x, y + 1, z) !== 0 || !SOLID[w.getBlock(x, y - 1, z)]) return;
      if (this.entityBlocks(x, y, z) || this.entityBlocks(x, y + 1, z)) return;
      const facing = [3, 0, 1, 2][q];
      const hinge = this.doorHinge(x, y, z, facing);
      w.setBlock(x, y, z, B.WOOD_DOOR, facing);
      w.setBlock(x, y + 1, z, B.WOOD_DOOR, 8 | hinge);
      this.consume(p);
      this.placeSound(B.WOOD_DOOR, x, y, z);
    }
    doorHinge(x, y, z, facing) {
      const side = [[0, 1], [1, 0], [0, -1], [-1, 0]][facing];
      return this.world.getBlock(x + side[0], y, z + side[1]) === B.WOOD_DOOR ? 1 : 0;
    }
    placeBed(p, x, y, z, q) {
      const w = this.world;
      const d = [2, 3, 0, 1][q];
      const off = [[0, 1], [-1, 0], [0, -1], [1, 0]][d];
      const hx = x + off[0], hz = z + off[1];
      const free = (xx, zz) => (w.getBlock(xx, y, zz) === 0 || blocks[w.getBlock(xx, y, zz)].replaceable) && SOLID[w.getBlock(xx, y - 1, zz)] && !this.entityBlocks(xx, y, zz);
      if (!free(x, z) || !free(hx, hz)) return;
      w.setBlock(x, y, z, B.BED, d);
      w.setBlock(hx, y, hz, B.BED, d | 8);
      this.consume(p);
      this.placeSound(B.BED, x, y, z);
    }
    placePainting(p, x, y, z, f) {
      if (f < 2) return;
      const w = this.world;
      if (!OPAQUE[w.getBlock(x, y, z)]) return;
      const [dx, , dz] = FACE_DIRS[f];
      const bx = x + dx, by = y, bz = z + dz;
      const fits = [];
      for (let a = 0; a < PAINTINGS.length; a++) {
        const art = PAINTINGS[a];
        for (let ox = 0; ox < art.w; ox++) for (let oy = 0; oy < art.h; oy++) {
          let ax = bx, az = bz;
          if (f === 2) ax += ox;
          else if (f === 3) ax -= ox;
          else if (f === 4) az -= ox;
          else az += ox;
          const pt2 = new Painting(ax, by - oy, az, f, a);
          pt2.id = -1;
          if (pt2.valid(w) && !this.paintingOverlap(pt2)) fits.push([art.w * art.h, pt2]);
        }
      }
      if (!fits.length) return;
      const maxA = Math.max(...fits.map((q) => q[0]));
      const cands = fits.filter((q) => q[0] === maxA);
      const choice = cands[this.rand() * cands.length | 0][1];
      const pt = new Painting(choice.bx, choice.by, choice.bz, choice.dir, choice.art);
      this.addEntity(pt);
      this.consume(p);
      this.fx({ k: "snd", s: "wood", x: pt.x, y: pt.y, z: pt.z });
    }
    paintingOverlap(pt) {
      const cells = new Set(pt.cells().map((c) => c.join(",")));
      for (const e of this.entities.values()) if (e.type === "painting" && e.dir === pt.dir) {
        for (const c of e.cells()) if (cells.has(c.join(","))) return true;
      }
      return false;
    }
    // ------------------------------------------------------------------ items used in the air
    useItem(p, cmd) {
      const h = p.held();
      if (!h || p.deathTime) return;
      const it = getItem(h.id);
      if (!it) return;
      if (it.food) {
        if (p.health >= p.maxHealth && p.mode !== "creative") return;
        p.health = Math.min(p.maxHealth, p.health + it.food);
        this.fx({ k: "snd", s: "eat", x: p.x, y: p.y, z: p.z });
        if (p.mode !== "creative") {
          h.count--;
          if (h.count <= 0) p.inv.slots[p.sel] = it.leaves ? { id: it.leaves, count: 1, meta: 0, dmg: 0 } : null;
          this.syncInv(p);
        }
        if (p.sink) p.sink.hp();
        return;
      }
      if (it.use === "throw") {
        const e = new Thrown(h.id === I.EGG ? "egg" : "snowball", p.x, p.y + p.eyeH - 0.1, p.z, p);
        const fx = Math.sin(p.yaw) * Math.cos(p.pitch), fy = -Math.sin(p.pitch), fz = -Math.cos(p.yaw) * Math.cos(p.pitch);
        e.vx = fx * 1.5;
        e.vy = fy * 1.5;
        e.vz = fz * 1.5;
        this.addEntity(e);
        this.consume(p);
        this.fx({ k: "snd", s: "throw", x: p.x, y: p.y, z: p.z });
      }
    }
    shootBow(p, charge) {
      const h = p.held();
      if (!h || h.id !== I.BOW || p.deathTime) return;
      if (p.mode !== "creative" && p.inv.count(I.ARROW) <= 0) return;
      charge = Math.max(0, Math.min(1, charge));
      if (charge < 0.1) return;
      const a = new Arrow(p.x, p.y + p.eyeH - 0.1, p.z, p);
      const fx = Math.sin(p.yaw) * Math.cos(p.pitch), fy = -Math.sin(p.pitch), fz = -Math.cos(p.yaw) * Math.cos(p.pitch);
      a.shoot(fx, fy, fz, charge * 3, 1);
      a.dmg = 2 + (charge >= 1 ? 1 : 0);
      a.ownerPlayer = p.id;
      this.addEntity(a);
      if (p.mode !== "creative") {
        p.inv.remove(I.ARROW, 1);
        this.damageTool(p, 1);
        this.syncInv(p);
      }
      this.fx({ k: "snd", s: "bow", x: p.x, y: p.y, z: p.z });
    }
    // ------------------------------------------------------------------ containers
    openContainer(p, x, y, z, id) {
      const w = this.world;
      let t = w.getTile(x, y, z);
      if (!t) {
        t = blocks[id].container === "chest" ? { kind: "chest", inv: new Inventory(27) } : newFurnace();
        w.setTile(x, y, z, t);
      }
      p.openContainer = { x, y, z };
      if (p.sink) p.sink.open(t.kind, { x, y, z, state: containerState(t) });
      if (t.kind === "chest") this.fx({ k: "snd", s: "chestopen", x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    }
    containerAction(p, cmd) {
      if (!p.openContainer) return;
      const { x, y, z } = p.openContainer;
      const t = this.world.getTile(x, y, z);
      if (!t) return;
      const inv = p.inv;
      if (t.kind === "chest") {
        if (cmd.act === "take") {
          const s = t.inv.slots[cmd.s | 0];
          if (!s) return;
          const left = inv.add(s.id, s.count, s.meta, s.dmg);
          if (left === 0) t.inv.slots[cmd.s | 0] = null;
          else s.count = left;
        } else if (cmd.act === "put") {
          const s = inv.slots[cmd.s | 0];
          if (!s) return;
          const left = t.inv.add(s.id, s.count, s.meta, s.dmg);
          if (left === 0) inv.slots[cmd.s | 0] = null;
          else s.count = left;
        }
      } else if (t.kind === "furnace") {
        if (cmd.act === "put") {
          const s = inv.slots[cmd.s | 0];
          if (!s) return;
          const toFuel = cmd.to === "fuel";
          const key = toFuel ? "fuel" : "input";
          if (toFuel && !fuelTime(s.id)) return;
          if (!toFuel && !smelting.has(s.id)) return;
          const cur = t[key];
          if (cur && (cur.id !== s.id || cur.meta !== s.meta)) {
            inv.slots[cmd.s | 0] = cur;
            t[key] = s;
          } else if (cur) {
            const n = Math.min(64 - cur.count, s.count);
            cur.count += n;
            s.count -= n;
            if (s.count <= 0) inv.slots[cmd.s | 0] = null;
          } else {
            t[key] = s;
            inv.slots[cmd.s | 0] = null;
          }
        } else if (cmd.act === "take") {
          const key = cmd.from;
          if (!["input", "fuel", "output"].includes(key)) return;
          const s = t[key];
          if (!s) return;
          const left = inv.add(s.id, s.count, s.meta, s.dmg);
          if (left === 0) t[key] = null;
          else s.count = left;
        }
      }
      this.syncInv(p);
      this.syncContainer(x, y, z);
    }
    syncContainer(x, y, z) {
      const t = this.world.getTile(x, y, z);
      if (!t) return;
      const st = containerState(t);
      for (const p of this.players.values()) {
        if (p.openContainer && p.openContainer.x === x && p.openContainer.y === y && p.openContainer.z === z && p.sink) p.sink.cont(st);
      }
    }
    tickFurnaces() {
      const w = this.world;
      for (const [k, t] of w.tiles) {
        if (t.kind !== "furnace") continue;
        const y = k & 127, z = k >> 7 & 255, x = k >> 15;
        const wasBurning = t.burn > 0;
        let changed = false;
        if (t.burn > 0) t.burn--;
        const res = t.input ? smelting.get(t.input.id) : null;
        const canSmelt = res && (!t.output || t.output.id === res[0] && t.output.meta === res[2] && t.output.count < maxStack(res[0]));
        if (t.burn <= 0 && canSmelt && t.fuel) {
          const ft = fuelTime(t.fuel.id);
          if (ft) {
            t.burn = t.burnMax = ft;
            t.fuel.count--;
            if (t.fuel.count <= 0) t.fuel = null;
            changed = true;
          }
        }
        if (t.burn > 0 && canSmelt) {
          t.cook++;
          if (t.cook >= 200) {
            t.cook = 0;
            t.input.count--;
            if (t.input.count <= 0) t.input = null;
            if (t.output) t.output.count += res[1];
            else t.output = { id: res[0], count: res[1], meta: res[2], dmg: 0 };
            changed = true;
          }
        } else if (t.cook > 0) t.cook = Math.max(0, t.cook - 2);
        const burning = t.burn > 0;
        if (burning !== wasBurning) {
          const meta = w.getMeta(x, y, z);
          w.setBlock(x, y, z, burning ? B.LIT_FURNACE : B.FURNACE, meta);
          w.setTile(x, y, z, t);
          changed = true;
        }
        if (changed || this.tick % 10 === 0) this.syncContainer(x, y, z);
      }
    }
    // ------------------------------------------------------------------ sleeping
    trySleep(p, x, y, z, meta) {
      if (this.isDay()) {
        this.msg(p, "You can only sleep at night");
        return;
      }
      for (const e of this.entities.values()) if (HOSTILE.has(e.type) && e.dist2(p) < 64) {
        this.msg(p, "You may not rest now, there are monsters nearby");
        return;
      }
      let hx = x, hz = z;
      if (!(meta & 8)) {
        const off = [[0, 1], [-1, 0], [0, -1], [1, 0]][meta & 3];
        hx += off[0];
        hz += off[1];
      }
      p.sleeping = { x: hx, y, z: hz, d: meta & 3 };
      p.spawnPoint = [hx + 0.5, y + 1, hz + 0.5];
      if (p.sink) p.sink.sleep(p.sleeping);
      this.dirtyEntity(p);
    }
    wake(p) {
      if (!p.sleeping) return;
      const s = p.sleeping;
      p.sleeping = null;
      if (p.sink) p.sink.sleep(null, [s.x + 0.5, s.y + 0.6, s.z + 0.5]);
      this.dirtyEntity(p);
    }
    tickSleep() {
      const ps = [...this.players.values()].filter((p) => p.deathTime === 0);
      if (!ps.length) return;
      if (ps.every((p) => p.sleeping)) {
        this.sleepTicks++;
        if (this.sleepTicks > 100) {
          this.world.time = Math.ceil(this.world.time / DAY) * DAY;
          for (const p of ps) {
            p.health = p.maxHealth;
            if (p.sink) p.sink.hp();
            this.wake(p);
          }
          this.sleepTicks = 0;
          if (this.onTimeJump) this.onTimeJump();
        }
      } else this.sleepTicks = 0;
    }
    // ------------------------------------------------------------------ players
    respawn(p) {
      const sp = this.validSpawn(p);
      p.x = sp[0];
      p.y = sp[1];
      p.z = sp[2];
      p.vx = p.vy = p.vz = 0;
      p.health = p.maxHealth;
      p.deathTime = 0;
      p.fire = 0;
      p.air = 300;
      p.fallDist = 0;
      p.sleeping = null;
      if (p.sink) {
        p.sink.teleport(p.x, p.y, p.z);
        p.sink.hp();
        p.sink.inv();
      }
      this.dirtyEntity(p);
    }
    validSpawn(p) {
      const w = this.world;
      if (p.spawnPoint) {
        const [x2, y, z2] = p.spawnPoint;
        if (w.getBlock(Math.floor(x2), Math.floor(y - 1), Math.floor(z2)) === B.BED) {
          for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
            const bx = Math.floor(x2) + dx, bz = Math.floor(z2) + dz, by = Math.floor(y) - 1;
            if (!SOLID[w.getBlock(bx, by + 1, bz)] && !SOLID[w.getBlock(bx, by + 2, bz)] && dx !== 0 | dz !== 0) return [bx + 0.5, by + 1, bz + 0.5];
          }
        }
        p.spawnPoint = null;
      }
      const [sx, , sz] = w.spawn;
      const x = Math.floor(sx) + (this.rand() * 5 | 0) - 2, z = Math.floor(sz) + (this.rand() * 5 | 0) - 2;
      return [x + 0.5, w.surfaceY(x, z) + 1, z + 0.5];
    }
    playerDied(p) {
      if (p.mode !== "creative") {
        for (let i = 0; i < p.inv.size; i++) {
          const s = p.inv.slots[i];
          if (s) {
            const e = this.spawnItem(p.x, p.y + 1, p.z, s.id, s.count, s.meta, s.dmg);
            if (e) {
              e.vx = (this.rand() - 0.5) * 0.6;
              e.vz = (this.rand() - 0.5) * 0.6;
              e.pickupDelay = 40;
            }
            p.inv.slots[i] = null;
          }
        }
        this.syncInv(p);
      }
      this.broadcastMsg(`${p.name} died`);
    }
    // server-side per-player logic (env damage + pickup)
    tickPlayer(p) {
      if (p.removed) return;
      if (p.swing > 0) p.swing = Math.max(0, p.swing - 0.15);
      if (p.deathTime > 0) {
        p.deathTime++;
        return;
      }
      const env2 = liquidAt(this.world, p);
      p.inWater = env2.water;
      p.inLava = env2.lava;
      p.baseTick(this);
      if (env2.cactus && p.age % 10 === 0) p.damage(this, 1, { cactus: true });
      if (p.hurtTimeSent !== p.hurtTime && p.sink) {
        p.sink.hp();
      }
      p.hurtTimeSent = p.hurtTime;
      if (p.age % 20 === 0 && p.sink) p.sink.hp();
      for (const e of this.entities.values()) {
        if (e.type === "item" && !e.removed && e.pickupDelay <= 0) {
          const dx = e.x - p.x, dy = e.y - (p.y + 0.5), dz = e.z - p.z;
          if (dx * dx + dz * dz < 2.2 && dy > -2.1 && dy < 1.9) {
            const left = p.inv.add(e.item.id, e.item.count, e.item.meta, e.item.dmg);
            if (left < e.item.count) {
              this.fx({ k: "pickup", id: e.id, to: p.id, x: e.x, y: e.y, z: e.z });
              if (left === 0) this.removeEntity(e);
              else {
                e.item.count = left;
                this.dirtyEntity(e);
              }
              this.syncInv(p);
              this.dirtyEntity(p);
            }
          }
        } else if (e.type === "arrow" && e.stuck && e.fromPlayer && e.age > 10) {
          if (e.dist2(p) < 2) {
            if (p.inv.add(I.ARROW, 1) === 0) {
              this.removeEntity(e);
              this.syncInv(p);
              this.fx({ k: "pickup", id: e.id, to: p.id, x: e.x, y: e.y, z: e.z });
            }
          }
        }
      }
    }
    // ------------------------------------------------------------------ mob spawning
    countMobs() {
      let a = 0, h = 0;
      for (const e of this.entities.values()) {
        if (HOSTILE.has(e.type)) h++;
        else if (e.type === "pig" || e.type === "cow" || e.type === "chicken" || e.type === "sheep") a++;
      }
      return [a, h];
    }
    spawnAnimals(n) {
      const w = this.world;
      const types = ["pig", "cow", "chicken", "sheep"];
      let made = 0;
      for (let tries = 0; tries < n * 20 && made < n; tries++) {
        const x = 4 + (this.rand() * (WX - 8) | 0), z = 4 + (this.rand() * (WZ - 8) | 0);
        const y = w.surfaceY(x, z);
        if (w.getBlock(x, y, z) !== B.GRASS || w.getBlock(x, y + 1, z) !== 0) continue;
        const t = types[this.rand() * types.length | 0];
        const grp = 2 + (this.rand() * 3 | 0);
        for (let g = 0; g < grp && made < n; g++) {
          const xx = x + (this.rand() * 5 | 0) - 2, zz = z + (this.rand() * 5 | 0) - 2, yy = w.surfaceY(xx, zz);
          if (w.getBlock(xx, yy, zz) !== B.GRASS || SOLID[w.getBlock(xx, yy + 1, zz)]) continue;
          let e;
          if (t === "sheep") {
            const r = this.rand();
            e = new Sheep(xx + 0.5, yy + 1, zz + 0.5, r < 0.8 ? 0 : r < 0.88 ? 7 : r < 0.94 ? 8 : r < 0.97 ? 15 : 12);
          } else e = new MOB_CLASSES[t](xx + 0.5, yy + 1, zz + 0.5);
          e.yaw = this.rand() * Math.PI * 2;
          this.addEntity(e);
          made++;
        }
      }
      return made;
    }
    spawnMonsters() {
      if (this.difficulty === "peaceful") return;
      const w = this.world;
      const survivors = [...this.players.values()].filter((p2) => p2.mode !== "creative" && p2.deathTime === 0);
      if (!survivors.length) return;
      const [, h] = this.countMobs();
      if (h >= 18) return;
      const p = survivors[this.rand() * survivors.length | 0];
      for (let tries = 0; tries < 4; tries++) {
        const ang = this.rand() * Math.PI * 2, dist = 20 + this.rand() * 28;
        const x = Math.floor(p.x + Math.cos(ang) * dist), z = Math.floor(p.z + Math.sin(ang) * dist);
        if (x < 1 || z < 1 || x >= WX - 1 || z >= WZ - 1) continue;
        const y = Math.max(1, Math.min(WY - 3, Math.floor(p.y + (this.rand() - 0.5) * 30)));
        let yy = y;
        while (yy > 1 && !SOLID[w.getBlock(x, yy - 1, z)]) yy--;
        if (!OPAQUE[w.getBlock(x, yy - 1, z)] || SOLID[w.getBlock(x, yy, z)] || SOLID[w.getBlock(x, yy + 1, z)] || LIQUID[w.getBlock(x, yy, z)]) continue;
        if (w.getBrightness(x, yy, z) > 7) continue;
        let tooClose = false;
        for (const q of this.players.values()) if ((q.x - x) ** 2 + (q.y - yy) ** 2 + (q.z - z) ** 2 < 24 * 24) tooClose = true;
        if (tooClose) continue;
        const r = this.rand();
        const type = r < 0.3 ? "zombie" : r < 0.55 ? "skeleton" : r < 0.78 ? "spider" : "creeper";
        if (type === "spider" && (SOLID[w.getBlock(x + 1, yy, z)] || SOLID[w.getBlock(x, yy, z + 1)])) continue;
        const e = new MOB_CLASSES[type](x + 0.5, yy, z + 0.5);
        e.yaw = this.rand() * Math.PI * 2;
        this.addEntity(e);
        return;
      }
    }
    despawn() {
      for (const e of this.entities.values()) {
        if (!HOSTILE.has(e.type)) continue;
        let near = 1e9;
        for (const p of this.players.values()) near = Math.min(near, e.dist2(p));
        if (near > 80 * 80 || near > 32 * 32 && this.rand() < 2e-3) e.removed = true;
      }
    }
    // ------------------------------------------------------------------ nether reactor
    reactorPattern(x, y, z) {
      const w = this.world;
      const G = B.GOLD_BLOCK, C = B.COBBLE, A = 0;
      const layers = [
        [[G, C, G], [C, C, C], [G, C, G]],
        [[C, A, C], [A, B.REACTOR, A], [C, A, C]],
        [[A, C, A], [C, C, C], [A, C, A]]
      ];
      for (let l = 0; l < 3; l++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const want = layers[l][i][j];
        const got = w.getBlock(x + i - 1, y + l - 1, z + j - 1);
        if (want === A) {
          if (got !== 0 && !blocks[got].replaceable) return false;
        } else if (got !== want) return false;
      }
      return true;
    }
    activateReactor(p, x, y, z) {
      const w = this.world;
      if (w.getMeta(x, y, z) !== 0) return;
      if (this.reactor) {
        this.msg(p, "Another reactor is already active");
        return;
      }
      if (!this.reactorPattern(x, y, z)) {
        this.msg(p, "Not the correct pattern!");
        return;
      }
      if (y < 4 || y + 30 > WY - 1) {
        this.msg(p, "The nether reactor needs to be built lower down.");
        return;
      }
      if (x < 10 || z < 10 || x > WX - 11 || z > WZ - 11) {
        this.msg(p, "Not enough space around the reactor");
        return;
      }
      for (const q of this.players.values()) {
        if (Math.abs(q.x - (x + 0.5)) > 1.5 || Math.abs(q.z - (z + 0.5)) > 1.5 || q.y < y - 1 || q.y > y + 2) {
          if (Math.abs(q.x - x) < 9 && Math.abs(q.z - z) < 9 && q.y > y - 3 && q.y < y + 32) continue;
        }
      }
      this.broadcastMsg("Active!");
      w.setMeta(x, y, z, 1);
      for (let l = -1; l <= 1; l++) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const id = w.getBlock(x + i, y + l, z + j);
        if (id === B.GOLD_BLOCK || id === B.COBBLE) this.setBlock(x + i, y + l, z + j, B.GLOWING_OBSIDIAN);
      }
      this.buildSpire(x, y, z);
      this.reactor = { x, y, z, t: 0 };
      this.world.reactorState = this.reactor;
    }
    buildSpire(cx, cy, cz) {
      const w = this.world;
      const set = (x, y, z, id) => {
        if (w.inBounds(x, y, z) && w.getBlock(x, y, z) !== B.REACTOR && w.getBlock(x, y, z) !== B.GLOWING_OBSIDIAN) this.setBlock(x, y, z, id);
      };
      const by = cy - 2;
      for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) set(cx + dx, by, cz + dz, B.NETHERRACK);
      const tiers = [[8, 0, 4], [7, 5, 9], [6, 10, 14], [5, 15, 19], [4, 20, 23], [3, 24, 27], [2, 28, 30]];
      for (const [r, y0, y1] of tiers) {
        for (let yy2 = by + 1 + y0; yy2 <= by + 1 + y1; yy2++) {
          for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
            const edge = Math.abs(dx) === r || Math.abs(dz) === r;
            if (edge) set(cx + dx, yy2, cz + dz, B.NETHERRACK);
            else set(cx + dx, yy2, cz + dz, 0);
          }
        }
        const yy = by + 1 + y1 + 1;
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (Math.abs(dx) >= r - 1 || Math.abs(dz) >= r - 1) set(cx + dx, yy, cz + dz, B.NETHERRACK);
      }
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) set(cx + dx, by + 33, cz + dz, B.NETHERRACK);
    }
    tickReactor() {
      const r = this.reactor;
      if (!r) return;
      r.t++;
      const w = this.world;
      if (w.getBlock(r.x, r.y, r.z) !== B.REACTOR) {
        this.reactor = null;
        return;
      }
      if (r.t < 800 && r.t % 40 === 0) {
        const loot = [
          [I.GLOWSTONE_DUST, 3],
          [I.GLOWSTONE_DUST, 3],
          [B.CACTUS, 1],
          [I.SUGARCANE, 2],
          [I.PUMPKIN_SEEDS, 2],
          [I.MELON_SEEDS, 2],
          [B.BROWN_MUSHROOM, 1],
          [B.RED_MUSHROOM, 1],
          [I.BOW, 1],
          [I.ARROW, 4],
          [I.FEATHER, 3],
          [I.BONE, 2],
          [I.BED, 1],
          [I.DOOR, 1],
          [I.PAINTING, 1],
          [I.BOOK, 1],
          [I.BOWL, 2],
          [I.MELON_SLICE, 2],
          [B.GLOWSTONE, 1]
        ];
        const n = 2 + (this.rand() * 3 | 0);
        for (let i = 0; i < n; i++) {
          const [id, c] = loot[this.rand() * loot.length | 0];
          const ang = this.rand() * Math.PI * 2, d = 2 + this.rand() * 5;
          const e = this.spawnItem(r.x + 0.5 + Math.cos(ang) * d, r.y + 0.5, r.z + 0.5 + Math.sin(ang) * d, id, c, 0);
        }
        if (r.t % 120 === 0 && r.t > 100) {
          const ang = this.rand() * Math.PI * 2, d = 3 + this.rand() * 4;
          const x = r.x + 0.5 + Math.cos(ang) * d, z = r.z + 0.5 + Math.sin(ang) * d;
          if (!SOLID[w.getBlock(Math.floor(x), r.y - 1, Math.floor(z))]) this.addEntity(new PigZombie(x, r.y - 1, z));
        }
        this.fx({ k: "snd", s: "reactor", x: r.x, y: r.y, z: r.z });
      }
      if (r.t === 900) {
        w.setMeta(r.x, r.y, r.z, 2);
        for (let l = -1; l <= 1; l++) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          if (w.getBlock(r.x + i, r.y + l, r.z + j) === B.GLOWING_OBSIDIAN) this.setBlock(r.x + i, r.y + l, r.z + j, B.OBSIDIAN);
        }
        for (let n = 0; n < 220; n++) {
          const dx = (this.rand() * 17 | 0) - 8, dz = (this.rand() * 17 | 0) - 8, dy = (this.rand() * 32 | 0) - 1;
          const x = r.x + dx, y = r.y + dy, z = r.z + dz;
          if (w.getBlock(x, y, z) === B.NETHERRACK && y > r.y - 2) this.setBlock(x, y, z, 0);
        }
        this.broadcastMsg("The nether reactor has gone quiet");
        this.reactor = null;
        this.world.reactorState = null;
      }
    }
    // ------------------------------------------------------------------ ray casting
    canSee(x0, y0, z0, x1, y1, z1) {
      const d = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      const n = Math.ceil(d * 2);
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const id = this.world.getBlock(Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t), Math.floor(z0 + (z1 - z0) * t));
        if (OPAQUE[id]) return false;
      }
      return true;
    }
    // ------------------------------------------------------------------ main server tick
    serverTick() {
      const w = this.world;
      this.tick++;
      w.time++;
      this.updateSkyDarken();
      this.randomTicks();
      this.runScheduled();
      for (const e of this.entities.values()) {
        if (e.removed) continue;
        e.savePrev();
        e.tick(this);
      }
      for (const e of [...this.entities.values()]) if (e.removed) this.removeEntity(e);
      for (const p of this.players.values()) this.tickPlayer(p);
      this.tickFurnaces();
      this.tickReactor();
      if (this.tick % 20 === 0) this.spawnMonsters();
      if (this.tick % 600 === 0) {
        const [a] = this.countMobs();
        if (a < 30) this.spawnAnimals(3);
      }
      if (this.tick % 100 === 0) this.despawn();
      this.tickSleep();
    }
    updateSkyDarken() {
      const st = this.world.time % DAY;
      const ang = (st / DAY - 0.25) * Math.PI * 2;
      const day = Math.max(0, Math.min(1, Math.cos(ang) * 2 + 0.5));
      this.world.skyDarken = Math.round((1 - day) * 11);
    }
    // ------------------------------------------------------------------ persistence
    saveState() {
      const ents = [];
      for (const e of this.entities.values()) {
        if (e.removed || e.type === "arrow" && !e.stuck) continue;
        ents.push(e.toSave());
      }
      const tiles = [];
      for (const [k, t] of this.world.tiles) {
        const y = k & 127, z = k >> 7 & 255, x = k >> 15;
        if (t.kind === "chest") tiles.push({ x, y, z, kind: "chest", inv: t.inv.toJSON() });
        else tiles.push({ x, y, z, kind: "furnace", input: slotJ(t.input), fuel: slotJ(t.fuel), output: slotJ(t.output), burn: t.burn, burnMax: t.burnMax, cook: t.cook });
      }
      return { ents, tiles, reactor: this.reactor };
    }
    loadState(s) {
      if (!s) return;
      for (const t of s.tiles || []) {
        if (t.kind === "chest") {
          const inv = new Inventory(27);
          inv.load(t.inv);
          this.world.setTile(t.x, t.y, t.z, { kind: "chest", inv });
        } else this.world.setTile(t.x, t.y, t.z, { kind: "furnace", input: slotP(t.input), fuel: slotP(t.fuel), output: slotP(t.output), burn: t.burn || 0, burnMax: t.burnMax || 0, cook: t.cook || 0 });
      }
      for (const es of s.ents || []) {
        let e;
        if (es.t === "painting") {
          e = new Painting(0, 0, 0, 2, 0);
          e.applyExtra(es.ex);
          e.x = e.bx + 0.5;
          e.y = e.by;
          e.z = e.bz + 0.5;
        } else e = createEntity(es.t, es.x, es.y, es.z, es.ex);
        if (!e) continue;
        e.yaw = es.yaw || 0;
        if (es.hp) e.health = es.hp;
        e.savePrev();
        this.addEntity(e);
      }
      this.reactor = s.reactor || null;
    }
  };
  function slotJ(s) {
    return s ? [s.id, s.count, s.meta, s.dmg || 0] : 0;
  }
  function slotP(a) {
    return a ? { id: a[0], count: a[1], meta: a[2] || 0, dmg: a[3] || 0 } : null;
  }
  function newFurnace() {
    return { kind: "furnace", input: null, fuel: null, output: null, burn: 0, burnMax: 0, cook: 0 };
  }
  function containerState(t) {
    if (t.kind === "chest") return { kind: "chest", slots: t.inv.toJSON() };
    return { kind: "furnace", input: slotJ(t.input), fuel: slotJ(t.fuel), output: slotJ(t.output), burn: t.burnMax ? t.burn / t.burnMax : 0, cook: t.cook / 200 };
  }

  // game/src/models.js
  function I3() {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
  }
  function mm(a, b) {
    const o = new Array(12);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c];
      o[r * 4 + 3] = a[r * 4] * b[3] + a[r * 4 + 1] * b[7] + a[r * 4 + 2] * b[11] + a[r * 4 + 3];
    }
    return o;
  }
  var T3 = {
    id: I3,
    t: (m, x, y, z) => mm(m, [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z]),
    ry: (m, a) => {
      const c = Math.cos(a), s = Math.sin(a);
      return mm(m, [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]);
    },
    rx: (m, a) => {
      const c = Math.cos(a), s = Math.sin(a);
      return mm(m, [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]);
    },
    rz: (m, a) => {
      const c = Math.cos(a), s = Math.sin(a);
      return mm(m, [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]);
    },
    s: (m, x, y, z) => mm(m, [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0]),
    ap: (m, x, y, z) => [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]]
  };
  var SH = [0.5, 1, 0.8, 0.8, 0.6, 0.6];
  function drawBox(mesh, m, x0, y0, z0, x1, y1, z1, faces, sky, blk, alpha = 255) {
    const P = (x, y, z) => T3.ap(m, x, y, z);
    const corners = [
      [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]],
      [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]],
      [[x1, y1, z0], [x1, y0, z0], [x0, y0, z0], [x0, y1, z0]],
      [[x0, y1, z1], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1]],
      [[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]],
      [[x1, y1, z1], [x1, y0, z1], [x1, y0, z0], [x1, y1, z0]]
    ];
    const white = tileUV(tex("white"));
    for (let f = 0; f < 6; f++) {
      let fc = Array.isArray(faces) && faces.length === 6 ? faces[f] : faces;
      if (!fc) continue;
      let col, uv;
      if (fc.tile !== void 0) {
        col = fc.col || [255, 255, 255];
        const [tu, tv, ts] = tileUV(fc.tile);
        uv = fc.uv ? [tu + fc.uv[0] * ts, tv + fc.uv[1] * ts, tu + fc.uv[2] * ts, tv + fc.uv[3] * ts] : [tu, tv, tu + ts, tv + ts];
      } else {
        col = fc;
        uv = [white[0] + 0.01 * white[2], white[1] + 0.01 * white[2], white[0] + 0.99 * white[2], white[1] + 0.99 * white[2]];
      }
      const c = corners[f];
      mesh.quad(P(...c[0]), P(...c[1]), P(...c[2]), P(...c[3]), uv[0], uv[1], uv[2], uv[3], sky, blk, SH[f], col, alpha);
    }
  }
  var MODELS = {};
  var px = 1 / 16;
  function limb(mesh, m, pivot, size, angle, faces, sky, blk, angleZ = 0) {
    let t = T3.t(m, pivot[0] * px, pivot[1] * px, pivot[2] * px);
    if (angle) t = T3.rx(t, angle);
    if (angleZ) t = T3.rz(t, angleZ);
    const [w, h, d, ox = 0, oz = 0] = size;
    drawBox(mesh, t, (-w / 2 + ox) * px, -h * px, (-d / 2 + oz) * px, (w / 2 + ox) * px, 0, (d / 2 + oz) * px, faces, sky, blk);
  }
  function face(mesh, m, x, y, z, w, h, col, sky, blk) {
    drawBox(mesh, m, x * px, y * px, z * px - 2e-3, (x + w) * px, (y + h) * px, z * px, [null, null, col, null, null, null], sky, blk);
  }
  function humanoid(mesh, m, e, sky, blk, pal) {
    const sw = Math.sin(e.walkAnim * 0.6662) * 1 * e.walkAmt;
    const headPitch = e.pitch || 0;
    limb(mesh, m, [-2, 12, 0], [4, 12, 4], sw, pal.legs, sky, blk);
    limb(mesh, m, [2, 12, 0], [4, 12, 4], -sw, pal.legs, sky, blk);
    drawBox(mesh, m, -4 * px, 12 * px, -2 * px, 4 * px, 24 * px, 2 * px, pal.body, sky, blk);
    const armRaise = pal.armsForward ? -Math.PI / 2 : 0;
    const swing = e.swing ? -Math.sin(e.swing * Math.PI) * 1.2 : 0;
    limb(mesh, m, [-6, 22, 0], [4, 12, 4], armRaise + (pal.armsForward ? 0 : -sw * 0.8), pal.arms, sky, blk);
    limb(mesh, m, [6, 22, 0], [4, 12, 4], armRaise + (pal.armsForward ? 0 : sw * 0.8) + swing, pal.arms, sky, blk);
    if (e.held && e.held.id) {
      let t = T3.t(m, 6 * px, 22 * px, 0);
      t = T3.rx(t, armRaise + sw * 0.8 + swing);
      t = T3.t(t, 0, -10 * px, -2 * px);
      t = T3.rx(t, -Math.PI / 2);
      t = T3.s(t, 0.45, 0.45, 0.45);
      t = T3.t(t, -0.5, -0.1, -0.5);
      drawItem(mesh, t, e.held.id, e.held.meta || 0, sky, blk, true);
    }
    let h = T3.t(m, 0, 24 * px, 0);
    h = T3.rx(h, headPitch);
    drawBox(mesh, h, -4 * px, 0, -4 * px, 4 * px, 8 * px, 4 * px, pal.head, sky, blk);
    if (pal.hair) drawBox(mesh, h, -4.2 * px, 6 * px, -4.2 * px, 4.2 * px, 8.3 * px, 4.2 * px, pal.hair, sky, blk);
    if (pal.face) pal.face(mesh, h, sky, blk);
  }
  var eyes = (white, pupil) => (mesh, h, sky, blk) => {
    face(mesh, h, -3, 3, -4, 2, 1, white, sky, blk);
    face(mesh, h, 1, 3, -4, 2, 1, white, sky, blk);
    face(mesh, h, -2, 3, -4.01, 1, 1, pupil, sky, blk);
    face(mesh, h, 1, 3, -4.01, 1, 1, pupil, sky, blk);
  };
  var SKIN = [214, 166, 126];
  var SHIRT = [56, 120, 180];
  var PANTS = [52, 52, 110];
  var HAIR = [70, 45, 25];
  MODELS.player = (mesh, m, e, sky, blk) => {
    const shirt = e.color || SHIRT;
    humanoid(mesh, m, e, sky, blk, {
      legs: PANTS,
      body: shirt,
      arms: [shirt, SKIN, shirt, shirt, shirt, shirt],
      head: SKIN,
      hair: [HAIR, HAIR, null, HAIR, HAIR, HAIR],
      face: (mesh2, h, sky2, blk2) => {
        eyes([240, 240, 240], [60, 60, 160])(mesh2, h, sky2, blk2);
        face(mesh2, h, -2, 1, -4, 4, 1, [150, 90, 70], sky2, blk2);
      }
    });
  };
  MODELS.zombie = (mesh, m, e, sky, blk) => {
    const g = [90, 140, 80];
    humanoid(mesh, m, e, sky, blk, {
      legs: [60, 60, 120],
      body: [40, 140, 160],
      arms: g,
      head: g,
      armsForward: true,
      face: (mesh2, h, sky2, blk2) => {
        face(mesh2, h, -3, 3, -4, 2, 2, [20, 30, 20], sky2, blk2);
        face(mesh2, h, 1, 3, -4, 2, 2, [20, 30, 20], sky2, blk2);
        face(mesh2, h, -2, 1, -4, 4, 1, [50, 80, 45], sky2, blk2);
      }
    });
  };
  MODELS.pigzombie = (mesh, m, e, sky, blk) => {
    const pink = [230, 150, 150], rot = [110, 150, 80];
    humanoid(mesh, m, e, sky, blk, {
      legs: [pink, pink, rot, pink, rot, pink],
      body: [180, 120, 100],
      arms: [pink, pink, pink, rot, pink, pink],
      head: [pink, pink, pink, pink, rot, pink],
      armsForward: false,
      face: (mesh2, h, sky2, blk2) => {
        face(mesh2, h, -2, 1, -4.5, 4, 2, [240, 170, 170], sky2, blk2);
        face(mesh2, h, -3, 4, -4, 2, 1, [30, 30, 30], sky2, blk2);
        face(mesh2, h, 1, 4, -4, 2, 1, [30, 30, 30], sky2, blk2);
      }
    });
  };
  MODELS.skeleton = (mesh, m, e, sky, blk) => {
    const b = [200, 200, 200];
    const sw = Math.sin(e.walkAnim * 0.6662) * e.walkAmt;
    limb(mesh, m, [-2, 12, 0], [2, 12, 2], sw, b, sky, blk);
    limb(mesh, m, [2, 12, 0], [2, 12, 2], -sw, b, sky, blk);
    drawBox(mesh, m, -4 * px, 12 * px, -1.5 * px, 4 * px, 24 * px, 1.5 * px, [180, 180, 180], sky, blk);
    limb(mesh, m, [-5, 22, 0], [2, 12, 2], -Math.PI / 2, b, sky, blk);
    limb(mesh, m, [5, 22, 0], [2, 12, 2], -Math.PI / 2, b, sky, blk);
    let t = T3.t(m, 5 * px, 22 * px, 0);
    t = T3.rx(t, -Math.PI / 2);
    t = T3.t(t, 0, -11 * px, 0);
    t = T3.ry(t, Math.PI / 2);
    t = T3.s(t, 0.6, 0.6, 0.6);
    t = T3.t(t, -0.5, -0.5, 0);
    drawItem(mesh, t, 261, 0, sky, blk, true);
    let h = T3.t(m, 0, 24 * px, 0);
    h = T3.rx(h, e.pitch || 0);
    drawBox(mesh, h, -4 * px, 0, -4 * px, 4 * px, 8 * px, 4 * px, b, sky, blk);
    face(mesh, h, -3, 3, -4, 2, 2, [30, 30, 30], sky, blk);
    face(mesh, h, 1, 3, -4, 2, 2, [30, 30, 30], sky, blk);
    face(mesh, h, -2, 1, -4, 4, 1, [60, 60, 60], sky, blk);
  };
  MODELS.creeper = (mesh, m, e, sky, blk) => {
    const g = [80, 170, 70], g2 = [60, 140, 55];
    const sw = Math.sin(e.walkAnim * 0.6662) * e.walkAmt;
    const fuse = e.fuse ? 1 + Math.sin(e.fuse * 1.2) * 0.04 + e.fuse / 30 * 0.1 : 1;
    m = T3.s(m, fuse, 1, fuse);
    limb(mesh, m, [-2, 6, -4], [4, 6, 4], sw, g2, sky, blk);
    limb(mesh, m, [2, 6, -4], [4, 6, 4], -sw, g2, sky, blk);
    limb(mesh, m, [-2, 6, 4], [4, 6, 4], -sw, g2, sky, blk);
    limb(mesh, m, [2, 6, 4], [4, 6, 4], sw, g2, sky, blk);
    drawBox(mesh, m, -4 * px, 6 * px, -2 * px, 4 * px, 18 * px, 2 * px, g, sky, blk);
    const h = T3.t(m, 0, 18 * px, 0);
    drawBox(mesh, h, -4 * px, 0, -4 * px, 4 * px, 8 * px, 4 * px, g, sky, blk);
    const k = [20, 30, 20];
    face(mesh, h, -3, 4, -4, 2, 2, k, sky, blk);
    face(mesh, h, 1, 4, -4, 2, 2, k, sky, blk);
    face(mesh, h, -1, 1, -4, 2, 3, k, sky, blk);
    face(mesh, h, -2, 0, -4, 1, 2, k, sky, blk);
    face(mesh, h, 1, 0, -4, 1, 2, k, sky, blk);
    if (e.fuse && Math.floor(e.fuse / 4) % 2) drawBox(mesh, m, -4.3 * px, 0, -4.3 * px, 4.3 * px, 26.3 * px, 4.3 * px, [255, 255, 255], 15, 15, 120);
  };
  MODELS.spider = (mesh, m, e, sky, blk) => {
    const d = [50, 40, 36], d2 = [70, 56, 50];
    drawBox(mesh, m, -3 * px, 5 * px, -3 * px, 3 * px, 11 * px, 3 * px, d, sky, blk);
    drawBox(mesh, m, -5 * px, 4 * px, 3 * px, 5 * px, 12 * px, 15 * px, d2, sky, blk);
    const h = T3.t(m, 0, 4 * px, -3 * px);
    drawBox(mesh, h, -4 * px, 0, -8 * px, 4 * px, 8 * px, 0, d, sky, blk);
    const red = [230, 30, 30];
    for (const [x, y] of [[-3, 5], [2, 5], [-2, 3], [1, 3]]) face(mesh, h, x, y, -8, 1, 1, red, 15, 15);
    const sw = Math.sin(e.walkAnim * 0.6662 * 2) * 0.4 * e.walkAmt;
    for (let i = 0; i < 4; i++) for (const side of [-1, 1]) {
      let t = T3.t(m, side * 3 * px, 9 * px, (-1 + i * 1.2) * px);
      t = T3.ry(t, side * (0.6 - i * 0.4) + (i % 2 ? sw : -sw) * side);
      t = T3.rz(t, side * 0.6);
      drawBox(mesh, t, (side < 0 ? -15 : 0) * px, -1 * px, -1 * px, (side < 0 ? 0 : 15) * px, 1 * px, 1 * px, d, sky, blk);
    }
  };
  function quadruped(mesh, m, e, sky, blk, o) {
    const sw = Math.sin(e.walkAnim * 0.6662) * 1.2 * e.walkAmt;
    const lh = o.legH;
    for (const [x, z, s] of [[-o.legX, -o.legZ, sw], [o.legX, -o.legZ, -sw], [-o.legX, o.legZ, -sw], [o.legX, o.legZ, sw]]) limb(mesh, m, [x, lh, z], [o.legW, lh, o.legW], s, o.leg, sky, blk);
    drawBox(mesh, m, -o.bw / 2 * px, lh * px, -o.bl / 2 * px, o.bw / 2 * px, (lh + o.bh) * px, o.bl / 2 * px, o.body, sky, blk);
    if (o.wool) drawBox(mesh, m, (-o.bw / 2 - 1.5) * px, (lh - 1) * px, (-o.bl / 2 - 1.5) * px, (o.bw / 2 + 1.5) * px, (lh + o.bh + 1.5) * px, (o.bl / 2 + 1.5) * px, o.wool, sky, blk);
    let h = T3.t(m, 0, (lh + o.bh - 1) * px, -o.bl / 2 * px);
    h = T3.rx(h, e.pitch || 0);
    drawBox(mesh, h, -o.hw / 2 * px, (-o.hh + o.hUp) * px, -o.hd * px, o.hw / 2 * px, o.hUp * px, 0, o.head, sky, blk);
    if (o.face) o.face(mesh, h, sky, blk);
  }
  MODELS.pig = (mesh, m, e, sky, blk) => quadruped(mesh, m, e, sky, blk, {
    legH: 6,
    legW: 4,
    legX: 3,
    legZ: 5,
    bw: 10,
    bl: 16,
    bh: 8,
    hw: 8,
    hh: 8,
    hd: 8,
    hUp: 5,
    leg: [230, 150, 150],
    body: [240, 160, 160],
    head: [240, 160, 160],
    face: (mesh2, h, sky2, blk2) => {
      drawBox(mesh2, h, -2 * px, -2 * px, -9 * px, 2 * px, 1 * px, -8 * px, [230, 130, 140], sky2, blk2);
      face(mesh2, h, -4, 1, -8, 2, 1, [30, 30, 30], sky2, blk2);
      face(mesh2, h, 2, 1, -8, 2, 1, [30, 30, 30], sky2, blk2);
    }
  });
  MODELS.cow = (mesh, m, e, sky, blk) => quadruped(mesh, m, e, sky, blk, {
    legH: 12,
    legW: 4,
    legX: 4,
    legZ: 6,
    bw: 12,
    bl: 18,
    bh: 10,
    hw: 8,
    hh: 8,
    hd: 6,
    hUp: 4,
    leg: [70, 50, 40],
    body: [[90, 60, 40], [90, 60, 40], [230, 230, 230], [90, 60, 40], [230, 230, 230], [90, 60, 40]],
    head: [80, 55, 40],
    face: (mesh2, h, sky2, blk2) => {
      drawBox(mesh2, h, -3 * px, -4 * px, -7 * px, 3 * px, -1 * px, -6 * px, [200, 170, 150], sky2, blk2);
      face(mesh2, h, -3, 1, -6, 2, 1, [20, 20, 20], sky2, blk2);
      face(mesh2, h, 1, 1, -6, 2, 1, [20, 20, 20], sky2, blk2);
      drawBox(mesh2, h, -5 * px, 3 * px, -4 * px, -4 * px, 5 * px, -3 * px, [220, 220, 210], sky2, blk2);
      drawBox(mesh2, h, 4 * px, 3 * px, -4 * px, 5 * px, 5 * px, -3 * px, [220, 220, 210], sky2, blk2);
    }
  });
  MODELS.sheep = (mesh, m, e, sky, blk) => {
    const wc = e.woolColor !== void 0 ? e.woolColorRGB : [235, 235, 235];
    quadruped(mesh, m, e, sky, blk, {
      legH: 12,
      legW: 4,
      legX: 3,
      legZ: 5,
      bw: 8,
      bl: 16,
      bh: 6,
      hw: 6,
      hh: 6,
      hd: 8,
      hUp: 4,
      leg: [220, 210, 200],
      body: [220, 180, 170],
      head: [210, 200, 190],
      wool: e.sheared ? null : wc,
      face: (mesh2, h, sky2, blk2) => {
        face(mesh2, h, -3, 0, -8, 2, 1, [30, 30, 30], sky2, blk2);
        face(mesh2, h, 1, 0, -8, 2, 1, [30, 30, 30], sky2, blk2);
      }
    });
  };
  MODELS.chicken = (mesh, m, e, sky, blk) => {
    const sw = Math.sin(e.walkAnim * 0.6662) * 1.2 * e.walkAmt;
    const yel = [230, 180, 40];
    limb(mesh, m, [-1.5, 5, 1], [1, 5, 1], sw, yel, sky, blk);
    limb(mesh, m, [1.5, 5, 1], [1, 5, 1], -sw, yel, sky, blk);
    drawBox(mesh, m, -3 * px, 4 * px, -3 * px, 3 * px, 10 * px, 5 * px, [245, 245, 245], sky, blk);
    const flap = e.onGround ? 0 : Math.sin(e.walkAnim * 3) * 0.8;
    limb(mesh, m, [-3.5, 9, 1], [1, 4, 6], 0, [235, 235, 235], sky, blk, flap);
    limb(mesh, m, [3.5, 9, 1], [1, 4, 6], 0, [235, 235, 235], sky, blk, -flap);
    const h = T3.t(m, 0, 9 * px, -3 * px);
    drawBox(mesh, h, -2 * px, 0, -3 * px, 2 * px, 6 * px, 0, [250, 250, 250], sky, blk);
    drawBox(mesh, h, -2 * px, 2 * px, -5 * px, 2 * px, 4 * px, -3 * px, [240, 170, 40], sky, blk);
    drawBox(mesh, h, -1 * px, 0, -4 * px, 1 * px, 2 * px, -3 * px, [210, 30, 30], sky, blk);
    face(mesh, h, -2, 4, -3, 1, 1, [20, 20, 20], sky, blk);
    face(mesh, h, 1, 4, -3, 1, 1, [20, 20, 20], sky, blk);
  };
  function drawMob(mesh, e, sky, blk) {
    const fn = MODELS[e.type];
    if (!fn) return;
    let m = T3.t(T3.id(), e.rx, e.ry, e.rz);
    m = T3.ry(m, -e.ryaw);
    if (e.deathTime > 0) m = T3.rz(m, Math.min(1, e.deathTime / 20) * Math.PI / 2);
    if (e.scale) m = T3.s(m, e.scale, e.scale, e.scale);
    const hurt = e.hurtTime > 0 || e.deathTime > 0;
    const start = mesh.n;
    fn(mesh, m, e, sky, blk);
    if (hurt) {
      const u82 = mesh.u8;
      for (let v = start; v < mesh.n; v++) {
        const o = v * 28 + 24;
        u82[o + 1] *= 0.45;
        u82[o + 2] *= 0.45;
      }
    }
  }
  function drawItem(mesh, m, id, meta, sky, blk, thin = false) {
    if (isBlockItem(id) && !blockIconIsFlat(id)) {
      const b = blocks[id];
      const faces = [];
      for (let f = 0; f < 6; f++) faces.push({ tile: b.texFn(f, f === 2 && (b.container || id === 86) ? meta || 2 : meta) });
      let y1 = 1;
      if (b.render === R.SLAB || b.render === R.BED) y1 = 0.5;
      if (b.render === R.SNOW) y1 = 0.125;
      drawBox(mesh, m, 0.2, 0.2, 0.2, 0.8, 0.2 + 0.6 * y1, 0.8, faces.map((f, i) => i < 2 || y1 === 1 ? f : { tile: f.tile, uv: [0, 1 - y1, 1, 1] }), sky, blk);
      return;
    }
    const tile = id < 256 ? blocks[id] ? blocks[id].texFn(1, meta) : 0 : itemIconTile(id, meta);
    const [tu, tv, ts] = tileUV(tile);
    const P = (x, y, z) => T3.ap(m, x, y, z);
    const z0 = 0.47, z1 = 0.53;
    mesh.quad(P(0, 1, z0), P(0, 0, z0), P(1, 0, z0), P(1, 1, z0), tu, tv, tu + ts, tv + ts, sky, blk, 1);
    mesh.quad(P(1, 1, z1), P(1, 0, z1), P(0, 0, z1), P(0, 1, z1), tu + ts, tv, tu, tv + ts, sky, blk, 0.8);
  }
  function drawPainting(mesh, p, sky, blk) {
    const art = PAINTINGS[p.art % PAINTINGS.length];
    const e = 0.03;
    for (let ty = 0; ty < art.h; ty++) for (let tx = 0; tx < art.w; tx++) {
      const tile = tex(art.tiles[(art.h - 1 - ty) * art.w + tx]);
      const [tu, tv, ts] = tileUV(tile);
      let p0, p1, p2, p3;
      const bx = p.x, by = p.y + ty, bz = p.z;
      if (p.dir === 2) {
        const x = bx - tx, z = bz + 1 - e;
        p0 = [x + 1, by + 1, z];
        p1 = [x + 1, by, z];
        p2 = [x, by, z];
        p3 = [x, by + 1, z];
      } else if (p.dir === 3) {
        const x = bx + tx, z = bz + e;
        p0 = [x, by + 1, z];
        p1 = [x, by, z];
        p2 = [x + 1, by, z];
        p3 = [x + 1, by + 1, z];
      } else if (p.dir === 4) {
        const z = bz + tx, x = bx + 1 - e;
        p0 = [x, by + 1, z];
        p1 = [x, by, z];
        p2 = [x, by, z + 1];
        p3 = [x, by + 1, z + 1];
      } else {
        const z = bz - tx, x = bx + e;
        p0 = [x, by + 1, z + 1];
        p1 = [x, by, z + 1];
        p2 = [x, by, z];
        p3 = [x, by + 1, z];
      }
      mesh.quad(p0, p1, p2, p3, tu, tv, tu + ts, tv + ts, sky, blk, 1);
    }
  }

  // game/src/audio.js
  var ctx = null;
  var master = null;
  var noiseBuf = null;
  var volume = 0.8;
  var last = /* @__PURE__ */ new Map();
  function setVolume(v) {
    volume = v;
    if (master) master.gain.value = v;
  }
  function unlockAudio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
  }
  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(1e-4, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(1e-4, t + a + dec);
  }
  function noise(type, freq, q, dur, peak, delay = 0, pan = 0) {
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    env(g, t, 5e-3, peak, dur);
    s.connect(f);
    f.connect(g);
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(master);
    } else g.connect(master);
    s.start(t, Math.random() * 0.5, dur + 0.05);
  }
  function tone(type, f0, f1, dur, peak, delay = 0) {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    env(g, t, 5e-3, peak, dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  var MAT = {
    stone: ["bandpass", 1800, 1.2],
    wood: ["bandpass", 700, 2.5],
    grass: ["lowpass", 1200, 0.7],
    gravel: ["bandpass", 1100, 0.8],
    sand: ["highpass", 2500, 0.6],
    cloth: ["lowpass", 700, 0.5],
    glass: ["highpass", 3500, 4],
    metal: ["bandpass", 2600, 6]
  };
  function play(name, o = {}) {
    if (!ctx || volume <= 0) return;
    const now = performance.now();
    const key = name + (o.mat || "");
    if (o.minGap && now - (last.get(key) || 0) < o.minGap) return;
    last.set(key, now);
    const att = o.dist !== void 0 ? Math.max(0, 1 - o.dist / 24) : 1;
    if (att <= 0) return;
    const v = (o.vol || 1) * att;
    const m = MAT[o.mat] || MAT.stone;
    switch (name) {
      case "dig":
        noise(m[0], m[1] * (0.8 + Math.random() * 0.4), m[2], 0.09, 0.35 * v);
        break;
      case "break":
        noise(m[0], m[1] * 0.9, m[2], 0.2, 0.5 * v);
        noise(m[0], m[1] * 0.6, m[2], 0.15, 0.3 * v, 0.04);
        if (o.mat === "glass") {
          tone("triangle", 2400, 900, 0.25, 0.1 * v);
        }
        break;
      case "place":
        noise(m[0], m[1], m[2], 0.12, 0.45 * v);
        break;
      case "step":
        noise(m[0], m[1] * 0.8, m[2], 0.06, 0.15 * v);
        break;
      case "hurt":
        tone("sawtooth", 220, 110, 0.18, 0.18 * v);
        noise("lowpass", 600, 1, 0.12, 0.2 * v);
        break;
      case "mobhurt":
        tone("square", 300 + Math.random() * 200, 150, 0.15, 0.1 * v);
        break;
      case "pig":
        tone("sawtooth", 300, 180, 0.2, 0.08 * v);
        tone("sawtooth", 280, 160, 0.15, 0.06 * v, 0.18);
        break;
      case "cow":
        tone("sawtooth", 140, 100, 0.6, 0.1 * v);
        break;
      case "sheep":
        tone("square", 400, 380, 0.4, 0.05 * v);
        break;
      case "chicken":
        tone("square", 1200, 900, 0.08, 0.05 * v);
        tone("square", 1300, 1e3, 0.08, 0.05 * v, 0.1);
        break;
      case "zombie":
        tone("sawtooth", 120, 80, 0.8, 0.09 * v);
        break;
      case "skeleton":
        noise("bandpass", 2500, 8, 0.1, 0.2 * v);
        noise("bandpass", 2200, 8, 0.1, 0.2 * v, 0.12);
        break;
      case "spider":
        noise("bandpass", 900, 3, 0.25, 0.15 * v);
        break;
      case "explode":
        noise("lowpass", 400, 0.5, 1.6, 1 * v);
        noise("lowpass", 150, 0.5, 2.2, 0.9 * v, 0.02);
        break;
      case "fuse":
        noise("highpass", 4e3, 1, 1.2, 0.15 * v);
        break;
      case "pop":
        tone("sine", 600 + Math.random() * 400, 1400, 0.07, 0.2 * v);
        break;
      case "click":
        tone("square", 1200, 1e3, 0.03, 0.06 * v);
        break;
      case "bow":
        tone("triangle", 500, 250, 0.2, 0.15 * v);
        noise("bandpass", 1500, 2, 0.1, 0.15 * v);
        break;
      case "arrowhit":
        noise("bandpass", 900, 3, 0.08, 0.25 * v);
        break;
      case "hit":
        noise("bandpass", 700, 1.5, 0.08, 0.3 * v);
        break;
      case "door":
        noise("bandpass", 500, 3, 0.25, 0.3 * v);
        tone("sawtooth", 200, 170, 0.2, 0.04 * v);
        break;
      case "chestopen":
        noise("bandpass", 400, 2, 0.35, 0.3 * v);
        break;
      case "eat":
        for (let i = 0; i < 3; i++) noise("bandpass", 1500, 1, 0.07, 0.3 * v, i * 0.12);
        break;
      case "splash":
        noise("lowpass", 1500, 0.7, 0.5, 0.4 * v);
        break;
      case "fizz":
        noise("highpass", 3e3, 1, 0.5, 0.25 * v);
        break;
      case "toolbreak":
        noise("highpass", 3e3, 5, 0.3, 0.3 * v);
        tone("triangle", 1800, 600, 0.3, 0.1 * v);
        break;
      case "ignite":
        noise("highpass", 2e3, 1, 0.3, 0.3 * v);
        break;
      case "throw":
        noise("bandpass", 1e3, 1, 0.15, 0.15 * v);
        break;
      case "craft":
        tone("sine", 800, 1200, 0.08, 0.1 * v);
        tone("sine", 1200, 1600, 0.08, 0.1 * v, 0.08);
        break;
      case "shear":
        noise("highpass", 5e3, 2, 0.1, 0.3 * v);
        break;
      case "plop":
        tone("sine", 400, 200, 0.1, 0.2 * v);
        break;
      case "reactor":
        tone("sawtooth", 60, 50, 1.4, 0.15 * v);
        noise("lowpass", 200, 1, 1.2, 0.2 * v);
        break;
      case "levelup":
        tone("sine", 500, 900, 0.3, 0.1 * v);
        break;
    }
  }

  // game/src/controller.js
  var REACH_S = 5;
  var REACH_C = 6;
  function breakTicks(id, held) {
    const b = blocks[id];
    if (!b || b.hardness < 0) return Infinity;
    if (b.hardness === 0) return 1;
    const tool = held ? getItem(held.id) : null;
    let speed = 1;
    if (tool && tool.tool && (tool.tool === b.tool || tool.tool === "sword" && b.id === B.COBWEB || tool.tool === "shears" && (b.leaves || b.id === B.WOOL || b.id === B.COBWEB))) speed = tool.speed;
    if (tool && tool.tool === "sword" && b.id !== B.COBWEB) speed = 1.5;
    let harvest = true;
    if (b.level >= 0 && b.tool === "pickaxe") harvest = !!(tool && tool.tool === "pickaxe" && tool.tier >= b.level);
    const perTick = speed / b.hardness / (harvest ? 30 : 100);
    return Math.ceil(1 / perTick);
  }
  var Controller = class {
    constructor(app2) {
      this.app = app2;
      this.input = { fwd: 0, strafe: 0, jump: false, sneak: false };
      this.breaking = null;
      this.holdAim = null;
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
    get p() {
      return this.app.me;
    }
    get game() {
      return this.app.game;
    }
    get world() {
      return this.app.world;
    }
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
      if (p.sleeping) {
        p.vx = p.vy = p.vz = 0;
        return;
      }
      const inp = this.app.menuOpen() ? { fwd: 0, strafe: 0, jump: false, sneak: false } : this.input;
      p.sneak = inp.sneak && !p.flying;
      const speed = p.sneak ? 0.03 : 0.1;
      const wasGround = p.onGround;
      const preY = p.y;
      const env2 = livingPhysics(w, p, { fwd: inp.fwd, strafe: inp.strafe, jump: inp.jump, speed }, p.flying, inp.sneak);
      if (p.flying && p.onGround && p.mode === "creative" && !inp.jump) p.flying = false;
      if (p.mode !== "creative") p.flying = false;
      if (p.onGround && !wasGround) {
        if (p.fallDist > 3 && p.mode !== "creative" && !env2.water) this.app.command({ c: "fall", d: Math.ceil(p.fallDist - 3) });
        if (p.fallDist > 1.5) play("step", { mat: this.matUnder(), vol: 1.5 });
        p.fallDist = 0;
      }
      if (env2.water && !this.wasInWater) play("splash", { vol: Math.min(1, Math.abs(p.vy) * 3 + 0.3) });
      this.wasInWater = env2.water;
      const mv = Math.hypot(p.x - p.px, p.z - p.pz);
      if (p.onGround && !p.sneak) {
        this.stepDist += mv;
        if (this.stepDist > 1.7) {
          this.stepDist = 0;
          play("step", { mat: this.matUnder() });
        }
      }
      p.walkAmt += (Math.min(1, mv * 4) - p.walkAmt) * 0.4;
      p.walkAnim += mv * 4;
      if (p.onGround) this.camBob += mv;
      this.tickBreaking();
      if (this.bowCharge >= 0) this.bowCharge = Math.min(1, this.bowCharge + 1 / 20);
    }
    matUnder() {
      const p = this.p;
      const id = this.world.getBlock(Math.floor(p.x), Math.floor(p.y - 0.2), Math.floor(p.z));
      return blocks[id] ? blocks[id].sound : "stone";
    }
    tickBreaking() {
      const p = this.p;
      if (!this.holdAim || this.app.menuOpen()) {
        this.breaking = null;
        return;
      }
      const held = p.held();
      if (held && held.id === I.BOW) return;
      const hit = this.aim(this.holdAim);
      if (hit && hit.ent) {
        if (this.digCooldown <= 0) {
          this.attackEntity(hit.ent);
          this.digCooldown = 10;
        }
        this.breaking = null;
        return;
      }
      if (!hit || !hit.block) {
        this.breaking = null;
        return;
      }
      const { x, y, z } = hit.block;
      const id = this.world.getBlock(x, y, z);
      if (!this.breaking || this.breaking.x !== x || this.breaking.y !== y || this.breaking.z !== z) {
        this.breaking = { x, y, z, progress: 0, n: 0 };
      }
      if (p.mode === "creative") {
        if (this.digCooldown <= 0) {
          this.digBlock(x, y, z, id);
          this.digCooldown = 6;
        }
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
        play("dig", { mat: blocks[id].sound });
        this.app.particles.blockHit(x, y, z, id, this.world.getMeta(x, y, z), hit.block.f);
        if (this.app.isMultiplayer()) this.app.command({ c: "swing" });
      }
      if (this.breaking.progress >= 1 && this.digCooldown <= 0) {
        this.digBlock(x, y, z, id);
        this.breaking = null;
        this.digCooldown = 5;
      }
    }
    digBlock(x, y, z, id) {
      const meta = this.world.getMeta(x, y, z);
      this.app.command({ c: "dig", x, y, z });
      this.swing = 1;
      if (!this.game.authority) {
        this.app.particles.blockBreak(x, y, z, id, meta);
        play("break", { mat: blocks[id].sound });
        this.world.setBlock(x, y, z, 0);
      }
    }
    attackEntity(e) {
      this.swing = 1;
      const held = this.p.held();
      if (e.type === "sheep" && held && (held.id === I.SHEARS || held.id === I.DYE)) this.app.command({ c: "interact", id: e.id });
      else this.app.command({ c: "attack", id: e.id });
    }
    // ------------------------------------------------------------------ actions from input layer
    pressStart(aim) {
      this.holdAim = aim;
      const held = this.p && this.p.held();
      if (held && held.id === I.BOW && (this.p.mode === "creative" || this.p.inv.count(I.ARROW) > 0)) this.bowCharge = 0;
    }
    pressMove(aim) {
      if (this.holdAim) this.holdAim = aim;
    }
    pressEnd(aim, wasTap) {
      this.holdAim = null;
      this.breaking = null;
      if (this.bowCharge >= 0) {
        const c = this.bowCharge;
        this.bowCharge = -1;
        if (c > 0.1) {
          this.app.command({ c: "bow", charge: c });
          this.swing = 1;
        }
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
        if (fromTap || hit.ent.type === "sheep") {
          this.attackEntity(hit.ent);
          return;
        }
      }
      if (hit && hit.block) {
        const b = hit.block;
        this.app.command({ c: "use", x: b.x, y: b.y, z: b.z, f: b.f, hy: b.hy });
        this.swing = 1;
        return;
      }
      if (held) {
        const it = getItem(held.id);
        if (it && (it.food || it.use === "throw")) {
          this.app.command({ c: "useItem" });
          this.swing = 1;
        }
      }
    }
    attackPress(aim) {
      const hit = this.aim(aim);
      if (hit && hit.ent) {
        this.attackEntity(hit.ent);
        this.digCooldown = 8;
        return false;
      }
      return true;
    }
    jumpTap() {
      const now = performance.now();
      if (this.p && this.p.mode === "creative" && now - this.lastJumpTap < 300) {
        this.p.flying = !this.p.flying;
        this.p.vy = 0;
      }
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
      if (aim && aim !== "center") {
        const c = this.app.canvas;
        const W = c.clientWidth, H = c.clientHeight;
        const nx = aim[0] / W * 2 - 1, ny = 1 - aim[1] / H * 2;
        const t = Math.tan(this.app.renderer.fov * Math.PI / 360);
        dx = nx * t * (W / H);
        dy = ny * t;
        dz = -1;
      }
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
      const reach = p.mode === "creative" ? REACH_C : REACH_S;
      const block = this.raycastBlock(ox, oy, oz, dx, dy, dz, reach);
      let ent = null, ed = block ? block.d : reach;
      const consider = (e) => {
        if (e === p || e.removed || e.deathTime > 0) return;
        if (e.type === "painting") {
          const d2 = e.hitTest(ox, oy, oz, dx, dy, dz, ed);
          if (d2 !== null && d2 < ed) {
            ed = d2;
            ent = e;
          }
          return;
        }
        if (!e.living) return;
        const hw = e.w / 2 + 0.1;
        const d = rayBox(ox, oy, oz, dx, dy, dz, [e.x - hw, e.y - 0.05, e.z - hw, e.x + hw, e.y + e.h + 0.1, e.z + hw]);
        if (d !== null && d < ed) {
          ed = d;
          ent = e;
        }
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
              const e = 1e-4;
              let f;
              if (Math.abs(hy - box[1]) < e) f = 0;
              else if (Math.abs(hy - box[4]) < e) f = 1;
              else if (Math.abs(hz - box[2]) < e) f = 2;
              else if (Math.abs(hz - box[5]) < e) f = 3;
              else if (Math.abs(hx - box[0]) < e) f = 4;
              else f = 5;
              return { x, y, z, f, d: t, hy: hy - y, box: sb };
            }
          }
        }
        if (tmx < tmy && tmx < tmz) {
          if (tmx > maxD) break;
          x += sx;
          tmx += tdx;
        } else if (tmy < tmz) {
          if (tmy > maxD) break;
          y += sy;
          tmy += tdy;
        } else {
          if (tmz > maxD) break;
          z += sz;
          tmz += tdz;
        }
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
      const L = w.light[(Math.floor(bx) & 255) << 15 | (Math.floor(bz) & 255) << 7 | Math.max(0, Math.min(127, Math.floor(by)))] || 0;
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
        if (flat) {
          m = T3.ry(m, -0.8);
          m = T3.rz(m, 0.3);
          m = T3.s(m, 0.55, 0.55, 0.55);
          m = T3.t(m, -0.5, -0.3, -0.5);
        } else {
          m = T3.ry(m, 0.75);
          m = T3.s(m, 0.45, 0.45, 0.45);
          m = T3.t(m, -0.5, -0.5, -0.5);
        }
        drawItem(mesh, m, held.id, held.meta || 0, sky, blk);
      } else {
        m = T3.t(m, 0.5 + bobX - swingA * 0.2, -0.55 + bobY + swingA * 0.15, -0.6);
        m = T3.rx(m, -0.9 - swingA * 0.8);
        m = T3.ry(m, -0.35);
        const skin = [214, 166, 126];
        drawBox(mesh, m, -0.08, -0.5, -0.08, 0.08, 0.1, 0.08, skin, sky, blk);
      }
    }
  };

  // game/src/input.js
  var Input = class {
    constructor(app2) {
      this.app = app2;
      this.canvas = app2.canvas;
      this.keys = /* @__PURE__ */ new Set();
      this.dpad = { fwd: false, back: false, left: false, right: false, jump: false, sneak: false };
      this.sneakToggle = false;
      this.look = null;
      this.mouseLocked = false;
      this.mouseButtons = 0;
      this.touchMode = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      this.lastAim = null;
      this.bindCanvas();
      this.bindKeys();
      this.bindDpad();
    }
    get ctrl() {
      return this.app.ctrl;
    }
    sens() {
      return this.app.settings.sens;
    }
    inGame() {
      return this.app.inGame() && !this.app.menuOpen();
    }
    // ------------------------------------------------------------------ canvas: look + tap/hold
    bindCanvas() {
      const c = this.canvas;
      c.addEventListener("contextmenu", (e) => e.preventDefault());
      c.addEventListener("pointerdown", (e) => {
        unlockAudio();
        if (!this.inGame()) return;
        if (e.pointerType === "mouse") {
          this.mouseDown(e);
          return;
        }
        this.touchMode = true;
        this.app.ui.setTouchControls(true, this.app.settings.dpad);
        if (this.look) return;
        c.setPointerCapture && c.setPointerCapture(e.pointerId);
        const aim = this.aimFor(e.clientX, e.clientY);
        this.look = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0, holding: false };
        this.look.timer = setTimeout(() => {
          if (this.look && this.look.id === e.pointerId) {
            this.look.holding = true;
            this.ctrl.pressStart(this.aimFor(this.look.x, this.look.y));
          }
        }, 220);
        this.lastAim = aim;
      });
      c.addEventListener("pointermove", (e) => {
        if (e.pointerType === "mouse") {
          this.mouseMove(e);
          return;
        }
        const L = this.look;
        if (!L || L.id !== e.pointerId) return;
        const dx = e.clientX - L.x, dy = e.clientY - L.y;
        L.x = e.clientX;
        L.y = e.clientY;
        L.moved += Math.abs(dx) + Math.abs(dy);
        if (this.inGame()) this.rotate(dx * 55e-4, dy * 55e-4);
        const aim = this.aimFor(L.x, L.y);
        this.lastAim = aim;
        if (L.holding) this.ctrl.pressMove(aim);
      });
      const end = (e) => {
        if (e.pointerType === "mouse") {
          this.mouseUp(e);
          return;
        }
        const L = this.look;
        if (!L || L.id !== e.pointerId) return;
        clearTimeout(L.timer);
        const dt = performance.now() - L.t;
        const tap = dt < 260 && L.moved < 14;
        const aim = this.aimFor(L.x, L.y);
        if (this.inGame()) {
          if (L.holding) this.ctrl.pressEnd(aim, false);
          else if (tap) {
            this.ctrl.pressEnd(aim, true);
          } else this.ctrl.pressEnd(aim, false);
        }
        this.look = null;
      };
      c.addEventListener("pointerup", end);
      c.addEventListener("pointercancel", end);
      document.addEventListener("pointerlockchange", () => {
        this.mouseLocked = document.pointerLockElement === c;
        if (!this.mouseLocked && this.app.inGame() && !this.app.menuOpen() && !this.touchMode) this.app.openPause();
      });
      c.addEventListener("wheel", (e) => {
        if (!this.inGame()) return;
        const me = this.app.me;
        if (!me) return;
        this.app.selectSlot((me.sel + (e.deltaY > 0 ? 1 : 8)) % 9);
        e.preventDefault();
      }, { passive: false });
    }
    aimFor(x, y) {
      if (this.app.settings.splitControls || this.mouseLocked) return "center";
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
      if (!this.mouseLocked) {
        this.canvas.requestPointerLock && this.canvas.requestPointerLock();
        return;
      }
      if (e.button === 0) {
        if (this.ctrl.attackPress("center")) this.ctrl.pressStart("center");
      } else if (e.button === 2) {
        this.ctrl.use("center");
        this.rightHeld = setInterval(() => this.inGame() && this.ctrl.use("center"), 250);
      }
    }
    mouseUp(e) {
      if (e.button === 0) this.ctrl.pressEnd("center", false);
      else if (e.button === 2) clearInterval(this.rightHeld);
    }
    mouseMove(e) {
      if (!this.mouseLocked || !this.inGame()) return;
      this.rotate(e.movementX * 25e-4, e.movementY * 25e-4);
    }
    // ------------------------------------------------------------------ keyboard
    bindKeys() {
      window.addEventListener("keydown", (e) => {
        if (e.target && e.target.tagName === "INPUT") return;
        const k = e.code;
        if (k === "Escape") {
          if (this.app.menuOpen()) this.app.closeScreens();
          else if (this.app.inGame()) this.app.openPause();
          return;
        }
        if (!this.app.inGame()) return;
        if (k === "KeyE") {
          if (this.app.menuOpen()) this.app.closeScreens();
          else this.app.openInventory();
          e.preventDefault();
          return;
        }
        if (this.app.menuOpen()) return;
        if (k === "KeyT") {
          this.app.ui.showChat();
          e.preventDefault();
          return;
        }
        if (k === "Space" && !this.keys.has("Space")) this.ctrl.jumpTap();
        if (k === "KeyQ") {
          const me = this.app.me;
          this.app.command({ c: "drop", s: me.sel, all: e.ctrlKey });
        }
        if (k === "KeyF") {
          const me = this.app.me;
          if (me.mode === "creative") {
            me.flying = !me.flying;
            me.vy = 0;
          }
        }
        if (k.startsWith("Digit")) {
          const n = +k.slice(5);
          if (n >= 1 && n <= 9) this.app.selectSlot(n - 1);
        }
        this.keys.add(k);
        if (k === "Space" || k.startsWith("Arrow")) e.preventDefault();
      });
      window.addEventListener("keyup", (e) => this.keys.delete(e.code));
      window.addEventListener("blur", () => {
        this.keys.clear();
        for (const k in this.dpad) this.dpad[k] = false;
      });
    }
    // ------------------------------------------------------------------ on-screen D-pad
    bindDpad() {
      const hud = this.app.ui.hud;
      const active = /* @__PURE__ */ new Map();
      const set = (k, v) => {
        if (k === "sneak") {
          if (v) {
            this.sneakToggle = !this.sneakToggle;
            hud.querySelector(".sneak").classList.toggle("on", this.sneakToggle);
          }
          return;
        }
        if (k === "jump" && v && !this.dpad.jump) this.ctrl.jumpTap();
        this.dpad[k] = v;
      };
      const fly = (k) => k === "jump" || k === "sneak";
      const onDown = (e) => {
        const b = e.target.closest(".dbtn");
        if (!b) return;
        e.preventDefault();
        e.stopPropagation();
        unlockAudio();
        const k = b.dataset.k;
        if (b.classList.contains("flydown")) {
          active.set(e.pointerId, "flydown");
          this.dpad.sneak = true;
          b.classList.add("on");
          return;
        }
        active.set(e.pointerId, k);
        b.classList.add("on");
        set(k, true);
        b.setPointerCapture && b.setPointerCapture(e.pointerId);
      };
      const onMove = (e) => {
        if (!active.has(e.pointerId)) return;
        const t = document.elementFromPoint(e.clientX, e.clientY);
        const b = t && t.closest && t.closest(".dpad .dbtn");
        const cur = active.get(e.pointerId);
        if (b && b.dataset.k !== cur && cur !== "sneak" && cur !== "flydown" && b.closest(".dpad")) {
          set(cur, false);
          hud.querySelectorAll(`.dpad [data-k="${cur}"]`).forEach((x) => x.classList.remove("on"));
          active.set(e.pointerId, b.dataset.k);
          set(b.dataset.k, true);
          b.classList.add("on");
        }
      };
      const onUp = (e) => {
        if (!active.has(e.pointerId)) return;
        const k = active.get(e.pointerId);
        active.delete(e.pointerId);
        if (k === "flydown") {
          this.dpad.sneak = false;
          hud.querySelector(".flydown").classList.remove("on");
          return;
        }
        if (k !== "sneak") {
          set(k, false);
          hud.querySelectorAll(`[data-k="${k}"]`).forEach((x) => x.classList.remove("on"));
        } else hud.querySelector(".sneak").classList.toggle("on", this.sneakToggle);
      };
      hud.addEventListener("pointerdown", onDown);
      hud.addEventListener("pointermove", onMove);
      hud.addEventListener("pointerup", onUp);
      hud.addEventListener("pointercancel", onUp);
    }
    // produce movement input each tick
    update() {
      const c = this.ctrl;
      const K = this.keys, D = this.dpad;
      let fwd = 0, strafe = 0;
      if (K.has("KeyW") || K.has("ArrowUp") || D.fwd) fwd += 1;
      if (K.has("KeyS") || K.has("ArrowDown") || D.back) fwd -= 1;
      if (K.has("KeyA") || K.has("ArrowLeft") || D.left) strafe -= 1;
      if (K.has("KeyD") || K.has("ArrowRight") || D.right) strafe += 1;
      c.input.fwd = fwd;
      c.input.strafe = strafe;
      c.input.jump = K.has("Space") || D.jump;
      const me = this.app.me;
      c.input.sneak = K.has("ShiftLeft") || K.has("ShiftRight") || D.sneak || this.sneakToggle && !(me && me.flying);
      if (me && me.flying && this.sneakToggle) {
        this.sneakToggle = false;
        this.app.ui.hud.querySelector(".sneak").classList.remove("on");
      }
    }
  };

  // game/src/icons.js
  var cache = /* @__PURE__ */ new Map();
  var SIZE = 48;
  function tileXY(t) {
    return [t % ATLAS_TILES * TILE, Math.floor(t / ATLAS_TILES) * TILE];
  }
  function drawFace(ctx2, tile, a, b, c, d, e, f, shade2, crop = null) {
    const [sx, sy] = tileXY(tile);
    ctx2.save();
    ctx2.setTransform(a, b, c, d, e, f);
    if (crop) ctx2.drawImage(atlasCanvas, sx, sy + crop[0], TILE, crop[1], 0, crop[0], TILE, crop[1]);
    else ctx2.drawImage(atlasCanvas, sx, sy, TILE, TILE, 0, 0, TILE, TILE);
    if (shade2 < 1) {
      ctx2.globalCompositeOperation = "source-atop";
      ctx2.fillStyle = `rgba(0,0,0,${1 - shade2})`;
      ctx2.fillRect(0, 0, TILE, TILE);
    }
    ctx2.restore();
  }
  function iconCanvas(id, meta = 0) {
    const key = id + ":" + meta;
    let c = cache.get(key);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = c.height = SIZE;
    const ctx2 = c.getContext("2d");
    ctx2.imageSmoothingEnabled = false;
    if (isBlockItem(id) && !blockIconIsFlat(id)) {
      const b = blocks[id];
      const fm = b.container || id === 86 || id === 61 || id === 62 ? 3 : meta;
      const top = b.texFn(1, meta), left = b.texFn(3, fm), right = b.texFn(5, meta);
      const s = SIZE / 36;
      const cx = SIZE / 2, cy = SIZE * 0.06;
      let h = 1;
      if (b.render === R.SLAB) h = 0.5;
      if (b.render === R.SNOW) h = 0.125;
      if (b.render === R.BED) h = 0.56;
      const topY = cy + (1 - h) * 16 * s * 1.15;
      drawFace(ctx2, top, s, s * 0.5, -s, s * 0.5, cx, topY, 1);
      const crop = h < 1 ? [Math.round((1 - h) * 16), Math.round(h * 16)] : null;
      const off = h < 1 ? -(1 - h) * 16 * s * 1.15 : 0;
      drawFace(ctx2, left, s, s * 0.5, 0, s * 1.15, cx - 16 * s, topY + 8 * s + off, 0.8, crop);
      drawFace(ctx2, right, s, -s * 0.5, 0, s * 1.15, cx, topY + 16 * s + off, 0.62, crop);
    } else {
      const tile = id < 256 ? blocks[id] ? blocks[id].texFn(1, meta) : 0 : itemIconTile(id, meta);
      const [sx, sy] = tileXY(tile);
      ctx2.drawImage(atlasCanvas, sx, sy, TILE, TILE, 4, 4, SIZE - 8, SIZE - 8);
    }
    cache.set(key, c);
    return c;
  }
  var urlCache = /* @__PURE__ */ new Map();
  function iconURL(id, meta = 0) {
    const key = id + ":" + meta;
    let u = urlCache.get(key);
    if (!u) {
      u = iconCanvas(id, meta).toDataURL();
      urlCache.set(key, u);
    }
    return u;
  }
  function tileURL(name) {
    let u = urlCache.get("t:" + name);
    if (!u) {
      const c = document.createElement("canvas");
      c.width = c.height = 32;
      const ctx2 = c.getContext("2d");
      ctx2.imageSmoothingEnabled = false;
      const [sx, sy] = tileXY(tex(name));
      ctx2.drawImage(atlasCanvas, sx, sy, TILE, TILE, 0, 0, 32, 32);
      u = c.toDataURL();
      urlCache.set("t:" + name, u);
    }
    return u;
  }

  // game/src/ui.js
  var $ = (sel, root = document) => root.querySelector(sel);
  var el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== void 0) e.innerHTML = html;
    return e;
  };
  var esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  function slotHTML(s, extra = "") {
    if (!s) return `<div class="slot empty" ${extra}></div>`;
    const it = getItem(s.id);
    let bar = "";
    if (it && it.durability && s.dmg) {
      const f = 1 - s.dmg / it.durability;
      bar = `<i class="dur"><b style="width:${Math.max(0, f * 100)}%;background:hsl(${f * 120},90%,45%)"></b></i>`;
    }
    return `<div class="slot" ${extra}><img src="${iconURL(s.id, s.meta)}">${s.count > 1 ? `<span>${s.count}</span>` : ""}${bar}</div>`;
  }
  var UI = class {
    constructor(app2) {
      this.app = app2;
      this.root = $("#ui");
      this.screen = null;
      this.screenName = null;
      this.buildHUD();
      this.msgTimer = null;
    }
    click() {
      unlockAudio();
      play("click");
    }
    // ------------------------------------------------------------------ HUD
    buildHUD() {
      const hud = el("div", "hud hidden");
      hud.id = "hud";
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
      hud.addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-act]");
        if (!b) return;
        this.click();
        const a = b.dataset.act;
        if (a === "pause") this.app.openPause();
        else if (a === "chat") this.showChat();
        else if (a === "wake") this.app.command({ c: "wake" });
      });
      const hb = $(".hotbar", hud);
      for (let i = 0; i < 9; i++) {
        const s = el("div", "hslot");
        s.dataset.i = i;
        hb.appendChild(s);
      }
      const more = el("div", "hslot more", "<b>\u2022\u2022\u2022</b>");
      hb.appendChild(more);
      let pressT = null, longFired = false;
      hb.addEventListener("pointerdown", (ev) => {
        const s = ev.target.closest(".hslot");
        if (!s) return;
        ev.preventDefault();
        ev.stopPropagation();
        longFired = false;
        if (s.classList.contains("more")) return;
        const i = +s.dataset.i;
        pressT = setTimeout(() => {
          longFired = true;
          if (i === this.app.me.sel) this.app.command({ c: "drop", s: i, all: false });
        }, 550);
      });
      hb.addEventListener("pointerup", (ev) => {
        clearTimeout(pressT);
        const s = ev.target.closest(".hslot");
        if (!s) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (longFired) return;
        this.click();
        if (s.classList.contains("more")) {
          this.app.openInventory();
          return;
        }
        this.app.selectSlot(+s.dataset.i);
      });
      hb.addEventListener("pointercancel", () => clearTimeout(pressT));
    }
    showHUD(on2) {
      this.hud.classList.toggle("hidden", !on2);
    }
    setTouchControls(on2, size = 1) {
      this.hud.classList.toggle("notouch", !on2);
      this.hud.style.setProperty("--dp", size);
    }
    setCrosshair(on2) {
      $(".cross", this.hud).classList.toggle("hidden", !on2);
    }
    setFlying(on2) {
      $(".flybtns", this.hud).classList.toggle("hidden", !on2);
    }
    setLanBadge(text) {
      const b = $(".lanbadge", this.hud);
      b.classList.toggle("hidden", !text);
      b.textContent = text || "";
    }
    setSleeping(on2) {
      $(".sleepover", this.hud).classList.toggle("hidden", !on2);
    }
    refreshHotbar() {
      const me = this.app.me;
      if (!me) return;
      const slots = this.hud.querySelectorAll(".hotbar .hslot:not(.more)");
      slots.forEach((s, i) => {
        const it = me.inv.slots[i];
        const key = it ? `${it.id}:${it.meta}:${it.count}:${it.dmg || 0}` : "";
        if (s._k !== key) {
          s._k = key;
          s.innerHTML = it ? slotHTML(it) : "";
        }
        s.classList.toggle("sel", i === me.sel);
      });
    }
    refreshStats() {
      const me = this.app.me;
      if (!me) return;
      const surv = me.mode !== "creative";
      const hearts = $(".hearts", this.hud), bubbles = $(".bubbles", this.hud);
      hearts.classList.toggle("hidden", !surv);
      const hp = Math.max(0, Math.ceil(me.health));
      const key = hp + ":" + (me.hurtTime > 0);
      if (hearts._k !== key) {
        hearts._k = key;
        let h = "";
        for (let i = 0; i < 10; i++) {
          const v = hp - i * 2;
          h += `<img src="${tileURL(v >= 2 ? "heart_full" : v === 1 ? "heart_half" : "heart_empty")}"${hp <= 4 ? ' class="shake"' : ""}>`;
        }
        hearts.innerHTML = h;
        hearts.classList.toggle("flash", me.hurtTime > 0);
      }
      const air = me.air;
      const showAir = surv && air < 300;
      bubbles.classList.toggle("hidden", !showAir);
      if (showAir) {
        const n = Math.max(0, Math.ceil(air / 30));
        if (bubbles._k !== n) {
          bubbles._k = n;
          let h = "";
          for (let i = 0; i < n; i++) h += `<img src="${tileURL("bubble")}">`;
          bubbles.innerHTML = h;
        }
      }
    }
    message(text) {
      const box = $(".msgs", this.hud);
      const m = el("div", "msg", esc(text));
      box.appendChild(m);
      while (box.children.length > 6) box.firstChild.remove();
      setTimeout(() => m.classList.add("fade"), 6e3);
      setTimeout(() => m.remove(), 7500);
    }
    updateLabels(list) {
      const box = $(".labels", this.hud);
      let h = "";
      for (const [name, x, y] of list) h += `<div class="nametag" style="left:${x}px;top:${y}px">${esc(name)}</div>`;
      if (box._h !== h) {
        box._h = h;
        box.innerHTML = h;
      }
    }
    // ------------------------------------------------------------------ screens
    show(name, html, cls = "") {
      this.hide();
      const s = el("div", "screen " + cls, html);
      s.dataset.name = name;
      this.root.appendChild(s);
      this.screen = s;
      this.screenName = name;
      s.addEventListener("pointerdown", (e) => e.stopPropagation());
      return s;
    }
    hide() {
      if (this.screen) {
        this.screen.remove();
        this.screen = null;
        this.screenName = null;
      }
    }
    isOpen() {
      return !!this.screen;
    }
    bind(s, handlers) {
      s.addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-act]");
        if (!b || b.disabled) return;
        this.click();
        const fn = handlers[b.dataset.act];
        if (fn) fn(b, ev);
      });
    }
    title() {
      const s = this.show("title", `
      <div class="title-bg"></div>
      <div class="logo">POCKETCRAFT<small>Pocket Edition v0.5.0 alpha \xB7 fan remake</small></div>
      <div class="menu">
        <button data-act="start">Start Game</button>
        <button data-act="join">Join Game</button>
        <button data-act="options">Options</button>
      </div>
      <div class="foot">Independent clean-room remake for personal use. Not affiliated with Mojang or Microsoft.</div>`, "title");
      this.bind(s, { start: () => this.app.showWorlds(), join: () => this.join(), options: () => this.options(() => this.title()) });
    }
    worlds(list) {
      const rows = list.map((w) => `
      <div class="wrow" data-act="play" data-id="${esc(w.id)}">
        <div><b>${esc(w.name)}</b><small>${w.mode === "creative" ? "Creative" : "Survival"} \xB7 ${new Date(w.lastPlayed || 0).toLocaleString()}</small></div>
        <button class="small danger" data-act="del" data-id="${esc(w.id)}">\u2715</button>
      </div>`).join("");
      const s = this.show("worlds", `
      <h1>Select World</h1>
      <div class="wlist">${rows || '<p class="dim">No worlds yet.</p>'}</div>
      <div class="row"><button data-act="back">Back</button><button data-act="create">Create New</button></div>`);
      this.bind(s, {
        back: () => this.title(),
        create: () => this.create(),
        play: (b, ev) => {
          if (ev.target.closest('[data-act="del"]')) return;
          this.app.loadWorld(b.dataset.id);
        },
        del: (b, ev) => {
          ev.stopPropagation();
          const w = list.find((x) => x.id === b.dataset.id);
          this.confirm(`Delete "${w ? w.name : ""}"? This cannot be undone.`, () => this.app.deleteWorld(b.dataset.id), () => this.app.showWorlds());
        }
      });
    }
    confirm(text, yes, no) {
      const s = this.show("confirm", `<h1>Are you sure?</h1><p>${esc(text)}</p><div class="row"><button data-act="no">Cancel</button><button class="danger" data-act="yes">Yes</button></div>`);
      this.bind(s, { yes, no });
    }
    create() {
      const n = this.app.settings.worldCounter || 1;
      const s = this.show("create", `
      <h1>Create New World</h1>
      <label>World name<input id="wname" maxlength="32" value="My World${n > 1 ? " " + n : ""}"></label>
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
        mode: (b) => {
          b.dataset.v = b.dataset.v === "survival" ? "creative" : "survival";
          b.textContent = "Mode: " + (b.dataset.v === "survival" ? "Survival" : "Creative");
          $("#wmodedesc").textContent = b.dataset.v === "survival" ? "Survival: gather resources, craft, and stay alive at night." : "Creative: unlimited blocks, flying, no damage.";
        },
        type: (b) => {
          b.dataset.v = b.dataset.v === "normal" ? "flat" : "normal";
          b.textContent = "Terrain: " + (b.dataset.v === "normal" ? "Normal" : "Flat");
        },
        diff: (b) => {
          b.dataset.v = b.dataset.v === "normal" ? "peaceful" : "normal";
          b.textContent = "Difficulty: " + (b.dataset.v === "normal" ? "Normal" : "Peaceful");
        },
        go: () => {
          const name = $("#wname").value.trim() || "World";
          const seedStr = $("#wseed").value.trim();
          let seed;
          if (!seedStr) seed = Math.random() * 2 ** 31 | 0;
          else if (/^-?\d+$/.test(seedStr)) seed = parseInt(seedStr, 10) | 0;
          else {
            seed = 0;
            for (const c of seedStr) seed = Math.imul(seed, 31) + c.charCodeAt(0) | 0;
          }
          this.app.settings.worldCounter = n + 1;
          this.app.createWorld({ name, seed, mode: $("#wmode").dataset.v, type: $("#wtype").dataset.v, difficulty: $("#wdiff").dataset.v });
        }
      });
    }
    join() {
      const s = this.show("join", `
      <h1>Join Game</h1>
      <p class="dim">Games on your local Wi-Fi network appear below. Both devices must be on the same network.</p>
      <div class="glist"><p class="dim scanning">Scanning for games\u2026</p></div>
      <label>Or enter the host's IP address<input id="jip" placeholder="192.168.1.20" inputmode="decimal" value="${esc(this.app.settings.lastIp || "")}"></label>
      <div class="row"><button data-act="back">Back</button><button data-act="ip">Join by IP</button></div>
      <p class="dim myip"></p>`);
      const games = /* @__PURE__ */ new Map();
      const render = () => {
        const l = $(".glist", s);
        if (!games.size) {
          l.innerHTML = '<p class="dim scanning">Scanning for games\u2026</p>';
          return;
        }
        l.innerHTML = [...games.values()].map((g) => `<div class="wrow" data-act="game" data-host="${esc(g.host)}" data-port="${g.port}"><div><b>${esc(g.info.w || g.name)}</b><small>Host: ${esc(g.info.h || "?")} \xB7 ${esc(g.host)}</small></div><span class="go">\u25B6</span></div>`).join("");
      };
      const stop = this.app.discover((g) => {
        games.set(g.name, g);
        render();
      }, (name) => {
        games.delete(name);
        render();
      });
      this.app.localIp().then((ip) => {
        const e = $(".myip", s);
        if (e) e.textContent = "Your IP: " + ip;
      });
      this.bind(s, {
        back: () => {
          stop();
          this.title();
        },
        game: (b) => {
          stop();
          this.app.joinGame(b.dataset.host, +b.dataset.port);
        },
        ip: () => {
          const ip = $("#jip").value.trim();
          if (!ip) return;
          this.app.settings.lastIp = ip;
          this.app.saveSettings();
          stop();
          const [h, p] = ip.split(":");
          this.app.joinGame(h, p ? +p : void 0);
        }
      });
    }
    options(back) {
      const st = this.app.settings;
      const s = this.show("options", `
      <h1>Options</h1>
      <div class="opts">
        <label>Player name<input id="oname" maxlength="16" value="${esc(st.name)}"></label>
        <label>Look sensitivity <span id="osensv">${st.sens.toFixed(1)}</span><input id="osens" type="range" min="0.3" max="3" step="0.1" value="${st.sens}"></label>
        <label>Field of view <span id="ofovv">${st.fov}</span><input id="ofov" type="range" min="50" max="100" step="1" value="${st.fov}"></label>
        <label>Sound volume <span id="osndv">${Math.round(st.sound * 100)}%</span><input id="osnd" type="range" min="0" max="1" step="0.05" value="${st.sound}"></label>
        <label>Controls size <span id="odpv">${st.dpad.toFixed(1)}</span><input id="odp" type="range" min="0.7" max="1.6" step="0.1" value="${st.dpad}"></label>
        <div class="toggles">
          <button data-act="rd" id="ord">Render distance: ${st.renderDist <= 48 ? "Short" : st.renderDist <= 80 ? "Normal" : "Far"}</button>
          <button data-act="inv" id="oinv">Invert Y: ${st.invertY ? "ON" : "OFF"}</button>
          <button data-act="cross" id="ocross">Crosshair aiming: ${st.splitControls ? "ON" : "OFF"}</button>
          <button data-act="color" id="ocolor">Shirt color</button>
        </div>
      </div>
      <div class="row"><button data-act="done">Done</button></div>`);
      const upd = () => {
        this.app.applySettings();
      };
      const range = (id, key, fmt) => {
        const i = $("#" + id);
        i.addEventListener("input", () => {
          st[key] = parseFloat(i.value);
          $("#" + id + "v").textContent = fmt(st[key]);
          upd();
        });
      };
      range("osens", "sens", (v) => v.toFixed(1));
      range("ofov", "fov", (v) => v);
      range("osnd", "sound", (v) => Math.round(v * 100) + "%");
      range("odp", "dpad", (v) => v.toFixed(1));
      $("#ocolor").style.background = `rgb(${this.app.playerColor().join(",")})`;
      this.bind(s, {
        rd: (b) => {
          st.renderDist = st.renderDist <= 48 ? 80 : st.renderDist <= 80 ? 128 : 48;
          b.textContent = "Render distance: " + (st.renderDist <= 48 ? "Short" : st.renderDist <= 80 ? "Normal" : "Far");
          upd();
        },
        inv: (b) => {
          st.invertY = !st.invertY;
          b.textContent = "Invert Y: " + (st.invertY ? "ON" : "OFF");
          upd();
        },
        cross: (b) => {
          st.splitControls = !st.splitControls;
          b.textContent = "Crosshair aiming: " + (st.splitControls ? "ON" : "OFF");
          upd();
        },
        color: (b) => {
          st.color = (st.color + 1) % 8;
          b.style.background = `rgb(${this.app.playerColor().join(",")})`;
          upd();
        },
        done: () => {
          st.name = ($("#oname").value.trim() || st.name).slice(0, 16);
          this.app.saveSettings();
          upd();
          back();
        }
      });
    }
    pause(info) {
      const s = this.show("pause", `
      <h1>Game Menu</h1>
      <div class="menu">
        <button data-act="resume">Back to Game</button>
        <button data-act="options">Options</button>
        ${info.host ? `<button data-act="lan">LAN game: ${info.lan ? "Visible" : "Hidden"}</button>` : ""}
        ${info.canMode ? `<button data-act="mode">Game mode: ${info.mode === "creative" ? "Creative" : "Survival"}</button>` : ""}
        <button data-act="quit">${info.client ? "Disconnect" : "Save and Quit to Title"}</button>
      </div>
      <p class="dim">${esc(info.status || "")}</p>`);
      this.bind(s, {
        resume: () => this.app.closeScreens(),
        options: () => this.options(() => this.app.openPause()),
        lan: () => {
          this.app.toggleLan();
          this.app.openPause();
        },
        mode: () => {
          this.app.toggleMode();
          this.app.openPause();
        },
        quit: () => this.app.quit()
      });
    }
    loading(text, progress) {
      if (this.screenName !== "loading") this.show("loading", `<div class="ltxt"></div><div class="lbar"><b></b></div>`, "loading");
      $(".ltxt", this.screen).textContent = text;
      $(".lbar b", this.screen).style.width = Math.round((progress || 0) * 100) + "%";
    }
    error(text, back) {
      const s = this.show("error", `<h1>Oops</h1><p>${esc(text)}</p><div class="row"><button data-act="ok">OK</button></div>`);
      this.bind(s, { ok: back });
    }
    death() {
      const s = this.show("death", `<h1>You died!</h1><div class="menu"><button data-act="respawn">Respawn</button><button data-act="quit">Main menu</button></div>`, "death");
      this.bind(s, { respawn: () => {
        this.app.command({ c: "respawn" });
        this.app.closeScreens();
      }, quit: () => this.app.quit() });
    }
    showChat() {
      const s = this.show("chat", `<div class="chatbox"><input id="chatin" maxlength="100" placeholder="Say something\u2026"><button data-act="send">Send</button><button data-act="close">\u2715</button></div>`, "chat");
      const inp = $("#chatin", s);
      setTimeout(() => inp.focus(), 50);
      const send2 = () => {
        const t = inp.value.trim();
        if (t) this.app.command({ c: "chat", t });
        this.app.closeScreens();
      };
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") send2();
        if (e.key === "Escape") this.app.closeScreens();
        e.stopPropagation();
      });
      this.bind(s, { send: send2, close: () => this.app.closeScreens() });
    }
    // ------------------------------------------------------------------ inventory & crafting
    inventory(tab) {
      const me = this.app.me;
      const creative = me.mode === "creative";
      tab = tab || (creative ? "creative" : "inv");
      const tabs = creative ? `<button class="tab ${tab === "creative" ? "on" : ""}" data-act="tab" data-t="creative">Items</button><button class="tab ${tab === "craft" ? "on" : ""}" data-act="tab" data-t="craft">Crafting</button>` : `<button class="tab ${tab === "inv" ? "on" : ""}" data-act="tab" data-t="inv">Inventory</button><button class="tab ${tab === "craft" ? "on" : ""}" data-act="tab" data-t="craft">Crafting</button>`;
      const s = this.show("inventory", `
      <div class="ihead">${tabs}<button class="tab close" data-act="close">\u2715</button></div>
      <div class="ibody"></div>
      <div class="ihot"></div>`, "inv");
      this.invTab = tab;
      this.invTable = false;
      this.renderInvBody();
      this.bind(s, {
        tab: (b) => {
          this.invTab = b.dataset.t;
          s.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t === b));
          this.renderInvBody();
        },
        close: () => this.app.closeScreens()
      });
      this.bindSlots(s);
    }
    crafting() {
      const s = this.show("inventory", `
      <div class="ihead"><button class="tab on">Crafting Table</button><button class="tab close" data-act="close">\u2715</button></div>
      <div class="ibody"></div>
      <div class="ihot"></div>`, "inv");
      this.invTab = "craft";
      this.invTable = true;
      this.renderInvBody();
      this.bind(s, { close: () => this.app.closeScreens() });
      this.bindSlots(s);
    }
    renderInvBody() {
      const s = this.screen;
      if (!s) return;
      const me = this.app.me;
      const body = $(".ibody", s);
      const tab = this.invTab;
      if (tab === "inv") {
        let h = '<div class="grid g9">';
        for (let i = 9; i < 36; i++) h += slotHTML(me.inv.slots[i], `data-inv="${i}"`);
        h += '</div><p class="dim">Tap an item to move it to the selected hotbar slot. Hold a hotbar slot to drop.</p><div class="row"><button class="small" data-act2="drop1">Drop 1</button><button class="small" data-act2="dropall">Drop stack</button></div>';
        body.innerHTML = h;
      } else if (tab === "creative") {
        let h = '<div class="grid g9 creative">';
        CREATIVE.forEach(([id, m], k) => {
          h += slotHTML({ id, meta: m, count: 1 }, `data-cr="${k}" title="${esc(itemName(id, m))}"`);
        });
        h += '</div><div class="row"><button class="small" data-act2="clear">Clear selected slot</button></div>';
        body.innerHTML = h;
      } else if (tab === "craft") {
        const table = this.invTable;
        const cats = ["Blocks", "Tools", "Food", "Decoration", "Items"];
        this.craftCat = this.craftCat || "Blocks";
        let h = '<div class="cats">' + cats.map((c) => `<button class="tab small ${c === this.craftCat ? "on" : ""}" data-cat="${c}">${c}</button>`).join("") + '</div><div class="rlist">';
        const list = recipes.filter((r) => r.cat === this.craftCat && (table || !r.table));
        list.sort((a, b) => (canCraft(me.inv, b, table) ? 1 : 0) - (canCraft(me.inv, a, table) ? 1 : 0));
        for (const r of list) {
          const ok = canCraft(me.inv, r, table);
          const ins = r.in.map(([id, n, m]) => {
            const have = me.inv.count(id, m);
            return `<span class="ing ${have >= n ? "" : "miss"}"><img src="${iconURL(id, m < 0 ? 0 : m)}">${n}</span>`;
          }).join("");
          h += `<div class="recipe ${ok ? "ok" : ""}" data-rec="${r.id}"><img class="out" src="${iconURL(r.out[0], r.out[2])}"><div class="rn"><b>${esc(itemName(r.out[0], r.out[2]))}${r.out[1] > 1 ? " \xD7" + r.out[1] : ""}</b><div class="ings">${ins}</div></div></div>`;
        }
        if (!list.length) h += '<p class="dim">Nothing here.</p>';
        h += "</div>";
        if (!table) h += '<p class="dim">Use a Crafting Table for more recipes.</p>';
        body.innerHTML = h;
      }
      this.renderHotRow();
    }
    renderHotRow() {
      const s = this.screen;
      if (!s) return;
      const row = $(".ihot", s);
      if (!row) return;
      const me = this.app.me;
      let h = '<div class="grid g9 hot">';
      for (let i = 0; i < 9; i++) h += slotHTML(me.inv.slots[i], `data-hot="${i}" class="${i === me.sel ? "sel" : ""}"`).replace('class="slot', `class="slot ${i === me.sel ? "sel" : ""}`);
      h += "</div>";
      row.innerHTML = h;
    }
    bindSlots(s) {
      s.addEventListener("click", (ev) => {
        const me = this.app.me;
        const t = ev.target.closest("[data-inv],[data-hot],[data-cr],[data-rec],[data-cat],[data-act2]");
        if (!t) return;
        this.click();
        if (t.dataset.inv !== void 0) this.app.command({ c: "invMove", a: +t.dataset.inv, b: me.sel });
        else if (t.dataset.hot !== void 0) {
          this.app.selectSlot(+t.dataset.hot);
          this.renderHotRow();
        } else if (t.dataset.cr !== void 0) {
          const [id, m] = CREATIVE[+t.dataset.cr];
          this.app.command({ c: "creative", id, m, s: me.sel });
        } else if (t.dataset.rec !== void 0) {
          this.app.command({ c: "craft", r: +t.dataset.rec, n: 1, table: this.invTable });
        } else if (t.dataset.cat !== void 0) {
          this.craftCat = t.dataset.cat;
          this.renderInvBody();
        } else if (t.dataset.act2 === "clear") this.app.command({ c: "creative", id: 0, s: me.sel });
        else if (t.dataset.act2 === "drop1") this.app.command({ c: "drop", s: me.sel, all: false });
        else if (t.dataset.act2 === "dropall") this.app.command({ c: "drop", s: me.sel, all: true });
      });
    }
    invChanged() {
      this.refreshHotbar();
      if (this.screenName === "inventory") this.renderInvBody();
      else if (this.screenName === "chest" || this.screenName === "furnace") this.renderContainer();
    }
    // ------------------------------------------------------------------ containers
    container(kind, state) {
      this.contKind = kind;
      this.contState = state;
      const s = this.show(kind, `
      <div class="ihead"><button class="tab on">${kind === "chest" ? "Chest" : "Furnace"}</button><button class="tab close" data-act="close">\u2715</button></div>
      <div class="ibody"></div>`, "inv");
      this.renderContainer();
      this.bind(s, { close: () => this.app.closeScreens() });
      s.addEventListener("click", (ev) => {
        const t = ev.target.closest("[data-cs],[data-ps],[data-fs]");
        if (!t) return;
        this.click();
        if (t.dataset.cs !== void 0) this.app.command({ c: "cont", act: "take", s: +t.dataset.cs });
        else if (t.dataset.fs !== void 0) this.app.command({ c: "cont", act: "take", from: t.dataset.fs });
        else if (t.dataset.ps !== void 0) {
          const i = +t.dataset.ps;
          if (kind === "chest") this.app.command({ c: "cont", act: "put", s: i });
          else {
            const it = this.app.me.inv.slots[i];
            if (!it) return;
            const smelt = smelting.has(it.id), fuel = fuelTime(it.id) > 0;
            const to = this._fuelMode ? fuel ? "fuel" : "input" : smelt ? "input" : "fuel";
            this.app.command({ c: "cont", act: "put", s: i, to });
          }
        }
      });
    }
    updateContainer(state) {
      this.contState = state;
      this.renderContainer();
    }
    renderContainer() {
      const s = this.screen;
      if (!s) return;
      const st = this.contState;
      const me = this.app.me;
      const body = $(".ibody", s);
      const P = (a) => a ? { id: a[0], count: a[1], meta: a[2], dmg: a[3] } : null;
      let h = "";
      if (this.contKind === "chest") {
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
      <div class="row"><button class="small ${this._fuelMode ? "" : "on"}" data-fm="0">Tap items \u2192 Ingredient</button><button class="small ${this._fuelMode ? "on" : ""}" data-fm="1">Tap items \u2192 Fuel</button></div>`;
      }
      h += '<div class="grid g9 pinv">';
      for (let i = 9; i < 36; i++) h += slotHTML(me.inv.slots[i], `data-ps="${i}"`);
      for (let i = 0; i < 9; i++) h += slotHTML(me.inv.slots[i], `data-ps="${i}"`);
      h += "</div>";
      body.innerHTML = h;
      body.querySelectorAll("[data-fm]").forEach((b) => b.addEventListener("click", () => {
        this._fuelMode = b.dataset.fm === "1";
        this.renderContainer();
      }));
    }
  };

  // game/src/scene.js
  var Particles = class {
    constructor(world) {
      this.world = world;
      this.list = [];
    }
    add(p) {
      if (this.list.length < 1500) this.list.push(p);
    }
    blockBreak(x, y, z, id, meta) {
      const b = blocks[id];
      if (!b) return;
      const tile = b.texFn(2, meta);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) {
        if (Math.random() < 0.55) continue;
        const px2 = x + (i + 0.5) / 4, py = y + (j + 0.5) / 4, pz = z + (k + 0.5) / 4;
        this.add({ x: px2, y: py, z: pz, vx: (px2 - x - 0.5) * 0.25 + (Math.random() - 0.5) * 0.05, vy: (py - y - 0.5) * 0.25 + Math.random() * 0.1, vz: (pz - z - 0.5) * 0.25 + (Math.random() - 0.5) * 0.05, life: 15 + Math.random() * 20, tile, size: 0.08 + Math.random() * 0.06, g: 0.04, sub: true, uo: Math.random() * 0.75, vo: Math.random() * 0.75 });
      }
    }
    blockHit(x, y, z, id, meta, f) {
      const b = blocks[id];
      if (!b) return;
      const tile = b.texFn(2, meta);
      const n = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]][f || 1];
      for (let i = 0; i < 3; i++) {
        const px2 = x + 0.5 + n[0] * 0.55 + (n[0] ? 0 : Math.random() - 0.5), py = y + 0.5 + n[1] * 0.55 + (n[1] ? 0 : Math.random() - 0.5), pz = z + 0.5 + n[2] * 0.55 + (n[2] ? 0 : Math.random() - 0.5);
        this.add({ x: px2, y: py, z: pz, vx: n[0] * 0.05 + (Math.random() - 0.5) * 0.06, vy: n[1] * 0.05 + Math.random() * 0.06, vz: n[2] * 0.05 + (Math.random() - 0.5) * 0.06, life: 10 + Math.random() * 10, tile, size: 0.07, g: 0.04, sub: true, uo: Math.random() * 0.75, vo: Math.random() * 0.75 });
      }
    }
    explosion(x, y, z, p) {
      const t = tex("smoke");
      for (let i = 0; i < 40 + p * 10; i++) {
        const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2, s = Math.random() * 0.4;
        this.add({ x, y, z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + 0.05, vz: Math.sin(a) * Math.cos(e) * s, life: 20 + Math.random() * 25, tile: t, size: 0.4 + Math.random() * 0.6, g: -5e-3, drag: 0.9, col: [255, 255, 255], light: true });
      }
    }
    poof(x, y, z, tileName, col) {
      const t = tex(tileName || "smoke");
      for (let i = 0; i < 8; i++) this.add({ x, y, z, vx: (Math.random() - 0.5) * 0.15, vy: Math.random() * 0.15, vz: (Math.random() - 0.5) * 0.15, life: 10 + Math.random() * 10, tile: t, size: 0.12, g: 0.03, sub: !!tileName, uo: 0.25, vo: 0.25, col });
    }
    sparkle(x, y, z, col) {
      const t = tex("particle");
      for (let i = 0; i < 10; i++) this.add({ x: x + Math.random(), y: y + Math.random(), z: z + Math.random(), vx: 0, vy: 0.02, vz: 0, life: 20 + Math.random() * 10, tile: t, size: 0.08, g: -1e-3, col: col || [120, 255, 120], light: true });
    }
    bubble(x, y, z) {
      this.add({ x, y, z, vx: 0, vy: 0.05, vz: 0, life: 20, tile: tex("bubble"), size: 0.08, g: -0.01, light: true });
    }
    smokeAt(x, y, z) {
      this.add({ x, y, z, vx: (Math.random() - 0.5) * 0.02, vy: 0.04, vz: (Math.random() - 0.5) * 0.02, life: 20 + Math.random() * 10, tile: tex("smoke"), size: 0.12, g: -2e-3, col: [90, 90, 90] });
    }
    flame(x, y, z) {
      this.add({ x, y, z, vx: 0, vy: 0.01, vz: 0, life: 8 + Math.random() * 6, tile: tex("fire"), size: 0.08, g: -3e-3, light: true, sub: true, uo: 0.3, vo: 0.5 });
    }
    tick() {
      const w = this.world;
      let j = 0;
      for (let i = 0; i < this.list.length; i++) {
        const p = this.list[i];
        p.life--;
        p.vy -= p.g;
        const d = p.drag || 0.96;
        p.vx *= d;
        p.vy *= d;
        p.vz *= d;
        const nx = p.x + p.vx, ny = p.y + p.vy, nz = p.z + p.vz;
        const id = w.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
        if (blocks[id] && blocks[id].solid && blocks[id].opaque) {
          p.vx *= 0.2;
          p.vz *= 0.2;
          p.vy = 0;
        } else {
          p.x = nx;
          p.y = ny;
          p.z = nz;
        }
        if (p.life > 0) this.list[j++] = p;
      }
      this.list.length = j;
    }
    build(mesh, cam) {
      const w = this.world;
      const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      const rx = cy, rz = sy;
      const ux = sy * sp, uy = cp, uz = -cy * sp;
      for (const p of this.list) {
        const s = p.size;
        const [tu, tv, ts] = tileUV(p.tile);
        let u0 = tu, v0 = tv, u1 = tu + ts, v1 = tv + ts;
        if (p.sub) {
          u0 = tu + p.uo * ts;
          v0 = tv + p.vo * ts;
          u1 = u0 + ts * 0.25;
          v1 = v0 + ts * 0.25;
        }
        const L = p.light ? 255 : w.light[((p.x | 0) & 255) << 15 | ((p.z | 0) & 255) << 7 | Math.max(0, Math.min(127, p.y | 0))];
        const sky = L >> 4, blk = L & 15;
        const c = p.col || [255, 255, 255];
        mesh.quad(
          [p.x - rx * s + ux * s, p.y + uy * s, p.z - rz * s + uz * s],
          [p.x - rx * s - ux * s, p.y - uy * s, p.z - rz * s - uz * s],
          [p.x + rx * s - ux * s, p.y - uy * s, p.z + rz * s - uz * s],
          [p.x + rx * s + ux * s, p.y + uy * s, p.z + rz * s + uz * s],
          u0,
          v0,
          u1,
          v1,
          sky,
          blk,
          1,
          c
        );
      }
    }
  };
  function lightAt(w, x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    if (yi >= 128) return [15, 0];
    if (xi < 0 || zi < 0 || xi > 255 || zi > 255 || yi < 0) return [15, 0];
    const L = w.light[xi << 15 | zi << 7 | yi];
    return [L >> 4, L & 15];
  }
  var lerp = (a, b, t) => a + (b - a) * t;
  function lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }
  function buildEntities(mesh, game, me, alpha, cam, renderDist) {
    const w = game.world;
    const rd2 = renderDist * renderDist;
    const draw = (e) => {
      if (e === me || e.removed) return;
      const x = lerp(e.px, e.x, alpha), y = lerp(e.py, e.y, alpha), z = lerp(e.pz, e.z, alpha);
      if ((x - cam.x) ** 2 + (z - cam.z) ** 2 > rd2) return;
      const [sky, blk] = lightAt(w, x, y + 0.5, z);
      if (e.type === "item") {
        const t = (e.age + alpha) / 20;
        const bob = Math.sin(t * 2 + e.bob) * 0.08 + 0.15;
        let m = T3.t(T3.id(), x, y + bob, z);
        m = T3.ry(m, t + e.bob);
        const n = e.item.count > 20 ? 3 : e.item.count > 5 ? 2 : 1;
        const block3d = isBlockItem(e.item.id) && !blockIconIsFlat(e.item.id);
        for (let k = 0; k < n; k++) {
          let mm2 = T3.t(m, k * 0.06, k * 0.04, k * 0.05);
          mm2 = block3d ? T3.s(mm2, 0.45, 0.45, 0.45) : T3.s(mm2, 0.45, 0.45, 0.45);
          mm2 = T3.t(mm2, -0.5, block3d ? -0.2 : 0, -0.5);
          drawItem(mesh, mm2, e.item.id, e.item.meta, sky, blk);
        }
        return;
      }
      if (e.type === "painting") {
        drawPainting(mesh, e, ...lightAt(w, e.bx + 0.5 + [0, 0, 0, 0, 1, -1][e.dir] * 0, e.by + 0.5, e.bz + 0.5));
        return;
      }
      if (e.type === "arrow") {
        let m = T3.t(T3.id(), x, y + 0.1, z);
        m = T3.ry(m, -e.yaw);
        m = T3.rx(m, e.pitch || 0);
        drawBox(mesh, m, -0.03, -0.03, -0.35, 0.03, 0.03, 0.35, [120, 85, 40], sky, blk);
        drawBox(mesh, m, -0.08, -0.01, 0.25, 0.08, 0.01, 0.38, [230, 230, 230], sky, blk);
        drawBox(mesh, m, -0.05, -0.05, -0.42, 0.05, 0.05, -0.33, [130, 130, 130], sky, blk);
        return;
      }
      if (e.type === "snowball" || e.type === "egg") {
        let m = T3.t(T3.id(), x - 0.15, y, z - 0.15);
        m = T3.s(m, 0.3, 0.3, 0.3);
        drawItem(mesh, m, e.type === "egg" ? 344 : 332, 0, sky, blk);
        return;
      }
      if (e.type === "tnt" || e.type === "falling") {
        const id = e.type === "tnt" ? B.TNT : e.block;
        const b = blocks[id];
        let m = T3.t(T3.id(), x - 0.5, y, z - 0.5);
        let sc = 1;
        if (e.type === "tnt" && e.fuse < 10) sc = 1 + (10 - e.fuse) / 10 * 0.2;
        if (sc !== 1) {
          m = T3.t(m, 0.5, 0.5, 0.5);
          m = T3.s(m, sc, sc, sc);
          m = T3.t(m, -0.5, -0.5, -0.5);
        }
        const faces = [0, 1, 2, 3, 4, 5].map((f) => ({ tile: b.texFn(f, e.meta || 0) }));
        const flash = e.type === "tnt" && Math.floor(e.fuse / 5) % 2 === 0;
        drawBox(mesh, m, 0, 0, 0, 1, 1, 1, faces, flash ? 15 : sky, flash ? 15 : blk);
        if (flash) drawBox(mesh, m, -0.01, -0.01, -0.01, 1.01, 1.01, 1.01, [255, 255, 255], 15, 15, 140);
        return;
      }
      e.rx = x;
      e.ry = y;
      e.rz = z;
      if (e.type !== "player") e.ryaw = lerpAngle(e.pyaw !== void 0 ? e.pyaw : e.ryaw, e.ryaw, alpha);
      else e.ryaw = e.yaw;
      const fireLit = e.fire > 0 ? 15 : blk;
      if (e.type === "player") {
        e.rx = x;
        e.ry = e.sneak ? y - 0.1 : y;
        if (e.sleepingNet || e.sleeping) {
          e.ry = y - 1.2;
        }
      }
      drawMob(mesh, e, sky, fireLit);
      if (e.type === "player" && e.name) e._label = [x, y + 2.05, z];
    };
    for (const e of game.entities.values()) draw(e);
    for (const p of game.players.values()) draw(p);
  }
  function buildOverlay(mesh, ctrl) {
    const br = ctrl.breaking;
    if (!br || br.progress <= 0) return;
    const stage = Math.min(9, Math.floor(br.progress * 10));
    const tile = tex("destroy_" + stage);
    const e = 3e-3;
    const sb = ctrl.target && ctrl.target.x === br.x && ctrl.target.y === br.y && ctrl.target.z === br.z ? ctrl.target.box : [0, 0, 0, 1, 1, 1];
    const m = T3.t(T3.id(), br.x, br.y, br.z);
    drawBox(mesh, m, sb[0] - e, sb[1] - e, sb[2] - e, sb[3] + e, sb[4] + e, sb[5] + e, { tile, col: [255, 255, 255] }, 15, 15);
  }

  // node_modules/fflate/esm/browser.js
  var u8 = Uint8Array;
  var u16 = Uint16Array;
  var i32 = Int32Array;
  var fleb = new u8([
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    1,
    1,
    1,
    2,
    2,
    2,
    2,
    3,
    3,
    3,
    3,
    4,
    4,
    4,
    4,
    5,
    5,
    5,
    5,
    0,
    /* unused */
    0,
    0,
    /* impossible */
    0
  ]);
  var fdeb = new u8([
    0,
    0,
    0,
    0,
    1,
    1,
    2,
    2,
    3,
    3,
    4,
    4,
    5,
    5,
    6,
    6,
    7,
    7,
    8,
    8,
    9,
    9,
    10,
    10,
    11,
    11,
    12,
    12,
    13,
    13,
    /* unused */
    0,
    0
  ]);
  var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
  var freb = function(eb, start) {
    var b = new u16(31);
    for (var i = 0; i < 31; ++i) {
      b[i] = start += 1 << eb[i - 1];
    }
    var r = new i32(b[30]);
    for (var i = 1; i < 30; ++i) {
      for (var j = b[i]; j < b[i + 1]; ++j) {
        r[j] = j - b[i] << 5 | i;
      }
    }
    return { b, r };
  };
  var _a = freb(fleb, 2);
  var fl = _a.b;
  var revfl = _a.r;
  fl[28] = 258, revfl[258] = 28;
  var _b = freb(fdeb, 0);
  var fd = _b.b;
  var revfd = _b.r;
  var rev = new u16(32768);
  for (i = 0; i < 32768; ++i) {
    x = (i & 43690) >> 1 | (i & 21845) << 1;
    x = (x & 52428) >> 2 | (x & 13107) << 2;
    x = (x & 61680) >> 4 | (x & 3855) << 4;
    rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
  }
  var x;
  var i;
  var hMap = function(cd, mb, r) {
    var s = cd.length;
    var i = 0;
    var l = new u16(mb);
    for (; i < s; ++i) {
      if (cd[i])
        ++l[cd[i] - 1];
    }
    var le = new u16(mb);
    for (i = 1; i < mb; ++i) {
      le[i] = le[i - 1] + l[i - 1] << 1;
    }
    var co;
    if (r) {
      co = new u16(1 << mb);
      var rvb = 15 - mb;
      for (i = 0; i < s; ++i) {
        if (cd[i]) {
          var sv = i << 4 | cd[i];
          var r_1 = mb - cd[i];
          var v = le[cd[i] - 1]++ << r_1;
          for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
            co[rev[v] >> rvb] = sv;
          }
        }
      }
    } else {
      co = new u16(s);
      for (i = 0; i < s; ++i) {
        if (cd[i]) {
          co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
        }
      }
    }
    return co;
  };
  var flt = new u8(288);
  for (i = 0; i < 144; ++i)
    flt[i] = 8;
  var i;
  for (i = 144; i < 256; ++i)
    flt[i] = 9;
  var i;
  for (i = 256; i < 280; ++i)
    flt[i] = 7;
  var i;
  for (i = 280; i < 288; ++i)
    flt[i] = 8;
  var i;
  var fdt = new u8(32);
  for (i = 0; i < 32; ++i)
    fdt[i] = 5;
  var i;
  var flm = /* @__PURE__ */ hMap(flt, 9, 0);
  var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
  var fdm = /* @__PURE__ */ hMap(fdt, 5, 0);
  var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
  var max = function(a) {
    var m = a[0];
    for (var i = 1; i < a.length; ++i) {
      if (a[i] > m)
        m = a[i];
    }
    return m;
  };
  var bits = function(d, p, m) {
    var o = p / 8 | 0;
    return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
  };
  var bits16 = function(d, p) {
    var o = p / 8 | 0;
    return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
  };
  var shft = function(p) {
    return (p + 7) / 8 | 0;
  };
  var slc = function(v, s, e) {
    if (s == null || s < 0)
      s = 0;
    if (e == null || e > v.length)
      e = v.length;
    return new u8(v.subarray(s, e));
  };
  var ec = [
    "unexpected EOF",
    "invalid block type",
    "invalid length/literal",
    "invalid distance",
    "stream finished",
    "no stream handler",
    ,
    "no callback",
    "invalid UTF-8 data",
    "extra field too long",
    "date not in range 1980-2099",
    "filename too long",
    "stream finishing",
    "invalid zip data"
    // determined by unknown compression method
  ];
  var err = function(ind, msg, nt) {
    var e = new Error(msg || ec[ind]);
    e.code = ind;
    if (Error.captureStackTrace)
      Error.captureStackTrace(e, err);
    if (!nt)
      throw e;
    return e;
  };
  var inflt = function(dat, st, buf, dict) {
    var sl = dat.length, dl = dict ? dict.length : 0;
    if (!sl || st.f && !st.l)
      return buf || new u8(0);
    var noBuf = !buf;
    var resize = noBuf || st.i != 2;
    var noSt = st.i;
    if (noBuf)
      buf = new u8(sl * 3);
    var cbuf = function(l2) {
      var bl = buf.length;
      if (l2 > bl) {
        var nbuf = new u8(Math.max(bl * 2, l2));
        nbuf.set(buf);
        buf = nbuf;
      }
    };
    var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
    var tbts = sl * 8;
    do {
      if (!lm) {
        final = bits(dat, pos, 1);
        var type = bits(dat, pos + 1, 3);
        pos += 3;
        if (!type) {
          var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
          if (t > sl) {
            if (noSt)
              err(0);
            break;
          }
          if (resize)
            cbuf(bt + l);
          buf.set(dat.subarray(s, t), bt);
          st.b = bt += l, st.p = pos = t * 8, st.f = final;
          continue;
        } else if (type == 1)
          lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
        else if (type == 2) {
          var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
          var tl = hLit + bits(dat, pos + 5, 31) + 1;
          pos += 14;
          var ldt = new u8(tl);
          var clt = new u8(19);
          for (var i = 0; i < hcLen; ++i) {
            clt[clim[i]] = bits(dat, pos + i * 3, 7);
          }
          pos += hcLen * 3;
          var clb = max(clt), clbmsk = (1 << clb) - 1;
          var clm = hMap(clt, clb, 1);
          for (var i = 0; i < tl; ) {
            var r = clm[bits(dat, pos, clbmsk)];
            pos += r & 15;
            var s = r >> 4;
            if (s < 16) {
              ldt[i++] = s;
            } else {
              var c = 0, n = 0;
              if (s == 16)
                n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
              else if (s == 17)
                n = 3 + bits(dat, pos, 7), pos += 3;
              else if (s == 18)
                n = 11 + bits(dat, pos, 127), pos += 7;
              while (n--)
                ldt[i++] = c;
            }
          }
          var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
          lbt = max(lt);
          dbt = max(dt);
          lm = hMap(lt, lbt, 1);
          dm = hMap(dt, dbt, 1);
        } else
          err(1);
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
      }
      if (resize)
        cbuf(bt + 131072);
      var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
      var lpos = pos;
      for (; ; lpos = pos) {
        var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
        pos += c & 15;
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (!c)
          err(2);
        if (sym < 256)
          buf[bt++] = sym;
        else if (sym == 256) {
          lpos = pos, lm = null;
          break;
        } else {
          var add = sym - 254;
          if (sym > 264) {
            var i = sym - 257, b = fleb[i];
            add = bits(dat, pos, (1 << b) - 1) + fl[i];
            pos += b;
          }
          var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
          if (!d)
            err(3);
          pos += d & 15;
          var dt = fd[dsym];
          if (dsym > 3) {
            var b = fdeb[dsym];
            dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
          }
          if (pos > tbts) {
            if (noSt)
              err(0);
            break;
          }
          if (resize)
            cbuf(bt + 131072);
          var end = bt + add;
          if (bt < dt) {
            var shift = dl - dt, dend = Math.min(dt, end);
            if (shift + bt < 0)
              err(3);
            for (; bt < dend; ++bt)
              buf[bt] = dict[shift + bt];
          }
          for (; bt < end; ++bt)
            buf[bt] = buf[bt - dt];
        }
      }
      st.l = lm, st.p = lpos, st.b = bt, st.f = final;
      if (lm)
        final = 1, st.m = lbt, st.d = dm, st.n = dbt;
    } while (!final);
    return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
  };
  var wbits = function(d, p, v) {
    v <<= p & 7;
    var o = p / 8 | 0;
    d[o] |= v;
    d[o + 1] |= v >> 8;
  };
  var wbits16 = function(d, p, v) {
    v <<= p & 7;
    var o = p / 8 | 0;
    d[o] |= v;
    d[o + 1] |= v >> 8;
    d[o + 2] |= v >> 16;
  };
  var hTree = function(d, mb) {
    var t = [];
    for (var i = 0; i < d.length; ++i) {
      if (d[i])
        t.push({ s: i, f: d[i] });
    }
    var s = t.length;
    var t2 = t.slice();
    if (!s)
      return { t: et, l: 0 };
    if (s == 1) {
      var v = new u8(t[0].s + 1);
      v[t[0].s] = 1;
      return { t: v, l: 1 };
    }
    t.sort(function(a, b) {
      return a.f - b.f;
    });
    t.push({ s: -1, f: 25001 });
    var l = t[0], r = t[1], i0 = 0, i1 = 1, i2 = 2;
    t[0] = { s: -1, f: l.f + r.f, l, r };
    while (i1 != s - 1) {
      l = t[t[i0].f < t[i2].f ? i0++ : i2++];
      r = t[i0 != i1 && t[i0].f < t[i2].f ? i0++ : i2++];
      t[i1++] = { s: -1, f: l.f + r.f, l, r };
    }
    var maxSym = t2[0].s;
    for (var i = 1; i < s; ++i) {
      if (t2[i].s > maxSym)
        maxSym = t2[i].s;
    }
    var tr = new u16(maxSym + 1);
    var mbt = ln(t[i1 - 1], tr, 0);
    if (mbt > mb) {
      var i = 0, dt = 0;
      var lft = mbt - mb, cst = 1 << lft;
      t2.sort(function(a, b) {
        return tr[b.s] - tr[a.s] || a.f - b.f;
      });
      for (; i < s; ++i) {
        var i2_1 = t2[i].s;
        if (tr[i2_1] > mb) {
          dt += cst - (1 << mbt - tr[i2_1]);
          tr[i2_1] = mb;
        } else
          break;
      }
      dt >>= lft;
      while (dt > 0) {
        var i2_2 = t2[i].s;
        if (tr[i2_2] < mb)
          dt -= 1 << mb - tr[i2_2]++ - 1;
        else
          ++i;
      }
      for (; i >= 0 && dt; --i) {
        var i2_3 = t2[i].s;
        if (tr[i2_3] == mb) {
          --tr[i2_3];
          ++dt;
        }
      }
      mbt = mb;
    }
    return { t: new u8(tr), l: mbt };
  };
  var ln = function(n, l, d) {
    return n.s == -1 ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1)) : l[n.s] = d;
  };
  var lc = function(c) {
    var s = c.length;
    while (s && !c[--s])
      ;
    var cl = new u16(++s);
    var cli = 0, cln = c[0], cls = 1;
    var w = function(v) {
      cl[cli++] = v;
    };
    for (var i = 1; i <= s; ++i) {
      if (c[i] == cln && i != s)
        ++cls;
      else {
        if (!cln && cls > 2) {
          for (; cls > 138; cls -= 138)
            w(32754);
          if (cls > 2) {
            w(cls > 10 ? cls - 11 << 5 | 28690 : cls - 3 << 5 | 12305);
            cls = 0;
          }
        } else if (cls > 3) {
          w(cln), --cls;
          for (; cls > 6; cls -= 6)
            w(8304);
          if (cls > 2)
            w(cls - 3 << 5 | 8208), cls = 0;
        }
        while (cls--)
          w(cln);
        cls = 1;
        cln = c[i];
      }
    }
    return { c: cl.subarray(0, cli), n: s };
  };
  var clen = function(cf, cl) {
    var l = 0;
    for (var i = 0; i < cl.length; ++i)
      l += cf[i] * cl[i];
    return l;
  };
  var wfblk = function(out, pos, dat) {
    var s = dat.length;
    var o = shft(pos + 2);
    out[o] = s & 255;
    out[o + 1] = s >> 8;
    out[o + 2] = out[o] ^ 255;
    out[o + 3] = out[o + 1] ^ 255;
    for (var i = 0; i < s; ++i)
      out[o + i + 4] = dat[i];
    return (o + 4 + s) * 8;
  };
  var wblk = function(dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
    wbits(out, p++, final);
    ++lf[256];
    var _a2 = hTree(lf, 15), dlt = _a2.t, mlb = _a2.l;
    var _b2 = hTree(df, 15), ddt = _b2.t, mdb = _b2.l;
    var _c = lc(dlt), lclt = _c.c, nlc = _c.n;
    var _d = lc(ddt), lcdt = _d.c, ndc = _d.n;
    var lcfreq = new u16(19);
    for (var i = 0; i < lclt.length; ++i)
      ++lcfreq[lclt[i] & 31];
    for (var i = 0; i < lcdt.length; ++i)
      ++lcfreq[lcdt[i] & 31];
    var _e = hTree(lcfreq, 7), lct = _e.t, mlcb = _e.l;
    var nlcc = 19;
    for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
      ;
    var flen = bl + 5 << 3;
    var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
    var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
    if (bs >= 0 && flen <= ftlen && flen <= dtlen)
      return wfblk(out, p, dat.subarray(bs, bs + bl));
    var lm, ll, dm, dl;
    wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
    if (dtlen < ftlen) {
      lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
      var llm = hMap(lct, mlcb, 0);
      wbits(out, p, nlc - 257);
      wbits(out, p + 5, ndc - 1);
      wbits(out, p + 10, nlcc - 4);
      p += 14;
      for (var i = 0; i < nlcc; ++i)
        wbits(out, p + 3 * i, lct[clim[i]]);
      p += 3 * nlcc;
      var lcts = [lclt, lcdt];
      for (var it = 0; it < 2; ++it) {
        var clct = lcts[it];
        for (var i = 0; i < clct.length; ++i) {
          var len = clct[i] & 31;
          wbits(out, p, llm[len]), p += lct[len];
          if (len > 15)
            wbits(out, p, clct[i] >> 5 & 127), p += clct[i] >> 12;
        }
      }
    } else {
      lm = flm, ll = flt, dm = fdm, dl = fdt;
    }
    for (var i = 0; i < li; ++i) {
      var sym = syms[i];
      if (sym > 255) {
        var len = sym >> 18 & 31;
        wbits16(out, p, lm[len + 257]), p += ll[len + 257];
        if (len > 7)
          wbits(out, p, sym >> 23 & 31), p += fleb[len];
        var dst = sym & 31;
        wbits16(out, p, dm[dst]), p += dl[dst];
        if (dst > 3)
          wbits16(out, p, sym >> 5 & 8191), p += fdeb[dst];
      } else {
        wbits16(out, p, lm[sym]), p += ll[sym];
      }
    }
    wbits16(out, p, lm[256]);
    return p + ll[256];
  };
  var deo = /* @__PURE__ */ new i32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
  var et = /* @__PURE__ */ new u8(0);
  var dflt = function(dat, lvl, plvl, pre, post2, st) {
    var s = st.z || dat.length;
    var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7e3)) + post2);
    var w = o.subarray(pre, o.length - post2);
    var lst = st.l;
    var pos = (st.r || 0) & 7;
    if (lvl) {
      if (pos)
        w[0] = st.r >> 3;
      var opt = deo[lvl - 1];
      var n = opt >> 13, c = opt & 8191;
      var msk_1 = (1 << plvl) - 1;
      var prev = st.p || new u16(32768), head = st.h || new u16(msk_1 + 1);
      var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
      var hsh = function(i2) {
        return (dat[i2] ^ dat[i2 + 1] << bs1_1 ^ dat[i2 + 2] << bs2_1) & msk_1;
      };
      var syms = new i32(25e3);
      var lf = new u16(288), df = new u16(32);
      var lc_1 = 0, eb = 0, i = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
      for (; i + 2 < s; ++i) {
        var hv = hsh(i);
        var imod = i & 32767, pimod = head[hv];
        prev[imod] = pimod;
        head[hv] = imod;
        if (wi <= i) {
          var rem = s - i;
          if ((lc_1 > 7e3 || li > 24576) && (rem > 423 || !lst)) {
            pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i - bs, pos);
            li = lc_1 = eb = 0, bs = i;
            for (var j = 0; j < 286; ++j)
              lf[j] = 0;
            for (var j = 0; j < 30; ++j)
              df[j] = 0;
          }
          var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
          if (rem > 2 && hv == hsh(i - dif)) {
            var maxn = Math.min(n, rem) - 1;
            var maxd = Math.min(32767, i);
            var ml = Math.min(258, rem);
            while (dif <= maxd && --ch_1 && imod != pimod) {
              if (dat[i + l] == dat[i + l - dif]) {
                var nl = 0;
                for (; nl < ml && dat[i + nl] == dat[i + nl - dif]; ++nl)
                  ;
                if (nl > l) {
                  l = nl, d = dif;
                  if (nl > maxn)
                    break;
                  var mmd = Math.min(dif, nl - 2);
                  var md = 0;
                  for (var j = 0; j < mmd; ++j) {
                    var ti = i - dif + j & 32767;
                    var pti = prev[ti];
                    var cd = ti - pti & 32767;
                    if (cd > md)
                      md = cd, pimod = ti;
                  }
                }
              }
              imod = pimod, pimod = prev[imod];
              dif += imod - pimod & 32767;
            }
          }
          if (d) {
            syms[li++] = 268435456 | revfl[l] << 18 | revfd[d];
            var lin = revfl[l] & 31, din = revfd[d] & 31;
            eb += fleb[lin] + fdeb[din];
            ++lf[257 + lin];
            ++df[din];
            wi = i + l;
            ++lc_1;
          } else {
            syms[li++] = dat[i];
            ++lf[dat[i]];
          }
        }
      }
      for (i = Math.max(i, wi); i < s; ++i) {
        syms[li++] = dat[i];
        ++lf[dat[i]];
      }
      pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i - bs, pos);
      if (!lst) {
        st.r = pos & 7 | w[pos / 8 | 0] << 3;
        pos -= 7;
        st.h = head, st.p = prev, st.i = i, st.w = wi;
      }
    } else {
      for (var i = st.w || 0; i < s + lst; i += 65535) {
        var e = i + 65535;
        if (e >= s) {
          w[pos / 8 | 0] = lst;
          e = s;
        }
        pos = wfblk(w, pos + 1, dat.subarray(i, e));
      }
      st.i = s;
    }
    return slc(o, 0, pre + shft(pos) + post2);
  };
  var dopt = function(dat, opt, pre, post2, st) {
    if (!st) {
      st = { l: 1 };
      if (opt.dictionary) {
        var dict = opt.dictionary.subarray(-32768);
        var newDat = new u8(dict.length + dat.length);
        newDat.set(dict);
        newDat.set(dat, dict.length);
        dat = newDat;
        st.w = dict.length;
      }
    }
    return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20 : 12 + opt.mem, pre, post2, st);
  };
  function deflateSync(data, opts) {
    return dopt(data, opts || {}, 0, 0);
  }
  function inflateSync(data, opts) {
    return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
  }
  var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
  var tds = 0;
  try {
    td.decode(et, { stream: true });
    tds = 1;
  } catch (e) {
  }

  // game/src/bridge.js
  var listeners = /* @__PURE__ */ new Map();
  var pending = /* @__PURE__ */ new Map();
  var reqId = 1;
  var platform = (() => {
    if (window.AndroidBridge) return "android";
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.bridge) return "ios";
    return "web";
  })();
  var isNative = platform !== "web";
  function post(obj) {
    const s = JSON.stringify(obj);
    if (platform === "android") window.AndroidBridge.postMessage(s);
    else if (platform === "ios") window.webkit.messageHandlers.bridge.postMessage(s);
  }
  function dispatch(e) {
    if (e.ev === "reply") {
      const p = pending.get(e.req);
      if (p) {
        pending.delete(e.req);
        e.error ? p.reject(new Error(e.error)) : p.resolve(e.data);
      }
      return;
    }
    const set = listeners.get(e.ev);
    if (set) for (const fn of set) {
      try {
        fn(e);
      } catch (err2) {
        console.error(err2);
      }
    }
  }
  window.__nativeEvents = (arr) => {
    for (const e of arr) dispatch(e);
  };
  function on(ev, fn) {
    if (!listeners.has(ev)) listeners.set(ev, /* @__PURE__ */ new Set());
    listeners.get(ev).add(fn);
    return () => listeners.get(ev).delete(fn);
  }
  function send(op, args = {}) {
    post(Object.assign({ op }, args));
  }
  function request(op, args = {}) {
    return new Promise((resolve, reject) => {
      const req = reqId++;
      pending.set(req, { resolve, reject });
      post(Object.assign({ op, req }, args));
      setTimeout(() => {
        if (pending.has(req)) {
          pending.delete(req);
          reject(new Error("timeout " + op));
        }
      }, 3e4);
    });
  }
  var cidSeq = 1;
  var NativeTransport = class {
    constructor() {
      this.handlers = { accept: null, msg: null, close: null, open: null, error: null };
      on("accept", (e) => this.handlers.accept && this.handlers.accept(e.cid, e.addr));
      on("msg", (e) => this.handlers.msg && this.handlers.msg(e.cid, e.data));
      on("close", (e) => this.handlers.close && this.handlers.close(e.cid));
      on("open", (e) => this.handlers.open && this.handlers.open(e.cid));
      on("error", (e) => this.handlers.error && this.handlers.error(e.cid, e.msg));
    }
    host(port) {
      send("host", { port });
    }
    unhost() {
      send("unhost");
    }
    connect(host, port) {
      const cid = "c" + cidSeq++;
      send("connect", { cid, host, port });
      return cid;
    }
    send(cid, data) {
      send("send", { cid, data });
    }
    close(cid) {
      send("close", { cid });
    }
    advertise(name, port, info) {
      send("advertise", { name, port, info: JSON.stringify(info) });
    }
    unadvertise() {
      send("unadvertise");
    }
    discover(onFound, onLost) {
      this._f = on("found", (e) => {
        let info = {};
        try {
          info = JSON.parse(e.info || "{}");
        } catch (_) {
        }
        onFound({ name: e.name, host: e.host, port: e.port, info });
      });
      this._l = on("lost", (e) => onLost && onLost(e.name));
      send("discover");
    }
    undiscover() {
      if (this._f) this._f();
      if (this._l) this._l();
      send("undiscover");
    }
    localIp() {
      return request("ip").catch(() => "?");
    }
  };
  var WebTransport = class {
    constructor() {
      this.handlers = { accept: null, msg: null, close: null, open: null, error: null };
      this.ws = null;
      this.queue = [];
      this.ready = false;
      this.url = (location.protocol === "https:" ? "wss://" : "ws://") + (location.host || "localhost:8080") + "/relay";
    }
    ensure() {
      if (this.ws) return;
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => {
        this.ready = true;
        for (const m of this.queue) this.ws.send(m);
        this.queue = [];
      };
      this.ws.onmessage = (ev) => {
        const e = JSON.parse(ev.data);
        if (e.ev === "found") {
          this._found && this._found({ name: e.name, host: e.host, port: e.port, info: e.info || {} });
          return;
        }
        if (e.ev === "lost") {
          this._lost && this._lost(e.name);
          return;
        }
        if (e.ev === "ip") {
          this._ip && this._ip(e.ip);
          return;
        }
        const h = this.handlers[e.ev];
        if (h) e.ev === "msg" ? h(e.cid, e.data) : e.ev === "error" ? h(e.cid, e.msg) : h(e.cid, e.addr);
      };
      this.ws.onclose = () => {
        this.ready = false;
        this.ws = null;
      };
    }
    raw(o) {
      this.ensure();
      const s = JSON.stringify(o);
      if (this.ready) this.ws.send(s);
      else this.queue.push(s);
    }
    host(port) {
      this.raw({ op: "host", port });
    }
    unhost() {
      this.raw({ op: "unhost" });
    }
    connect(host, port) {
      const cid = "c" + cidSeq++ + "_" + Math.random().toString(36).slice(2, 6);
      this.raw({ op: "connect", cid, host, port });
      return cid;
    }
    send(cid, data) {
      this.raw({ op: "send", cid, data });
    }
    close(cid) {
      this.raw({ op: "close", cid });
    }
    advertise(name, port, info) {
      this.raw({ op: "advertise", name, port, info });
    }
    unadvertise() {
      this.raw({ op: "unadvertise" });
    }
    discover(onFound, onLost) {
      this._found = onFound;
      this._lost = onLost;
      this.raw({ op: "discover" });
    }
    undiscover() {
      this._found = null;
      this.raw({ op: "undiscover" });
    }
    localIp() {
      return new Promise((res) => {
        this._ip = res;
        this.raw({ op: "ip" });
        setTimeout(() => res("127.0.0.1"), 2e3);
      });
    }
  };
  var transport = null;
  function getTransport() {
    if (!transport) transport = isNative ? new NativeTransport() : new WebTransport();
    return transport;
  }
  function keepAwake(on2) {
    if (isNative) send("keepAwake", { on: !!on2 });
  }

  // game/src/storage.js
  function b64encode(u82) {
    let s = "";
    const CH = 32768;
    for (let i = 0; i < u82.length; i += CH) s += String.fromCharCode.apply(null, u82.subarray(i, i + CH));
    return btoa(s);
  }
  function b64decode(str) {
    const s = atob(str);
    const u82 = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u82[i] = s.charCodeAt(i);
    return u82;
  }
  var dbp = null;
  function idb() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open("pocketcraft", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function idbOp(mode, fn) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction("files", mode);
      const st = tx.objectStore("files");
      const r = fn(st);
      tx.oncomplete = () => res(r && r.result);
      tx.onerror = () => rej(tx.error);
    });
  }
  var fs = isNative ? {
    write: (path, data) => request("fsWrite", { path, data }),
    read: (path) => request("fsRead", { path }),
    list: (dir) => request("fsList", { dir }).then((a) => a || []),
    del: (path) => request("fsDelete", { path })
  } : {
    write: (path, data) => idbOp("readwrite", (st) => st.put(data, path)),
    read: (path) => idbOp("readonly", (st) => st.get(path)),
    list: async (dir) => {
      const keys = await idbOp("readonly", (st) => st.getAllKeys());
      return (keys || []).filter((k) => k.startsWith(dir + "/")).map((k) => k.slice(dir.length + 1));
    },
    del: (path) => idbOp("readwrite", (st) => st.delete(path))
  };
  async function listWorlds() {
    const names = await fs.list("worlds");
    const out = [];
    for (const n of names) {
      if (!n.endsWith(".json")) continue;
      try {
        const m = JSON.parse(await fs.read("worlds/" + n));
        m.id = n.slice(0, -5);
        out.push(m);
      } catch (e) {
        console.warn("bad world", n, e);
      }
    }
    out.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
    return out;
  }
  async function saveWorld(id, meta, world) {
    const raw = new Uint8Array(world.blocks.length * 2);
    raw.set(world.blocks, 0);
    raw.set(world.meta, world.blocks.length);
    const z = deflateSync(raw, { level: 6 });
    meta.lastPlayed = Date.now();
    meta.format = 1;
    await fs.write("worlds/" + id + ".dat", b64encode(z));
    await fs.write("worlds/" + id + ".json", JSON.stringify(meta));
  }
  async function loadWorldData(id, world) {
    const meta = JSON.parse(await fs.read("worlds/" + id + ".json"));
    const d = await fs.read("worlds/" + id + ".dat");
    if (!d) throw new Error("world data missing");
    const raw = inflateSync(b64decode(d));
    world.blocks.set(raw.subarray(0, world.blocks.length));
    world.meta.set(raw.subarray(world.blocks.length, world.blocks.length * 2));
    return meta;
  }
  async function deleteWorld(id) {
    await fs.del("worlds/" + id + ".dat");
    await fs.del("worlds/" + id + ".json");
  }
  var DEFAULTS = { name: "", sens: 1, invertY: false, renderDist: 80, sound: 0.8, fov: 70, dpad: 1, color: 0, showCross: true, splitControls: false };
  function loadSettings() {
    let s = {};
    try {
      s = JSON.parse(localStorage.getItem("pc_settings") || "{}");
    } catch (e) {
    }
    return Object.assign({}, DEFAULTS, s);
  }
  function saveSettings(s) {
    try {
      localStorage.setItem("pc_settings", JSON.stringify(s));
    } catch (e) {
    }
  }

  // game/src/net.js
  var PORT = 19135;
  var PROTO = 5;
  var r2 = (v) => Math.round(v * 100) / 100;
  var r3 = (v) => Math.round(v * 1e3) / 1e3;
  function entSpawn(e) {
    return [e.id, e.type, r3(e.x), r3(e.y), r3(e.z), r2(e.yaw), r2(e.pitch || 0), e.extra()];
  }
  var Server = class {
    constructor(game, opts) {
      this.game = game;
      this.t = getTransport();
      this.clients = /* @__PURE__ */ new Map();
      this.blockQueue = [];
      this.dirtyEnts = /* @__PURE__ */ new Set();
      this.lastSent = /* @__PURE__ */ new Map();
      this.worldName = opts.worldName;
      this.hostName = opts.hostName;
      this.playerData = opts.playerData || {};
      this.onChange = opts.onChange || (() => {
      });
      this.open = false;
      const g = game;
      g.hooks.blockChange.push((x, y, z, id, meta) => {
        if (this.clients.size) this.blockQueue.push([x, y, z, id, meta]);
      });
      g.hooks.entityAdd.push((e) => this.bcast({ t: "spawn", e: entSpawn(e) }, e.type === "player" ? e : null));
      g.hooks.entityRemove.push((e) => {
        this.lastSent.delete(e.id);
        this.bcast({ t: "rm", ids: [e.id] });
      });
      g.hooks.entityDirty.push((e) => this.dirtyEnts.add(e.id));
      g.fxListeners.push((fx) => {
        if (!fx._remote) this.bcastFx(fx);
      });
      this.t.handlers.accept = (cid, addr) => this.onAccept(cid, addr);
      this.t.handlers.msg = (cid, data) => this.onMsg(cid, data);
      this.t.handlers.close = (cid) => this.onClose(cid);
    }
    start() {
      if (this.open) return;
      this.open = true;
      this.t.host(PORT);
      this.t.advertise(this.worldName + " (" + this.hostName + ")", PORT, { w: this.worldName, h: this.hostName, v: PROTO, m: this.game.world.mode });
    }
    stop() {
      if (!this.open) return;
      for (const c of this.clients.values()) {
        this.sendTo(c, { t: "bye", reason: "Host closed the world" });
        this.t.close(c.cid);
      }
      this.t.unadvertise();
      this.t.unhost();
      this.open = false;
    }
    sendTo(c, m) {
      this.t.send(c.cid, JSON.stringify(m));
    }
    bcast(m, except) {
      const s = JSON.stringify(m);
      for (const c of this.clients.values()) if (c.ready && c.player !== except) this.t.send(c.cid, s);
    }
    bcastFx(fx) {
      const s = JSON.stringify({ t: "fx", e: fx });
      for (const c of this.clients.values()) {
        if (!c.ready) continue;
        if (fx.only && fx.only !== c.player.id) continue;
        this.t.send(c.cid, s);
      }
    }
    onAccept(cid, addr) {
      if (!this.open) {
        this.t.close(cid);
        return;
      }
      this.clients.set(cid, { cid, player: null, ready: false, chunkQueue: [], addr });
    }
    onClose(cid) {
      const c = this.clients.get(cid);
      if (!c) return;
      this.clients.delete(cid);
      if (c.player) {
        this.savePlayer(c.player);
        this.game.removeEntity(c.player);
        this.game.broadcastMsg(c.player.name + " left the game");
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
      try {
        m = JSON.parse(data);
      } catch (e) {
        return;
      }
      const g = this.game;
      if (m.t === "hello") {
        if (m.v !== PROTO) {
          this.sendTo(c, { t: "bye", reason: "Incompatible version" });
          this.t.close(cid);
          return;
        }
        let name = String(m.name || "Player").slice(0, 16).replace(/[^\w \-.]/g, "") || "Player";
        const taken = new Set([...g.players.values()].map((p3) => p3.name));
        if (taken.has(name)) {
          let i = 2;
          while (taken.has(name + i)) i++;
          name = name + i;
        }
        const saved = this.playerData[name];
        const sp = saved ? [saved.x, saved.y, saved.z] : g.validSpawn({ spawnPoint: null });
        const p2 = new Player(name, sp[0], sp[1], sp[2]);
        p2.remote = true;
        p2.mode = saved ? saved.mode : g.world.mode;
        p2.color = PLAYER_COLORS[(m.color | 0) % PLAYER_COLORS.length];
        if (saved) {
          p2.inv.load(saved.inv);
          p2.health = saved.hp || 20;
          p2.spawnPoint = saved.sp || null;
        }
        p2.tx = p2.x;
        p2.ty = p2.y;
        p2.tz = p2.z;
        p2.sink = this.makeSink(c, p2);
        c.player = p2;
        c.name = name;
        this.sendTo(c, {
          t: "welcome",
          id: p2.id,
          name,
          seed: g.world.seed,
          time: g.world.time,
          mode: p2.mode,
          worldMode: g.world.mode,
          pos: [p2.x, p2.y, p2.z],
          hp: p2.health,
          inv: p2.inv.toJSON(),
          world: this.worldName,
          diff: g.difficulty,
          spawn: g.world.spawn,
          biomes: g.world.biomes ? b64encode(deflateSync(g.world.biomes)) : null
        });
        for (let cx = 0; cx < WX / 16; cx++) for (let cz = 0; cz < WZ / 16; cz++) c.chunkQueue.push([cx, cz]);
        const pcx = p2.x / 16, pcz = p2.z / 16;
        c.chunkQueue.sort((a, b) => (a[0] - pcx) ** 2 + (a[1] - pcz) ** 2 - ((b[0] - pcx) ** 2 + (b[1] - pcz) ** 2));
        return;
      }
      const p = c.player;
      if (!p) return;
      if (m.t === "pos") {
        if (p.deathTime > 0) return;
        if (!Number.isFinite(m.x) || !Number.isFinite(m.y) || !Number.isFinite(m.z)) return;
        p.tx = Math.max(-2, Math.min(WX + 2, m.x));
        p.ty = Math.max(-80, Math.min(WY + 64, m.y));
        p.tz = Math.max(-2, Math.min(WZ + 2, m.z));
        p.yaw = m.yaw;
        p.pitch = m.pitch;
        p.onGround = !!m.g;
        const sn = !!m.sn;
        if (sn !== p.sneak) {
          p.sneak = sn;
          this.dirtyEnts.add(p.id);
        }
        p.flying = !!m.f;
        return;
      }
      if (m.t === "cmd" && m.cmd) {
        g.command(p, m.cmd);
        return;
      }
      if (m.t === "ping") {
        this.sendTo(c, { t: "pong", k: m.k });
      }
    }
    makeSink(c, p) {
      const s = (m) => this.sendTo(c, m);
      return {
        inv: () => s({ t: "inv", s: p.inv.toJSON(), sel: p.sel }),
        hp: () => s({ t: "hp", v: p.health, air: p.air, dead: p.deathTime > 0 ? 1 : 0 }),
        msg: (text) => s({ t: "msg", s: text }),
        open: (kind, data) => s({ t: "open", kind, data }),
        cont: (st) => s({ t: "cont", s: st }),
        sleep: (st, wake) => s({ t: "sleep", s: st, wake }),
        teleport: (x, y, z) => {
          p.tx = x;
          p.ty = y;
          p.tz = z;
          s({ t: "tp", x, y, z });
        },
        knock: (vx, vy, vz) => s({ t: "knock", v: [vx, vy, vz] }),
        mode: (m) => s({ t: "mode", m })
      };
    }
    // called once per server tick
    tick() {
      const g = this.game;
      for (const c of this.clients.values()) {
        const p = c.player;
        if (!p || p.tx === void 0) continue;
        p.savePrev();
        p.x = p.tx;
        p.y = p.ty;
        p.z = p.tz;
        const mv = Math.hypot(p.x - p.px, p.z - p.pz);
        p.walkAmt += (Math.min(1, mv * 4) - p.walkAmt) * 0.4;
        p.walkAnim += mv * 4;
      }
      for (const c of this.clients.values()) {
        if (!c.player || c.ready) continue;
        let n = 0;
        while (c.chunkQueue.length && n < 6) {
          const [cx, cz] = c.chunkQueue.shift();
          const raw = g.world.exportChunk(cx, cz);
          this.sendTo(c, { t: "chunk", cx, cz, d: b64encode(deflateSync(raw, { level: 4 })), left: c.chunkQueue.length });
          n++;
        }
        if (!c.chunkQueue.length) {
          c.ready = true;
          this.sendTo(c, { t: "ready" });
          const list = [];
          for (const e of g.entities.values()) list.push(entSpawn(e));
          for (const p of g.players.values()) if (p !== c.player) list.push(entSpawn(p));
          this.sendTo(c, { t: "spawnMany", l: list });
          if (g.reactor) this.sendTo(c, { t: "reactor", r: g.reactor });
          g.addEntity(c.player);
          g.broadcastMsg(c.player.name + " joined the game");
          c.player.sink.inv();
          this.onChange();
        }
      }
      if (!this.clients.size) {
        this.blockQueue.length = 0;
        this.dirtyEnts.clear();
        return;
      }
      if (this.blockQueue.length) {
        const l = this.blockQueue;
        this.blockQueue = [];
        const s = JSON.stringify({ t: "b", l });
        for (const c of this.clients.values()) this.t.send(c.cid, s);
      }
      if (g.tick % 2 === 0) this.sendEntities();
      if (g.tick % 40 === 0) this.bcast({ t: "time", v: g.world.time });
    }
    sendEntities() {
      const g = this.game;
      const list = [];
      const consider = (e) => {
        const ls = this.lastSent.get(e.id);
        const dirty = this.dirtyEnts.has(e.id);
        const yaw = e.type === "player" ? e.yaw : e.ryaw !== void 0 ? e.ryaw : e.yaw;
        if (!ls || dirty || Math.abs(ls[0] - e.x) > 0.01 || Math.abs(ls[1] - e.y) > 0.01 || Math.abs(ls[2] - e.z) > 0.01 || Math.abs(ls[3] - yaw) > 0.02 || Math.abs(ls[4] - (e.pitch || 0)) > 0.02 || e.hurtTime > 0 !== ls[5] || e.deathTime > 0 !== ls[6]) {
          const row = [e.id, r3(e.x), r3(e.y), r3(e.z), r2(yaw), r2(e.pitch || 0), e.hurtTime > 0 ? 1 : 0, e.deathTime > 0 ? 1 : 0];
          if (dirty) row.push(e.extra());
          list.push(row);
          this.lastSent.set(e.id, [e.x, e.y, e.z, yaw, e.pitch || 0, e.hurtTime > 0, e.deathTime > 0]);
        }
      };
      for (const e of g.entities.values()) if (e.type !== "painting" || this.dirtyEnts.has(e.id)) consider(e);
      for (const p of g.players.values()) consider(p);
      this.dirtyEnts.clear();
      if (!list.length) return;
      for (const c of this.clients.values()) {
        if (!c.ready) continue;
        const mine = c.player.id;
        const l = list.filter((r) => r[0] !== mine);
        if (l.length) this.t.send(c.cid, JSON.stringify({ t: "ents", l }));
      }
    }
    playerCount() {
      let n = 0;
      for (const c of this.clients.values()) if (c.ready) n++;
      return n;
    }
  };
  var Client = class {
    constructor(host, port, opts) {
      this.t = getTransport();
      this.host = host;
      this.port = port || PORT;
      this.opts = opts;
      this.cid = null;
      this.handlers = opts.handlers;
      this.chunksLeft = WX * WZ / 256;
    }
    connect() {
      this.t.handlers.open = (cid) => {
        if (cid === this.cid) this.send({ t: "hello", v: PROTO, name: this.opts.name, color: this.opts.color });
      };
      this.t.handlers.msg = (cid, data) => {
        if (cid === this.cid) this.onMsg(data);
      };
      this.t.handlers.close = (cid) => {
        if (cid === this.cid) this.handlers.closed("Connection lost");
      };
      this.t.handlers.error = (cid, msg) => {
        if (cid === this.cid) this.handlers.closed("Could not connect: " + (msg || "error"));
      };
      this.cid = this.t.connect(this.host, this.port);
    }
    send(m) {
      if (this.cid) this.t.send(this.cid, JSON.stringify(m));
    }
    cmd(c) {
      this.send({ t: "cmd", cmd: c });
    }
    close() {
      if (this.cid) this.t.close(this.cid);
      this.cid = null;
    }
    onMsg(data) {
      let m;
      try {
        m = JSON.parse(data);
      } catch (e) {
        return;
      }
      const h = this.handlers;
      switch (m.t) {
        case "welcome":
          h.welcome(m);
          break;
        case "chunk":
          h.chunk(m.cx, m.cz, inflateSync(b64decode(m.d)), m.left);
          break;
        case "ready":
          h.ready();
          break;
        case "b":
          h.blocks(m.l);
          break;
        case "spawn":
          h.spawn([m.e]);
          break;
        case "spawnMany":
          h.spawn(m.l);
          break;
        case "rm":
          h.remove(m.ids);
          break;
        case "ents":
          h.ents(m.l);
          break;
        case "time":
          h.time(m.v);
          break;
        case "fx":
          h.fx(m.e);
          break;
        case "inv":
          h.inv(m.s, m.sel);
          break;
        case "hp":
          h.hp(m.v, m.air, m.dead);
          break;
        case "msg":
          h.msg(m.s);
          break;
        case "open":
          h.open(m.kind, m.data);
          break;
        case "cont":
          h.cont(m.s);
          break;
        case "sleep":
          h.sleep(m.s, m.wake);
          break;
        case "tp":
          h.tp(m.x, m.y, m.z);
          break;
        case "knock":
          h.knock(m.v);
          break;
        case "mode":
          h.mode(m.m);
          break;
        case "reactor":
          h.reactor && h.reactor(m.r);
          break;
        case "bye":
          h.closed(m.reason || "Disconnected");
          this.close();
          break;
      }
    }
  };
  function discoverGames(onFound, onLost) {
    const t = getTransport();
    t.discover(onFound, onLost);
    return () => t.undiscover();
  }

  // game/src/main.js
  var TICK_MS = 50;
  var App = class {
    constructor() {
      this.canvas = document.getElementById("game");
      this.settings = loadSettings();
      this.session = null;
      this.paused = false;
      this.particles = null;
    }
    async boot() {
      if (isNative) {
        try {
          const s = await request("fsRead", { path: "settings.json" });
          if (s) Object.assign(this.settings, JSON.parse(s));
        } catch (e) {
        }
      }
      if (!this.settings.name) this.settings.name = "Steve" + Math.floor(Math.random() * 900 + 100);
      buildAtlas();
      this.ui = new UI(this);
      this.ctrl = new Controller(this);
      this.input = new Input(this);
      this.applySettings();
      this.ui.title();
      this.last = performance.now();
      this.acc = 0;
      requestAnimationFrame((t) => this.frame(t));
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.autosave();
      });
      window.addEventListener("pagehide", () => this.autosave());
      window.addEventListener("resize", () => this.renderer && this.renderer.resize());
    }
    // ------------------------------------------------------------------ settings
    saveSettings() {
      saveSettings(this.settings);
      if (isNative) request("fsWrite", { path: "settings.json", data: JSON.stringify(this.settings) }).catch(() => {
      });
    }
    applySettings() {
      const s = this.settings;
      setVolume(s.sound);
      if (this.renderer) {
        this.renderer.renderDist = s.renderDist;
        this.renderer.fov = s.fov;
      }
      this.ui.setTouchControls(this.input ? this.input.touchMode : true, s.dpad);
      this.ui.setCrosshair(s.splitControls || this.input && !this.input.touchMode);
      if (this.me && this.session && this.session.server === null && this.me.color) this.me.color = this.playerColor();
    }
    playerColor() {
      return PLAYER_COLORS[this.settings.color % PLAYER_COLORS.length];
    }
    // ------------------------------------------------------------------ state helpers
    inGame() {
      return !!this.session && this.session.running;
    }
    menuOpen() {
      return this.ui.isOpen();
    }
    isMultiplayer() {
      return !!this.session && (!!this.session.client || this.session.server && this.session.server.playerCount() > 0);
    }
    get me() {
      return this.session ? this.session.me : null;
    }
    get game() {
      return this.session ? this.session.game : null;
    }
    get world() {
      return this.session ? this.session.world : null;
    }
    get renderer() {
      return this.session ? this.session.renderer : null;
    }
    command(cmd) {
      const s = this.session;
      if (!s) return;
      if (s.client) s.client.cmd(cmd);
      else s.game.command(s.me, cmd);
    }
    selectSlot(i) {
      const me = this.me;
      if (!me) return;
      me.sel = i;
      this.command({ c: "sel", s: i });
      this.ui.refreshHotbar();
    }
    // ------------------------------------------------------------------ menus
    async showWorlds() {
      let list = [];
      try {
        list = await listWorlds();
      } catch (e) {
        console.error(e);
      }
      this.ui.worlds(list);
    }
    closeScreens() {
      if (this.ui.screenName && ["chest", "furnace"].includes(this.ui.screenName)) this.command({ c: "close" });
      this.ui.hide();
      this.paused = false;
      if (this.me && this.me.deathTime > 0) this.ui.death();
    }
    openPause() {
      if (!this.session) return;
      const s = this.session;
      if (!s.client) this.paused = !this.isMultiplayer();
      const status = s.client ? `Connected to ${s.hostLabel}` : s.server && s.server.open ? `Hosting on LAN \xB7 ${s.server.playerCount()} other player(s) \xB7 IP ${this.localIpCache || "\u2026"}` : "Single player";
      this.ui.pause({ host: !s.client, lan: !!(s.server && s.server.open), client: !!s.client, status, canMode: !s.client, mode: this.me.mode });
      this.autosave();
    }
    openInventory() {
      if (this.me && !this.me.deathTime) this.ui.inventory();
    }
    discover(onFound, onLost) {
      return discoverGames(onFound, onLost);
    }
    localIp() {
      return getTransport().localIp().then((ip) => this.localIpCache = ip);
    }
    toggleLan() {
      const s = this.session;
      if (!s || s.client) return;
      if (!s.server) s.server = this.makeServer(s);
      if (s.server.open) s.server.stop();
      else s.server.start();
      this.updateLanBadge();
    }
    toggleMode() {
      const me = this.me;
      me.mode = me.mode === "creative" ? "survival" : "creative";
      if (me.mode === "survival") me.flying = false;
      this.ui.refreshStats();
    }
    updateLanBadge() {
      const s = this.session;
      if (!s) return;
      if (s.client) this.ui.setLanBadge("LAN: " + s.hostLabel);
      else if (s.server && s.server.open) this.ui.setLanBadge(`LAN ${this.localIpCache || ""} \xB7 ${s.server.playerCount() + 1}P`);
      else this.ui.setLanBadge("");
    }
    // ------------------------------------------------------------------ sessions
    localSink(me) {
      return {
        inv: () => this.ui.invChanged(),
        hp: () => this.ui.refreshStats(),
        msg: (t) => this.ui.message(t),
        open: (kind, data) => {
          if (kind === "workbench") this.ui.crafting();
          else this.ui.container(kind, data.state);
        },
        cont: (st) => {
          if (this.ui.screenName === "chest" || this.ui.screenName === "furnace") this.ui.updateContainer(st);
        },
        sleep: (st, wake) => this.setSleeping(st, wake),
        teleport: (x, y, z) => {
          me.x = me.px = x;
          me.y = me.py = y;
          me.z = me.pz = z;
          me.vx = me.vy = me.vz = 0;
        },
        knock: (vx, vy, vz) => {
          me.vx += vx;
          me.vy += vy;
          me.vz += vz;
        },
        mode: (m) => {
          me.mode = m;
          this.ui.refreshStats();
        }
      };
    }
    setSleeping(st, wake) {
      const me = this.me;
      me.sleeping = st;
      if (st) {
        me.x = me.px = st.x + 0.5;
        me.y = me.py = st.y + 0.56;
        me.z = me.pz = st.z + 0.5;
        me.vx = me.vy = me.vz = 0;
        me.yaw = [Math.PI, Math.PI / 2, 0, -Math.PI / 2][st.d];
        me.pitch = 0;
        this.ui.closeAll && this.ui.closeAll();
      } else if (wake) {
        me.x = me.px = wake[0];
        me.y = me.py = wake[1];
        me.z = me.pz = wake[2];
      }
      this.ui.setSleeping(!!st);
    }
    newSession(world, game, me, extra = {}) {
      if (this.session) this.endSession();
      const renderer = new Renderer(this.canvas, world);
      renderer.renderDist = this.settings.renderDist;
      renderer.fov = this.settings.fov;
      this.particles = new Particles(world);
      const s = Object.assign({ world, game, me, renderer, running: true, server: null, client: null, lastSave: performance.now() }, extra);
      this.session = s;
      game.fxListeners.push((fx) => this.onFx(fx));
      this.ui.showHUD(true);
      this.ui.hide();
      this.applySettings();
      this.ui.refreshHotbar();
      this.ui.refreshStats();
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
      this.ui.setLanBadge("");
      this.ui.setSleeping(false);
      keepAwake(false);
    }
    makeServer(s) {
      return new Server(s.game, { worldName: s.meta.name, hostName: this.settings.name, playerData: s.meta.playerData || {}, onChange: () => this.updateLanBadge() });
    }
    async createWorld(opts) {
      this.ui.loading("Generating world", 0);
      await sleep(30);
      const world = new World();
      world.name = opts.name;
      world.mode = opts.mode;
      const t0 = performance.now();
      if (opts.type === "flat") generateFlat(world, opts.seed);
      else generate(world, opts.seed, (p) => {
      });
      console.log("worldgen ms", Math.round(performance.now() - t0));
      world.time = 1e3;
      const game = new Game(world, { authority: true, difficulty: opts.difficulty });
      game.spawnAnimals(opts.type === "flat" ? 20 : 45);
      const id = "w" + Date.now().toString(36);
      const meta = { name: opts.name, seed: opts.seed, mode: opts.mode, type: opts.type, difficulty: opts.difficulty, created: Date.now() };
      this.startHost(world, game, meta, id, null);
      await this.save();
    }
    async loadWorld(id) {
      this.ui.loading("Loading world", 0.2);
      await sleep(30);
      const world = new World();
      let meta;
      try {
        meta = await loadWorldData(id, world);
      } catch (e) {
        console.error(e);
        this.ui.error("Could not load this world: " + e.message, () => this.showWorlds());
        return;
      }
      this.ui.loading("Lighting world", 0.6);
      await sleep(20);
      world.seed = meta.seed;
      world.name = meta.name;
      world.mode = meta.mode;
      world.time = meta.time || 0;
      world.spawn = meta.spawn || world.spawn;
      if (meta.biomes) world.biomes = inflateSync(b64decode(meta.biomes));
      world.fullLight();
      const game = new Game(world, { authority: true, difficulty: meta.difficulty || "normal" });
      if (meta.nextId) setNextId(meta.nextId);
      game.loadState(meta.state);
      this.startHost(world, game, meta, id, meta.player);
    }
    startHost(world, game, meta, id, saved) {
      const sp = saved ? [saved.x, saved.y, saved.z] : [world.spawn[0], world.spawn[1], world.spawn[2]];
      const me = new Player(this.settings.name, sp[0], sp[1], sp[2]);
      me.mode = saved && saved.mode ? saved.mode : world.mode;
      me.color = this.playerColor();
      if (saved) {
        me.inv.load(saved.inv);
        me.health = saved.hp || 20;
        me.sel = saved.sel || 0;
        me.yaw = saved.yaw || 0;
        me.pitch = saved.pitch || 0;
        me.spawnPoint = saved.sp || null;
        me.flying = !!saved.fly;
      } else if (me.mode === "survival") {
      } else this.fillCreativeHotbar(me);
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
      const def2 = [[B.STONE, 0], [B.COBBLE, 0], [B.PLANKS, 0], [B.LOG, 0], [B.GLASS, 0], [B.BRICKS, 0], [B.TORCH, 0], [B.WOOL, 14], [B.SAND, 0]];
      def2.forEach(([id, m], i) => me.inv.slots[i] = { id, count: 64, meta: m, dmg: 0 });
    }
    async save() {
      const s = this.session;
      if (!s || s.client || !s.worldId) return;
      const w = s.world, me = s.me;
      const meta = s.meta;
      meta.time = w.time;
      meta.spawn = w.spawn;
      meta.mode = w.mode;
      meta.player = { x: me.x, y: me.y, z: me.z, yaw: me.yaw, pitch: me.pitch, hp: me.health, inv: me.inv.toJSON(), sel: me.sel, mode: me.mode, sp: me.spawnPoint, fly: me.flying };
      if (me.deathTime > 0) {
        const sp = s.game.validSpawn(me);
        Object.assign(meta.player, { x: sp[0], y: sp[1], z: sp[2], hp: 20 });
      }
      if (s.server) {
        for (const c of s.server.clients.values()) if (c.player) s.server.savePlayer(c.player);
        meta.playerData = s.server.playerData;
      }
      meta.state = s.game.saveState();
      if (w.biomes && !meta.biomes) meta.biomes = b64encode(deflateSync(w.biomes));
      meta.nextId = (me.id || 0) + 1e5;
      try {
        await saveWorld(s.worldId, meta, w);
        s.lastSave = performance.now();
      } catch (e) {
        console.error("save failed", e);
        this.ui.message("Saving failed: " + e.message);
      }
    }
    autosave() {
      if (this.session && !this.session.client) this.save();
    }
    async deleteWorld(id) {
      await deleteWorld(id);
      this.showWorlds();
    }
    async quit() {
      if (this.session && !this.session.client) {
        this.ui.loading("Saving world", 0.5);
        await this.save();
      }
      this.endSession();
      this.paused = false;
      this.ui.title();
    }
    // ------------------------------------------------------------------ joining a LAN game
    joinGame(host, port) {
      this.ui.loading("Connecting to " + host, 0);
      const world = new World();
      const game = new Game(world, { authority: false });
      let me = null, chunks = 0;
      const total = WX / 16 * (WZ / 16);
      let started = false;
      let ss = null;
      const ents = (list) => {
        for (const r of list) {
          const [id, type, x, y, z, yaw, pitch, ex] = r;
          if (me && id === me.id) continue;
          if (game.getEntity(id)) continue;
          const e = type === "painting" ? createEntity("painting", x, y, z, ex) : createEntity(type, x, y, z, ex);
          if (!e) continue;
          e.id = id;
          e.yaw = e.pyaw = yaw;
          e.pitch = pitch;
          e.ryaw = yaw;
          e.tx = x;
          e.ty = y;
          e.tz = z;
          e.tyaw = yaw;
          if (type === "painting") {
            e.x = e.bx + 0.5;
            e.y = e.by;
            e.z = e.bz + 0.5;
          }
          e.savePrev();
          if (type === "player") game.players.set(id, e);
          else game.entities.set(id, e);
        }
      };
      const client = new Client(host, port, {
        name: this.settings.name,
        color: this.settings.color,
        handlers: {
          welcome: (m) => {
            world.seed = m.seed;
            world.time = m.time;
            world.mode = m.worldMode;
            world.spawn = m.spawn;
            world.name = m.world;
            if (m.biomes) world.biomes = inflateSync(b64decode(m.biomes));
            me = new Player(m.name, m.pos[0], m.pos[1], m.pos[2]);
            me.id = m.id;
            me.mode = m.mode;
            me.health = m.hp;
            me.inv.load(m.inv);
            me.color = this.playerColor();
            me.savePrev();
            this.ui.loading("Downloading world", 0);
          },
          chunk: (cx, cz, data, left) => {
            world.importChunk(cx, cz, data);
            chunks++;
            if (!started) this.ui.loading("Downloading world", chunks / total);
          },
          ready: () => {
            this.ui.loading("Lighting world", 1);
            setTimeout(() => {
              world.fullLight();
              ss = this.newSession(world, game, me, { client, hostLabel: host, meta: { name: world.name } });
              started = true;
              this.updateLanBadge();
              if (pendingSpawns.length) {
                ents(pendingSpawns);
                pendingSpawns.length = 0;
              }
            }, 20);
          },
          blocks: (l) => {
            for (const [x, y, z, id, meta] of l) {
              if (started) {
                const old = world.getBlock(x, y, z);
                world.setBlock(x, y, z, id, meta);
              } else if (world.inBounds(x, y, z)) world.rawSet(x, y, z, id, meta);
            }
          },
          spawn: (list) => {
            if (started) ents(list);
            else pendingSpawns.push(...list);
          },
          remove: (ids) => {
            for (const id of ids) {
              game.entities.delete(id);
              game.players.delete(id);
            }
          },
          ents: (l) => {
            for (const r of l) {
              const e = game.getEntity(r[0]);
              if (!e) continue;
              e.tx = r[1];
              e.ty = r[2];
              e.tz = r[3];
              e.tyaw = r[4];
              e.pitch = r[5];
              if (r[6] && !e.hurtFlag) e.hurtTime = 10;
              e.hurtFlag = !!r[6];
              if (r[7] && !e.deathTime) e.deathTime = 1;
              if (!r[7] && e.deathTime && e.type === "player") e.deathTime = 0;
              if (r[8] !== void 0) e.applyExtra(r[8]);
            }
          },
          time: (v) => {
            world.time = v;
          },
          fx: (e) => {
            e._remote = true;
            game.fx(e);
          },
          inv: (slots, sel) => {
            if (!me) return;
            me.inv.load(slots);
            this.ui.invChanged();
          },
          hp: (v, air, dead) => {
            if (!me) return;
            if (v < me.health) {
              me.hurtTime = 10;
            }
            me.health = v;
            me.air = air;
            if (dead && !me.deathTime) {
              me.deathTime = 1;
              this.ui.death();
            }
            if (!dead && me.deathTime) {
              me.deathTime = 0;
              this.ui.hide();
            }
            this.ui.refreshStats();
          },
          msg: (t) => this.ui.message(t),
          open: (kind, data) => {
            if (kind === "workbench") this.ui.crafting();
            else this.ui.container(kind, data.state);
          },
          cont: (st) => {
            if (this.ui.screenName === "chest" || this.ui.screenName === "furnace") this.ui.updateContainer(st);
          },
          sleep: (st, wake) => this.setSleeping(st, wake),
          tp: (x, y, z) => {
            if (!me) return;
            me.x = me.px = x;
            me.y = me.py = y;
            me.z = me.pz = z;
            me.vx = me.vy = me.vz = 0;
          },
          knock: (v) => {
            if (me) {
              me.vx += v[0];
              me.vy += v[1];
              me.vz += v[2];
            }
          },
          mode: (m) => {
            if (me) {
              me.mode = m;
              this.ui.refreshStats();
            }
          },
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
        case "break": {
          const pb = this.predictedBreak;
          if (this.session.client && pb && pb[0] === fx.x && pb[1] === fx.y && pb[2] === fx.z) break;
          this.particles.blockBreak(fx.x, fx.y, fx.z, fx.id, fx.m);
          play("break", { mat: blocks[fx.id] ? blocks[fx.id].sound : "stone", dist });
          break;
        }
        case "place":
          play("place", { mat: blocks[fx.id] ? blocks[fx.id].sound : "stone", dist });
          break;
        case "hurt":
          if (fx.id === me.id) {
            play("hurt");
            this.hurtFlash = 1;
          } else play(fx.type === "player" ? "hurt" : ["pig", "cow", "sheep", "chicken", "zombie", "skeleton", "spider"].includes(fx.type) ? fx.type : "mobhurt", { dist, vol: 0.8 });
          break;
        case "explode":
          this.particles.explosion(fx.x, fx.y, fx.z, fx.p);
          play("explode", { dist: dist / 3 });
          this.shake = Math.max(this.shake || 0, Math.max(0, 1 - dist / 16));
          break;
        case "snd":
          play(fx.s, { dist, minGap: 40 });
          break;
        case "pickup":
          play("pop", { dist, vol: 0.6 });
          break;
        case "swing": {
          const e = this.game.getEntity(fx.id);
          if (e) e.swing = 1;
          break;
        }
        case "bonemeal":
          this.particles.sparkle(fx.x, fx.y, fx.z);
          break;
        case "poof":
          this.particles.poof(fx.x, fx.y, fx.z, fx.tile);
          break;
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
        s.client.send({ t: "pos", x: +me.x.toFixed(3), y: +me.y.toFixed(3), z: +me.z.toFixed(3), yaw: +me.yaw.toFixed(3), pitch: +me.pitch.toFixed(3), g: me.onGround ? 1 : 0, sn: me.sneak ? 1 : 0, f: me.flying ? 1 : 0 });
      } else if (!this.paused) {
        s.game.serverTick();
        if (s.server) s.server.tick();
        if (performance.now() - s.lastSave > 9e4) this.save();
      }
      this.particles.tick();
      if (s.game.tick % 4 === 0 || s.client) this.ambient(s);
      if (me.deathTime > 0 && this.ui.screenName !== "death") this.ui.death();
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
        if (e.tx !== void 0) {
          const k = e.type === "player" ? 0.5 : 0.4;
          e.x += (e.tx - e.x) * k;
          e.y += (e.ty - e.y) * k;
          e.z += (e.tz - e.z) * k;
          if (Math.abs(e.tx - e.x) > 8 || Math.abs(e.tz - e.z) > 8) {
            e.x = e.tx;
            e.y = e.ty;
            e.z = e.tz;
          }
          let d = e.tyaw - e.yaw;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          e.yaw += d * 0.5;
          if (e.type !== "player") e.ryaw = e.yaw;
        }
        e.age++;
        if (e.hurtTime > 0) e.hurtTime--;
        if (e.deathTime > 0 && e.type !== "player") e.deathTime++;
        if (e.swing > 0) e.swing = Math.max(0, e.swing - 0.15);
        if (e.type === "tnt") e.fuse--;
        const mv = Math.hypot(e.x - e.px, e.z - e.pz);
        e.walkAmt += (Math.min(1, mv * 4) - e.walkAmt) * 0.4;
        e.walkAnim += mv * 4;
        e.onGround = true;
      };
      for (const e of g.entities.values()) step(e);
      for (const p of g.players.values()) step(p);
    }
    ambient(s) {
      const me = s.me, w = s.world;
      const cx = Math.floor(me.x), cy = Math.floor(me.y), cz = Math.floor(me.z);
      for (let i = 0; i < 30; i++) {
        const x = cx + (Math.random() * 24 | 0) - 12, y = cy + (Math.random() * 16 | 0) - 8, z = cz + (Math.random() * 24 | 0) - 12;
        const id = w.getBlock(x, y, z);
        if (id === B.TORCH) {
          const m = w.getMeta(x, y, z);
          let ox = 0.5, oz = 0.5, oy = 0.7;
          if (m === 1) ox = 0.25;
          else if (m === 2) ox = 0.75;
          else if (m === 3) oz = 0.25;
          else if (m === 4) oz = 0.75;
          if (m >= 1 && m <= 4) oy = 0.9;
          this.particles.flame(x + ox, y + oy, z + oz);
          this.particles.smokeAt(x + ox, y + oy + 0.1, z + oz);
        } else if (id === B.LIT_FURNACE && Math.random() < 0.5) this.particles.flame(x + 0.5, y + 0.3, z + 0.5);
        else if (id === B.FIRE) this.particles.smokeAt(x + Math.random(), y + 0.8, z + Math.random());
        else if (id === B.LAVA || id === B.STILL_LAVA) {
          if (Math.random() < 0.05 && w.getBlock(x, y + 1, z) === 0) this.particles.flame(x + Math.random(), y + 1, z + Math.random());
        } else if (id === B.REACTOR && w.getMeta(x, y, z) === 1) this.particles.sparkle(x - 1, y - 1, z - 1, [255, 140, 60]);
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
      while (this.acc >= TICK_MS) {
        this.tick();
        this.acc -= TICK_MS;
        if (!this.session) return;
      }
      const alpha = this.acc / TICK_MS;
      const me = s.me;
      const r = s.renderer;
      const eye = this.ctrl.eye(alpha);
      let bobY = 0, bobX = 0;
      if (me.onGround && !me.flying) {
        const b = this.ctrl.prevBob + (this.ctrl.camBob - this.ctrl.prevBob) * alpha;
        bobY = Math.abs(Math.cos(b * Math.PI)) * 0.05 * me.walkAmt;
        bobX = Math.sin(b * Math.PI) * 0.03 * me.walkAmt;
      }
      const sh = (this.shake || 0) * 0.15;
      const headId = s.world.getBlock(Math.floor(eye[0]), Math.floor(eye[1]), Math.floor(eye[2]));
      const cam = {
        x: eye[0] + Math.cos(me.yaw) * bobX + (Math.random() - 0.5) * sh,
        y: eye[1] + bobY + (Math.random() - 0.5) * sh,
        z: eye[2] + Math.sin(me.yaw) * bobX,
        yaw: me.yaw,
        pitch: me.pitch + (me.hurtTime > 0 ? Math.sin(me.hurtTime) * 0.02 : 0),
        underwater: isWater(headId),
        inLava: isLava(headId)
      };
      const crosshair = this.settings.splitControls || this.input.mouseLocked;
      const aim = crosshair ? "center" : this.input.look ? this.input.lastAim : null;
      if (aim && !this.menuOpen()) this.ctrl.updateTarget(aim);
      else {
        this.ctrl.target = null;
        this.ctrl.targetEnt = null;
      }
      const tgt = this.ctrl.target;
      r.updateMeshes(eye[0], eye[1], eye[2], this.settings.renderDist > 80 ? 8 : 6);
      const labels = [];
      r.render(cam, {
        selection: tgt && !me.deathTime ? [tgt.x, tgt.y, tgt.z, tgt.box] : null,
        buildDyn: (mesh, c) => {
          buildEntities(mesh, s.game, me, alpha, c, r.renderDist);
          this.particles.build(mesh, c);
        },
        buildDynT: (mesh) => buildOverlay(mesh, this.ctrl),
        buildHand: (mesh) => this.ctrl.buildHand(mesh, alpha),
        screenTint: this.hurtFlash > 0 ? [0.8, 0, 0, this.hurtFlash * 0.35] : cam.underwater ? [0.1, 0.2, 0.6, 0.15] : null,
        darken: me.sleeping ? Math.min(1, (s.game.sleepTicks || 0) / 100) : 0
      });
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
      if (s.game.tick % 5 === 0) {
        this.ui.refreshStats();
        this.ui.refreshHotbar();
      }
    }
  };
  var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.addEventListener("error", (e) => {
    console.error("ERR", e.message, e.filename, e.lineno);
  });
  var app = new App();
  window.__app = app;
  window.__recipes = recipes;
  window.__classes = { Pig: MOB_CLASSES.pig };
  app.boot();
})();
