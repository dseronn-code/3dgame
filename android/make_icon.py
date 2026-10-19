"""Gera os ícones do app (res/mipmap-*/ic_launcher.png): ondas de som sobre fundo noturno."""
import os
from PIL import Image, ImageDraw

SIZES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
S = 512
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
bg = Image.new('RGBA', (S, S))
gd = ImageDraw.Draw(bg)
for y in range(S):
    t = y / S
    gd.line([(0, y), (S, y)], fill=(int(12 + 6 * t), int(18 + 20 * t), int(32 + 30 * t), 255))
mask = Image.new('L', (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([16, 16, S - 16, S - 16], radius=110, fill=255)
img.paste(bg, (0, 0), mask)
d = ImageDraw.Draw(img)
c = S // 2
for i, r in enumerate([40, 95, 150, 205]):
    a = 255 - i * 50
    d.arc([c - r, c - r, c + r, c + r], start=-60, end=60, fill=(127, 233, 255, a), width=22)
    d.arc([c - r, c - r, c + r, c + r], start=120, end=240, fill=(127, 233, 255, a), width=22)
d.ellipse([c - 18, c - 18, c + 18, c + 18], fill=(232, 238, 247, 255))

base = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'res')
for name, px in SIZES.items():
    out = os.path.join(base, 'mipmap-' + name)
    os.makedirs(out, exist_ok=True)
    img.resize((px, px), Image.LANCZOS).save(os.path.join(out, 'ic_launcher.png'))
