#!/usr/bin/env python3
"""Build history/street.json: street-accurate outlines for the Map tab's "Then" overlay.

Land outlines are today's municipal boundaries from OpenStreetMap (they follow the
coastline), cut into the Republic of Ragusa's parts at the same lines the History
tab's coast map uses (history-data.json → inset.parts):
  core|prim at 17.98 °E, prim|pel at 17.72 °E, Neum's Ragusan strip west of 17.75 °E.
Border lines are the boundary stretches two municipalities share, i.e. today's
Croatia–Bosnia and Croatia–Montenegro borders, which follow Ragusa's old frontier
and the two 1699 corridors.

  python3 tools/build-street.py --fetch DIR   # download the boundaries via Nominatim (1 req/s)
  python3 tools/build-street.py DIR           # write history/street.json

Data © OpenStreetMap contributors, ODbL.
"""
import json, math, os, sys, time, urllib.request

REL = {  # OSM relation ids
    'dubrovnik': 8796464, 'zupa': 8796465, 'konavle': 8796466, 'primorje': 8796467, 'ston': 8796468,
    'janjina': 8796470, 'trpanj': 8796471, 'orebic': 15897363, 'mljet': 10206061, 'lastovo': 10521402,
    'neum': 2528236, 'ravno': 2528257, 'trebinje': 2528277, 'slivno': 8796590, 'hercegnovi': 2187901,
    'sutorina': 4098902,  # boundary=historic: the 1699 Sutorina corridor
}
STRADUN_WAY = 987089809
UA = 'croatia-family-archive/1.0 (history map build)'

def fetch(d):
    os.makedirs(d, exist_ok=True)
    ids = ['R%d' % v for v in REL.values()] + ['W%d' % STRADUN_WAY]
    for i in ids:
        url = 'https://nominatim.openstreetmap.org/lookup?format=json&polygon_geojson=1&osm_ids=' + i
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60) as r:
            open(os.path.join(d, i + '.json'), 'wb').write(r.read())
        time.sleep(1.2)

def geo(d, i):
    return json.load(open(os.path.join(d, i + '.json')))[0]['geojson']

def polys(d, name):
    g = geo(d, 'R%d' % REL[name])
    return g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]

COS = math.cos(math.radians(42.7))

def dp(pts, eps):
    """Douglas–Peucker on [lon, lat] points; eps in degrees of latitude."""
    if len(pts) < 3: return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = (x2 - x1) * COS, y2 - y1
    L = dx * dx + dy * dy
    best, bi = -1, 0
    for i in range(1, len(pts) - 1):
        px, py = (pts[i][0] - x1) * COS, pts[i][1] - y1
        t = 0 if L == 0 else max(0, min(1, (px * dx + py * dy) / L))
        dd = math.hypot(px - t * dx, py - t * dy)
        if dd > best: best, bi = dd, i
    if best > eps: return dp(pts[:bi + 1], eps)[:-1] + dp(pts[bi:], eps)
    return [pts[0], pts[-1]]

def clip(ring, axis, c, keep_less):
    """Sutherland–Hodgman against one half-plane (axis 0 = lon, 1 = lat)."""
    inside = (lambda p: p[axis] < c) if keep_less else (lambda p: p[axis] >= c)
    out = []
    for i in range(len(ring)):
        a, b = ring[i - 1], ring[i]
        if inside(b):
            if not inside(a): out.append(cut(a, b, axis, c))
            out.append(b)
        elif inside(a): out.append(cut(a, b, axis, c))
    return out

def cut(a, b, axis, c):
    t = (c - a[axis]) / (b[axis] - a[axis])
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]

def clip_polys(ps, *rules):
    out = []
    for p in ps:
        rings = []
        for r in p:
            for rule in rules: r = clip(r, *rule)
            if len(r) >= 3: rings.append(r)
        if rings and len(p[0]) and rings[0]: out.append(rings)
    return out

def pip(x, y, r):
    c = False
    for i in range(len(r)):
        (x1, y1), (x2, y2) = r[i - 1], r[i]
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1): c = not c
    return c

def area(r):
    return abs(sum(r[i - 1][0] * r[i][1] - r[i][0] * r[i - 1][1] for i in range(len(r)))) / 2

def label_pt(ps):
    """A point well inside the largest polygon (coarse pole of inaccessibility)."""
    r = max((p[0] for p in ps), key=area)
    xs, ys = [p[0] for p in r], [p[1] for p in r]
    best, bp = -1, None
    for i in range(1, 30):
        for j in range(1, 30):
            x = min(xs) + (max(xs) - min(xs)) * i / 30
            y = min(ys) + (max(ys) - min(ys)) * j / 30
            if not pip(x, y, r): continue
            dd = min(math.hypot((x - a[0]) * COS, y - a[1]) for a in r[::max(1, len(r) // 400)])
            if dd > best: best, bp = dd, (x, y)
    return [round(bp[1], 4), round(bp[0], 4)]

def out_polys(ps, eps=0.00009, min_area=1.5e-6):
    res = []
    for p in ps:
        if area(p[0]) < min_area: continue   # islets under ~1 ha
        rings = []
        for r in p:
            s = dp(r[:-1] if r[0] == r[-1] else r, eps)
            if len(s) >= 4: rings.append([[round(q[1], 5), round(q[0], 5)] for q in s])
        if rings: res.append(rings)
    return res

def shared(d, a_names, b_names, eps=0.00004):
    key = lambda q: (round(q[0], 7), round(q[1], 7))
    s = set(key(q) for n in b_names for p in polys(d, n) for r in p for q in r)
    lines = []
    for n in a_names:
        for p in polys(d, n):
            for r in p:
                m = len(r) - 1
                flags = [key(r[i]) in s for i in range(m)]
                if all(flags): lines.append(r); continue
                if not any(flags): continue
                st, cur = flags.index(False), []
                for k in range(1, m + 1):
                    i = (st + k) % m
                    if flags[i]: cur.append(r[i])
                    else:
                        if len(cur) > 1: lines.append(cur)
                        cur = []
                if len(cur) > 1: lines.append(cur)
    return [[[round(q[1], 5), round(q[0], 5)] for q in dp(l, eps)] for l in lines]

def build(d):
    gd = polys(d, 'dubrovnik')
    big = max(gd, key=lambda p: area(p[0]))
    lokrum = [p for p in gd if pip(18.1213, 42.625, p[0])]
    isles = [p for p in gd if p is not big and not any(p is q for q in lokrum)]
    parts = {
        # by tradition the first town stood on the islet of Laus: the Old Town south of the Stradun
        'city': clip_polys([big], (0, 18.106, False), (0, 18.1125, True), (1, 42.6413, True), (1, 42.6380, False)),
        'core': clip_polys([big], (0, 17.98, False)) + polys(d, 'zupa') + lokrum,
        'elaph': isles,
        'prim': clip_polys([big], (0, 17.98, True)) + polys(d, 'primorje') + clip_polys(polys(d, 'ston'), (0, 17.72, False)),
        'pel': clip_polys(polys(d, 'ston'), (0, 17.72, True)) + polys(d, 'orebic') + polys(d, 'trpanj') + polys(d, 'janjina'),
        'mljet': polys(d, 'mljet'), 'lastovo': polys(d, 'lastovo'), 'konavle': polys(d, 'konavle'),
        'neum': clip_polys(polys(d, 'neum'), (0, 17.75, True)),
        'sutorina': clip_polys(polys(d, 'sutorina'), (1, 42.445, False)),
    }
    out = {'src': 'Outlines © OpenStreetMap contributors (ODbL): municipal boundaries, cut at the coast map’s own part lines.',
           'parts': {}, 'lab': {}}
    for k, ps in parts.items():
        out['parts'][k] = out_polys(ps, 0.00002, 0) if k == 'city' else out_polys(ps)
        out['lab'][k] = label_pt(ps)
    out['bih'] = out_polys(polys(d, 'neum') + polys(d, 'ravno') + polys(d, 'trebinje'), 0.00015)
    rag = ['konavle', 'zupa', 'dubrovnik', 'primorje', 'ston']
    out['lines'] = {
        'frontier': shared(d, rag, ['ravno', 'trebinje']),
        'neum': shared(d, rag, ['neum']) + shared(d, ['neum'], ['slivno']),
        'sutorina': shared(d, ['konavle'], ['hercegnovi']),
    }
    g = geo(d, 'W%d' % STRADUN_WAY)
    out['stradun'] = [[round(q[1], 6), round(q[0], 6)] for q in dp(g['coordinates'], 0.000005)]
    return out

if __name__ == '__main__':
    if sys.argv[1] == '--fetch': fetch(sys.argv[2]); sys.exit()
    here = os.path.dirname(os.path.abspath(__file__))
    J = build(sys.argv[1])
    p = os.path.join(here, '..', 'history', 'street.json')
    json.dump(J, open(p, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(p, os.path.getsize(p), 'bytes;', {k: sum(len(r) for poly in v for r in poly) for k, v in J['parts'].items()})
