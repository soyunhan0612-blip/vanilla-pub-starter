# Step 4: layout-detail

## 읽어야 할 파일

- `/docs/PRD.md` — 레이아웃 스켈레톤의 정의(영역 구조·그리드만, 스타일 비움)
- `/docs/ARCHITECTURE.md` — 적응형 전략, `--safe-bottom` 토큰
- `/src/pc/product-list.html`, `/src/mo/product-list.html` — 이전 step. 그리드 클래스 규약을 이어간다
- `/src/assets/components/ecommerce/price.html`, `stepper.html`, `review.html`, `product-card.html`
- `/src/assets/components/common/tab.html`, `accordion.html`, `image.html`, `modal.html`
- `/src/assets/scss/base/_reset.scss` — `--safe-bottom` 확인

## 작업

상품상세는 이커머스에서 **전환이 일어나는 페이지**다. 영역이 많고 PC/MO 구조 차이가 가장 크다.

### 1. `src/pc/product-detail.html`

```
[브레드크럼]
┌──────────────────┬─────────────────────────┐
│ [이미지 갤러리]     │ [브랜드/상품명]           │
│  메인 + 썸네일 목록  │ [별점 요약]  review@summary│
│                  │ [가격]      price         │
│                  │ [옵션 선택]               │
│                  │ [수량]      stepper       │
│                  │ [총 금액]                 │
│                  │ [장바구니/바로구매 버튼]     │
│                  │ [배송/반품 안내]           │
└──────────────────┴─────────────────────────┘
[탭]  상세정보 | 리뷰 | Q&A | 배송/반품     tab.html
  ├ 상세정보    — 상세 이미지 나열
  ├ 리뷰        — review@item 목록 + 페이지네이션
  ├ Q&A         — accordion
  └ 배송/반품    — 텍스트
[함께 본 상품]  product-card grid
```

이미지 갤러리:
- 메인 이미지 + 썸네일 목록. **썸네일은 `<button>`** (클릭으로 메인 교체)
- 확대 보기는 `modal.html` 재사용. 새 오버레이를 만들지 마라
- 메인 이미지는 `common/image.html` 의 **`eager` 변형** (첫 화면이다)

**탭 앵커 문제**: 탭 전환 시 URL 해시를 바꿀지 정하고 주석에 명시한다. 리뷰 직접 링크가 필요한 경우가 많다.

### 2. `src/mo/product-detail.html`

```
[이미지 갤러리]        — 전체 폭, scroll-snap 가로 스와이프 + 인디케이터
[브랜드/상품명]
[별점 요약]
[가격]
[배송 안내]
[탭 또는 아코디언]     — 상세정보/리뷰/Q&A
[함께 본 상품]
[하단 고정 구매 바]    ★ --safe-bottom 필수
  └ 찜하기 + 장바구니 + 바로구매
[옵션 선택 바텀시트]   — modal.html @variant 바텀시트 재사용
```

**MO 구매 흐름**: 하단 고정 바의 "구매" 를 누르면 옵션 선택 바텀시트가 열리고, 거기서 옵션·수량을 고른 뒤 최종 확정한다. 이게 국내 이커머스 표준 패턴이다.

하단 고정 바는 `--safe-bottom` 을 반드시 반영하고, `<main>` 에 그만큼의 하단 여백을 확보한다.

### 3. 옵션 선택 UI

옵션은 이커머스에서 마크업 실수가 잦은 영역이다.

- 단일 선택 옵션은 **라디오 그룹** 또는 `<select>`. `<div>` 에 클릭 핸들러를 붙이지 마라
- 품절 옵션은 `disabled` + 텍스트로 "품절" 표시
- 옵션 조합 결과(선택된 옵션 목록)를 제거 가능한 항목으로 표시하고, 각 제거 버튼에 `aria-label="{옵션명} 제거"`

### 4. SCSS

`src/assets/scss/pages/_detail.scss` 작성 후 엔트리 연결.

- PC 2단은 CSS Grid. 우측 구매 영역은 `position: sticky` 로 스크롤을 따라오게 한다
- MO 갤러리는 `scroll-snap-type: x mandatory`
- **색·그림자 금지.** 영역 경계는 `--color-border` 까지만

### 5. JS

**갤러리 스와이프 JS를 구현하지 마라.** `scroll-snap` 으로 처리한다. 썸네일 클릭 → 메인 교체 정도만 필요하면 `common/` 에 위임 방식으로 추가하되, 꼭 필요한지 먼저 판단하라.

## Acceptance Criteria

```bash
node --test "src/__tests__/**/*.test.js"
node tools/build.js
node tools/check.js
node tools/serve.js --smoke
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. `node tools/serve.js` 후 PC 1280px / MO 360px로 확인한다.
3. **키보드만으로** 확인한다: 썸네일 전환, 탭 이동, 옵션 선택, 수량 조절, 구매 버튼 도달.
4. MO에서 하단 고정 바가 콘텐츠 마지막을 가리지 않는지, **iOS 홈 인디케이터에 가리지 않는지** 확인한다.
5. PC에서 우측 구매 영역이 sticky로 따라오되 푸터를 침범하지 않는지 확인한다.
6. 320px까지 좁혀도 가로 스크롤이 없는지 확인한다.
7. `tools/vendor/axe.min.js` 로 violations 0건 확인.
8. 결과에 따라 `phases/2-layout/index.json` 의 해당 step을 업데이트한다 (completed / error / blocked + 사유).

## 금지사항

- **디자인 스타일을 입히지 마라.** 영역 구조와 그리드까지만.
- **옵션 선택을 `<div>` + 클릭 핸들러로 만들지 마라.** 라디오 또는 `<select>` 를 쓴다. 이유: 키보드 조작·스크린리더 지원을 직접 구현해야 하고 대부분 빠뜨린다.
- **확대 보기용 오버레이를 새로 만들지 마라.** `modal.html` 을 재사용한다.
- **MO 하단 고정 바에서 `--safe-bottom` 을 빠뜨리지 마라.** 구매 버튼이 홈 인디케이터에 가리면 매출 손실로 직결된다.
- **갤러리 스와이프를 JS로 구현하지 마라.** `scroll-snap` 을 쓴다. 이유: 시안 없이 만든 스와이프 인터랙션은 명세가 추측이 되고, 네이티브 스크롤이 접근성·성능 모두 우수하다.
- **메인 상품 이미지에 `loading="lazy"` 를 쓰지 마라.** 첫 화면이므로 `eager` 다.
- **컴포넌트 마크업을 복붙하지 마라.** `@include` 로 참조한다.
- 새 컴포넌트를 만들지 마라. 필요하면 summary에 기록하라.
