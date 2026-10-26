"""Export every keyframe as compact SVG-path data for the interactive History tab."""
import sys, json, warnings
warnings.filterwarnings('ignore')
sys.path.insert(0, '/home/claude/work')
import render as R
from keyframes import KEYFRAMES, C, TRAILS, fmt_label
from shapely.geometry import box
from shapely.ops import unary_union

def X(lon): return round((lon - R.LON0) * 100, 1)
def Y(lat): return round((R.LAT1 - lat) * 132.7, 1)
def path(g, tol):
    out = []
    g = g.simplify(tol, preserve_topology=True)
    for p in R.parts(g):
        if p.geom_type == 'MultiPolygon' or p.geom_type == 'GeometryCollection':
            out.append(path(p, 0)); continue
        if p.geom_type != 'Polygon' or p.is_empty or p.area < 0.0004: continue
        for ring in [p.exterior] + list(p.interiors):
            pts = list(ring.coords)
            out.append('M' + ' '.join(f'{X(x)},{Y(y)}' for x, y in pts[:-1]) + 'Z')
    return ''.join(out)

# inset projection (Dubrovnik coast), separate scale
IX0, IX1, IY0, IY1 = R.IX0, R.IX1, R.IY0, R.IY1
def ix(lon): return round((lon - IX0) * 1000, 1)
def iy(lat): return round((IY1 - lat) * 1360, 1)
def ipath(g, tol=0.0015):
    out = []
    for p in R.parts(g.simplify(tol, preserve_topology=True)):
        if p.geom_type != 'Polygon' or p.is_empty: continue
        for ring in [p.exterior] + list(p.interiors):
            out.append('M' + ' '.join(f'{ix(x)},{iy(y)}' for x, y in list(ring.coords)[:-1]) + 'Z')
    return ''.join(out)

IV = box(IX0, IY0, IX1, IY1)
pieces = []
for g in (R.HR10, R.BIH10, R.MNE10):
    for p in R.parts(g.intersection(IV)):
        if p.geom_type == 'Polygon': pieces.append(p)

data = {
  'view': {'w': X(R.LON1), 'h': Y(R.LAT0)},
  'inset': {'w': ix(IX1), 'h': iy(IY0), 'box': [X(IX0), Y(IY1), X(IX1) - X(IX0), Y(IY0) - Y(IY1)],
            'land': [ipath(p) for p in pieces],
            'parts': {k: ipath(v) for k, v in R.RG.items()},
            'former': ipath(R.FORMER),
            'places': [[n, ix(x), iy(y), s] for n, x, y, s in [{'Neum': ('Neum', 17.616, 42.923, 'r'), 'Konavle': ('Konavle', 18.34, 42.49, 'c')}.get(q[0], q) for q in R.INSET_PLACES] if IX0 < x < IX1],
            'ragusa': [ix(18.094), iy(42.641)], 'cavtat': [ix(18.218), iy(42.581)],
            'bridge': [[ix(17.533), iy(42.936)], [ix(17.556), iy(42.905)]]},
  'land': path(R.LAND, 0.02),
  'borders': '',
  'ragusaPt': [X(18.094), Y(42.641)],
  'frames': [],
}
# modern internal borders as polylines
segs = []
for ln in R.parts(R.BORDERS):
    if ln.geom_type in ('LineString', 'LinearRing'):
        ln = ln.simplify(0.02)
        segs.append('M' + ' '.join(f'{X(x)},{Y(y)}' for x, y in ln.coords))
    elif hasattr(ln, 'geoms'):
        for q in ln.geoms:
            q = q.simplify(0.02); segs.append('M' + ' '.join(f'{X(x)},{Y(y)}' for x, y in q.coords))
data['borders'] = ''.join(segs)

prev = {}
for k in KEYFRAMES:
    feats, rg = R.load_frame(k)
    status, body = R.RTEXT[k.get('label') or k['year']]
    cur = {}
    fl = []
    for n, g in feats:
        if g.is_empty: continue
        name = None if n is None else n.rstrip(' ·')
        tribal = bool(n and n.endswith(' ·'))
        col = R.UNNAMED if n is None else (R.TRIBAL if tribal else R.family_color(n))
        changed = False
        if name and not tribal:
            pg = prev.get(name)
            changed = pg is None or (pg.symmetric_difference(g).area / max(g.area, 1e-6) > 0.12)
            cur[name] = g
        lp, a = R.label_pos(g)
        fl.append({'n': name, 'c': col, 'h': R.hatch_of(n), 't': tribal, 'chg': changed,
                   'a': round(a, 2), 'l': [X(lp.x), Y(lp.y)], 'd': path(g, 0.02)})
    prev = cur
    y = k['year']
    # inset piece colours (nearest polity), as in the video
    icol = []
    for p in pieces:
        rp = p.representative_point(); best, bd = None, 1e9
        for n, g in feats:
            dd = g.distance(rp)
            if dd < bd: best, bd = n, dd
        icol.append(R.LAND0 if bd > 0.35 else (R.UNNAMED if best is None else
                    (R.TRIBAL if best.endswith(' ·') else R.family_color(best))))
    trails = []
    for ci, chain in enumerate(TRAILS):
        if y >= R.TRAIL_END.get(ci, 9999): continue
        act = [c for (yy, c) in chain if yy <= y]
        if len(act) < 2 or act[-1] not in k['caps']: continue
        seq = []
        for c in act:
            if not seq or seq[-1] != c: seq.append(c)
        trails.append([[c, X(C[c][0]), Y(C[c][1])] for c in seq])
    data['frames'].append({
        'label': fmt_label(k), 'year': y, 'tpos': k['tpos'], 'title': k['title'],
        'caption': k['caption'].replace('\n', ' '),
        'feats': fl,
        'caps': [[c, X(C[c][0]), Y(C[c][1])] for c in k['caps']],
        'trails': trails,
        'ragusa': {'status': status, 'body': body, 'parts': R.ragusa_parts(y), 'siege': k.get('ragusa') == 'siege',
                   'ceded': 1699 <= y < 1808, 'former': y >= 1808, 'bridge': y >= 2022, 'founded': y >= 614,
                   'icol': icol},
    })
    print(fmt_label(k), len(fl), flush=True)

out = '/home/claude/work/history/history-data.json'
json.dump(data, open(out, 'w'), separators=(',', ':'), ensure_ascii=False)
import os; print('bytes', os.path.getsize(out))
