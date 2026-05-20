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

# ── 3. PHP syntax check across all plugin files ─────────────────────────────
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
