"""Video engine v2: word-count pacing, change glow, push-in zooms, Ragusa pulse,
LIBERTAS counter, time-true timeline, title + end cards.  usage: compose2.py OUT.mp4 [highlights]"""
import sys, subprocess, math
sys.path.insert(0, '/home/claude/work')
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
from keyframes import KEYFRAMES, fmt_year, fmt_label

W, H, FPS = 1080, 1920, 24
GOLD = (242, 194, 48); BG = (18, 22, 28)
MAP_Y0, MAP_Y1 = 290, 1376
LON0, LON1, LAT0, LAT1 = 12.0, 30.2, 34.6, 48.4
FD = '/usr/share/fonts/opentype/inter/'
def F(name, size): return ImageFont.truetype(FD + name, size)
def lonlat_px(lon, lat):
    return (lon - LON0) / (LON1 - LON0) * W, MAP_Y0 + (LAT1 - lat) / (LAT1 - LAT0) * (MAP_Y1 - MAP_Y0)
RAG = lonlat_px(18.094, 42.641)

HIGHLIGHTS = '--highlights' in sys.argv
OUT = sys.argv[1]
IDX = list(range(len(KEYFRAMES)))
if HIGHLIGHTS:
    want = ['323 BC', '14 AD', '400 AD', '1210', '1355', '1453', '1700', '1810', 'Jul 1878', '1942', '1992', '2026']
    IDX = [i for i, k in enumerate(KEYFRAMES) if fmt_label(k) in want]
KF = [KEYFRAMES[i] for i in IDX]
N = len(KF)

from render import RTEXT
def hold_of(k):
    if HIGHLIGHTS: return 3.75
    status, body = RTEXT[k.get('label') or k['year']]
    w = len((k['caption'] + ' ' + body).split())
    return float(np.clip(1.8 + 0.135 * w, 5.0, 8.5))
TRANS = 0.7 if HIGHLIGHTS else 0.9
GLOW = 1.4

frames = [Image.open(f'/home/claude/work/frames/kf_{i:02d}.png').convert('RGB') for i in IDX]
fills = [Image.open(f'/home/claude/work/frames/fill_{i:02d}.png').convert('RGB') for i in IDX]
def status_of(k):
    return RTEXT[k.get('label') or k['year']][0]

# ---- change masks (what changed hands going INTO frame j) ----
def change_mask(a, b):
    d = np.asarray(ImageChops.difference(a, b)).max(axis=2) > 28
    m = Image.fromarray((d * 255).astype('uint8')).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    m = m.resize((W, MAP_Y1 - MAP_Y0), Image.BILINEAR)
    edge = ImageChops.subtract(m.filter(ImageFilter.MaxFilter(7)), m.filter(ImageFilter.MinFilter(5)))
    return m, edge.filter(ImageFilter.GaussianBlur(2.2))
MASKS = [None] + [change_mask(fills[j - 1], fills[j]) for j in range(1, N)]

# ---- timeline (time-true) ----
T0, T1 = -500, 2026
TX0, TX1, TL = 60, 1020, 1780
def tx(year): return TX0 + (TX1 - TX0) * (year - T0) / (T1 - T0)
ERAS = [('GREEK', -500, -146, (77, 143, 214)), ('ROMAN', -146, 476, (155, 114, 196)),
        ('MEDIEVAL', 476, 1453, (93, 140, 60)), ('OTTOMAN', 1453, 1878, (63, 154, 120)), ('MODERN', 1878, 2026, (216, 191, 85))]
tl_base = Image.new('RGBA', (W, 140), (0, 0, 0, 0))
d = ImageDraw.Draw(tl_base)
for name, a, b, col in ERAS:
    d.rounded_rectangle([tx(a) + 1, 30, tx(b) - 1, 37], radius=3, fill=col + (220,))
    if tx(b) - tx(a) > 70:
        d.text(((tx(a) + tx(b)) / 2, 24), name, font=F('Inter-SemiBold.otf', 13), fill=col, anchor='mb')
d.line([TX0, 75, TX1, 75], fill=(70, 78, 90), width=2)
for yr, lab in [(-500, '500 BC'), (1, '1 AD'), (500, '500'), (1000, '1000'), (1500, '1500'), (1800, '1800'), (2026, 'NOW')]:
    d.line([tx(yr), 83, tx(yr), 90], fill=(110, 118, 130), width=2)
    d.text((tx(yr), 96), lab, font=F('Inter-Medium.otf', 15), fill=(160, 168, 180), anchor='mt')
TPOS = [k['tpos'] for k in KF]

def draw_timeline(im, pos_year, gap_txt=None, gap_alpha=0):
    im.paste(tl_base, (0, TL), tl_base)
    dd = ImageDraw.Draw(im, 'RGBA')
    x = tx(pos_year)
    dd.line([TX0, TL + 75, x, TL + 75], fill=GOLD, width=4)
    for t in TPOS:
        c = GOLD if t <= pos_year + 1e-6 else (130, 138, 150)
        dd.ellipse([tx(t) - 3, TL + 72, tx(t) + 3, TL + 78], fill=c)
    dd.ellipse([x - 11, TL + 64, x + 11, TL + 86], fill=GOLD, outline=BG, width=3)
    if gap_txt and gap_alpha > 0:
        f = F('Inter-SemiBold.otf', 16)
        a = int(255 * gap_alpha)
        tw = dd.textlength(gap_txt, font=f)
        bx = min(max(x - tw / 2 - 10, 8), W - tw - 28)
        dd.rounded_rectangle([bx, TL + 40, bx + tw + 20, TL + 62], radius=11, fill=GOLD[:3] + (a,))
        dd.text((bx + 10, TL + 51), gap_txt, font=f, fill=BG + (a,), anchor='lm')

def libertas(im, year):
    if year < 1358: return
    free = int(round(min(year, 1808) - 1358))
    txt = f'LIBERTAS · {free} yrs free' if year < 1808 else 'LIBERTAS · 450 yrs (1358–1808)'
    dd = ImageDraw.Draw(im)
    dd.text((1050, 1424), txt, font=F('InterDisplay-SemiBold.otf', 19), fill=GOLD, anchor='rs')

def glow(im, j, t):
    """gold outline + tint on regions that just changed hands, fading over GLOW seconds"""
    if MASKS[j] is None or t >= GLOW: return
    m, edge = MASKS[j]
    a = (1 - t / GLOW) ** 1.6
    reg = im.crop((0, MAP_Y0, W, MAP_Y1))
    tint = Image.new('RGB', reg.size, GOLD)
    reg = Image.composite(tint, reg, m.point(lambda v: int(v * 0.22 * a)))
    reg = Image.composite(tint, reg, edge.point(lambda v: min(255, int(v * 1.8 * a))))
    im.paste(reg, (0, MAP_Y0))

def pulse(im, t):
    if t > 1.8: return
    dd = ImageDraw.Draw(im, 'RGBA')
    for off in (0, 0.45):
        u = (t - off) / 1.3
        if 0 <= u <= 1:
            r = 14 + 70 * u
            dd.ellipse([RAG[0] - r, RAG[1] - r, RAG[0] + r, RAG[1] + r], outline=GOLD + (int(255 * (1 - u)),), width=4)

def zoom(im, k, t, hold):
    if 'zoom' not in k or HIGHLIGHTS: return im
    s = 1 + 0.075 * math.sin(math.pi * min(1, t / hold))
    if s < 1.001: return im
    fx, fy = lonlat_px(*k['zoom'])
    reg = im.crop((0, MAP_Y0, W, MAP_Y1))
    w2, h2 = reg.size[0] / s, reg.size[1] / s
    cx = min(max(fx, w2 / 2), reg.size[0] - w2 / 2); cy = min(max(fy - MAP_Y0, h2 / 2), reg.size[1] - h2 / 2)
    reg = reg.crop((cx - w2 / 2, cy - h2 / 2, cx + w2 / 2, cy + h2 / 2)).resize(reg.size, Image.BICUBIC)
    im = im.copy(); im.paste(reg, (0, MAP_Y0)); return im

# ---- title & end cards ----
def card_bg(src):
    base = src.crop((0, MAP_Y0, W, MAP_Y1)).filter(ImageFilter.GaussianBlur(3))
    im = Image.new('RGB', (W, H), BG)
    im.paste(Image.blend(Image.new('RGB', base.size, BG), base, 0.28), (0, 420))
    return im
def title_card():
    im = card_bg(frames[-1]); d = ImageDraw.Draw(im)
    d.text((W / 2, 330), 'THE BALKANS', font=F('InterDisplay-Bold.otf', 104), fill='white', anchor='mm')
    d.text((W / 2, 430), '2,500 years of borders', font=F('InterDisplay-SemiBold.otf', 46), fill=GOLD, anchor='mm')
    d.text((W / 2, 1520), 'and Ragusa,', font=F('InterDisplay-MediumItalic.otf', 40), fill=(225, 230, 236), anchor='mm')
    d.text((W / 2, 1575), 'the city that stayed free', font=F('InterDisplay-MediumItalic.otf', 40), fill=(225, 230, 236), anchor='mm')
    d.text((W / 2, 1680), f'{len(KF)} maps  ·  500 BC – 2026', font=F('Inter-Medium.otf', 24), fill=(150, 160, 172), anchor='mm')
    return im
def end_card():
    im = card_bg(frames[0]); d = ImageDraw.Draw(im)
    d.text((W / 2, 300), 'LIBERTAS', font=F('InterDisplay-Bold.otf', 92), fill=GOLD, anchor='mm')
    d.text((W / 2, 385), 'Ragusa · free republic 1358–1808', font=F('InterDisplay-Medium.otf', 34), fill='white', anchor='mm')
    lines = ['SOURCES', '',
             'Borders: historical-basemaps (A. Ourednik)',
             'and Natural Earth, with hand corrections',
             'for the Balkans by era.',
             'Ragusa: Wikipedia — Republic of Ragusa; Neum.', '',
             'Borders before 1900 are approximate;',
             'hand-drawn eras are close, not survey-exact.']
    y = 1380
    for i, l in enumerate(lines):
        d.text((W / 2, y), l, font=F('Inter-SemiBold.otf' if i == 0 else 'Inter-Medium.otf', 22 if i else 20),
               fill=GOLD if i == 0 else (205, 212, 220), anchor='mm'); y += 36
    return im

ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}',
                       '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
                       '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT], stdin=subprocess.PIPE)
def emit(im, n=1):
    b = im.tobytes()
    for _ in range(n): ff.stdin.write(b)
def ease(t): return t * t * (3 - 2 * t)
def gap_label(a, b):
    g = round(b - a)
    return None if g < 1 else (f'+{g} years' if g > 1 else '+1 year')

def full(j, t, hold):
    im = frames[j].copy()
    glow(im, j, t)
    if j == 0 or status_of(KF[j]) != status_of(KF[j - 1]): pulse(im, t)
    im = zoom(im, KF[j], t, hold)
    return im

tc = title_card(); first = frames[0]
emit(tc, int((2.2 if HIGHLIGHTS else 3.0) * FPS))
for k in range(1, int(0.8 * FPS) + 1):
    im = Image.blend(tc, first, ease(k / (0.8 * FPS + 1))); emit(im)
total = 0
for j in range(N):
    hold = hold_of(KF[j]) + (2.0 if j == N - 1 else 0)
    total += hold
    nf = int(hold * FPS)
    static_from = int(min(1.8, hold) * FPS)
    zoomed = 'zoom' in KF[j] and not HIGHLIGHTS
    cached = None
    for f in range(nf):
        t = f / FPS
        if f < static_from or zoomed:
            im = full(j, t, hold)
            draw_timeline(im, TPOS[j]); libertas(im, TPOS[j]); emit(im)
        else:
            if cached is None:
                cached = frames[j].copy(); draw_timeline(cached, TPOS[j]); libertas(cached, TPOS[j])
            emit(cached)
    if j < N - 1:
        nt = int(TRANS * FPS); g = gap_label(TPOS[j], TPOS[j + 1])
        a_img = zoom(frames[j], KF[j], hold, hold)
        for f in range(1, nt + 1):
            u = ease(f / (nt + 1))
            im = Image.blend(a_img, frames[j + 1], u)
            yr = TPOS[j] + (TPOS[j + 1] - TPOS[j]) * u
            draw_timeline(im, yr, g, math.sin(math.pi * f / (nt + 1)))
            libertas(im, yr)
            emit(im)
ec = end_card(); last = frames[-1]
for k in range(1, int(0.8 * FPS) + 1):
    emit(Image.blend(last, ec, ease(k / (0.8 * FPS + 1))))
emit(ec, int((3.0 if HIGHLIGHTS else 6.0) * FPS))
ff.stdin.close(); ff.wait()
print('done', ff.returncode, 'holds total', round(total, 1))
