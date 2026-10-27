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
# Konavle's villages (OSM settlement boundaries), for the 1941 Italy–NDH line. The Rome Agreements
# split Konavle along the Popovići–Lovorno line, on the cadastral boundary between Popovići (Italy)
# and Komaji (NDH); in 1942 Italy also took Kuna and Pridvorje (Konavle museums, blog.migk.hr).
# Villages are put on a side by where they lie relative to that line; Lovorno changed hands.
KONAVLE = {
    'Brotnice': 15909713, 'Cavtat': 15909658, 'Čilipi': 15909698, 'Drvenik': 15909763, 'Duba Konavoska': 15909764,
    'Dunave': 15909805, 'Gabrili': 15909714, 'Gruda': 15909816, 'Jasenice': 15909666, 'Komaji': 15909796,
    'Kuna Konavoska': 15909797, 'Lovorno': 15909801, 'Ljuta': 15909813, 'Mihanići': 15909762, 'Mikulići': 15909835,
    'Močići': 15909693, 'Molunat': 15909849, 'Palje Brdo': 15909836, 'Pločice': 15909873, 'Poljice': 15909822,
    'Popovići': 15909802, 'Pridvorje': 15909803, 'Radovčići': 15909812, 'Stravča': 15909724, 'Šilješki': 15909712,
    'Uskoplje': 15909675, 'Vitaljina': 15909852, 'Vodovađa': 15909872, 'Zastolje': 15909871, 'Zvekovica': 15909691,
}
REL.update({'k:' + k: v for k, v in KONAVLE.items()})
# Grad Dubrovnik's own villages (OSM settlement boundaries), for the land held round the city in
# 1991–92. Named as occupied in the sources: Bosanka (fell 9 November 1991), Mokošica, Rožat,
# Komolac, Šumet and Čajkovići (late November, after Osojnik fell), Osojnik, Zaton, Orašac and
# Trsteno; the rest lie between those villages and the border (Pobrežje and Čajkovica border only
# occupied villages). Sustjepan, on the defenders' line, held.
DBK_VILLAGES = {
    'Bosanka': 15907328, 'Mokošica': 15906773, 'Rožat': 15906749, 'Komolac': 15906774, 'Šumet': 15926767, 'Čajkovići': 15907312,
    'Osojnik': 15906714, 'Zaton': 15906691, 'Orašac': 15906630, 'Trsteno': 15906631, 'Brsečine': 15906620, 'Ljubač': 15906715,
    'Gromača': 15906632, 'Kliševo': 15906633, 'Mravinjac': 15906622, 'Mrčevo': 15906619, 'Prijevor': 15906750, 'Petrovo Selo': 15906728,
    'Knežica': 15907329, 'Dubravica': 15906621, 'Lozica': 15906718, 'Pobrežje': 15906716, 'Čajkovica': 15907330,
}
REL.update({'d:' + k: v for k, v in DBK_VILLAGES.items()})
ITALY_1941 = ['Popovići', 'Radovčići', 'Gruda', 'Ljuta', 'Poljice', 'Dunave', 'Zastolje', 'Mikulići', 'Palje Brdo',
              'Pločice', 'Vodovađa', 'Molunat', 'Vitaljina', 'Lovorno']
ITALY_1942 = ['Kuna Konavoska', 'Pridvorje']
STRADUN_WAY = 987089809
# The walls of Ston, tower to tower. OpenStreetMap maps the towers (man_made=tower) but not the
# wall itself in a form Nominatim serves, so the line joins the towers in order along the
# documented route: round the town, up to Pozvizd on the hill, then along the isthmus to Mali
# Ston. Positions are the towers' OSM centroids (found with Nominatim reverse lookups).
STON_TOWERS = {  # name: (osm way/node, lat, lng)
    'Veliki Kaštio': ('w180367431', 42.8369293, 17.6967566), 'Kula Nad vodom': ('w250734826', 42.839309, 17.6969414),
    'Minčeta': ('n2571160782', 42.8396384, 17.6939916), 'Sokolić': ('n2571160783', 42.8395804, 17.6937096),
    'Arcimun': ('n2571160781', 42.8385192, 17.6934791), 'Stoviš': ('w250734827', 42.8402902, 17.6955856),
    'Pozvizd': ('w208087226', 42.8427218, 17.6958284), 'Kula Dobri': ('w250734213', 42.8436669, 17.6997446),
    'Kula Dolina': ('w250734290', 42.8448068, 17.7018059), 'Koruna': ('w250734212', 42.8453501, 17.7034374),
    'Toljevac': ('w235921263', 42.8469313, 17.7048744),
}
# Dubrovnik's own walls, the same way: the towers and gates OpenStreetMap names on the land side,
# then the sea walls, which stand on the shore, from today's coastline.
DBK_WALL = [  # clockwise from Minčeta; (name, osm, lat, lng)
    ('Minčeta', 'w172454061', 42.6429736, 18.1084349), ('Buža gate', 'w668417760', 42.6421059, 18.1102286),
    ('Ploče gate', 'w290356997', 42.6420229, 18.1127296), ('Ponte gate', 'w1297393781', 42.6401916, 18.1109555),
    ('St. John', 'n3040735714', 42.6398468, 18.112383),   # the Maritime Museum inside the fort
    # … the sea walls along the shore …
    ('Bokar', 'w172456340', 42.640938, 18.1061244), ('Puncjela', 'w1452945182', 42.6412819, 18.1065384),
    ('Pile gate', 'w668283215', 42.6417295, 18.1068385), ('Gornji ugao', 'w1466480190', 42.6425951, 18.1079521),
]
STON_LINES = [
    ['Veliki Kaštio', 'Kula Nad vodom', 'Minčeta', 'Sokolić', 'Arcimun', 'Veliki Kaštio'],   # round the town
    ['Kula Nad vodom', 'Stoviš', 'Pozvizd', 'Kula Dobri', 'Kula Dolina', 'Koruna', 'Toljevac'],   # up the hill and on to Mali Ston
]
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

def dp_keep(r, eps, keep):
    """Douglas–Peucker that never drops a point in `keep` (borders shared with a neighbour stay
    exact on both sides, so separately simplified neighbours still meet without hairline gaps)."""
    idx = [i for i, q in enumerate(r) if (round(q[0], 7), round(q[1], 7)) in keep]
    if not idx: return dp(r, eps)
    out, pts = [], r + r[:idx[0] + 1]
    marks = idx + [idx[0] + len(r)]
    for a, b in zip(marks, marks[1:]):
        out += dp(pts[a:b + 1], eps)[:-1]
    return out

def out_polys(ps, eps=0.00009, min_area=1.5e-6, keep=None):
    res = []
    for p in ps:
        if area(p[0]) < min_area: continue   # islets under ~1 ha
        rings = []
        for r in p:
            r0 = r[:-1] if r[0] == r[-1] else r
            s = dp_keep(r0, eps, keep) if keep else dp(r0, eps)
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

def sutorina_land(d):
    """The 1699 Sutorina corridor's land: its historic outline (which runs out to sea) cut to Herceg
    Novi's coastline. Uses shapely when it's installed; otherwise a straight cut at 42.445 °N."""
    try:
        from shapely.geometry import shape, mapping
    except ImportError:
        return clip_polys(polys(d, 'sutorina'), (1, 42.445, False))
    hist = shape(geo(d, 'R%d' % REL['sutorina']))
    land = shape(geo(d, 'R%d' % REL['hercegnovi']))
    g = mapping(hist.intersection(land).buffer(0))
    ps = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    return [[[list(q) for q in r] for r in p] for p in ps]

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
        'sutorina': sutorina_land(d),
    }
    out = {'src': 'Outlines © OpenStreetMap contributors (ODbL): municipal boundaries, cut at the coast map’s own part lines.',
           'parts': {}, 'lab': {}}
    for k, ps in parts.items():
        out['parts'][k] = out_polys(ps, 0.00002, 0) if k == 'city' else out_polys(ps)
        out['lab'][k] = label_pt(ps)
    bih = [polys(d, n) for n in ('neum', 'ravno', 'trebinje')]
    key = lambda q: (round(q[0], 7), round(q[1], 7))
    seen, shared_pts = {}, set()
    for i, ps in enumerate(bih):
        for q in {key(q) for p in ps for r in p for q in r}:
            if q in seen and seen[q] != i: shared_pts.add(q)
            seen[q] = i
    out['bih'] = out_polys(sum(bih, []), 0.00015, keep=shared_pts)
    rag = ['konavle', 'zupa', 'dubrovnik', 'primorje', 'ston']
    out['lines'] = {
        'frontier': shared(d, rag, ['ravno', 'trebinje']),
        'neum': shared(d, rag, ['neum']) + shared(d, ['neum'], ['slivno']),
        'sutorina': shared(d, ['konavle'], ['hercegnovi']),
    }
    # the shore between St. John and Bokar, the short way round (the Old Town's south side)
    ring = max((p[0] for p in polys(d, 'dubrovnik')), key=area)[:-1]
    near = lambda la, lo: min(range(len(ring)), key=lambda i: math.hypot((ring[i][0] - lo) * COS, ring[i][1] - la))
    a, b = near(42.6398468, 18.112383), near(42.640938, 18.1061244)
    fwd = ring[a:b + 1] if a <= b else ring[a:] + ring[:b + 1]
    back = (ring[b:a + 1] if b <= a else ring[b:] + ring[:a + 1])[::-1]
    shore = dp(min(fwd, back, key=len), 0.00002)
    pts = [[round(q[2], 6), round(q[3], 6)] for q in DBK_WALL]
    out['dbkWalls'] = {
        'line': pts[:5] + [[round(q[1], 6), round(q[0], 6)] for q in shore[1:-1]] + pts[5:] + [pts[0]],
        'pts': [[q[0], round(q[2], 6), round(q[3], 6)] for q in DBK_WALL],
    }
    k = lambda l: ['k:' + n for n in l]
    ndh41 = [n for n in KONAVLE if n not in ITALY_1941]
    ndh42 = [n for n in ndh41 if n not in ITALY_1942]
    out['konavle41'] = {
        'italy41': out_polys(sum((polys(d, 'k:' + n) for n in ITALY_1941 if n != 'Lovorno'), []), 0.00006),
        'lovorno': out_polys(polys(d, 'k:Lovorno'), 0.00006),
        'italy42': out_polys(sum((polys(d, 'k:' + n) for n in ITALY_1942), []), 0.00006),
        'line41': shared(d, k(ITALY_1941), k(ndh41)),
        'line42': shared(d, k(ITALY_1941 + ITALY_1942), k(ndh42)),
        'lab41': label_pt(sum((polys(d, 'k:' + n) for n in ITALY_1941), [])),
    }
    out['ston'] = {
        'towers': [[n, round(v[1], 6), round(v[2], 6)] for n, v in STON_TOWERS.items()],
        'lines': [[[round(STON_TOWERS[n][1], 6), round(STON_TOWERS[n][2], 6)] for n in l] for l in STON_LINES],
    }
    # 1991–92: by the end of November 1991 the Yugoslav army held almost all the land between
    # Pelješac and Prevlaka except Dubrovnik itself. Drawn by municipality and village, so approximate.
    # Four areas, each with its own dates in the app: Konavle, Župa, the Dubrovnik Littoral, and
    # Rijeka dubrovačka with the villages up the coast to Brsečine and on the Srđ plateau.
    out['siege'] = {'areas': {
        'konavle': out_polys(polys(d, 'konavle'), 0.00012),
        'zupa': out_polys(polys(d, 'zupa'), 0.00012),
        'prim': out_polys(polys(d, 'primorje'), 0.00012),
        'rijeka': out_polys(sum((polys(d, 'd:' + n) for n in DBK_VILLAGES), []), 0.00006),
    }}
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
