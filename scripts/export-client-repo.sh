#!/usr/bin/env bash
# Builds a clean copy of the app for Litera: code only, no history, no internal
# documents. Everything it copies is a tracked file, so nothing local or
# ignored can leak in by accident.
set -euo pipefail

# Run from the repository root:  npm run export:client  [destination]
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$(dirname "$SRC")/compete-agent-litera}"

# Internal working material. Specs, planning, commercial documents, Litera's own
# source documents (the app reads those from the database, not the repo), and the
# one-off debugging scripts written while chasing a specific bug.
EXCLUDE='
^Context documents/
^client-docs/
^[0-9]{2}-.*\.md$
^CURRENT-BUILD-STATE\.md$
^MEETING-SPEAKING-NOTES\.
^PHASE-ONE-STATUS-REPORT\.md$
^PRD-Compete-Agent-MVP\.
^Compete-Agent-UX-Audit\.pdf$
^scripts/(brandt|crayon|halden|meridian|wexley)-retest\.ts$
^scripts/(harvey-demo|prompt-demo|fresh-signal-test|pin-backend|cleanup-orphan)\.ts$
^scripts/demo-video\.ts$
^reports/
'
PATTERN=$(echo "$EXCLUDE" | grep -v '^$' | paste -sd'|' -)

rm -rf "$DEST"
mkdir -p "$DEST"

cd "$SRC"
KEPT=0
while IFS= read -r f; do
  if echo "$f" | grep -Eq "$PATTERN"; then continue; fi
  mkdir -p "$DEST/$(dirname "$f")"
  cp "$f" "$DEST/$f"
  KEPT=$((KEPT+1))
done < <(git ls-files)

echo "copied $KEPT files to $DEST"
echo
echo "This only refreshes the working copy. To publish, commit and push there:"
echo "  cd $DEST && git add -A && git commit && git push"
echo
echo "If GETTING-STARTED.md changed, regenerate the Word copy too:"
echo "  node scripts/md2docx.cjs $DEST/GETTING-STARTED.md \\"
echo "    $DEST/docs/Compete-Agent-Getting-Started.docx"
echo
echo "excluded:"
git ls-files | grep -E "$PATTERN" | sed 's/^/  /'
