# 이커머스 퍼블리싱 보일러플레이트

이커머스 쇼핑몰 퍼블리싱을 시작할 때 바로 쓸 수 있는 재사용 뼈대다. 완성된 쇼핑몰이 아니라 **사람이 손으로 이어받아 페이지를 채우는 뼈대**다.

**합격 기준**: `node_modules/` 와 `.claude/` 를 둘 다 지운 상태에서도 열리고, 작업되고, 품질이 강제된다.

## 요구 사항

- **Node 18 이상.** 검증이 Node 내장 테스트 러너(`node --test`)를 쓴다.
- 그 외에는 아무것도 필요 없다. npm 도, 인터넷도 필요 없다.

## 최초 세팅 (클론 후 1회)

```bash
git config core.hooksPath .githooks
```

**반드시 실행하라.** git 은 훅 설정을 클론에 담아 오지 않는다. 이 한 줄을 빠뜨리면 `.githooks/pre-commit` 이 있어도 커밋 시 검증이 돌지 않는다.

## Tier 0 — npm 없이 (필수 경로)

이 세 개가 전부다. 폐쇄망에서도 그대로 동작한다.

```bash
node tools/build.js      # SCSS 컴파일 + dist/ 이관 산출물 생성
node tools/serve.js      # 개발 서버 (기본 http://localhost:3000)
node tools/check.js      # 전체 검증 — Stop 훅 · pre-commit · AC 공통 진입점
```

부가 옵션:

```bash
node tools/serve.js --port 4000   # 포트 변경
node tools/serve.js --smoke       # 기동 확인 1회 후 종료 코드로 보고 (CI 용)
node tools/check.js --quiet       # 경고 출력 생략
node --test src/__tests__         # 테스트만
```

`serve.js` 는 `src/` 를 문서 루트로 서빙하고, `.html` 요청은 `<!-- @include ... -->` 마커를 **실시간으로 해소**해 응답한다. 페이지를 고치고 새로고침하면 끝이다. 빌드가 필요 없다.

## Tier 1 — npm 이 있을 때 (선택)

있으면 좋은 보너스일 뿐 전제가 아니다. 아래가 전부 없어도 위 Tier 0 는 그대로 돌아간다.

```bash
npm install
npm run check     # node tools/check.js + eslint · stylelint · html-validate
npm run build
npm run serve
npm test
```

`tools/check.js` 는 `node_modules/` 가 있을 때만 린터를 추가로 실행한다. 없으면 조용히 건너뛴다.

## SCSS 컴파일러

`tools/build.js` 가 이 순서로 자동 탐색한다.

1. `node_modules/.bin/sass` (npm 으로 설치된 경우)
2. `tools/vendor/sass/` 동봉 단독 실행 파일
3. 둘 다 없으면 **경고 후 건너뛴다.** 컴파일된 `src/assets/css/*.css` 를 저장소에 커밋해 두므로 컴파일이 불가해도 뼈대는 열린다.

### 동봉 바이너리는 Windows x64 기준이다

`tools/vendor/sass/` 에 들어 있는 dart-sass 1.102.0 은 **Windows x64 빌드**다. macOS·Linux 에서 작업한다면 아래에서 해당 플랫폼 아카이브를 받아 `tools/vendor/sass/` 에 풀어 넣어라.

<https://github.com/sass/dart-sass/releases>

압축을 풀면 `sass` 실행 파일과 `src/` 가 나온다. `tools/vendor/sass/sass` 가 실행 가능하도록 배치하면 `build.js` 가 자동으로 찾는다 (`chmod +x tools/vendor/sass/sass`).

## 디렉토리

```
src/
├── pc/  mo/                PC/MO HTML 각 7장 (@include 마커 포함)
├── assets/
│   ├── components/         마크업 단일 소스 + @component 주석
│   ├── scss/               tokens/ 는 CSS 변수로 출력
│   ├── css/                컴파일 산출물 — 커밋한다 (폐쇄망 안전망)
│   ├── js/util/            순수 로직. DOM 비의존. 테스트 필수
│   ├── js/common/          DOM 바인딩 레이어
│   └── img/
└── __tests__/              node --test 대상
tools/                      serve · include · build · check + vendor/
dist/                       build.js 생성물 (커밋하지 않음)
```

`src/package.json` 의 `{"type":"module"}` 은 `src/` 아래만 ESM 으로 만들기 위한 것이다. 브라우저가 `<script type="module">` 로 읽는 코드와 `node --test` 대상이 같은 파일이기 때문이다. **root `package.json` 에는 절대 `"type": "module"` 을 넣지 마라.** `tools/*.js` 는 CommonJS 이고, root 선언이 그 스코프를 덮으면 `node tools/check.js` 가 즉사한다.

## 문서

| 문서 | 내용 |
|---|---|
| `CLAUDE.md` | 프로젝트 규칙 요약 |
| `docs/PRD.md` | 목표 · 산출물 · MVP 제외 사항 |
| `docs/ARCHITECTURE.md` | 2-tier 원칙 · 디렉토리 · 빌드 파이프라인 |
| `docs/ADR.md` | 주요 설계 결정과 트레이드오프 |
| `docs/UI_GUIDE.md` | 디자인 토큰 플레이스홀더 기준 · AI 슬롭 안티패턴 |
