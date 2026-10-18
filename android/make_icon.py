"""Gera os ícones do app (res/mipmap-*/ic_launcher.png)."""
import os
from PIL import Image, ImageDraw

SIZES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
S = 512
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
# fundo arredondado em degradê laranja
grad = Image.new('RGBA', (S, S))
gd = ImageDraw.Draw(grad)
for y in range(S):
    t = y / S
    gd.line([(0, y), (S, y)], fill=(int(255 - 10 * t), int(209 - 100 * t), int(102 - 90 * t), 255))
mask = Image.new('L', (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([16, 16, S - 16, S - 16], radius=110, fill=255)
img.paste(grad, (0, 0), mask)
# mira
c, r, w = S // 2, 150, 28
dark = (27, 27, 27, 255)
d.ellipse([c - r, c - r, c + r, c + r], outline=dark, width=w)
for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
    x0, y0 = c + dx * (r - 70), c + dy * (r - 70)
    x1, y1 = c + dx * (r + 60), c + dy * (r + 60)
    d.line([(x0, y0), (x1, y1)], fill=dark, width=w)
d.ellipse([c - 30, c - 30, c + 30, c + 30], fill=(214, 40, 40, 255))
d.rounded_rectangle([16, 16, S - 16, S - 16], radius=110, outline=(154, 52, 18, 255), width=14)

base = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'res')
for name, px in SIZES.items():
    out = os.path.join(base, 'mipmap-' + name)
    os.makedirs(out, exist_ok=True)
    img.resize((px, px), Image.LANCZOS).save(os.path.join(out, 'ic_launcher.png'))
