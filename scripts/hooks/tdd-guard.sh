#!/bin/bash
# TDD Guard Hook — PreToolUse[Edit|Write]
# 구현 코드를 작성하려 할 때, 해당 모듈의 테스트 파일이 먼저 존재하는지 체크.
# 테스트 없이 구현 코드를 작성하려 하면 차단.

INPUT=$(cat)
# jq 에 의존하지 않는다 — 이 환경에 jq 가 없어 훅이 조용히 무력화된 적이 있다.
# Node 는 Tier 0 가 이미 요구하므로 새 의존성이 아니다.
FILE_PATH=$(printf '%s' "$INPUT" | node -e '
  let s = "";
  process.stdin.on("data", (d) => (s += d)).on("end", () => {
    try {
      const v = JSON.parse(s);
      process.stdout.write((v.tool_input && v.tool_input.file_path) || "");
    } catch (_) {}
  });
')

# Windows 경로는 역슬래시로 들어온다. 아래 case 글로브가 전부 / 기준이므로 정규화한다.
FILE_PATH=$(printf '%s' "$FILE_PATH" | tr '\\' '/')

# 파일 경로가 없으면 통과
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# 테스트 파일 자체를 수정하는 건 허용
case "$FILE_PATH" in
  *test*|*spec*|*.test.*|*.spec.*|*__tests__*)
    exit 0
    ;;
esac

# 설정/마크업/스타일/문서 파일은 테스트 불필요 — 허용
case "$FILE_PATH" in
  *.json|*.html|*.css|*.scss|*.md|*.yml|*.yaml|*.env*|*.config.*|*.code-snippets)
    exit 0
    ;;
esac

# 빌드/검증 도구는 테스트 대상 외 — 허용
case "$FILE_PATH" in
  tools/*|*/tools/*)
    exit 0
    ;;
esac

# assets/js/common/ 은 DOM 바인딩 레이어 — jsdom 없이는 유닛 테스트가 불가하므로 허용.
# 순수 로직은 assets/js/util/ 에 두고 거기서만 TDD를 강제한다.
case "$FILE_PATH" in
  */assets/js/common/*|*/assets/js/pages/*)
    exit 0
    ;;
esac

# 엔트리 파일은 import + init 만 담당 — 허용
case "$FILE_PATH" in
  */assets/js/pc.js|*/assets/js/mo.js)
    exit 0
    ;;
esac

# 여기까지 왔으면 assets/js/util/ 의 순수 로직 — 테스트 파일 존재 여부 확인
case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx)
    # 파일명 추출
    DIR=$(dirname "$FILE_PATH")
    BASENAME=$(basename "$FILE_PATH" | sed -E 's/\.(ts|tsx|js|jsx)$//')

    # 테스트 파일 후보 경로들
    TEST_FOUND=false

    # 같은 폴더에 .test 파일
    for EXT in ts tsx js jsx; do
      if [ -f "${DIR}/${BASENAME}.test.${EXT}" ] || [ -f "${DIR}/${BASENAME}.spec.${EXT}" ]; then
        TEST_FOUND=true
        break
      fi
    done

    # __tests__ 폴더
    if [ "$TEST_FOUND" = false ]; then
      PARENT=$(dirname "$DIR")
      for EXT in ts tsx js jsx; do
        if [ -f "${PARENT}/__tests__/${BASENAME}.test.${EXT}" ] || [ -f "${DIR}/__tests__/${BASENAME}.test.${EXT}" ]; then
          TEST_FOUND=true
          break
        fi
      done
    fi

    # src/__tests__/ 루트 테스트 폴더
    if [ "$TEST_FOUND" = false ]; then
      PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
      for EXT in ts tsx js jsx; do
        if [ -f "${PROJECT_ROOT}/src/__tests__/${BASENAME}.test.${EXT}" ]; then
          TEST_FOUND=true
          break
        fi
      done
    fi

    if [ "$TEST_FOUND" = false ]; then
      cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "TDD GUARD: '${BASENAME}'에 대한 테스트 파일이 존재하지 않습니다. 구현 코드를 작성하기 전에 테스트를 먼저 작성하세요. (테스트 파일 예: src/__tests__/${BASENAME}.test.js)"
  }
}
EOF
    fi
    ;;
esac

exit 0