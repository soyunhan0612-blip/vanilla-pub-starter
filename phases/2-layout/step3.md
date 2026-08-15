# Step 3: layout-catalog

## 읽어야 할 파일

- `/docs/PRD.md` — 레이아웃 스켈레톤의 정의(영역 구조·그리드만, 스타일 비움)
- `/docs/ARCHITECTURE.md` — 적응형 전략
- `/src/pc/index.html`, `/src/mo/index.html` — 이전 step. **섹션 구조·그리드 클래스 규약을 그대로 이어간다**
- `/src/assets/components/ecommerce/filter-bar.html` — PC/MO 변형이 다르다. 각각 맞게 include
- `/src/assets/components/ecommerce/product-card.html` — grid/list 변형
- `/src/assets/components/common/pagination.html` — PC는 페이지네이션, MO는 더보기 변형
- `/src/assets/components/common/breadcrumb.html`, `empty.html`, `skeleton.html`

## 작업

이 step은 **4장**을 만든다: 카테고리 PC/MO, 상품리스트 PC/MO.

### 1. 카테고리 페이지 — `src/pc/category.html`, `src/mo/category.html`

카테고리 진입 페이지(상품 나열 전의 허브).

```
[브레드크럼]
[카테고리 제목 + 설명]
[하위 카테고리 목록]     — 아이콘/이미지 그리드
[카테고리 배너]
[대표 상품]             — product-card grid
```

MO는 하위 카테고리를 2~3열 그리드 또는 리스트로.

### 2. 상품리스트 페이지 — `src/pc/product-list.html`, `src/mo/product-list.html`

이커머스에서 가장 트래픽이 많은 페이지 유형이다.

**PC 구조** (2단 레이아웃):
```
[브레드크럼]
[카테고리 제목]
┌─────────────┬──────────────────────────┐
│ [필터 사이드바] │ [정렬 바 + 결과 개수]      │
│  filter-bar  │ [상품 그리드 4열]          │
│  @variant pc │ [페이지네이션]             │
└─────────────┴──────────────────────────┘
```

**MO 구조** (1단):
```
[브레드크럼]
[카테고리 제목]
[필터/정렬 트리거 바]     — filter-bar @variant mo (sticky)
[결과 개수]
[상품 그리드 2열]
[더보기 버튼]            — pagination @variant more
```

**반드시 포함할 상태 변형**: 각 페이지 하단에 주석으로 감싸 함께 배치한다.
- **로딩 상태** — `skeleton.html` 을 상품 그리드 형태로
- **빈 상태** — `empty.html` 의 "검색 결과 없음" 변형
- 이유: 실무에서 가장 많이 빠뜨리는 것이 이 둘이고, 시안에도 대개 없다. 뼈대에 미리 두면 현업에서 물어볼 항목이 된다

**결과 개수는 `role="status"`** 로 감싼다. 필터 적용 시 이 값이 갱신되어야 사용자가 필터가 먹혔음을 안다.

### 3. SCSS

`src/assets/scss/pages/_catalog.scss` 작성 후 엔트리 연결.

- PC 2단 레이아웃은 CSS Grid로. 사이드바 고정폭 + 본문 가변
- 상품 그리드 열 수를 `respond-*` 로 분기 (PC 4열 / 태블릿 구간은 MO 레이아웃이므로 2열 / MO 2열)
- **색·그림자 금지.** 영역 경계는 `--color-border` 까지만

### 4. 무한 스크롤에 대하여

**무한 스크롤을 구현하지 마라.** MO는 "더보기" 버튼 방식으로 간다.

이유: 무한 스크롤은 키보드 사용자가 푸터에 도달할 수 없게 만들고(WCAG 2.4.1 관련), 뒤로가기 시 위치 복원이 어렵다. 더보기 버튼은 두 문제를 모두 피하면서 동일한 UX를 제공한다. 시안이 무한 스크롤을 요구하면 그때 접근성 대응과 함께 논의한다 — `DESIGN_REVIEW.md` 질의 항목이다.

## Acceptance Criteria

```bash
node tools/build.js
node tools/check.js
node tools/serve.js --smoke
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. `node tools/serve.js` 후 4장을 각각 확인한다 (PC 1280px / MO 360px).
3. 필터 사이드바가 PC에서만, 필터 트리거가 MO에서만 보이는지 확인한다.
4. 로딩 스켈레톤이 실제 상품 그리드와 **같은 크기**를 차지하는지 확인한다 (CLS 방지).
5. 320px까지 좁혀도 가로 스크롤이 없는지 확인한다.
6. `tools/vendor/axe.min.js` 로 4장 모두 violations 0건 확인.
7. 결과에 따라 `phases/2-layout/index.json` 의 해당 step을 업데이트한다 (completed / error / blocked + 사유).

## 금지사항

- **디자인 스타일을 입히지 마라.** 영역 구조와 그리드까지만.
- **무한 스크롤을 구현하지 마라.** 더보기 버튼을 쓴다. 이유: 키보드 사용자가 푸터에 도달할 수 없고 뒤로가기 위치 복원이 깨진다.
- **로딩 상태와 빈 상태를 빠뜨리지 마라.** 실무에서 가장 자주 누락되는 두 가지다.
- **실제 필터링·정렬 로직을 구현하지 마라.** 서버·개발사 몫이다. UI 상태 전환까지만.
- **컴포넌트 마크업을 페이지에 복붙하지 마라.** `@include` 로 참조한다.
- **스켈레톤이 실제 콘텐츠와 다른 크기를 갖게 하지 마라.** 로딩 완료 시 CLS가 발생한다.
- 새 컴포넌트를 만들지 마라. 필요하면 summary에 기록하라.
