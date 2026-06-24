#!/bin/bash
# Auto git add + commit + push for Olivia-agent project
REPO="/tmp/olivia-v14/Olivia-agent-main"
FILE=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)

# Only act on files that belong to this project
if [ -z "$FILE" ] || [[ "$FILE" != "$REPO"* ]]; then
  exit 0
fi

# File must actually exist
[ -f "$FILE" ] || exit 0

FNAME=$(basename "$FILE")
cd "$REPO" || exit 0

git add "$FILE" 2>/dev/null

# Commit only if there are staged changes
if ! git diff --cached --quiet 2>/dev/null; then
  git commit -m "Update $FNAME" 2>/dev/null
  git push origin HEAD 2>/dev/null
fi
