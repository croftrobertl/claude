#!/usr/bin/env bash
# Runs at the start of every Claude Code session for this project.
set -euo pipefail

PHPCS="/root/.config/composer/vendor/bin/phpcs"

# ── 1. Install PHP code-quality tools if missing ────────────────────────────
if [[ ! -x "$PHPCS" ]]; then
  echo "[session-start] Installing PHP code-quality tools..."
  COMPOSER_ALLOW_SUPERUSER=1 composer global config \
    allow-plugins.dealerdirect/phpcodesniffer-composer-installer true --no-interaction
  COMPOSER_ALLOW_SUPERUSER=1 composer global require --no-interaction \
    squizlabs/php_codesniffer \
    wp-coding-standards/wpcs \
    dealerdirect/phpcodesniffer-composer-installer \
    phpcsstandards/phpcsutils \
    phpcsstandards/phpcsextra \
    phpcompatibility/php-compatibility
fi

# ── 2. Install WP-CLI if missing ─────────────────────────────────────────────
if ! command -v wp &>/dev/null; then
  echo "[session-start] Installing WP-CLI..."
  curl -sL https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar \
    -o /usr/local/bin/wp
  chmod +x /usr/local/bin/wp
fi

# ── 3. Install npm dev deps (ESLint + Stylelint) if missing ─────────────────
if [[ -f package.json && ! -d node_modules ]]; then
  echo "[session-start] Installing npm dev dependencies..."
  npm install --silent
fi

# ── 4. Wire git pre-commit hook ─────────────────────────────────────────────
HOOK_SRC="$(git rev-parse --show-toplevel)/scripts/pre-commit"
HOOK_DST="$(git rev-parse --show-toplevel)/.git/hooks/pre-commit"
if [[ -f "$HOOK_SRC" ]]; then
  cp "$HOOK_SRC" "$HOOK_DST"
  chmod +x "$HOOK_DST"
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
