#!/usr/bin/env bash
# setup-hooks.sh — Install cortextOS git hooks into the local repo
#
# Run once after cloning:
#   bash scripts/setup-hooks.sh
#
# Installs:
#   - pre-commit: blocks commits that introduce *.env files or content
#     matching well-known secret patterns (Telegram BOT_TOKEN, sk-ant-*,
#     AIza*, ghp_*, AKIA*, etc.). See SECURITY.md for the full list.
#   - pre-push: runs npm run build && npm test before any push. If either
#     fails, the push is aborted and you fix it locally rather than on CI.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "Error: must be run from inside a git repository." >&2
  exit 1
}

HOOKS_DIR="$REPO_ROOT/.git/hooks"

install_hook() {
  local name="$1"
  local src="$REPO_ROOT/scripts/hooks/$name"
  local dest="$HOOKS_DIR/$name"

  if [[ ! -f "$src" ]]; then
    echo "Warning: hook source not found: $src (skipping)" >&2
    return
  fi

  cp "$src" "$dest"
  chmod +x "$dest"
  echo "  Installed: .git/hooks/$name"
}

echo "Installing cortextOS git hooks..."
install_hook pre-commit
install_hook pre-push
echo "Done. Hooks active for this repo clone."
