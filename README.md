# 이커머스 퍼블리싱 보일러플레이트

프레임워크나 npm 없이도 빌드·서빙·검증할 수 있는 재사용형 퍼블리싱 뼈대다. PC/MO HTML은 분리하고 SCSS·JavaScript·컴포넌트 fragment는 공유한다. 필수 경로는 Node.js 18+ 내장 기능과 저장소에 동봉된 자산만 사용한다.

## 현업 도착 후 먼저 확인할 것

- [ ] `node --version`이 18 이상인가? `node --test`와 Tier 0 도구 실행에 필요하다.
- [ ] 사내 npm 미러에서 `package.json`의 선택 도구를 받을 수 있는가? 사용할 수 없어도 Tier 0 경로는 동작해야 한다.
- [ ] 작업 PC 운영체제·아키텍처가 동봉된 dart-sass Windows x64 바이너리와 맞는가? 다르면 승인된 OS용 dart-sass를 `tools/vendor/sass/`에 준비하거나 npm Sass를 사용한다.
- [ ] 저장소를 받은 직후 `node tools/build.js`와 `node tools/check.js`가 통과하는가?
- [ ] Git hook 경로를 `git config core.hooksPath .githooks`로 한 번 등록했는가? clone만으로 로컬 설정은 따라오지 않는다.
- [ ] iOS Safari·Android Chrome 최신 2개 버전에서 시험할 실기기와 정확한 버전을 정했는가?

## Tier 0 — npm 없이

```bash
node tools/build.js
node tools/serve.js
node tools/check.js
```

`node tools/serve.js`는 사람이 Ctrl+C로 끝낼 때까지 실행된다. 자동화나 단순 기동 확인에서는 종료 조건을 반드시 준다.

```bash
node tools/serve.js --smoke
node tools/serve.js --timeout=120
```

빌드는 npm Sass를 먼저 찾고, 없으면 `tools/vendor/sass/`의 동봉 바이너리를 사용한다. 둘 다 쓸 수 없는 환경에서도 커밋된 `src/assets/css/`로 화면은 열 수 있지만 SCSS 변경분을 다시 컴파일할 수는 없으므로, 작업 시작 전에 현재 OS용 컴파일 경로를 확정한다.

## 가이드와 인수 문서

- [컴포넌트 가이드](src/guide.html) — 25개 컴포넌트 카탈로그, PC/MO 14개 레이아웃, 디자인 토큰, 동봉 axe 자동 검사. `node tools/build.js`가 생성하므로 직접 편집하지 않는다.
- `.vscode/publishing.code-snippets` — fragment의 `@component` 메타데이터로 생성되는 VS Code 스니펫. 가이드와 같은 빌드에서 갱신된다.
- [코딩 컨벤션](CONVENTIONS.md) — 레이어·BEM·토큰·Figma 변환·컴포넌트 추가·`data-bind`·웹폰트 도입 규약.
- [시안 검토 체크리스트](DESIGN_REVIEW.md) — Figma 수령 직후 착수 전에 질의하고 확정할 항목.
- [QA 체크리스트](QA_CHECKLIST.md) — 자동 검사가 판단하지 못하는 키보드·확대·실기기·7개 페이지 점검.
- [크로스브라우징 대응표](CROSSBROWSER.md) — iOS Safari와 Android Chrome의 증상·원인·해결 및 발견 이력.

새 컴포넌트는 `src/assets/components/`의 fragment와 `@component` 주석을 원본으로 만든다. 페이지에는 `<!-- @include ... -->`로 연결하고 SCSS를 PC/MO 엔트리에 연결한 뒤 빌드한다. 전체 절차는 [CONVENTIONS.md의 컴포넌트 추가 절차](CONVENTIONS.md#컴포넌트-추가-절차)를 따른다.

## 개발사 이관 절차

이관 직전에 `node tools/build.js`와 `node tools/check.js`를 실행한 뒤 다음 세 항목을 전달한다.

- `dist/` — include가 모두 해소된 PC/MO 평면 HTML과 읽을 수 있는 비압축 CSS·JavaScript·이미지. 파일명에는 해시가 없다.
- `guide.html`(원본 경로 `src/guide.html`) — 컴포넌트·레이아웃·토큰 카탈로그. 서버 없이 `file://`로 열 수 있다.
- `CONVENTIONS.md` — 마크업, 토큰, 접근성, 컴포넌트 추가와 데이터 연동 계약.

개발사는 `data-bind`, `data-bind-src`, `data-bind-href`, `data-bind-list`, `data-bind-event`를 서버 템플릿 연동 지점으로 사용한다. 각 마커의 치환 방식과 보안·ARIA 동기화 규칙은 [개발사 데이터 연동 규약](CONVENTIONS.md#개발사-데이터-연동-규약)에 있다.

색·간격·타이포그래피 토큰은 `dist/assets/css/pc.css`와 `mo.css`의 CSS Custom Properties로 출력되어 있으므로 Sass 없이도 값을 바꿀 수 있다. 원본 저장소에서 계속 개발한다면 `src/assets/scss/tokens/`를 수정하고 다시 빌드해 두 CSS를 함께 갱신한다.

PC/MO 선택은 운영 서버에서 처리하는 것이 원칙이다. `dist/index.html`의 클라이언트 분기는 뷰포트 폭을 우선하는 폴백 참조 구현일 뿐이며, 그대로 프로덕션 분기 방식으로 채택하면 SEO와 초기 렌더에 손해가 난다. 명시적인 버전 전환과 무한 루프 방지 규약은 [PC/MO 진입과 버전 전환](CONVENTIONS.md#pcmo-진입과-버전-전환)을 따른다.

초기 커밋 일부에는 `Co-Authored-By: Claude` 트레일러가 있다. 저장소 히스토리까지 사내로 반입할 계획이면 회사의 저작자·감사 정책에 맞게 이관 시점에 트레일러 정리가 필요한지 먼저 확인한다. 공개되었거나 공유된 히스토리를 임의로 다시 쓰기 전에 담당자 승인을 받는다.

### 걷어내기 리허설 기록 — 2026-08-17

`rehearsal-strip` 임시 브랜치에서 `.claude/`, `.codex/`, `phases/`, `scripts/`, `docs/`, `CLAUDE.md`, `AGENTS.md`, `node_modules/`를 모두 작업 트리 밖으로 걷어낸 뒤 아래 결과를 확인하고 원복했다. 추적 파일 제거 뒤 남아 있던 무시 파일(`settings.local.json`, phase output, `__pycache__`)도 발견 즉시 함께 격리했으며, 모든 대상의 부재를 다시 확인한 시점부터 검증을 실행했다.

| 검증 | 실제 결과 |
|---|---|
| `node tools/build.js` | 통과. `vendor` Sass로 PC/MO CSS 컴파일, `dist` 생성 |
| `node tools/check.js` | 통과, 경고 0건 |
| `node tools/serve.js --smoke` | 통과, HTTP 200 |
| `node --test "src/__tests__/**/*.test.js"` | 34개 통과 |
| `git hook run pre-commit` | `.githooks/pre-commit`이 `check.js`를 실행해 통과 |
| `node tools/serve.js --timeout=120` + Edge | `/pc/index.html`, `/mo/index.html`, `/guide.html`, 명시 PC/MO 루트 분기 렌더 통과 |
| 외부 임시 폴더의 `dist/` 복제본 | 복제본을 문서 루트로 PC/MO/루트 렌더 통과; 원본 자산 참조 없음 |
| `file:///.../src/guide.html` | 카탈로그 렌더 및 동봉 axe 요약 DOM 생성 통과 |
| 이관 형식 | `@include` 0건, 해시 파일명 0건, 비압축 CSS PC 3,691줄/MO 3,729줄 |

## Tier 1 — npm을 사용할 수 있을 때

```bash
npm install
npm run build
npm run serve
npm run check
npm test
npm run lint:js
npm run lint:css
npm run lint:html
```

Tier 1은 Sass, Vite, ESLint, Stylelint, html-validate를 제공하는 선택 레이어다. `node_modules/`를 삭제해도 Tier 0의 빌드·서빙·검증과 생성된 가이드는 유지되어야 한다.

## 작업 완료 기준

1. `node tools/build.js`로 CSS, include 결과, 가이드와 스니펫을 갱신한다.
2. `node tools/check.js`를 단일 품질 게이트로 실행한다.
3. 자동 검사 밖의 동작은 [QA_CHECKLIST.md](QA_CHECKLIST.md)로 확인한다.
4. 커밋 메시지는 conventional commits 형식(`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`)을 사용한다.
