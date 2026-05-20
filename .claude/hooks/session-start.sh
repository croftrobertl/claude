#!/usr/bin/env bash
# Runs at the start of every Claude Code session for this project.
# Ensures the PHP lint and WPCS tools are ready.
set -euo pipefail

PHPCS="/root/.config/composer/vendor/bin/phpcs"
WPCS_PATH="/root/.config/composer/vendor/wp-coding-standards/wpcs"

# ── 1. Install phpcs + WPCS if missing ──────────────────────────────────────
if [[ ! -x "$PHPCS" ]]; then
  echo "[session-start] Installing phpcs + WordPress Coding Standards..."
  composer global require --no-interaction \
    squizlabs/php_codesniffer \
    wp-coding-standards/wpcs \
    dealerdirect/phpcodesniffer-composer-installer
fi

# ── 2. Register WPCS with phpcs if not already registered ───────────────────
if ! "$PHPCS" -i 2>/dev/null | grep -q WordPress; then
  "$PHPCS" --config-set installed_paths "$WPCS_PATH"
fi

# ── 3. Install npm dev deps (ESLint + Stylelint) if missing ─────────────────
if [[ -f package.json && ! -d node_modules ]]; then
  echo "[session-start] Installing npm dev dependencies..."
  npm install --silent
fi

# ── 4. Wire git pre-commit hook ─────────────────────────────────────────────
HOOK_SRC="$(git rev-parse --show-toplevel)/scripts/pre-commit"
HOOK_DST="$(git rev-parse --show-toplevel)/.git/hooks/pre-commit"
if [[ -f "$HOOK_SRC" && ! -e "$HOOK_DST" ]]; then
  cp "$HOOK_SRC" "$HOOK_DST"
  chmod +x "$HOOK_DST"
  echo "[session-start] Git pre-commit hook installed."
fi

# ── 5. PHP syntax check across all plugin files ─────────────────────────────
echo "[session-start] PHP syntax check..."
ERRORS=0
while IFS= read -r -d '' file; do
  php -l "$file" > /dev/null 2>&1 || { echo "  SYNTAX ERROR: $file"; ERRORS=$((ERRORS + 1)); }
done < <(find mphb-availability-calendar -name '*.php' -print0)

if [[ $ERRORS -gt 0 ]]; then
  echo "[session-start] ⚠ $ERRORS PHP syntax error(s) found — fix before editing."
else
  echo "[session-start] ✓ All PHP files pass syntax check."
fi
