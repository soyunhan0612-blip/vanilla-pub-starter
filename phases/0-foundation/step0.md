# Step 0: skeleton

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — 2-tier 원칙, 디렉토리 구조, 빌드 파이프라인
- `/docs/ADR.md` — ADR-002(번들러 선택화), ADR-003(SCSS 바이너리 동봉)
- `/tools/check.js` — **이미 존재한다.** 단일 검증 경로의 전체 구현이 들어 있으므로 반드시 읽고, 이 step에서 만들 도구들이 check.js의 검사 항목과 어긋나지 않게 하라
- `/tools/check.test.js` — **이미 존재한다.** 아래 8번에서 만들 도구 테스트의 본보기다. `--root=` 인자로 임시 픽스처 저장소를 만들어 실제 프로세스를 돌리는 방식을 그대로 따른다 (환경변수를 쓰지 않는 이유는 `check.js` 의 `ROOT` 주석에 있다 — 환경변수는 자식 프로세스로 상속되어 유일한 관문을 조용히 갈아끼울 수 있다)

## 현재 상태 (이미 완료된 것)

- `tools/check.js` — 작성 완료. **다시 만들지 마라.**
- `tools/vendor/sass/sass.bat` — dart-sass 1.102.0 동봉 완료. 동작 검증됨
- `tools/vendor/axe.min.js` — axe-core 4.13.0 동봉 완료
- `.claude/settings.json` Stop 훅이 이미 `node tools/check.js` 를 호출한다

## 작업

### 1. 폴더 스켈레톤 생성

`docs/ARCHITECTURE.md` 의 디렉토리 구조대로 빈 폴더를 만든다. 빈 폴더는 git이 추적하지 않으므로 각 폴더에 `.gitkeep` 을 둔다.

**추가로 `src/package.json` 을 만든다. 내용은 아래 한 줄이 전부다:**

```json
{ "type": "module" }
```

이유를 반드시 이해하고 넘어가라. `src/` 아래 JS는 브라우저에서 `<script type="module">` 로 로드되므로 ESM(`export`/`import`)이어야 하고, 동시에 `node --test` 로 검증되어야 한다. Node는 모듈 파일이 있는 디렉토리에서 위로 올라가며 **가장 가까운 `package.json`** 을 찾아 모듈 종류를 판정하므로, `src/package.json` 에 `{"type":"module"}` 을 두면 **`src/` 아래만 ESM이 되고 `tools/` 는 CommonJS로 남는다.**

`tools/check.js` 는 `require`/`module.exports` 기반 CommonJS이고 이 프로젝트 모든 검증의 단일 진입점이므로, 이 스코프 분리가 필수다. 이 파일은 `npm install` 없이 동작하고 브라우저 로딩과도 무관하다.

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

**`--smoke` 의 성공 기준은 "서버가 기동해서 HTTP 응답을 반환했는가" 이다.** 이 step 시점의 `src/` 에는 HTML 이 하나도 없으므로 **404 가 정상이며 404 를 실패로 처리하지 마라.** 연결 거부·프로세스 크래시·타임아웃만 실패다. 이유: 이 step 은 폴더 스켈레톤과 도구만 만들고 페이지는 이후 phase 에서 생긴다. 404 를 실패로 보면 이 step 의 AC 를 통과할 방법이 없다.

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

**입력 SCSS 엔트리가 없을 때도 실패하면 안 된다.** `src/assets/scss/pc.scss` · `mo.scss` 가 존재하지 않으면 위 3번(컴파일러 부재)과 **동일하게 경고 후 건너뛴다.** 이유: 이 step 은 빈 폴더 스켈레톤만 만들고 SCSS 는 다음 step 에서 작성된다. 동봉 dart-sass 는 입력 파일이 없으면 `Error reading ...: Cannot open file.` 과 함께 **종료코드 66** 으로 실패하므로, 파일 존재를 먼저 확인하지 않으면 이 step 의 AC 첫 줄부터 막힌다.

`dist/` 생성도 마찬가지다. 복사할 HTML 이 하나도 없어도 실패하지 마라 — 빈 `dist/` 가 이 시점의 정상 결과다.

> `guide.html` 과 `.code-snippets` 생성은 이 step의 범위가 아니다. phase `3-guide` 에서 build.js에 추가한다.

### 5. `.githooks/pre-commit`

`node tools/check.js` 한 줄을 실행하고 종료 코드를 그대로 전달한다. husky를 쓰지 마라 — npm 의존이라 폐쇄망에서 무력화된다.

**파일만 만들고, `git config core.hooksPath .githooks` 는 실행하지 마라.** 이 설정은 README에 안내 문구로만 넣는다 (아래 6번). 사람이 저장소를 클론한 뒤 직접 하는 일이다.

### 6. `README.md`

최소한 아래를 포함한다:
- **최초 세팅**: `git config core.hooksPath .githooks` (클론 시 자동 적용되지 않으므로 반드시 명시)
- Tier 0 실행법 (npm 없이): `node tools/build.js`, `node tools/serve.js`, `node tools/check.js`
- Tier 1 실행법 (npm 있을 때)
- **dart-sass 바이너리가 Windows x64 기준**이며 타 OS는 `https://github.com/sass/dart-sass/releases` 에서 해당 플랫폼 아카이브를 받아 `tools/vendor/sass/` 에 풀어야 한다는 안내
- Node 18 이상 필요 (`node --test` 사용)

### 7. `package.json` (Tier 1, 선택)

`scripts` 에 `check`, `build`, `serve`, `test` 를 정의하고 `lint:js`/`lint:css`/`lint:html` 에 eslint·stylelint·html-validate를 연결한다. `devDependencies` 만 두고 `dependencies` 는 비운다. **이 파일이 없어도 모든 것이 동작해야 한다.**

**이 root `package.json` 에 `"type": "module"` 을 넣지 마라.** ESM 선언은 위 1번의 `src/package.json` 에만 둔다. root에 넣으면 `tools/*.js` 의 CommonJS 스코프를 덮어써 `node tools/check.js` 가 `require is not defined in ES module scope` 로 즉사한다.

### 8. 도구 테스트 — `tools/*.test.js`

위에서 만든 도구 3개에 각각 테스트를 붙인다. **파일 3개를 만드는 것 자체가 이 step 의 산출물이다.**

```
tools/include.test.js
tools/serve.test.js
tools/build.test.js
```

`tools/check.js` 가 강제한다. `tools/` 의 `.js` 파일에 대응하는 `tools/<name>.test.js` (또는 `tools/__tests__/<name>.test.js`) 가 없으면 **오류로 막는다.** 면제는 `tools/vendor/` 의 서드파티뿐이다. 즉 도구를 만들고 테스트를 빠뜨리면 **이 step 의 AC 두 번째 줄에서 즉시 실패한다.**

최소한 아래를 덮는다. 전부 이 step 에서 실제로 판단이 갈리는 지점이고, 틀리면 다음 phase 가 통째로 막힌다:

- `include.js` — 중첩 include 해소 · **순환 참조 시 throw**(무한 루프로 서버가 멈추면 안 된다) · 대상 파일 부재 시 throw · `@component` 주석 블록이 결과물에서 제거되는가
- `build.js` — 컴파일러 탐색 순서(`node_modules/.bin/sass` → 동봉 바이너리 → 없으면 **경고 후 건너뜀**) · **SCSS 엔트리가 없어도 종료 코드 0**
- `serve.js` — MIME 매핑 · 디렉토리 요청의 `index.html` 폴백 · `--smoke` 가 **404 를 실패로 보지 않는가**

테스트 가능한 형태로 설계하라. `serve.js` · `build.js` 는 실행 스크립트지만 판정 로직(MIME 결정, 컴파일러 탐색, 경로 해석)은 **`module.exports` 로 꺼내 순수 함수로 만든다.** 프로세스를 띄워야만 검증되는 부분만 `spawnSync` 로 돌린다. `util/` 과 `common/` 을 가르는 것과 같은 이유다.

`tools/` 는 CommonJS다 (`require`/`module.exports`). `src/` 의 ESM 규칙을 여기에 적용하지 마라.

## Acceptance Criteria

```bash
node tools/build.js
node tools/check.js
node tools/serve.js --smoke
```

세 커맨드가 모두 종료 코드 0으로 끝나야 한다.

**이 시점의 `src/` 에는 `.gitkeep` 과 `package.json` 밖에 없다.** SCSS 도 HTML 도 아직 없는 것이 정상이다. **빈 상태에서 세 커맨드가 통과하는 것**이 이 AC 의 요구사항이며, 통과시키려고 더미 SCSS·HTML 을 만들어 넣지 마라.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. `node_modules/` 가 없는 상태에서 위 3개가 전부 통과하는지 확인한다 (Tier 0 단독 동작).
3. 아키텍처 체크리스트:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - 모든 도구가 Node 내장 모듈 + 동봉 바이너리만 쓰는가? `require` 로 외부 패키지를 부르지 않았는가?
   - `tools/include.test.js` · `serve.test.js` · `build.test.js` 3개가 실재하는가? (없으면 `check.js` 가 `테스트 파일이 없다` 로 막으므로 AC 가 통과했다면 이미 충족된 것이다)
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
4. 결과에 따라 `phases/0-foundation/index.json` 의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **`tools/check.js` 를 다시 작성하지 마라.** 이미 완성되어 있다. 읽고 맞추기만 하라. 버그를 발견하면 최소한으로 수정하고 summary에 남겨라.
- **`git config core.hooksPath .githooks` 를 실행하지 마라.** README에 안내만 적는다. 이유: 이 저장소는 자동화 스크립트가 각 step 종료 시 커밋한다. hooksPath가 켜져 있으면 pre-commit이 커밋을 거부할 수 있는데, 그러면 **코드가 커밋되지 않은 채 다음 step으로 넘어간다.** 조용한 유실이라 나중에 발견하기 어렵다.
  - 이미 켜져 있다면 하네스를 돌리기 전에 끈다: `git config --local --unset core.hooksPath`
  - `execute.py` 는 이제 커밋 실패를 경고가 아니라 **중단**으로 처리하므로(`_abort_on_commit_failure`) step이 성공으로 기록되지는 않는다. 그래도 하네스가 통째로 멈추므로 설정은 꺼두는 편이 낫다.
- **root `package.json` 에 `"type": "module"` 을 넣지 마라.** ESM 선언은 `src/package.json` 에만 둔다. 이유: `tools/*.js` 가 CommonJS이며, root 선언이 그 스코프를 덮어쓰면 `node tools/check.js` 가 즉시 죽고 이 프로젝트의 모든 검증 경로가 함께 끊긴다.
- **외부 npm 패키지를 `require` 하지 마라.** 이유: Tier 0는 `npm install` 이 막힌 환경에서 동작해야 하며, 이것이 이 프로젝트의 최종 합격 기준이다.
- **`fs.readdirSync(dir, { recursive: true })` 를 쓰지 마라.** 이유: Node 18.17 미만에서 동작하지 않는다. 현업 Node 버전이 확인되지 않았으므로 재귀를 직접 구현하라.
- SCSS 컴파일러를 찾지 못했을 때 프로세스를 실패시키지 마라. 이유: 커밋된 CSS가 안전망이므로 컴파일 불가는 경고 사유이지 실패 사유가 아니다.
- **도구를 테스트 없이 남기지 마라.** `check.js` 가 막으므로 AC 가 통과하지 않는다. 이유: 훅의 TDD 가드는 `src/assets/js/util/` 만 보므로 `tools/` 는 빠뜨려도 훅이 잡지 못한다. 그런데 이 도구들이 이후 모든 phase 의 빌드·서빙·검증 경로다 — 여기가 조용히 깨지면 뒤 step 들은 원인을 알 수 없는 실패만 보게 된다.
- **테스트를 통과시키려고 도구를 단순화하지 마라.** 순환 참조 감지처럼 검증이 까다로운 요구사항을 빼고 테스트를 맞추면 목적이 뒤집힌다.
- 기존 테스트를 깨뜨리지 마라.
