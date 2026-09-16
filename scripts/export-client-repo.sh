#!/usr/bin/env bash
# Refreshes the Litera copy of the app: code only, no internal documents.
# Everything it copies is a tracked file, so nothing local or ignored can leak
# in by accident.
#
# It updates an existing client repository in place. It does NOT wipe the
# destination first: that repository has its own git history, its own
# client-facing guides, and its own README, none of which exist here.
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
^scripts/export-client-repo\.sh$
^reports/
'

# Files the client repository owns. They exist only there, or were rewritten
# for an audience that has never seen this project, and copying our versions
# over them would undo that work. The README is the clearest case: ours opens
# by pointing at 00-OVERVIEW.md, which is one of the files we deliberately
# strip out.
PRESERVE='
^README\.md$
^\.env\.example$
^DATA-HANDLING-POLICY\.md$
^WALKTHROUGH\.md$
'

join() { echo "$1" | grep -v '^$' | paste -sd'|' -; }
SKIP=$(join "$EXCLUDE")
KEEP=$(join "$PRESERVE")

if [ ! -d "$DEST" ]; then
  echo "Creating $DEST"
  mkdir -p "$DEST"
fi

cd "$SRC"
COPIED=0
CHANGED=()
while IFS= read -r f; do
  echo "$f" | grep -Eq "$SKIP" && continue
  echo "$f" | grep -Eq "$KEEP" && continue
  mkdir -p "$DEST/$(dirname "$f")"
  if ! cmp -s "$f" "$DEST/$f" 2>/dev/null; then CHANGED+=("$f"); fi
  cp "$f" "$DEST/$f"
  COPIED=$((COPIED+1))
done < <(git ls-files)

echo "$COPIED file(s) checked, ${#CHANGED[@]} changed:"
for f in "${CHANGED[@]:-}"; do [ -n "$f" ] && echo "  $f"; done

cat <<EOF

Left alone (the client repo's own):
$(echo "$PRESERVE" | grep -v '^$' | sed 's/[\^$\\]//g; s/^/  /')
  GETTING-STARTED.md, SETUP.md, docs/ - not in this repo at all

This only refreshes the working copy. To publish:
  cd $DEST && git add -A && git commit && git push

If GETTING-STARTED.md changed there, regenerate the Word copy:
  node scripts/md2docx.cjs $DEST/GETTING-STARTED.md \\
    $DEST/docs/Compete-Agent-Getting-Started.docx
EOF
