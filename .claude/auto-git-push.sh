#!/bin/bash
# Auto git add + commit + push for Olivia-agent project
REPO="/Users/jakembpm2/UGnasync/Cloade/Olivia-agent-main"
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
  # .claude/.no-deploy 파일이 있으면 로컬 커밋만 쌓고 push(=Vercel 배포)는 건너뛴다 —
  # 작업 중간중간 배포되는 걸 막아달라는 요청 때문에 임시로 켠 스위치, 끝나면 지운다.
  if [ ! -f "$REPO/.claude/.no-deploy" ]; then
    git push origin HEAD:main 2>/dev/null
  fi
fi
