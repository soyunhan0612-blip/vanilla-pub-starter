# Step 0: skeleton

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — 2-tier 원칙, 디렉토리 구조, 빌드 파이프라인
- `/docs/ADR.md` — ADR-002(번들러 선택화), ADR-003(SCSS 바이너리 동봉)
- `/tools/check.js` — **이미 존재한다.** 단일 검증 경로의 전체 구현이 들어 있으므로 반드시 읽고, 이 step에서 만들 도구들이 check.js의 검사 항목과 어긋나지 않게 하라

## 현재 상태 (이미 완료된 것)

- `tools/check.js` — 작성 완료. **다시 만들지 마라.**
- `tools/vendor/sass/sass.bat` — dart-sass 1.102.0 동봉 완료. 동작 검증됨
- `tools/vendor/axe.min.js` — axe-core 4.13.0 동봉 완료
- `.claude/settings.json` Stop 훅이 이미 `node tools/check.js` 를 호출한다

## 작업

### 1. 폴더 스켈레톤 생성

`docs/ARCHITECTURE.md` 의 디렉토리 구조대로 빈 폴더를 만든다. 빈 폴더는 git이 추적하지 않으므로 각 폴더에 `.gitkeep` 을 둔다.

### 2. `tools/include.js`

HTML include 전처리 모듈. `serve.js` 와 `build.js` 가 공유한다.

```js
// 마커 형식:  <!-- @include common/button.html -->
// 기준 경로:  src/assets/components/
module.exports = {
  resolveIncludes(html, opts)  // 문자열 → include 해소된 문자열. 중첩 include 지원
}
```

요구사항:
- 중첩 include 를 지원한다 (컴포넌트 안에서 다른 컴포넌트 include)
- **순환 참조를 감지해 에러를 던진다.** 무한 루프로 서버가 멈추면 안 된다
- 대상 파일이 없으면 명확한 에러 메시지와 함께 throw
- fragment 상단의 `@component` 주석 블록은 **결과물에서 제거**한다 (문서용 메타데이터이지 마크업이 아니다)

### 3. `tools/serve.js`

의존성 0 정적 개발 서버. Node 내장 `http`/`fs`/`path` 만 사용한다.

- 기본 포트 3000. `--port` 로 변경 가능
- `src/` 를 문서 루트로 서빙
- **`.html` 요청은 `include.js` 로 실시간 해소해서 응답한다** (빌드 없이 바로 확인 가능해야 함)
- MIME 타입: html, css, js, json, svg, png, jpg, webp, woff2
- 디렉토리 요청 시 `index.html` 폴백
- `--smoke` 옵션: 서버를 띄우고 자기 자신에게 요청 1회를 보낸 뒤 종료 코드로 성공/실패를 알린다 (CI·AC용)

### 4. `tools/build.js`

```
node tools/build.js
├─ SCSS 컴파일   src/assets/scss/{pc,mo}.scss → src/assets/css/{pc,mo}.css
└─ dist/ 생성    include 해소된 평면 HTML + css/js/img 복사
```

SCSS 컴파일러 탐색 순서 (**이 순서를 지켜라**):
1. `node_modules/.bin/sass` 가 있으면 사용
2. 없으면 `tools/vendor/sass/sass.bat` (Windows) 또는 `tools/vendor/sass/sass` (기타 OS)
3. 둘 다 없으면 **에러가 아니라 경고**를 내고 SCSS 컴파일을 건너뛴다. 이유: 커밋된 `src/assets/css/*.css` 가 안전망 3계층이므로 컴파일 불가가 곧 실패는 아니다

컴파일 옵션: `--no-source-map --style=expanded`. 사람이 읽을 수 있어야 개발사가 이관받아 수정할 수 있다.

> `guide.html` 과 `.code-snippets` 생성은 이 step의 범위가 아니다. phase `3-guide` 에서 build.js에 추가한다.

### 5. `.githooks/pre-commit`

`node tools/check.js` 한 줄을 실행하고 종료 코드를 그대로 전달한다. husky를 쓰지 마라 — npm 의존이라 폐쇄망에서 무력화된다.

### 6. `README.md`

최소한 아래를 포함한다:
- **최초 세팅**: `git config core.hooksPath .githooks` (클론 시 자동 적용되지 않으므로 반드시 명시)
- Tier 0 실행법 (npm 없이): `node tools/build.js`, `node tools/serve.js`, `node tools/check.js`
- Tier 1 실행법 (npm 있을 때)
- **dart-sass 바이너리가 Windows x64 기준**이며 타 OS는 `https://github.com/sass/dart-sass/releases` 에서 해당 플랫폼 아카이브를 받아 `tools/vendor/sass/` 에 풀어야 한다는 안내
- Node 18 이상 필요 (`node --test` 사용)

### 7. `package.json` (Tier 1, 선택)

`scripts` 에 `check`, `build`, `serve`, `test` 를 정의하고 `lint:js`/`lint:css`/`lint:html` 에 eslint·stylelint·html-validate를 연결한다. `devDependencies` 만 두고 `dependencies` 는 비운다. **이 파일이 없어도 모든 것이 동작해야 한다.**

## Acceptance Criteria

```bash
node tools/build.js
node tools/check.js
node tools/serve.js --smoke
```

세 커맨드가 모두 종료 코드 0으로 끝나야 한다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. `node_modules/` 가 없는 상태에서 위 3개가 전부 통과하는지 확인한다 (Tier 0 단독 동작).
3. 아키텍처 체크리스트:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - 모든 도구가 Node 내장 모듈 + 동봉 바이너리만 쓰는가? `require` 로 외부 패키지를 부르지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
4. 결과에 따라 `phases/0-foundation/index.json` 의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **`tools/check.js` 를 다시 작성하지 마라.** 이미 완성되어 있다. 읽고 맞추기만 하라. 버그를 발견하면 최소한으로 수정하고 summary에 남겨라.
- **외부 npm 패키지를 `require` 하지 마라.** 이유: Tier 0는 `npm install` 이 막힌 환경에서 동작해야 하며, 이것이 이 프로젝트의 최종 합격 기준이다.
- **`fs.readdirSync(dir, { recursive: true })` 를 쓰지 마라.** 이유: Node 18.17 미만에서 동작하지 않는다. 현업 Node 버전이 확인되지 않았으므로 재귀를 직접 구현하라.
- SCSS 컴파일러를 찾지 못했을 때 프로세스를 실패시키지 마라. 이유: 커밋된 CSS가 안전망이므로 컴파일 불가는 경고 사유이지 실패 사유가 아니다.
- 기존 테스트를 깨뜨리지 마라.
