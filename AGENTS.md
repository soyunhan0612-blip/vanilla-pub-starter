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
- **컴포넌트 마크업은 `assets/components/` 가 단일 소스.** 페이지는 `<!-- @include ... -->` 로 참조한다. 헤더 하나 고치려고 14개 파일을 여는 상황을 만들지 마라.
- **공통 자산은 PC/MO가 공유한다.** HTML만 2벌이고 SCSS·JS는 단일 소스다. `common/` 에 PC 전용 분기를 넣지 마라.
- 모든 컴포넌트 fragment는 `@component` 주석을 갖는다. 이 주석이 `guide.html` 과 에디터 스니펫의 생성 소스다.

## 개발 프로세스

- CRITICAL: `assets/js/util/` 에 코드를 쓰기 전에 `src/__tests__/` 에 테스트를 먼저 작성할 것 (TDD)
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
```

## 훅 (Codex)

`.codex/hooks.json` 이 안전·TDD·검증 훅 3종을 `scripts/hooks/codex-hook.js` 에 연결한다.
**Codex 는 신뢰(trust)가 등록되지 않은 훅을 실행하지 않는다.** `codex exec` 는 비대화형이라
신뢰를 물을 수 없으므로, 저장소를 처음 받은 뒤 대화형 `codex` 를 루트에서 1회 실행해
훅 신뢰를 등록해야 한다. 등록되면 `~/.codex/config.toml` 의 `[hooks.state]` 에
`<repo>\.codex\hooks.json:pre_tool_use:0:0` 같은 항목이 생긴다.

`scripts/execute.py` 는 이 신뢰가 없으면 훅 없이 조용히 실행되므로,
자동화에서는 `--dangerously-bypass-hook-trust` 를 붙인다.

훅 판정 로직은 `.codex/` 가 아니라 `scripts/hooks/` 에 산다. `.codex/` 를 지워도
`node tools/check.js` 로 같은 기준이 남는다.
