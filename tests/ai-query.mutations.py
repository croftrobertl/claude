#!/usr/bin/env python3
"""
Mutation run for the v0.23.5 AI-search fix.

Copies the plugin, breaks ONE protection at a time, and runs
tests/ai-query.test.php against the broken copy. Every mutant must make the
suite FAIL; a mutant that passes means a protection the tests do not guard.

    python3 tests/ai-query.mutations.py
"""
import os, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN = os.path.join(ROOT, 'dcc-guest-guide')
TEST = os.path.join(ROOT, 'tests', 'ai-query.test.php')
P, W = 'includes/class-plugin.php', 'includes/class-widget.php'

MUTANTS = [
    ('forward the browser context again (the original hole)', P,
     "$context = get_transient($ctx_key);",
     "$context = isset($_POST['context']) ? (string) $_POST['context'] : get_transient($ctx_key);"),
    ('prefer the browser context when one is sent', P,
     "if (!is_string($context)) {",
     "if (isset($_POST['context'])) { $context = (string) $_POST['context']; } elseif (!is_string($context)) {"),
    ('drop the password-protected check', P,
     "|| post_password_required($post)) {\n            wp_send_json_error(['message' => __('AI search is not available here.'",
     ") {\n            wp_send_json_error(['message' => __('AI search is not available here.'"),
    ('drop the publish / read-permission check', P,
     "|| ($post->post_status !== 'publish' && !current_user_can('read_post', $post_id))\n            || post_password_required($post)) {\n            wp_send_json_error(['message' => __('AI search",
     "|| post_password_required($post)) {\n            wp_send_json_error(['message' => __('AI search"),
    ('drop the AI-switch check', P,
     "($settings['enable_ai_search'] ?? '') !== 'yes'", "false"),
    ('skip public mode in the endpoint', P,
     "if ($settings && Widget::is_public_mode($settings)) {", "if (false) {"),
    ('ignore the widget id: use the first guide on the page', P,
     "$settings = $this->find_widget_settings($post_id, $widget_id);\n        if ($settings && Widget::is_public_mode",
     "$settings = (array) ($this->find_widget_element($post_id)['settings'] ?? []);\n        if ($settings && Widget::is_public_mode"),
    ('cache the context without keying it on the settings', P,
     "$ctx_key = 'dccgg_aictx_' . $post_id . '_' . substr(sha1((string) wp_json_encode($settings)), 0, 12);",
     "$ctx_key = 'dccgg_aictx_' . $post_id;"),
    ('drop the per-IP limit', P, "if ($rl_count >= 5) {", "if (false) {"),
    ('drop the daily cap', P,
     "if ($daily_cap > 0 && $daily_count >= $daily_cap) {\n            wp_send_json_error(['message' => __('AI search has hit",
     "if (false) {\n            wp_send_json_error(['message' => __('AI search has hit"),
    ('skip public mode in the builder', W,
     "        if (self::is_public_mode($settings)) {\n            self::apply_public_mode($settings);",
     "        if (false) {\n            self::apply_public_mode($settings);"),
    ('put the masked value into the context', W,
     "$parts[] = '### ' . trim(",
     "$parts[] = (string) ($item['item_copy_value'] ?? '');\n                $parts[] = '### ' . trim("),
    ('remove the length cap', W,
     'mb_substr(implode("\\n\\n", $parts), 0, self::AI_CONTEXT_MAX)', 'implode("\\n\\n", $parts)'),
    ('include items whose section no longer exists', W,
     "        $parts = [];\n        foreach ((array) ($settings['guide_sections'] ?? []) as $sec) {",
     "        $parts = [];\n        foreach ((array) ($settings['guide_items'] ?? []) as $it) { if (is_array($it)) { $parts[] = (string) ($it['item_content'] ?? ''); } }\n        foreach ((array) ($settings['guide_sections'] ?? []) as $sec) {"),
]

def run(plugin_dir):
    env = dict(os.environ, DCCGG_PLUGIN_DIR=plugin_dir)
    return subprocess.run(['php', TEST], env=env, capture_output=True, text=True)

base = run(PLUGIN)
if base.returncode != 0:
    print('The unmutated plugin fails the suite; fix that first.\n' + base.stdout[-2000:]); sys.exit(2)

survivors = 0
print(f"{len(MUTANTS)} mutants against tests/ai-query.test.php\n")
for name, rel, old, new in MUTANTS:
    tmp = tempfile.mkdtemp(prefix='dccgg-mut-')
    try:
        dst = os.path.join(tmp, 'dcc-guest-guide')
        shutil.copytree(PLUGIN, dst)
        f = os.path.join(dst, rel)
        src = open(f).read()
        if src.count(old) != 1:
            print(f"  ?  {name}: target text found {src.count(old)} times — mutation not applied"); survivors += 1; continue
        open(f, 'w').write(src.replace(old, new))
        lint = subprocess.run(['php', '-l', f], capture_output=True, text=True)
        if lint.returncode != 0:
            print(f"  ?  {name}: mutant does not parse"); survivors += 1; continue
        r = run(dst)
        failed = [l.strip()[2:] for l in r.stdout.splitlines() if l.strip().startswith('✗')]
        fatal = 'Fatal' in r.stdout + r.stderr
        if r.returncode != 0:
            why = failed[0] if failed else ('fatal error' if fatal else 'non-zero exit')
            print(f"  ✓ killed  {name}\n             by: {why}" + (f"  (+{len(failed)-1} more)" if len(failed) > 1 else ''))
        else:
            survivors += 1
            print(f"  ✗ SURVIVED  {name}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
print(f"\n{len(MUTANTS) - survivors} killed, {survivors} survived")
sys.exit(1 if survivors else 0)
