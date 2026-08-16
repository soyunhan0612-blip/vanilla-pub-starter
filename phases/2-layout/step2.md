# Step 2: layout-main

## 읽어야 할 파일

- `/docs/PRD.md` — **레이아웃 스켈레톤의 정의를 반드시 확인하라.** 완성된 페이지가 아니라 영역 구조와 그리드만 만든다
- `/docs/ARCHITECTURE.md` — 적응형 전략
- `/src/pc/_template.html`, `/src/mo/_template.html` — **이 템플릿에서 시작한다**
- `/src/assets/components/` 전체 목록 — 기존 컴포넌트를 include로 조합한다
- `/tools/include.js` — include 마커 형식

## 레이아웃 스켈레톤이란

**영역 구조와 그리드까지만 만든다. 디자인 스타일을 입히지 않는다.**

- 각 영역이 무엇인지 알 수 있는 최소한의 마크업과 그리드 배치
- 실제 색·그림자·정교한 간격은 시안 수령 후의 몫
- 콘텐츠는 더미 텍스트/이미지 자리표시자
- 이유: 시안이 없는 상태에서 스타일을 입히면 시안 도착 시 대부분 재작업이 된다. 골격은 이커머스 관례상 대체로 맞으므로 재작업 위험이 낮다

## 작업

### 1. `src/pc/index.html`

PC 메인 페이지 영역 구조:

```
[히어로 배너]           — 캐러셀 자리. loading="eager" + fetchpriority="high"
[카테고리 바로가기]      — 아이콘 그리드
[추천 상품]             — product-card grid × N (4~5열)
[기획전/이벤트 배너]     — 2~3분할 배너
[신상품]                — product-card grid
[베스트셀러]            — product-card grid (랭킹 번호 포함)
[브랜드 스토리/콘텐츠]   — 텍스트+이미지 블록
```

각 섹션은 `<section aria-labelledby="...">` + 섹션 제목(`<h2>`)을 갖는다. **제목이 시각적으로 필요 없는 섹션이라도 `sr-only` 로 제목을 둔다** — 스크린리더 사용자가 페이지 구조를 파악하는 유일한 수단이다.

히어로 배너 이미지는 **`common/image.html` 의 `eager` 변형**을 쓴다. 첫 화면 이미지를 lazy로 두면 LCP가 나빠진다.

### 2. `src/mo/index.html`

같은 섹션 구성이되 MO 배치:
- 히어로: 전체 폭 캐러셀
- 추천/신상품: 2열 그리드 또는 가로 스크롤 캐러셀
- 카테고리 바로가기: 4열 × 2행 아이콘 그리드

### 3. SCSS

`src/assets/scss/pages/_main.scss` 작성 후 `pc.scss`/`mo.scss` 에 연결.

- 그리드는 CSS Grid 또는 Flexbox만 쓴다
- 열 수를 `respond-*` 믹스인으로 분기한다
- **색·그림자를 넣지 마라.** 영역 경계는 토큰의 `--color-border` 정도로만 표시한다

### 4. 캐러셀에 대하여

**캐러셀 JS를 구현하지 마라.** 마크업 골격과 가로 스크롤 CSS(`scroll-snap`)까지만 제공한다.

이유: 시안 없이 만든 캐러셀은 인터랙션 명세(자동재생 여부, 간격, 무한루프)가 전부 추측이 되어 재작업 대상이다. 또한 자동재생 캐러셀은 WCAG 2.2.2(Pause, Stop, Hide)를 요구하므로 명세 없이 만들면 접근성 위반이 되기 쉽다. `scroll-snap` 기반 가로 스크롤은 JS 없이 동작하고 접근성 문제도 없다.

## Acceptance Criteria

```bash
node tools/build.js
node tools/check.js
node tools/serve.js --smoke
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. `node tools/serve.js` 후 `/pc/index.html` 을 1280px, `/mo/index.html` 을 360px로 확인한다.
3. 900px에서 MO 레이아웃이 `max-width: 767px` 중앙정렬되는지 확인한다.
4. 320px까지 좁혀도 가로 스크롤이 생기지 않는지 확인한다 (WCAG 1.4.10).
5. heading 순서가 h1 → h2 로 건너뜀 없이 이어지는지 확인한다 (`check.js` 가 경고한다).
6. `tools/vendor/axe.min.js` 로 violations 0건 확인.
7. 결과에 따라 `phases/2-layout/index.json` 의 해당 step을 업데이트한다 (completed / error / blocked + 사유).

## 금지사항

- **디자인 스타일을 입히지 마라.** 영역 구조와 그리드까지만. 이유: 시안 도착 시 재작업 대상이 된다.
- **캐러셀 JS를 구현하지 마라.** `scroll-snap` 마크업까지만. 이유: 인터랙션 명세가 없어 추측이 되고, 자동재생은 WCAG 2.2.2를 위반하기 쉽다.
- **히어로 이미지에 `loading="lazy"` 를 쓰지 마라.** `eager` + `fetchpriority="high"` 다.
- **섹션 제목을 생략하지 마라.** 시각적으로 불필요해도 `sr-only` 로 둔다.
- **컴포넌트 마크업을 페이지에 복붙하지 마라.** `@include` 로 참조한다.
- 새 컴포넌트를 만들지 마라. 필요하다고 판단되면 summary에 기록하고 기존 것으로 조합하라.
