#!/usr/bin/env python3
"""
Mutation run for v0.27.7 — the three fixes from the /explore/ parity audit.

Breaks ONE guarantee at a time and runs the suites against the broken copy.
Every mutant must make at least one of them FAIL.

    python3 tests/explore-fixes.mutations.py
"""
import os, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN = os.path.join(ROOT, 'dcc-guest-guide')
SUITES = [['php', os.path.join(ROOT, 'tests', 'search-index.test.php')],
          ['php', os.path.join(ROOT, 'tests', 'item-text.test.php')],
          ['node', os.path.join(ROOT, 'tests', 'explore-fixes.ui.js')],
          ['php', os.path.join(ROOT, 'tests', 'public-mode.test.php')]]
C, P, W = 'assets/css/widget.css', 'includes/class-plugin.php', 'includes/class-widget.php'

MUTANTS = [
    # ---- G1: the public intro -------------------------------------------
    ('the intro loses its balanced wrap', C,
     "       the tile below, where there very much is. */\n    text-wrap: balance;",
     "       the tile below, where there very much is. */"),
    ('the intro is balanced but no longer centred', C,
     '.dccgg-public-intro {\n    margin: 0 0 18px;\n    text-align: center;',
     '.dccgg-public-intro {\n    margin: 0 0 18px;\n    text-align: left;'),

    # ---- S1: the tile card on the grid -----------------------------------
    ('the whole S1 rule is gone, so the kit strips the border again', C,
     '.dccgg-root.dccgg-root:not(.dccgg-app-shell) .dccgg-tile.dccgg-tile {\n'
     '    border: 1px solid var(--dccgg-tile-border);\n'
     '    border-radius: 16px;\n}',
     '.dccgg-root.dccgg-root:not(.dccgg-app-shell) .dccgg-tile.dccgg-tile {\n'
     '    color: inherit;\n}'),
    ('the border comes back but the radius does not', C,
     '    border: 1px solid var(--dccgg-tile-border);\n    border-radius: 16px;\n}\n'
     '.dccgg-root.dccgg-root:not(.dccgg-app-shell) .dccgg-tile.dccgg-tile:hover,',
     '    border: 1px solid var(--dccgg-tile-border);\n}\n'
     '.dccgg-root.dccgg-root:not(.dccgg-app-shell) .dccgg-tile.dccgg-tile:hover,'),
    ('the rule drops to one class, so the kit outranks it again', C,
     '.dccgg-root.dccgg-root:not(.dccgg-app-shell) .dccgg-tile.dccgg-tile {\n'
     '    border: 1px solid var(--dccgg-tile-border);',
     '.dccgg-tile {\n'
     '    border: 1px solid var(--dccgg-tile-border);'),
    ('the app-shell exclusion is removed, so the shell is repainted too', C,
     '.dccgg-root.dccgg-root:not(.dccgg-app-shell) .dccgg-tile.dccgg-tile {\n'
     '    border: 1px solid var(--dccgg-tile-border);\n'
     '    border-radius: 16px;\n}',
     '.dccgg-root.dccgg-root .dccgg-tile.dccgg-tile.dccgg-tile.dccgg-tile.dccgg-tile {\n'
     '    border: 1px solid var(--dccgg-tile-border);\n'
     '    border-radius: 16px;\n}'),
    ('the stateless rule outranks the hover one, killing the hover', C,
     '.dccgg-root.dccgg-root:not(.dccgg-app-shell) .dccgg-tile.dccgg-tile:hover,\n'
     '.dccgg-root.dccgg-root:not(.dccgg-app-shell) .dccgg-tile.dccgg-tile:focus-visible {',
     '.dccgg-root .dccgg-tile:hover,\n'
     '.dccgg-root .dccgg-tile:focus-visible {'),
    ('the rule shouts, so a host-set control loses', C,
     '    border: 1px solid var(--dccgg-tile-border);\n    border-radius: 16px;\n}\n'
     '.dccgg-root.dccgg-root:not(.dccgg-app-shell) .dccgg-tile.dccgg-tile:hover,',
     '    border: 1px solid var(--dccgg-tile-border) !important;\n    border-radius: 16px !important;\n}\n'
     '.dccgg-root.dccgg-root:not(.dccgg-app-shell) .dccgg-tile.dccgg-tile:hover,'),

    # ---- S2: the search-index endpoint -----------------------------------
    ('the public-mode filter is removed from the search endpoint', P,
     '        if (Widget::is_public_mode($settings)) {\n'
     '            Widget::apply_public_mode($settings);\n'
     '        }\n'
     '        $hash = substr(sha1((string) wp_json_encode($settings)), 0, 12);',
     '        $hash = substr(sha1((string) wp_json_encode($settings)), 0, 12);'),
    ('the filter runs but the mode test is inverted', P,
     '        if (Widget::is_public_mode($settings)) {\n'
     '            Widget::apply_public_mode($settings);\n'
     '        }\n'
     '        $hash = substr(sha1((string) wp_json_encode($settings)), 0, 12);',
     '        if (!Widget::is_public_mode($settings)) {\n'
     '            Widget::apply_public_mode($settings);\n'
     '        }\n'
     '        $hash = substr(sha1((string) wp_json_encode($settings)), 0, 12);'),
    ('the key drops the mode AND the filter runs after the cache', P,
     '        if (Widget::is_public_mode($settings)) {\n'
     '            Widget::apply_public_mode($settings);\n'
     '        }\n'
     '        $hash = substr(sha1((string) wp_json_encode($settings)), 0, 12);\n'
     "        $key  = 'dccgg_searchidx_' . $post_id . '_' . $hash;\n"
     '        $cached = get_transient($key);\n'
     '        if (is_array($cached)) {\n'
     "            wp_send_json_success(['index' => $cached]);\n"
     '        }\n'
     '        $index = Widget::build_search_index($settings);',
     "        $keyed = $settings; unset($keyed['guide_mode']);\n"
     '        $hash = substr(sha1((string) wp_json_encode($keyed)), 0, 12);\n'
     "        $key  = 'dccgg_searchidx_' . $post_id . '_' . $hash;\n"
     '        $cached = get_transient($key);\n'
     '        if (is_array($cached)) {\n'
     "            wp_send_json_success(['index' => $cached]);\n"
     '        }\n'
     '        if (Widget::is_public_mode($settings)) {\n'
     '            Widget::apply_public_mode($settings);\n'
     '        }\n'
     '        $index = Widget::build_search_index($settings);'),
    ('the visibility guard is dropped now that the filter is there', P,
     '        $post = get_post($post_id);\n'
     '        if (!$post) {\n'
     "            wp_send_json_error(['message' => 'Not found.'], 404);\n"
     '        }\n'
     "        if ($post->post_status !== 'publish' && !current_user_can('read_post', $post_id)) {\n"
     "            wp_send_json_error(['message' => 'Not found.'], 404);\n"
     '        }\n'
     '        if (post_password_required($post)) {\n'
     "            wp_send_json_error(['message' => 'Not found.'], 404);\n"
     '        }\n'
     '        $settings = $this->find_widget_settings($post_id, $widget_id);\n'
     "        if (empty($settings)) {\n"
     "            wp_send_json_success(['index' => []]);\n"
     '        }',
     '        $post = get_post($post_id);\n'
     '        if (!$post) {\n'
     "            wp_send_json_error(['message' => 'Not found.'], 404);\n"
     '        }\n'
     '        $settings = $this->find_widget_settings($post_id, $widget_id);\n'
     "        if (empty($settings)) {\n"
     "            wp_send_json_success(['index' => []]);\n"
     '        }'),
    # the shared choke point both endpoints depend on
    ('apply_public_mode keeps guest sections', W,
     "            if ($audience !== 'public' && $audience !== 'both') { continue; }",
     "            if ($audience === 'nope') { continue; }"),

    # ---- the add-on: the even column -------------------------------------
    ('the even column reaches NON-checkable items too', C,
     '.dccgg-stage.dccgg-stage .dccgg-item--checkable .dccgg-item-body,\n'
     '.dccgg-report-dialog.dccgg-report-dialog .dccgg-item--checkable .dccgg-item-body {',
     '.dccgg-stage.dccgg-stage .dccgg-item-body,\n'
     '.dccgg-report-dialog.dccgg-report-dialog .dccgg-item-body {'),
    ('the column is gone, so the text runs past the controls again', C,
     '    max-width: calc(100% - 48px);\n    margin-inline: auto;\n}',
     '    max-width: 100%;\n}'),
    ('the insets are UNEVEN — inset one side only', C,
     '    max-width: calc(100% - 48px);\n    margin-inline: auto;\n}',
     '    max-width: calc(100% - 48px);\n    margin-inline: 0 auto;\n}'),
    ('the inset is the wrong size, so it no longer matches the checkbox', C,
     '    max-width: calc(100% - 48px);\n    margin-inline: auto;\n}',
     '    max-width: calc(100% - 20px);\n    margin-inline: auto;\n}'),

    # ---- the add-on: the line-length cap ---------------------------------
    ('the cap is missing, so a desktop line runs the full column', C,
     '    max-width: var(--dccgg-measure, 520px);\n    margin-inline: auto;\n}',
     '    margin-inline: auto;\n}'),
    ('the cap is there but the text is not centred under it', C,
     '    max-width: var(--dccgg-measure, 520px);\n    margin-inline: auto;\n}',
     '    max-width: var(--dccgg-measure, 520px);\n}'),
    ('the cap is applied to the BODY, so it reaches a table and an embed', C,
     '.dccgg-stage.dccgg-stage .dccgg-item-body > p,\n'
     '.dccgg-stage.dccgg-stage .dccgg-item-body > ul,\n'
     '.dccgg-stage.dccgg-stage .dccgg-item-body > ol,\n'
     '.dccgg-report-dialog.dccgg-report-dialog .dccgg-item-body > p,\n'
     '.dccgg-report-dialog.dccgg-report-dialog .dccgg-item-body > ul,\n'
     '.dccgg-report-dialog.dccgg-report-dialog .dccgg-item-body > ol {',
     '.dccgg-stage.dccgg-stage .dccgg-item-body,\n'
     '.dccgg-stage.dccgg-stage .dccgg-item-body *,\n'
     '.dccgg-report-dialog.dccgg-report-dialog .dccgg-item-body {'),

    # ---- the add-on: the empty-paragraph guard ---------------------------
    ('the empty-paragraph guard is removed', W,
     '            $body_html = self::drop_empty_paragraphs(\n'
     '                wpautop(self::auto_link_html(wp_kses_post($content))));',
     '            $body_html = wpautop(self::auto_link_html(wp_kses_post($content)));'),
    ('the guard keeps a paragraph holding only &nbsp;', W,
     "            '~<p(?:\\s[^>]*)?>(?:\\s|&nbsp;|&#160;|&#xa0;|\\x{00A0}|<br\\s*/?>)*</p>~iu',",
     "            '~<p(?:\\s[^>]*)?>(?:\\s|<br\\s*/?>)*</p>~iu',"),
    ('the guard eats a paragraph that HAS text', W,
     "            '~<p(?:\\s[^>]*)?>(?:\\s|&nbsp;|&#160;|&#xa0;|\\x{00A0}|<br\\s*/?>)*</p>~iu',",
     "            '~<p(?:\\s[^>]*)?>.*?</p>~iu',"),
    ('the guard rewrites the stored content as well as the render', W,
     '    public static function drop_empty_paragraphs(string $html): string\n'
     '    {\n'
     "        if ($html === '' || stripos($html, '<p') === false) { return $html; }",
     '    public static function drop_empty_paragraphs(string $html): string\n'
     '    {\n'
     "        if ($html === '' || stripos($html, '<p') === false) { return ''; }"),
]

# Recorded rather than run, with the measurement that explains each.
EQUIVALENT = [
    ('the public-mode filter moved to AFTER the cache lookup',
     'measured: all 22 search-index assertions stay green. guide_mode is itself part of '
     'the settings being hashed, so a public and a guest widget can never collide on a '
     'transient key, and the two orderings are behaviourally identical today. The safe '
     'order is kept because it is insurance, not because it is doing visible work — and '
     'the COMPOUND mutant (key drops the mode AND the filter runs late) IS in the live '
     'list above and dies on three assertions in both directions. Listing this as a kill '
     'would be dressing up a tie.'),
]
UNREACHABLE = []


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
    tmp = tempfile.mkdtemp(prefix='dccgg-277-')
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
            print(f"  ✓ killed  {name}\n             by {n}: {(fl[0] if fl else 'non-zero exit')[:100]}")
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
