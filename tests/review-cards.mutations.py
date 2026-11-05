#!/usr/bin/env python3
"""
Mutation run for v0.27.9 — the Review Us cards.

Breaks ONE guarantee at a time and runs the suites against the broken copy.
Every mutant must make at least one of them FAIL.

    python3 tests/review-cards.mutations.py
"""
import os, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN = os.path.join(ROOT, 'dcc-guest-guide')
SUITES = [['node', os.path.join(ROOT, 'tests', 'review-cards.ui.js')],
          ['php', os.path.join(ROOT, 'tests', 'public-mode.test.php')]]
C, J, W = 'assets/css/widget.css', 'assets/js/widget.js', 'includes/class-widget.php'

MUTANTS = [
    # ---- the eight the Director named --------------------------------
    ('900 weight is back on the card text', C,
     '    font-size: 16px;\n    font-weight: 700;\n    line-height: 1.25;\n}',
     '    font-size: 16px;\n    font-weight: 900;\n    line-height: 1.25;\n}'),
    ('green is back — the tick turns green again', C,
     "    /* Site blue, never green: the Tripadvisor circle is the only green the\n"
     "       section may carry, because it is the colour the footer already\n"
     "       shows. */\n    color: var(--dccgg-primary, #006BCF);",
     '    color: #1a7f4b;'),
    ('a card is allowed under 56px', C,
     '    min-height: 56px;\n    padding: 9px 14px;',
     '    min-height: 40px;\n    padding: 2px 14px;'),
    ('a link loses target=_blank', W,
     '''                    <a class="dccgg-rev-card" href="<?php echo esc_url($url); ?>"
                       target="_blank" rel="noopener"''',
     '''                    <a class="dccgg-rev-card" href="<?php echo esc_url($url); ?>"
                       rel="noopener"'''),
    ('the logo is loaded from the network instead of inlined', W,
     '''                            <?php $gl = self::REVIEW_GLYPHS[$key] ?? null; if ($gl) : ?>
                                <svg viewBox="<?php echo esc_attr($gl['vb']); ?>" focusable="false" aria-hidden="true"><path d="<?php echo esc_attr($gl['d']); ?>"/></svg>
                            <?php endif; ?>''',
     '''                            <img src="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/svgs/brands/<?php echo esc_attr($key); ?>.svg" alt="" width="18" height="18">'''),
    ('the desktop cap is removed', C,
     '.dccgg-rev {\n'
     '    /* DESKTOP CAP. The sheet is 732px wide at 1440 and three cards stretched\n'
     '       across it read as a toolbar rather than a short list. 420px, centred;\n'
     '       the cards fill it on a phone because the column is narrower than the\n'
     '       cap long before this matters. */\n'
     '    max-width: 420px;\n    margin-inline: auto;\n}',
     '.dccgg-rev {\n    margin-inline: auto;\n}'),
    ('hover is no longer limited to hover devices', C,
     '@media (hover: hover) and (pointer: fine) {\n'
     '    .dccgg-root.dccgg-root .dccgg-rev-card.dccgg-rev-card:hover,',
     '@media all {\n'
     '    .dccgg-root.dccgg-root .dccgg-rev-card.dccgg-rev-card:hover,'),
    ('the tick throws when storage is blocked', J,
     '''    function reviewStore(read, value) {
        try {
            if (read) { return JSON.parse(localStorage.getItem(REVIEW_KEY) || '{}'); }
            localStorage.setItem(REVIEW_KEY, JSON.stringify(value));
        } catch (_) { return read ? {} : undefined; }
        return undefined;
    }''',
     '''    function reviewStore(read, value) {
        if (read) { return JSON.parse(localStorage.getItem(REVIEW_KEY) || '{}'); }
        localStorage.setItem(REVIEW_KEY, JSON.stringify(value));
        return undefined;
    }'''),

    # ---- the rest of the contract ------------------------------------
    ('the item renders its own title, so there are two headings', W,
     '            <article class="dccgg-item dccgg-item--review" data-item-title="<?php echo esc_attr($title); ?>">',
     '            <article class="dccgg-item dccgg-item--review" data-item-title="<?php echo esc_attr($title); ?>">\n'
     '                <h3 class="dccgg-item-title"><span class="dccgg-item-title-text"><?php echo esc_html($title); ?></span></h3>'),
    ('a card loses rel=noopener', W,
     'target="_blank" rel="noopener"\n                       data-dccgg-review=',
     'target="_blank"\n                       data-dccgg-review='),
    ('the external link points at the wrong place', W,
     "            'url'   => 'https://www.yelp.com/writeareview/biz/QB_o9zAgu-JcKiTvXCx4VA',",
     "            'url'   => 'https://www.yelp.com/',"),
    ('the accessible name loses "opens in a new tab"', W,
     "                    $label = sprintf(__('%s, opens in a new tab', 'dcc-guest-guide'), $name);",
     "                    $label = $name;"),
    ('the sub-line is read out, so the name doubles', W,
     '<span class="dccgg-rev-sub" aria-hidden="true">',
     '<span class="dccgg-rev-sub">'),
    ('the tick does not change the accessible name', J,
     "        const thanks = card.getAttribute('data-dccgg-review-thanks');\n"
     "        if (thanks) { card.setAttribute('aria-label', thanks); }",
     '        /* name left as it was */'),
    ('the circles lose the footer colours', W,
     "            'ink'   => '#589442',",
     "            'ink'   => '#777777',"),
    ('the mark is square again', C,
     '    border-radius: 50%;\n    color: #fff;\n    background: var(--dccgg-rev-ink, #666);',
     '    border-radius: 9px;\n    color: #fff;\n    background: var(--dccgg-rev-ink, #666);'),
    ('the icon no longer grows on hover', C,
     '        transform: scale(1.12);',
     '        transform: none;'),
    ('the cards are not centred in a column', C,
     '    max-width: 420px;\n    margin-inline: auto;\n}',
     '    max-width: 420px;\n}'),
    ('the arrow goes back to the wrong blue', C,
     '    color: var(--dccgg-primary, #006BCF);\n}\n.dccgg-rev-arrow svg',
     '    color: #0A57C2;\n}\n.dccgg-rev-arrow svg'),
    ('the intro line is dropped', W,
     '            <p class="dccgg-rev-intro"><?php echo esc_html($intro); ?></p>',
     ''),
    ('the review section stops being guest-only', W,
     "            if ($audience !== 'public' && $audience !== 'both') { continue; }",
     "            if ($audience === 'nope') { continue; }"),
]

EQUIVALENT = []
UNREACHABLE = [
    ('the tap does not open in the browser from a home-screen web app',
     'not reachable in this container and not pretended otherwise: whether iOS hands a '
     'target=_blank link to Safari in standalone mode is decided by WebKit, which cannot be '
     'installed here. What the plugin controls IS checked, by scratch/webapp-tap.js against a '
     'page reporting navigator.standalone and display-mode: standalone — target=_blank and '
     'rel=noopener are present, nothing calls preventDefault() on the click, the click produces '
     'a separate page, the guide stays on its own URL with the section still open, and the tick '
     'is shown. The handset behaviour itself remains untested.'),
]


def run(cmd, plugin_dir):
    env = dict(os.environ, DCCGG_PLUGIN_DIR=plugin_dir, DCCGG_UI_SOURCE='1',
               NODE_PATH=os.path.join(ROOT, 'node_modules'))
    return subprocess.run(cmd, env=env, capture_output=True, text=True, cwd=ROOT)


def suites(plugin_dir, stop_early=True):
    out = []
    for cmd in SUITES:
        r = run(cmd, plugin_dir)
        failed = [l.strip()[2:] for l in r.stdout.splitlines() if l.strip().startswith('✗')]
        out.append((os.path.basename(cmd[1]), r.returncode, failed))
        if stop_early and r.returncode != 0:
            break
    return out


base = suites(PLUGIN, stop_early=False)
if any(rc != 0 for _, rc, _ in base):
    print('The unmutated plugin fails its own suites; fix that first.')
    for n, rc, f in base:
        print(' ', n, rc, f[:3])
    sys.exit(2)

survivors = 0
for name, rel, old, new in MUTANTS:
    tmp = tempfile.mkdtemp(prefix='dccgg-279-')
    try:
        dst = os.path.join(tmp, 'dcc-guest-guide')
        shutil.copytree(PLUGIN, dst)
        f = os.path.join(dst, rel)
        src = open(f).read()
        if src.count(old) != 1:
            print(f"  ?  {name}: target text found {src.count(old)} times — not applied")
            survivors += 1
            continue
        open(f, 'w').write(src.replace(old, new))
        if rel.endswith('.php'):
            lint = subprocess.run(['php', '-l', f], capture_output=True, text=True)
            if lint.returncode != 0:
                print(f"  ?  {name}: mutant does not parse")
                survivors += 1
                continue
        res = suites(dst)
        killers = [(n, fl) for n, rc, fl in res if rc != 0]
        if killers:
            n, fl = killers[0]
            print(f"  ✓ killed  {name}\n             by {n}: {(fl[0] if fl else 'non-zero exit')[:92]}")
        else:
            survivors += 1
            print(f"  ✗ SURVIVED  {name}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

print(f"\n{len(MUTANTS) - survivors} killed, {survivors} survived")
if UNREACHABLE:
    print(f"\n{len(UNREACHABLE)} mutant(s) NOT run — unreachable here, not passing by default:")
    for name, why in UNREACHABLE:
        print(f"  · {name}\n      {why}")
if EQUIVALENT:
    print(f"\n{len(EQUIVALENT)} mutant(s) NOT run — equivalent, not passing by default:")
    for name, why in EQUIVALENT:
        print(f"  · {name}\n      {why}")
sys.exit(1 if survivors else 0)
