import sys, os, warnings, textwrap, math
warnings.filterwarnings('ignore')
sys.path.insert(0, '/home/claude/work')
import numpy as np, geopandas as gpd, pandas as pd
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patheffects as pe
from matplotlib.patches import Rectangle
from shapely.geometry import box, Polygon, Point, MultiPolygon, LineString
from shapely.ops import unary_union, polylabel
from keyframes import KEYFRAMES, P, C, FAMILIES, TRAILS, fmt_year, fmt_label

OUT = '/home/claude/work/frames'; os.makedirs(OUT, exist_ok=True)
HB = '/home/claude/data/hb/geojson'
W, H, DPI = 1080, 1920, 100
LON0, LON1, LAT0, LAT1 = 12.0, 30.2, 34.6, 48.4
VIEW = box(LON0, LAT0, LON1, LAT1)
MAP_TOP, MAP_H = 290, 1086
IX0, IX1, IY0, IY1 = 16.75, 18.62, 42.36, 43.08     # inset extent
plt.rcParams['font.family'] = 'Inter'

BG, SEA, LAND0, UNNAMED = '#12161c', '#1c3345', '#4a4d50', '#6d6b60'
TRIBAL = '#827d6c'
TRAIL_END = {0: 1453}
from matplotlib.path import Path as _MPath
from matplotlib.patches import PathPatch as _PP
def _land_path():
    verts, codes = [], []
    for p in (LAND.geoms if hasattr(LAND, 'geoms') else [LAND]):
        if p.geom_type != 'Polygon': continue
        for ring in [p.exterior] + list(p.interiors):
            xy = list(ring.coords)
            verts += xy; codes += [_MPath.MOVETO] + [_MPath.LINETO] * (len(xy) - 2) + [_MPath.CLOSEPOLY]
    return _MPath(verts, codes)
_LP = None
def LAND_PATCH(ax):
    global _LP
    if _LP is None: _LP = _land_path()
    pp = _PP(_LP, transform=ax.transData, facecolor='none', edgecolor='none'); ax.add_patch(pp); return pp
plt.rcParams['hatch.linewidth'] = 1.1
# parchment texture (used before 1500): smooth sepia blotches + fine grain
_rng = np.random.default_rng(7)
def _smooth(n, k):
    a = _rng.random((n // k + 2, n // k + 2))
    from PIL import Image as _I
    return np.asarray(_I.fromarray((a * 255).astype('uint8')).resize((n, n), _I.BICUBIC)) / 255.0
_blot = _smooth(540, 36) * 0.6 + _smooth(540, 9) * 0.4
_grain = _rng.random((540, 540))
PARCH = np.zeros((540, 540, 4))
PARCH[..., 0], PARCH[..., 1], PARCH[..., 2] = 0.78, 0.66, 0.45
PARCH[..., 3] = np.clip(0.07 + 0.16 * _blot + 0.06 * _grain, 0, 1)
GOLD = '#f2c230'

def fix(g):
    g = g.buffer(0)
    return g

# ---------- modern data ----------
ne50 = gpd.read_file('/home/claude/data/modern/ne50.geojson')
ne50['geometry'] = ne50.geometry.apply(fix)
ne50v = ne50[ne50.intersects(VIEW.buffer(1))].copy()
LAND = unary_union(list(ne50v.geometry)).intersection(VIEW)
# internal modern borders (no coastlines)
bounds = unary_union([g.boundary for g in ne50v.geometry])
coast = LAND.boundary
BORDERS = bounds.difference(unary_union(ne50v.geometry).boundary.difference(bounds).buffer(0)) if False else None
# simpler: a boundary segment is internal if it lies within land (not touching sea)
sea = VIEW.difference(unary_union(list(ne50v.geometry)))
BORDERS = bounds.difference(sea.buffer(0.03)).intersection(VIEW)
def ne(name):
    return unary_union(list(ne50[ne50.ADMIN == name].geometry))
BIH50, MNE50 = ne('Bosnia and Herzegovina'), ne('Montenegro')

ne10 = gpd.read_file('/home/claude/data/modern/ne10.geojson',
                     bbox=(15.5, 41.5, 20.0, 44.0))
ne10['geometry'] = ne10.geometry.apply(fix)
def parts(g):
    return list(g.geoms) if hasattr(g, 'geoms') else [g]
def ne10g(name):
    return unary_union(list(ne10[ne10.ADMIN == name].geometry))
HR10, BIH10, MNE10 = ne10g('Croatia'), ne10g('Bosnia and Herzegovina'), ne10g('Montenegro')
DBK = Point(18.094, 42.641)
south = min(parts(HR10), key=lambda p: p.distance(DBK))
isl = [p for p in parts(HR10) if p is not south]
def isl_in(x0, x1, y0, y1):
    return unary_union([p for p in isl if x0 <= p.representative_point().x <= x1 and y0 <= p.representative_point().y <= y1] or [Polygon()])
RG = {
  'city': south.intersection(Point(18.094, 42.641).buffer(0.045)),
  'core': south.intersection(box(17.98, 42.0, 18.205, 43.2)),
  'elaph': isl_in(17.8, 18.1, 42.6, 42.8),
  'lastovo': isl_in(16.6, 17.05, 42.65, 42.85),
  'mljet': isl_in(17.25, 17.8, 42.65, 42.85),
  'pel': south.intersection(box(16.8, 42.0, 17.72, 43.2)),
  'prim': south.intersection(box(17.72, 42.0, 17.98, 43.2)),
  'neum': BIH10.intersection(box(17.45, 42.84, 17.75, 43.0)),
  'konavle': south.intersection(box(18.205, 42.0, 18.7, 43.2)),
  'sutorina': MNE10.intersection(box(18.42, 42.42, 18.53, 42.52)),
}
def ragusa_parts(y):
    if y < 614: return []
    if y < 800: return ['city']
    k = ['core', 'elaph']
    if y >= 1252: k += ['lastovo']
    if y >= 1333: k += ['pel']
    if y >= 1345: k += ['mljet']
    if y >= 1399: k += ['prim', 'neum']
    if y >= 1426: k += ['konavle', 'sutorina']
    if y >= 1699: k = [x for x in k if x not in ('neum', 'sutorina')]
    if y >= 1808: return []
    return k
FORMER = unary_union([RG[k] for k in ['core','elaph','lastovo','pel','mljet','prim','konavle']])
def ragusa_geom(y):
    ks = ragusa_parts(y)
    return unary_union([RG[k] for k in ks]) if ks else None

RTEXT = {
 -500: ('Not yet founded', 'Nearby Epidauros (today\'s Cavtat) is an Illyrian–Greek coastal settlement in the land of the Illyrians.'),
 -323: ('Not yet founded', 'The southern Adriatic coast is Illyrian territory, outside Alexander\'s empire.'),
 -300: ('Not yet founded', 'Greek traders sail the Adriatic; the Illyrian kingdoms control this coast.'),
 -200: ('Not yet founded', 'Rome fights the Illyrian queen Teuta\'s kingdom (229 BC) and starts to control the coast.'),
 -100: ('Not yet founded', 'The coast is now part of Roman Illyricum.'),
 14:   ('Roman Epidaurum', 'Epidaurum (Cavtat) is a Roman colony — the town whose refugees will later found Ragusa.'),
 200:  ('Roman Epidaurum', 'Province of Dalmatia. Epidaurum prospers on the coastal road to Greece.'),
 300:  ('Roman Epidaurum', 'Dalmatia is Diocletian\'s home province — he retires to his palace at Split.'),
 400:  ('Roman Epidaurum', 'The East–West dividing line runs just inland of this coast.'),
 500:  ('Roman Epidaurum', 'Dalmatia passes to the Ostrogoths, then back to Byzantium (530s).'),
 650:  ('Founded c. 614', 'Fleeing Avar and Slav raids, the people of Epidaurum settle the islet of Laus: Ragusa. Byzantine protection.'),
 700:  ('Byzantine town', 'A small walled town under Byzantine protection; Slavic Dubrava grows on the mainland opposite.'),
 900:  ('Byzantine city', 'Ragusa resists an Arab siege (866–67) and becomes a self-governing Byzantine city.'),
 1000: ('Byzantine city', 'Self-governing under Byzantium, trading across the Adriatic.'),
 1100: ('Byzantine city', 'Islet and mainland town merge; the channel between them becomes the Stradun.'),
 1210: ('Under Venice', '1205: after the Fourth Crusade, Venice takes sovereignty — but Ragusa keeps its own laws, council and trade.'),
 1300: ('Under Venice', 'Lastovo joins (mid-1200s). Ragusan merchants work the Serbian and Bosnian silver mines.'),
 1355: ('Under Venice', 'Ston & Pelješac bought from Serbia (1333), Mljet added. In 1358 Venice gives up Dalmatia and Ragusa becomes a free republic.'),
 1453: ('Free Republic', 'Coast to Neum added (1399), Konavle (1419–26). From 1458 it pays tribute to the Sultan — and keeps its freedom.'),
 1526: ('Free Republic', 'A tributary of the Sultan but self-governing; Ragusan merchants hold trading privileges across the Ottoman Balkans.'),
 1600: ('Golden Age', 'A neutral merchant republic trading between the Ottomans and Christian Europe. Motto: LIBERTAS.'),
 1700: ('Republic', '1667 earthquake devastates the city. 1699: Ragusa cedes Neum and Sutorina to the Ottomans as buffers against Venice.'),
 1800: ('Republic', 'Venice is gone (1797); Ragusa still stands — but Napoleon\'s armies are near.'),
 1810: ('Abolished 1808', 'Marshal Marmont dissolves the Republic after ~450 years. It joins the Illyrian Provinces.'),
 1832: ('Austrian rule', '1815 Congress of Vienna: the Republic is not restored. Part of Austria\'s Kingdom of Dalmatia.'),
 'Mar 1878': ('Austrian rule', 'A provincial Austrian town; the Republic is a memory. The Neum strip is still Ottoman Bosnia.'),
 'Jul 1878': ('Austrian rule', 'Austria-Hungary occupies Bosnia; the Neum strip, though, stays Bosnian.'),
 1913: ('Austrian rule', 'A quiet Habsburg port on the eve of war.'),
 1920: ('Yugoslavia', '1918: Dubrovnik joins the Kingdom of Serbs, Croats & Slovenes.'),
 1938: ('Yugoslavia', 'Part of the Banovina of Croatia (1939).'),
 1942: ('Axis occupation', 'Part of the Axis puppet Independent State of Croatia, garrisoned by Italy. Partisans take the city in October 1944.'),
 1960: ('Yugoslavia', 'Tourism booms. UNESCO World Heritage listing follows in 1979.'),
 1992: ('Under siege', 'Oct 1991 – May 1992: the Yugoslav army besieges Dubrovnik; Konavle and Cavtat are occupied and the Old Town is shelled.'),
 1995: ('Croatia', 'The Old Town is on UNESCO\'s "in danger" list (1991–98) while its shell damage is repaired.'),
 2026: ('Croatia', 'The 2022 Pelješac Bridge links the Dubrovnik area to the rest of Croatia, bypassing Neum.'),
}

# ---------- polities ----------
OTTO = '#3f9a78'
def hatch_of(name):
    n = (name or '').lower()
    if '(ottoman' in n: return OTTO
    if '(italian' in n: return '#e9eedf'
    if '(german' in n or 'axis occupation' in n: return '#2a2a2a'
    if 'austro-hungarian' in n: return '#e2b14a'
    if 'serb-held' in n: return '#e07d82'
    return None

EXACT = {'macedonia': '#c9649c', 'macedonia (fyrom)': '#c9649c', 'north macedonia': '#c9649c'}
def family_color(name):
    if name.lower() in EXACT: return EXACT[name.lower()]
    n = name.lower().split(' (')[0]
    for k, c in FAMILIES:
        if k in n: return c
    return '#a39a8a'

ISLANDS = {'crete','corfu','kefalonia','zakynthos','lefkada','euboea'}
LAND_PARTS = [p for p in parts(unary_union(list(ne50v.geometry)).intersection(VIEW)) if p.geom_type == 'Polygon']
def ne_admin(name):
    g = ne50[ne50.ADMIN == name]
    assert len(g), f'no Natural Earth country {name}'
    return unary_union(list(g.geometry)).intersection(VIEW)

def poly(key):
    if key == '@BIH': return BIH50
    if key.startswith('ne:'):
        expr = key[3:]
        if '&' in expr:
            a, b = expr.split('&')
            return unary_union([ne_admin(n) for n in a.split('+')]).intersection(Polygon(P[b]))
        return unary_union([ne_admin(n) for n in expr.split('+')])
    pg = Polygon(P[key])
    if key in ISLANDS:
        return unary_union([p for p in LAND_PARTS if pg.contains(p.representative_point())])
    return pg.intersection(LAND)

def load_frame(kf):
    if kf['file'] == 'MODERN':
        g = ne50v[['ADMIN', 'geometry']].rename(columns={'ADMIN': 'NAME'}).copy()
        g['NAME'] = g.NAME.replace({'Bosnia and Herzegovina': 'Bosnia & Herzegovina',
                                    'Republic of Serbia': 'Serbia', 'Kosovo': 'Kosovo'})
    else:
        g = gpd.read_file(f"{HB}/world_{kf['file']}.geojson")[['NAME', 'geometry']]
        g = g[g.geometry.notna()].copy()
        g['geometry'] = g.geometry.apply(fix)
    g = g[g.intersects(VIEW)].copy()
    g['geometry'] = g.geometry.intersection(VIEW).intersection(LAND)
    feats = []
    for n, geom in zip(g.NAME, g.geometry):
        if geom.is_empty: continue
        n = None if (n is None or (isinstance(n, float) and math.isnan(n)) or n in ('nan', '?', 'minor states')) else n
        if n in kf.get('rename', {}): n = kf['rename'][n]
        feats.append([n, geom])
    for tname, tx, ty in kf.get('tribes', []):
        pt = Point(tx, ty); hit = False
        for f in list(feats):
            if f[0] is None and f[1].intersects(pt.buffer(0.15)):
                for part in parts(f[1]):
                    if part.intersects(pt.buffer(0.15)):
                        feats.append([tname + ' ·', part]); f[1] = f[1].difference(part); hit = True; break
            if hit: break
        if not hit: print('  tribe not placed:', kf['year'], tname)
    for name, key in kf.get('over', []):
        og = poly(key)
        if key == 'illyria':
            og = og.difference(BIH50).difference(MNE50.difference(Polygon(P['kotor'])))
        feats = [[n, gg.difference(og)] for n, gg in feats]
        feats.append([name, og])
    if kf['file'] == '1810' or kf['year'] == 1810:
        pass
    rg = ragusa_geom(kf['year'])
    if rg is not None:
        feats = [[n, gg.difference(rg.buffer(0.01))] for n, gg in feats]
    # dissolve by name
    d = {}
    for n, gg in feats:
        if gg.is_empty: continue
        d.setdefault(n, []).append(gg)
    return [(n, unary_union(v)) for n, v in d.items()], rg

def plot_geom(ax, geom, **kw):
    for p in parts(geom):
        if p.is_empty or p.geom_type != 'Polygon':
            if p.geom_type in ('MultiPolygon', 'GeometryCollection'):
                for q in parts(p):
                    if q.geom_type == 'Polygon': plot_geom(ax, q, **kw)
            continue
        kw2 = {k: v for k, v in kw.items() if k != 'hole'}
        xs, ys = p.exterior.xy
        ax.fill(xs, ys, **kw2)
        for hole in p.interiors:
            hx, hy = hole.xy
            ax.fill(hx, hy, color=kw.get('hole', SEA), lw=0)

def plot_lines(ax, geom, **kw):
    if geom is None: return
    for p in parts(geom):
        if p is None or p.is_empty: continue
        if p.geom_type in ('LineString', 'LinearRing'):
            x, y = p.xy; ax.plot(x, y, **kw)
        elif p.geom_type in ('MultiLineString', 'GeometryCollection'):
            plot_lines(ax, p, **kw)

HALO_D = [pe.withStroke(linewidth=3, foreground='#ffffffcc')]
HALO_L = [pe.withStroke(linewidth=3, foreground='#000000cc')]

def wrap(n, w=16):
    return '\n'.join(textwrap.wrap(n, w))

def label_pos(geom):
    big = max([p for p in parts(geom) if p.geom_type == 'Polygon'], key=lambda p: p.area)
    try: pt = polylabel(big, tolerance=0.05)
    except Exception: pt = big.representative_point()
    return pt, big.area

def draw_map(ax, feats, rg, kf):
    ax.add_patch(Rectangle((LON0, LAT0), LON1 - LON0, LAT1 - LAT0, color=SEA, zorder=0))
    plot_geom(ax, LAND, color=LAND0, lw=0, hole=LAND0)
    for n, g in feats:
        col = UNNAMED if n is None else (TRIBAL if n.endswith(' ·') else family_color(n))
        plot_geom(ax, g, color=col, lw=0, hole=col)
        hc = hatch_of(n)
        if hc:
            for p in parts(g):
                if p.geom_type == 'Polygon':
                    xs, ys = p.exterior.xy
                    ax.fill(xs, ys, facecolor='none', edgecolor=hc, hatch='///', lw=0, alpha=0.55, zorder=2)
    if kf['year'] < 1500:
        im = ax.imshow(PARCH, extent=[LON0, LON1, LAT0, LAT1], aspect='auto', zorder=3, interpolation='bilinear')
        im.set_clip_path(LAND_PATCH(ax))
    # polity outlines
    for n, g in feats:
        plot_lines(ax, g.boundary, color='#15191f', lw=0.6, alpha=0.9)
    # modern borders
    plot_lines(ax, BORDERS, color='white', lw=0.9, alpha=0.75, ls=(0, (3, 2)))
    # ragusa
    if rg is not None:
        plot_geom(ax, rg, color=GOLD, lw=0)
    # labels
    placed = []   # label boxes in degrees: (x0, y0, x1, y1)
    for n, g in sorted(feats, key=lambda t: -t[1].area):
        if n is None or n in kf['caps']: continue
        pt, a = label_pos(g)
        if a < 0.3: continue
        if not (LON0 + 0.4 < pt.x < LON1 - 0.4 and LAT0 + 0.3 < pt.y < LAT1 - 0.3): continue
        fs = float(np.clip(6 + 2.2 * math.sqrt(a), 9.5, 15))
        txt = wrap(n.rstrip(' ·'), 15 if fs < 11 else 18)
        lines = txt.split('\n')
        wdeg = max(len(l) for l in lines) * fs * 1.389 * 0.56 / 59.34
        hdeg = len(lines) * fs * 1.389 * 1.1 / 78.75
        ly = pt.y
        for cn in kf['caps']:
            cx, cy = C[cn]
            if abs(cx - pt.x) < 1.6 and -0.25 < (cy - ly) < 0.6: ly = cy - 0.55
            elif abs(cx - pt.x) < 1.6 and -0.6 < (cy - ly) <= -0.25: ly = cy + 0.75
        if abs(pt.x - 18.1) < 1.6 and abs(ly - 42.6) < 0.5: ly += 0.7
        def clash(yc):
            bx = (pt.x - wdeg / 2, yc - hdeg / 2, pt.x + wdeg / 2, yc + hdeg / 2)
            return bx, any(not (bx[2] < q[0] or bx[0] > q[2] or bx[3] < q[1] or bx[1] > q[3]) for q in placed)
        for yc in (ly, ly + hdeg * 0.9, ly - hdeg * 0.9):
            bx, bad = clash(yc)
            if bx[0] < LON0 + 0.1 or bx[2] > LON1 - 0.1: bad = True
            if not bad: break
        else:
            continue
        tribal = n.endswith(' ·')
        ax.text(pt.x, yc, txt, ha='center', va='center', fontsize=fs - (1 if tribal else 0),
                color='#ece6d6' if tribal else '#14161a', weight='medium' if tribal else 'semibold',
                style='italic' if tribal else 'normal', path_effects=HALO_L if tribal else HALO_D,
                zorder=6, linespacing=0.95)
        placed.append(bx)
    # capitals
    for cn in kf['caps']:
        x, y = C[cn]
        inside = LON0 < x < LON1 and LAT0 < y < LAT1
        if inside:
            ax.plot(x, y, marker='*', ms=13, mfc='white', mec='#111', mew=1.0, zorder=8)
            dx = 0.18
            ha = 'left'
            if x > LON1 - 2.2: dx, ha = -0.18, 'right'
            ax.text(x + dx, y + 0.12, cn, fontsize=10.5, color='white', weight='bold', ha=ha, va='bottom',
                    path_effects=HALO_L, zorder=9)
        else:
            cx, cy = min(max(x, LON0 + 0.25), LON1 - 0.25), min(max(y, LAT0 + 0.25), LAT1 - 0.25)
            arrow = ('→ ' if x > LON1 else '← ' if x < LON0 else '') + ('↑ ' if y > LAT1 else '↓ ' if y < LAT0 else '')
            if x > LON1: txt, ha = f'{cn} →', 'right'
            elif x < LON0: txt, ha = f'← {cn}', 'left'
            elif y > LAT1: txt, ha = f'↑ {cn}', 'center'
            else: txt, ha = f'↓ {cn}', 'center'
            ax.text(cx, cy, txt + ' (capital)', fontsize=10, color='white', weight='bold', ha=ha, va='center',
                    path_effects=HALO_L, zorder=9)
    # capital lineages: faint dotted trail through former seats of the same state
    for ci, chain in enumerate(TRAILS):
        if kf['year'] >= TRAIL_END.get(ci, 9999): continue
        act = [c for (yy, c) in chain if yy <= kf['year']]
        if len(act) < 2 or act[-1] not in kf['caps']: continue
        seq = []
        for c in act:
            if not seq or seq[-1] != c: seq.append(c)
        xs = [C[c][0] for c in seq]; ys = [C[c][1] for c in seq]
        ax.plot(xs, ys, color='white', lw=1.6, alpha=0.55, ls=(0, (1, 2.2)), zorder=7, solid_capstyle='round')
        for c in seq[:-1]:
            if c in kf['caps'] or any(abs(C[c][0] - C[k][0]) < 0.2 and abs(C[c][1] - C[k][1]) < 0.2 for k in kf['caps']): continue
            lx, ly2 = C[c][0], C[c][1] - 0.13
            if any(q[0] - 0.3 < lx < q[2] + 0.3 and q[1] - 0.2 < ly2 < q[3] + 0.1 for q in placed):
                ax.plot(*C[c], 'o', ms=6, mfc='none', mec='white', mew=1.2, alpha=0.8, zorder=7); continue
            ax.plot(*C[c], 'o', ms=6, mfc='none', mec='white', mew=1.2, alpha=0.8, zorder=7)
            ax.text(C[c][0], C[c][1] - 0.13, c, fontsize=8.5, color='#e9e9e9', style='italic', ha='center',
                    va='top', alpha=0.85, path_effects=HALO_L, zorder=7)
    # Ragusa highlight on main map
    rx, ry = 18.094, 42.641
    founded = kf['year'] >= 614
    ax.add_patch(Rectangle((IX0, IY0), IX1 - IX0, IY1 - IY0, fill=False, ec=GOLD, lw=2.0, ls='-', zorder=7))
    if founded:
        ax.plot(rx, ry, 'o', ms=10, mfc=GOLD, mec='#111', mew=1.4, zorder=10)
        ax.plot(rx, ry, 'o', ms=20, mfc='none', mec=GOLD, mew=1.5, zorder=10, alpha=0.8)
        lab = 'Ragusa' if kf['year'] < 1918 else 'Dubrovnik'
    else:
        ax.plot(18.218, 42.581, 'o', ms=8, mfc='white', mec=GOLD, mew=2, zorder=10)
        lab = 'Epidaurum' if kf['year'] > -230 else 'Epidauros'
        rx, ry = 18.218, 42.581
    ax.annotate(lab, (rx, ry), xytext=(17.4, 41.85), fontsize=12.5, color=GOLD, weight='bold',
                ha='center', va='center', path_effects=HALO_L, zorder=11,
                arrowprops=dict(arrowstyle='-', color=GOLD, lw=1.2))
    ax.set_xlim(LON0, LON1); ax.set_ylim(LAT0, LAT1); ax.axis('off')

INSET_PLACES = [('Ston', 17.698, 42.838, 'r'), ('Cavtat', 18.218, 42.581, 'b'), ('Neum', 17.616, 42.923, 'l'),
                ('Pelješac', 17.35, 42.93, 'c'), ('Mljet', 17.52, 42.745, 'c'), ('Lastovo', 16.86, 42.70, 'c'),
                ('Konavle', 18.30, 42.565, 'c'), ('Kotor', 18.77, 42.42, 'l'), ('Korčula', 16.85, 42.985, 'c'),
                ('Sutorina', 18.47, 42.50, 'l')]

def draw_inset(ax, feats, rg, kf):
    y = kf['year']
    ax.set_facecolor(SEA)
    IV = box(IX0, IY0, IX1, IY1)
    land_pieces = []
    for g in (HR10, BIH10, MNE10):
        for p in parts(g.intersection(IV)):
            if p.geom_type == 'Polygon': land_pieces.append(p)
    # color each 10m land piece by the polity under it (nearest)
    named = [(n, g) for n, g in feats]
    for p in land_pieces:
        rp = p.representative_point()
        best, bd = None, 1e9
        for n, g in named:
            d = g.distance(rp)
            if d < bd: best, bd = n, d
        col = LAND0 if bd > 0.35 else (UNNAMED if best is None else family_color(best))
        plot_geom(ax, p, color=col, lw=0, hole=col)
        plot_lines(ax, p.boundary, color='#15191f', lw=0.5, alpha=0.6)
    if rg is not None:
        plot_geom(ax, rg, color=GOLD, lw=0)
        plot_lines(ax, rg.boundary, color='#111', lw=0.8)
    elif y >= 1808:
        for p in parts(FORMER):
            if p.geom_type != 'Polygon': continue
            xs, ys = p.exterior.xy
            ax.fill(xs, ys, facecolor='none', edgecolor=GOLD, hatch='////', lw=0.8, alpha=0.75)
    if 1699 <= y < 1808:
        for k in ('neum', 'sutorina'):
            for p in parts(RG[k]):
                if p.geom_type != 'Polygon': continue
                xs, ys = p.exterior.xy
                ax.fill(xs, ys, facecolor='none', edgecolor=GOLD, hatch='xx', lw=1.2, ls='--', zorder=6)
        ax.text(17.60, 43.0, 'ceded 1699', fontsize=9, color=GOLD, weight='bold', ha='center', va='bottom',
                path_effects=HALO_L, zorder=8)
    if kf.get('ragusa') == 'siege':
        occ = unary_union([RG['konavle'], RG['core'].intersection(box(18.115, 42.0, 18.3, 43.2))])
        for p in parts(occ):
            if p.geom_type != 'Polygon': continue
            xs, ys = p.exterior.xy
            ax.fill(xs, ys, facecolor='#c0392b55', edgecolor='#ff6b5b', hatch='\\\\', lw=1.0, zorder=6)
        ax.plot(18.094, 42.641, 'o', ms=30, mfc='none', mec='#ff6b5b', mew=2.2, zorder=8)
        ax.text(18.42, 42.60, 'occupied\n1991–92', fontsize=9, color='#ffb3aa', weight='bold', ha='left',
                va='center', path_effects=HALO_L, zorder=8, linespacing=0.95)
    if y >= 2022:
        ax.plot([17.533, 17.556], [42.936, 42.905], color='#111', lw=7.5, solid_capstyle='round', zorder=6)
        ax.plot([17.533, 17.556], [42.936, 42.905], color=GOLD, lw=4.5, solid_capstyle='round', zorder=6)
        ax.text(17.45, 42.90, 'Pelješac\nBridge', fontsize=8.5, color=GOLD, ha='right', va='top',
                weight='bold', path_effects=HALO_L, linespacing=0.95)
    for nm, x, yy, side in INSET_PLACES:
        if nm == 'Sutorina' and not (1426 <= y < 1699): continue
        if nm == 'Neum' and y < 1399: continue
        off = {'r': (0.03, 0, 'left'), 'l': (-0.03, 0, 'right'), 'b': (0, -0.035, 'center'), 'c': (0, 0, 'center')}[side]
        if side != 'c': ax.plot(x, yy, 'o', ms=3.5, color='white', zorder=7)
        if not (IX0 + 0.02 < x < IX1 - 0.02): continue
        ax.text(x + off[0], yy + off[1], nm, fontsize=9, clip_on=True, color='#e8e8e8', ha=off[2], va='center' if side != 'b' else 'top',
                path_effects=HALO_L, zorder=8, style='italic' if side == 'c' else 'normal')
    if y >= 614:
        ax.plot(18.094, 42.641, marker='*', ms=17, mfc=GOLD, mec='#111', mew=1.2, zorder=9)
        ax.text(18.094, 42.675, 'RAGUSA' if y < 1918 else 'DUBROVNIK', fontsize=12, color='white', weight='bold',
                ha='center', va='bottom', path_effects=HALO_L, zorder=9)
    else:
        ax.text(18.218, 42.60, 'Epidaurum' if y > -230 else 'Epidauros', fontsize=10.5, color=GOLD,
                weight='bold', ha='center', va='bottom', path_effects=HALO_L, zorder=9)
    ax.set_xlim(IX0, IX1); ax.set_ylim(IY0, IY1)
    ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values(): s.set_color(GOLD); s.set_linewidth(1.5)

def fy(top, h):  # pixel rect -> fig coords
    return 1 - (top + h) / H, h / H

def render(i, kf):
    feats, rg = load_frame(kf)
    fig = plt.figure(figsize=(W / DPI, H / DPI), dpi=DPI, facecolor=BG)
    b, h = fy(MAP_TOP, MAP_H)
    ax = fig.add_axes([0, b, 1, h]); draw_map(ax, feats, rg, kf)
    # header
    fig.text(60 / W, 1 - 108 / H, fmt_label(kf), fontsize=64, color='white', weight='bold', family='Inter Display')
    fig.text(60 / W, 1 - 170 / H, kf['title'], fontsize=29, color=GOLD, weight='semibold', family='Inter Display')
    fig.text(60 / W, 1 - 270 / H, kf['caption'], fontsize=15.5, color='#cfd6de', linespacing=1.35, va='bottom')
    fig.text(1020 / W, 1 - 60 / H, 'THE BALKANS', fontsize=13, color='#7f8a96', ha='right', weight='bold')
    fig.text(1020 / W, 1 - 82 / H, '500 BC → TODAY', fontsize=11, color='#7f8a96', ha='right')
    # legend for map symbols
    ly = MAP_TOP + MAP_H - 30
    st = dict(fontsize=11, va='center', path_effects=[pe.withStroke(linewidth=3, foreground=BG)])
    fig.text(24 / W, 1 - ly / H, '★ capital', color='#e6e6e6', **st)
    fig.text(112 / W, 1 - ly / H, '- - today\'s borders', color='#e6e6e6', **st)
    fig.text(262 / W, 1 - ly / H, '● Ragusa', color=GOLD, weight='bold', **st)
    fig.text(350 / W, 1 - ly / H, '/// vassal or occupied', color='#e6e6e6', **st)
    fig.text(530 / W, 1 - ly / H, '· · · earlier capitals', color='#e6e6e6', **st)
    # Ragusa panel
    PT = MAP_TOP + MAP_H + 14
    status, body = RTEXT[kf.get('label') or kf['year']]
    fig.text(30 / W, 1 - (PT + 30) / H, 'RAGUSA · DUBROVNIK', fontsize=17, color=GOLD, weight='bold', family='Inter Display')
    fig.text(330 / W, 1 - (PT + 30) / H, '— ' + status, fontsize=17, color='white', weight='semibold', family='Inter Display')
    ib, ih = fy(PT + 52, 300)
    iax = fig.add_axes([30 / W, ib, 590 / W, ih]); draw_inset(iax, feats, rg, kf)
    fig.text(645 / W, 1 - (PT + 62) / H, '\n'.join(textwrap.wrap(body, 34)), fontsize=14.5, color='#dfe5ea',
             va='top', linespacing=1.4)
    if kf['year'] >= 614 and kf['year'] < 1808:
        fig.text(645 / W, 1 - (PT + 340) / H, '■ territory of Ragusa', fontsize=11.5, color=GOLD, va='top')
    elif kf['year'] >= 1808:
        fig.text(645 / W, 1 - (PT + 340) / H, '▨ former Republic of Ragusa', fontsize=11.5, color=GOLD, va='top')
    fig.savefig(f'{OUT}/kf_{i:02d}.png', dpi=DPI, facecolor=BG)
    plt.close(fig)
    f2 = plt.figure(figsize=(5.4, 5.43), dpi=100)
    a2 = f2.add_axes([0, 0, 1, 1])
    a2.add_patch(Rectangle((LON0, LAT0), LON1 - LON0, LAT1 - LAT0, color=SEA, zorder=0))
    for n, g in feats:
        col = UNNAMED if n is None else (TRIBAL if n.endswith(' ·') else family_color(n))
        plot_geom(a2, g, color=col, lw=0, hole=col, antialiased=False)
    if rg is not None: plot_geom(a2, rg, color=GOLD, lw=0, antialiased=False)
    a2.set_xlim(LON0, LON1); a2.set_ylim(LAT0, LAT1); a2.axis('off')
    f2.savefig(f'{OUT}/fill_{i:02d}.png', dpi=100); plt.close(f2)

if __name__ == '__main__':
    sel = [int(a) for a in sys.argv[1:]] or range(len(KEYFRAMES))
    for i in sel:
        render(i, KEYFRAMES[i]); print('rendered', i, KEYFRAMES[i]['year'], flush=True)
