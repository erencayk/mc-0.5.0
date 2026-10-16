import json, collections
R = json.load(open('recipes.json'))
dome = json.load(open('dome.json'))
decay = json.load(open('decay_sample.json'))
creative = json.load(open('creative.json'))
TOOLS = {256,257,258,267,268,269,270,271,272,273,274,275,276,277,278,279,283,284,285,286,290,291,292,293,294,259,261,262,359}
FOOD = {297, 282, 353}
DECO = {85, 107, 65, 324, 96, 355, 321, 50, 47, 102}
ITEMS = {280, 266, 265, 264, 351, 339, 340, 281}
recs = []
for r in R['recipes']:
    res = r['result']
    if r['type'] == 'shaped':
        c = collections.Counter()
        for gid, g in zip(r['gridIds'], r['grid']):
            if gid > 0: c[(gid, g[1] if g[1] is not None else 0)] += 1
        ing = [[i, n, a] for (i, a), n in c.items()]
        table = r['w'] > 2 or r['h'] > 2
    else:
        c = collections.Counter()
        for name, a, cnt in r['ing']:
            pass
        c = collections.Counter()
        # shapeless ingredient ids from names
        names = {v: int(k) for k, v in R['names'].items()}
        for name, a, cnt in r['ing']: c[(names[name], a)] += 1
        ing = [[i, n, a] for (i, a), n in c.items()]
        table = len(r['ing']) > 4
    rid = res['id']
    cat = 'Tools' if rid in TOOLS else 'Food' if rid in FOOD else 'Decoration' if rid in DECO else 'Items' if rid in ITEMS else 'Blocks'
    recs.append([cat, [rid, res['count'], res['aux']], ing, table])
# final dome state
final = {}
for x, y, z, i in dome: final[(x, y, z)] = i
removed = set((x, y, z) for x, y, z, i in decay)
layers = []
for y in range(-3, 31):
    rows = []
    for z in range(-8, 9):
        row = ''
        for x in range(-8, 9):
            v = final.get((x, y, z))
            ch = '.' if v is None else ('a' if v == 0 else ('x' if (x, y, z) in removed else 'o'))
            row += ch
        rows.append(row)
    layers.append('|'.join(rows))
js = '''// Facts measured from the original 0.5.0 build with REA-style static analysis + CPU emulation
// (tools/re/*). Only numbers, ids and layouts are recorded here - no original code or assets.
export const RECIPES_050 = %s;
// [inputId, outputId, outputCount, outputAux]
export const FURNACE_050 = %s;
// creative inventory, original order: [id, aux]
export const CREATIVE_050 = %s;
// Nether spire around the reactor core: layers y=-3..30, rows z=-8..8, cols x=-8..8
// '.' untouched, 'a' air, 'o' obsidian, 'x' obsidian that crumbles when the reactor finishes
export const DOME_050 = %s;
export const REACTOR_050 = {
  clearRadius: 12, clearY0: -3, clearY1: 39, // cleared to air before the spire is built (core column kept)
  maxY: 100, playerRange: 5, keepEnemiesRange: 40,
  glow: { 2: -1, 3: 0, 4: 1, 7: -1 }, // second -> pattern layer turned to glowing obsidian
  levelSeconds: [10, 13, 20, 22, 25, 30, 34, 36, 38, 40],
  toObsidian: { 43: 2, 44: 1, 45: 0 }, // second -> layer back to obsidian
  endTick: 920,
  commonLoot: [[348, 3], [362, 1], [39, 1], [40, 1], [83, 1], [81, 1]], // 6/7 of drops
  rareLoot: [262, 355, 352, 340, 261, 281, 288, 321, 324] // 1/7 of drops
};
export const MOBS_050 = {
  health: { pig: 10, cow: 10, sheep: 8, chicken: 4, zombie: 12, skeleton: 10, spider: 8, creeper: 16, pigzombie: 20, player: 20 },
  attack: { zombie: 4, pigzombie: 5, spider: 2, skeleton: 2, creeper: 2 },
  creeperFuse: 30, tntPower: 3.1
};
''' % (json.dumps(recs, separators=(',', ':')), json.dumps([[a, b, c, d] for a, b, c, d in R['furnace']]),
       json.dumps([[i, a] for i, a, c in creative]), json.dumps(layers))
open('/home/user/mc-0.5.0/game/src/pe050data.js', 'w').write(js)
print(len(recs), 'recipes;', sum(r[3] for r in recs), 'need table')
