"""
DCC Seasons — an outline of each photo crane that was NOT used to build the
drawing (the Director, 2026-10-29), for the fit score: OpenCV GrabCut,
initialised only with a plain rectangle round the bird (a box, nothing
traced), 8 iterations, then the connected region holding the bird's middle.
The thin legs are lost to GrabCut's smoothing, so the score is reported for
the bird above the ankles (the legs are checked by the overlay).

  python3.11 tools/anniv-crane-grabcut.py <refs-dir>   -> tools/data/anniv-crane-mask-<pose>.png
"""
import sys, json, os
import cv2, numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = json.load(open(os.path.join(ROOT, 'tools', 'data', 'anniv-crane-trace.json')))
refs = sys.argv[1]
for k in ('stand', 'call', 'leap'):
    R = T[k]['ref']; cx, cy, cw, ch = R['crop']
    im = cv2.imread(os.path.join(refs, R['f']))[cy:cy + ch, cx:cx + cw]
    # the box: the crop less a margin, nothing more
    m = 6
    mask = np.zeros(im.shape[:2], np.uint8)
    bg, fg = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(im, mask, (m, m, cw - 2 * m, ch - 2 * m), bg, fg, 8, cv2.GC_INIT_WITH_RECT)
    bird = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    n, lab, stats, cent = cv2.connectedComponentsWithStats(bird, 4)
    if n > 1:
        big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        bird = np.where(lab == big, 255, 0).astype(np.uint8)
    cv2.imwrite(os.path.join(ROOT, 'tools', 'data', 'anniv-crane-mask-' + k + '.png'), bird)
    print(k, int(bird.sum() / 255), 'px')
