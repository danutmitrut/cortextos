#!/usr/bin/env bash
# scan-secrets.sh — scan the git index (and HEAD) for known secret patterns
#
# Defense-in-depth complement to scripts/hooks/pre-commit. The pre-commit hook
# blocks NEW secrets; this scanner catches anything that slipped through OR
# was committed before the hook was installed.
#
# What it scans:
#   1. All git-tracked files for content matching known secret patterns
#   2. The list of tracked files for sensitive filenames (*.env not in /examples)
#
# What it does NOT scan:
#   - git history (only HEAD). For history scan: `git log -p | grep -E "<pattern>"`
#     or use a dedicated tool like trufflehog for deep history audits.
#
# Exit codes:
#   0 — no secrets found
#   1 — at least one suspected secret committed

set -euo pipefail

FRAMEWORK_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$FRAMEWORK_ROOT"

SECRET_PATTERNS=(
  '[0-9]{8,10}:[A-Za-z0-9_-]{35}'        # Telegram BOT_TOKEN
  'sk-ant-[A-Za-z0-9_-]{20,}'            # Anthropic
  'sk-proj-[A-Za-z0-9_-]{20,}'           # OpenAI project
  'sk-[A-Za-z0-9]{48,}'                  # OpenAI legacy
  'AIza[0-9A-Za-z_-]{35}'                # Google
  'ghp_[A-Za-z0-9]{36}'                  # GitHub PAT
  'github_pat_[A-Za-z0-9_]{82}'          # GitHub fine-grained PAT
  'AKIA[0-9A-Z]{16}'                     # AWS access key
)

FAIL=0

# 1. Sensitive filenames committed
COMMITTED_ENVS=$(git ls-files | grep -E "(^|/)\.env$|(^|/)secrets\.env$" | grep -v "\.env\.example$" | grep -v "\.env\.local\.example$" || true)
if [[ -n "$COMMITTED_ENVS" ]]; then
  echo "FAIL — committed secret-named files:"
  echo "$COMMITTED_ENVS" | sed 's/^/  - /'
  FAIL=1
fi

# 2. Content scan across tracked files (skip binary, skip examples)
TRACKED=$(git ls-files | grep -v -E "\.env\.example$|\.env\.local\.example$|node_modules/|^dist/|package-lock\.json$|^scripts/hooks/pre-commit$|^scripts/security/" || true)

# Common placeholder substrings that indicate a documentation example, not a real secret.
# A match is suppressed if the matched value contains any of these.
PLACEHOLDER_GIVEAWAYS='xxxx|XXXX|0000|1111|YOUR_|EXAMPLE|<.*>'

if [[ -n "$TRACKED" ]]; then
  for pat in "${SECRET_PATTERNS[@]}"; do
    # For each tracked file, look for lines that match the secret pattern
    # but do NOT contain a placeholder giveaway in the matched substring.
    REAL_HITS=""
    while IFS= read -r f; do
      [[ -z "$f" || ! -f "$f" ]] && continue
      # Extract just the matched substrings, then filter placeholders
      MATCHES=$(grep -oE "$pat" "$f" 2>/dev/null | grep -vE "$PLACEHOLDER_GIVEAWAYS" || true)
      if [[ -n "$MATCHES" ]]; then
        REAL_HITS="${REAL_HITS}${f}"$'\n'
      fi
    done <<< "$TRACKED"
    REAL_HITS=$(echo "$REAL_HITS" | sed '/^$/d')
    if [[ -n "$REAL_HITS" ]]; then
      echo "FAIL — pattern $pat found in:"
      echo "$REAL_HITS" | sed 's/^/  - /'
      FAIL=1
    fi
  done
fi

if [[ "$FAIL" == "0" ]]; then
  echo "OK — no committed secrets detected (pattern + filename scan)"
  exit 0
fi

echo ""
echo "If a secret leaked: rotate it IMMEDIATELY at the provider, then remove from git history (git filter-repo / BFG) or accept that it's burned."
exit 1
