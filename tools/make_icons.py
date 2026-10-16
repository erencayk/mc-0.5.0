#!/usr/bin/env python3
"""Generate the app icons (an original isometric grass block) for Android and iOS."""
import os
import random
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


def face_texture(kind, rnd):
    t = Image.new('RGB', (16, 16))
    px = t.load()
    for y in range(16):
        for x in range(16):
            k = rnd.randint(-16, 16)
            if kind == 'top':
                c = (104 + k, 170 + k, 64 + k // 2)
            else:
                grass_h = 3 + (x * 7 + 3) % 3
                if y < grass_h:
                    c = (104 + k, 170 + k, 64 + k // 2)
                else:
                    c = (134 + k, 96 + k, 67 + k)
            px[x, y] = tuple(max(0, min(255, v)) for v in c)
    return t


def shade(img, f):
    return img.point(lambda v: int(v * f))


def iso_block(size):
    rnd = random.Random(7)
    top, side = face_texture('top', rnd), face_texture('side', rnd)
    S = 64  # work at a fixed scale, then resize with nearest neighbour
    s = S / 36.0
    canvas = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    cx, ty = S / 2, S * 0.07
    def warp(tex, a, b, c, d, e, f, shade_f):
        tex = shade(tex, shade_f).convert('RGBA')
        # map destination -> source with inverse affine
        det = a * d - b * c
        ia, ib, ic, id_ = d / det, -c / det, -b / det, a / det
        out = canvas.load()
        src = tex.load()
        for py in range(S):
            for px_ in range(S):
                X, Y = px_ + 0.5 - e, py + 0.5 - f
                u = ia * X + ib * Y
                v = ic * X + id_ * Y
                if 0 <= u < 16 and 0 <= v < 16:
                    out[px_, py] = src[int(u), int(v)]
    # transforms: x' = a*u + c*v + e ; y' = b*u + d*v + f
    warp(top, s, s * 0.5, -s, s * 0.5, cx, ty, 1.0)
    warp(side, s, s * 0.5, 0, s * 1.15, cx - 16 * s, ty + 8 * s, 0.8)
    warp(side, s, -s * 0.5, 0, s * 1.15, cx, ty + 16 * s, 0.62)
    return canvas


def icon(size, rounded=False):
    bg = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(bg)
    r = size // 6 if rounded else 0
    # sky gradient background
    grad = Image.new('RGBA', (size, size))
    gp = grad.load()
    for y in range(size):
        t = y / size
        c = (int(110 + 60 * t), int(160 + 50 * t), 255, 255)
        for x in range(size):
            gp[x, y] = c
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
    bg.paste(grad, (0, 0), mask)
    block = iso_block(size).resize((int(size * 0.78), int(size * 0.78)), Image.NEAREST)
    off = ((size - block.width) // 2, (size - block.height) // 2 + size // 40)
    bg.alpha_composite(block, off)
    return bg


def main():
    sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
    for name, px in sizes.items():
        d = os.path.join(ROOT, 'android', 'res', 'mipmap-' + name)
        os.makedirs(d, exist_ok=True)
        icon(px, rounded=True).save(os.path.join(d, 'ic_launcher.png'))
    ios = os.path.join(ROOT, 'ios', 'PocketCraft', 'Assets.xcassets', 'AppIcon.appiconset')
    os.makedirs(ios, exist_ok=True)
    icon(1024).convert('RGB').save(os.path.join(ios, 'icon-1024.png'))
    print('icons written')


if __name__ == '__main__':
    main()
