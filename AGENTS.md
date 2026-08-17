# 프로젝트: 이커머스 퍼블리싱 보일러플레이트

> 이 파일이 프로젝트 규칙의 **정본**이다. `CLAUDE.md` 는 이 파일을 가리키기만 한다.
> Codex 는 `AGENTS.md` 를, Claude Code 는 `CLAUDE.md` 를 자동으로 읽으므로 둘 다 둔다.

## 이 프로젝트가 무엇인가

완성된 쇼핑몰이 아니라 **재사용 가능한 퍼블리싱 뼈대**를 만든다. 집에서 에이전트로 뼈대를 만들고, 현업(폐쇄망·에이전트 없음)에 들고 가서 사람이 손으로 페이지를 채운다.

**최종 합격 기준**: `node_modules/` 와 `.claude/` · `.codex/` 를 전부 지운 상태에서도 열리고, 작업되고, 품질이 강제되는가.

## 기술 스택

- HTML5 시맨틱 마크업 (프레임워크 없음)
- SCSS → CSS. 토큰은 CSS Custom Properties 로 출력
- Vanilla JavaScript ES6+ (네이티브 ES Module)
- 적응형: PC/MO HTML 분리. MO 360~1023 / PC 1024~ / UA 분기 임계값 1024px
- 대상 브라우저: iOS Safari, Android Chrome 최신 2개 버전
- 접근성: WCAG 2.1 AA

## 아키텍처 규칙

- CRITICAL: **Tier 0(의존성 0)만으로 전부 동작해야 한다.** Node 내장 모듈과 동봉 바이너리 외에는 아무것도 요구하지 마라. npm 패키지는 있으면 좋은 보너스일 뿐 전제가 아니다.
- CRITICAL: **`assets/js/util/` 은 DOM에 의존하지 않는다.** `document`·`window` 참조 금지. 순수 로직만 둔다. DOM 바인딩은 `assets/js/common/` 담당. 이 분리가 jsdom 없이 `node --test` 로 검증하는 조건이자 폐쇄망에서 테스트를 유지하는 조건이다.
- CRITICAL: **토큰은 CSS 변수로 출력한다.** `$color-primary` 같은 SCSS 변수로 색·크기를 정의하지 마라. 개발사가 SCSS 컴파일 없이 값을 바꿀 수 있어야 한다. SCSS 변수는 미디어쿼리 브레이크포인트처럼 CSS 변수를 쓸 수 없는 자리에만.
- CRITICAL: **컴포넌트 SCSS에 색·크기 리터럴 금지.** `var(--...)` 만 쓴다. 재사용성이 토큰 단일 지점에 달려 있다.
  - 색은 예외 없다. `$brand: #d92d20` 처럼 SCSS 변수로 감싸는 것도 금지다 (ADR-004).
  - 크기는 **토큰이 있는 속성**에서 금지다 — 간격(`padding`·`margin`·`gap`), 위치 오프셋(`top`·`right`·`bottom`·`left`·`inset*`), `font-size`, `border-radius`. `px`·`rem`·`em` 전부 해당한다.
  - `width`/`height`/`border-width`/`transform` 오프셋은 토큰이 없으므로 물리값을 허용한다 (UI_GUIDE.md 의 최소 터치 영역 44×44px 이 그 자리다). `base/`·`abstracts/` 계층도 전체 면제 — 리셋의 iOS 입력 16px 이 여기 산다.
  - 이 범위가 `tools/check.js` 의 `SIZE_PROPERTIES` 와 정확히 같다. **한쪽만 고치지 마라** — 문서가 게이트보다 넓으면 사람이 어느 쪽을 믿을지 갈린다.
- **컴포넌트 fragment 는 레이블까지 자기 안에 갖는다.** `<input>`·`<select>`·`<textarea>` 는 같은 fragment 안의 `<label for>`·감싸는 `<label>`·`aria-label` 중 하나로 연결되어야 한다. `check.js` 가 파일 단위로 검사하므로 페이지가 레이블을 대신 주는 구조는 오류로 잡힌다 — 단일 소스 컴포넌트가 자기완결적이어야 하기 때문이다.
- **컴포넌트 마크업은 `assets/components/` 가 단일 소스.** 페이지는 `<!-- @include ... -->` 로 참조한다. 헤더 하나 고치려고 14개 파일을 여는 상황을 만들지 마라.
  - fragment 는 변형을 한 파일에 모아 두므로, 통째로 include 하면 변형 전부가 딸려 온다. **한 조각만 필요하면 변형을 지정한다** — `<!-- @include common/image.html#fixed-ratio -->`.
  - 가져올 쪽 fragment 는 그 조각을 `<!-- @variant fixed-ratio -->` ~ `<!-- @endvariant -->` 로 감싼다. 마커는 주석이라 쇼케이스 렌더에는 영향이 없고, 이름은 `@component` 주석의 `@variant` 목록과 맞춘다.
  - **필요 없는 변형을 CSS `display: none` 으로 가리지 마라.** DOM 과 이미지 요청이 그대로 남고, `:last-of-type` 같은 순서 의존 선택자는 원본 fragment 의 변형 순서만 바뀌어도 조용히 깨진다. 무엇보다 `ecommerce/` SCSS 가 `common/` fragment 의 내부 구조를 알게 되어 계층 경계가 뒤집힌다.
  - 변형 이름 오타는 `tools/check.js` 가 잡는다. 판정은 `tools/include.js` 의 `selectVariant` 한 곳에 있다 — **한쪽만 고치지 마라.**
- **공통 자산은 PC/MO가 공유한다.** HTML만 2벌이고 SCSS·JS는 단일 소스다. `common/` 에 PC 전용 분기를 넣지 마라.
- 모든 컴포넌트 fragment는 `@component` 주석을 갖는다. 이 주석이 `guide.html` 과 에디터 스니펫의 생성 소스다.

## 개발 프로세스

- CRITICAL: `assets/js/util/` 에 코드를 쓰기 전에 `src/__tests__/` 에 테스트를 먼저 작성할 것 (TDD)
- `tools/` 의 도구도 테스트가 있어야 한다 (`tools/<name>.test.js`). 훅의 TDD 가드는 `util/` 만 보므로 여기는 `node tools/check.js` 가 강제한다. 면제는 `tools/vendor/` 의 서드파티뿐이다
- 검증은 항상 `node tools/check.js` 하나로 한다. 이 파일이 Stop 훅·git hook·AC의 공통 진입점이다
- 커밋 메시지는 conventional commits 형식 (feat:, fix:, docs:, refactor:, chore:)

## 명령어

```bash
node tools/build.js      # SCSS 컴파일 + include 해소 + guide/스니펫 생성
node tools/serve.js      # 의존성 0 개발 서버
node tools/check.js      # 전체 검증 (Stop 훅 · pre-commit · AC 공통)

# 테스트만. 디렉토리를 넘기면 Node 가 그것을 모듈로 resolve 해 대부분을 조용히
# 건너뛰므로, 반드시 glob 으로 넘긴다.
node --test "src/__tests__/**/*.test.js"
node --test "scripts/hooks/**/*.test.js"
node --test "tools/**/*.test.js"
```

## 훅 (Claude · Codex)

`.codex/hooks.json` 과 `.claude/settings.json` 은 **배선만** 한다. 둘 다 안전·TDD·검증 훅
3종을 `scripts/hooks/` 의 같은 스크립트에 연결한다 — 판정 로직을 에이전트 설정 안에
인라인으로 두면 회귀를 테스트로 잡을 수 없다 (ADR-007, ADR-011).

`.codex/hooks.json` 의 배선은 **따옴표도 변수 확장도 없는 한 줄**로 적는다. Codex 는 훅을
저장소 루트를 cwd 로 실행하므로 상대 경로로 충분하다.

`.claude/settings.json` 은 **`$CLAUDE_PROJECT_DIR` 하나만 예외**로 허용하고, 그것을 감싸는
따옴표도 함께 허용한다. Claude 는 훅의 cwd 를 보장하지 않아 이것 없이는 경로가 깨진다.
예외는 이 변수 하나뿐이다 — 다른 변수를 끌어들이지 마라.

그 밖에는 양쪽이 같다. `$(...)` 명령 치환, PowerShell 래퍼, `grep`·`jq` 같은 외부 도구
의존, `2>&1` 을 넣지 마라. 전부 한 번씩 훅을 조용히 무력화시킨 적이 있고, 훅은 실패해도
작업이 그대로 진행되므로 눈에 띄지 않는다 (ADR-009).
`scripts/hooks/wiring.test.js` 가 이 규약을 강제한다.

**Stop 게이트는 `timeout` 을 명시한다.** 기본값(Claude 60초)은 `check.js` 가 `src/` 테스트와
Tier 1 lint 를 안고 자라면 넘긴다. 넘기는 순간 훅은 실패로 끝나고 작업은 그대로 진행되므로,
시간이 지나면 저절로 발생하는 무력화다.

**훅을 고친 뒤에는 반드시 프로브로 차단을 눈으로 확인하라.** 로그의 `Failed` 는 차단이
아니라 무력화를 뜻한다.

**Codex 는 신뢰(trust)가 등록되지 않은 훅을 실행하지 않는다.** `codex exec` 는 비대화형이라
신뢰를 물을 수 없으므로, 저장소를 처음 받은 뒤 대화형 `codex` 를 루트에서 1회 실행해
훅 신뢰를 등록해야 한다. 등록되면 `~/.codex/config.toml` 의 `[hooks.state]` 에
`<repo>\.codex\hooks.json:pre_tool_use:0:0` 같은 항목이 생긴다.

`scripts/execute.py` 는 이 신뢰가 없으면 훅 없이 조용히 실행되므로,
자동화에서는 `--dangerously-bypass-hook-trust` 를 붙인다.

**하네스는 codex 를 샌드박스 없이 돌린다** (ADR-008). Windows 의 codex 샌드박스가
프로세스 3단계째를 EPERM 으로 막아 `node tools/check.js` 가 — 즉 모든 step 의 AC 가 —
통과 불가이기 때문이다. 그래서 **위험 명령 훅이 사실상 유일한 자동 방어선이다.**
`scripts/hooks/` 의 차단 패턴을 좁히거나 지우지 마라. 대신 하네스는 `--one` 으로
step 하나씩 돌고 사람이 매 step 산출물을 확인한 뒤 다음으로 넘어간다.

훅 판정 로직은 `.codex/` 나 `.claude/` 가 아니라 `scripts/hooks/` 에 산다. 둘 다 지워도
`node tools/check.js` 로 같은 기준이 남는다.
