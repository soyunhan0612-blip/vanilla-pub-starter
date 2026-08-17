# Step 2: handover

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` — 2-tier 원칙, 적응형 전략(UA 분기 임계값 1024px)
- `/docs/ADR.md` — ADR-001(적응형), ADR-002(번들러 선택화), ADR-003(SCSS 3중 안전망)
- `/CONVENTIONS.md`, `/README.md` — 이전 step 산출물
- `/tools/build.js`, `/tools/serve.js`, `/tools/check.js` — 걷어내기 후에도 동작해야 하는 것들
- `/.githooks/pre-commit`

## 배경

이 프로젝트의 **최종 합격 기준**은 하나다:

> `node_modules/` 와 `.claude/` 를 둘 다 지운 상태에서도 열리고, 작업되고, 품질이 강제되는가.

이 step은 그것을 **문서로 주장하지 않고 실제로 실행해서 증명한다.**

## 작업

### 1. `tools/ua-redirect.js` — 적응형 분기 참조 구현

`/` 진입 시 PC/MO를 판별해 보내는 참조 구현.

```js
// 임계값 1024px. 판별 주체는 원칙적으로 서버이며 이것은 참조 구현이다.
```

요구사항:
- **UA 문자열이 아니라 뷰포트 폭을 우선 판단 기준으로 삼아라.** UA 스니핑은 신형 기기에서 계속 깨진다
- 사용자가 명시적으로 다른 버전을 선택했다면 그것을 기억한다 (PC 페이지에서 "모바일 버전으로" 링크)
- **무한 리다이렉트 루프를 방지한다.** 이게 UA 분기의 가장 흔한 사고다
- 파일 상단 주석에 **"서버에서 처리하는 것이 원칙이며 이 스크립트는 폴백"** 임을 명시한다. 개발사가 이걸 그대로 프로덕션에 쓰면 SEO와 초기 렌더에 손해다

각 HTML의 헤더 영역에 PC↔MO 전환 링크를 둘지 결정하고 `CONVENTIONS.md` 에 기록한다.

### 2. 걷어내기 리허설 — 실제로 실행한다

**반드시 실제로 수행하고 결과를 기록하라. 문서만 쓰고 끝내지 마라.**

절차:

```bash
# 1. 현재 상태를 커밋해 안전망을 만든다
git add -A && git commit -m "chore: 걷어내기 리허설 직전 상태"

# 2. 임시 브랜치에서 실제로 걷어낸다
git checkout -b rehearsal-strip
rm -rf .claude .codex phases scripts docs CLAUDE.md AGENTS.md node_modules

# 3. 폐쇄망 조건에서 전부 동작하는지 검증
git config core.hooksPath .githooks
node tools/build.js          # 동봉 sass 로 SCSS 컴파일
node tools/serve.js --smoke  # 서버 기동
node tools/check.js          # 검증 통과
node --test "src/__tests__/**/*.test.js"   # 테스트 통과 (디렉토리를 넘기면 조용히 건너뛴다)

# 4. 브라우저 확인
node tools/serve.js
#   /pc/index.html, /mo/index.html, /guide.html 이 정상 렌더되는가

# 5. 결과 기록 후 원복
git checkout - && git branch -D rehearsal-strip
```

**하나라도 실패하면 그것이 이 step의 진짜 산출물이다.** 실패 원인을 고치고 다시 리허설하라. 3회 시도 후에도 해결되지 않으면 `error` 로 기록하되, **무엇이 왜 실패했는지 구체적으로** 남겨라.

특히 확인할 것:
- `tools/*.js` 중 `docs/` 나 `phases/` 를 참조하는 코드가 없는가
- `check.js` 가 삭제된 경로를 참조해 깨지지 않는가
- `.githooks/pre-commit` 이 동작하는가

### 3. 이관 산출물 확인

```bash
node tools/build.js
```

`dist/` 를 확인한다:
- `@include` 마커가 전부 해소된 **평면 HTML** 인가
- CSS가 압축되지 않아 사람이 읽을 수 있는가
- 파일명에 해시가 붙지 않았는가
- `dist/` 만 별도 폴더로 복사해 열어도 동작하는가

`guide.html` 을 `file://` 로 직접 열어 카탈로그가 보이는지 확인한다.

### 4. `README.md` 에 이관 절차 추가

개발사에게 무엇을 어떻게 넘기는지 적는다:
- 넘기는 것: `dist/` + `guide.html` + `CONVENTIONS.md`
- `data-bind` 규약 안내
- 토큰이 CSS 변수라 **SCSS 없이도 색·간격 수정이 가능**하다는 안내
- UA 분기는 서버 처리가 원칙이라는 안내

### 5. 커밋 트레일러 정리 안내

`README.md` 또는 `CONVENTIONS.md` 에 짧게 기록한다: 초기 커밋에 `Co-Authored-By: Claude` 트레일러가 있으며, 히스토리째 반입할 계획이면 이관 시점에 정리가 필요할 수 있다.

## Acceptance Criteria

```bash
node tools/build.js
node tools/check.js
node tools/serve.js --smoke
node --test "src/__tests__/**/*.test.js"
```

그리고 **위 2번의 걷어내기 리허설이 실제로 수행되어 전부 통과**해야 한다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 걷어내기 리허설을 **실제로 실행**하고 각 단계의 결과를 기록한다.
3. `dist/` 를 프로젝트 밖 임시 폴더로 복사해 열어본다. 원본 저장소 없이 동작해야 한다.
4. `guide.html` 을 `file://` 로 연다.
5. **이것이 phase 3의 마지막 step이자 프로젝트의 마지막 step이다.** 아래를 최종 확인한다:
   - 컴포넌트 19종이 모두 존재하고 `@component` 주석을 갖는가
   - 레이아웃 14장이 모두 존재하는가
   - 문서 4종(`CONVENTIONS`, `DESIGN_REVIEW`, `QA_CHECKLIST`, `CROSSBROWSER`)이 루트에 있는가
   - `node_modules/` 없이 전부 동작하는가
6. 결과에 따라 `phases/3-guide/index.json` 의 해당 step을 업데이트한다. **summary에 걷어내기 리허설 결과를 반드시 포함하라.**

## 금지사항

- **걷어내기 리허설을 실제로 실행하지 않고 문서만 쓰지 마라.** 이 step의 존재 이유가 실증이다. 실행하지 않은 절차는 반드시 현업에서 깨진다.
- **리허설을 현재 브랜치에서 하지 마라.** 반드시 임시 브랜치에서 하고 원복하라. 이유: 실수로 `.claude/` 와 `phases/` 가 영구 삭제되면 하네스를 잃는다.
- **UA 스니핑만으로 PC/MO를 판별하지 마라.** 뷰포트 폭을 우선한다. 이유: UA 문자열 기반 분기는 신형 기기가 나올 때마다 깨진다.
- **`ua-redirect.js` 를 프로덕션 권장 방식으로 서술하지 마라.** 서버 처리가 원칙이고 이건 폴백이다.
- **`dist/` 를 압축하거나 파일명에 해시를 붙이지 마라.** 이유: 개발사가 서버 템플릿으로 쪼개야 하는데 읽을 수 없으면 이관이 실패한다.
- 리허설에서 실패가 나왔는데 `completed` 로 기록하지 마라. 실패를 그대로 기록하는 것이 이 step의 가치다.
