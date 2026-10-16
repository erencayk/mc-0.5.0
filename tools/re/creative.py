exec(open('init.py').read().split("def ptr(a)")[0])
import json
got = []
hook(A('FillingContainer::addItem'), lambda uc, a: got.append((i32(a[1] + 4), i32(a[1] + 8), i32(a[1]))) or 0)
hook(A('FillingContainer::clearInventory'), lambda uc, a: 0)
inv = alloc(4096); mu.mem_write(inv + 0x24, b'\x01')
call(A('Inventory::setupDefault'), inv)
items = json.load(open('items.json')); tiles = json.load(open('tiles.json'))
def nm(i): return (tiles.get(str(i)) or items.get(str(i)) or {}).get('desc')
print(len(got))
print([(i, a, nm(i)) for i, a, c in got])
json.dump(got, open('creative.json', 'w'))
