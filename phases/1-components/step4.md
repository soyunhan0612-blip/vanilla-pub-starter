# Step 4: ecommerce-product

## 읽어야 할 파일

- `/docs/PRD.md` — 산출물 정의, 재사용 경계(`ecommerce/` 는 도메인 계층이며 `common/` 과 분리된다)
- `/docs/UI_GUIDE.md` — 색상 토큰(특히 `--color-danger` 가 할인 표시용), 타이포 스케일(가격 17px/700)
- `/src/assets/components/common/image.html` — **상품 이미지는 반드시 이것을 include 한다.** 직접 `<img>` 를 쓰지 마라
- `/src/assets/components/common/button.html` — 클래스 네이밍 규약
- `/src/assets/js/util/api.js` — `data-bind` 규약이 주석에 정의되어 있다. 연동 지점 표시에 사용한다
- `src/assets/scss/tokens/`, `src/assets/scss/abstracts/_mixins.scss`

## 이 step부터 `ecommerce/` 계층이다

`src/assets/components/ecommerce/` 와 `src/assets/scss/ecommerce/` 에 둔다. **`common/` 에 이커머스 전용 컴포넌트를 넣지 마라.** 이 폴더만 들어내면 타 프로젝트에 재사용할 수 있어야 하는 것이 보일러플레이트의 설계 목적이다.

## 작업

### 1. `src/assets/components/ecommerce/product-card.html`

이커머스 퍼블리싱에서 가장 많이 쓰이는 컴포넌트다. 두 변형을 제공한다:
- `@variant grid` — 상품리스트·메인 추천 영역용 (이미지 위, 정보 아래)
- `@variant list` — 검색 결과·장바구니용 (이미지 좌, 정보 우)

포함 요소:
- 상품 이미지 (`@include common/image.html` — `fixed-ratio` 변형)
- 배지 (신상품 / 세일 / 품절) — 배지는 시각 표시만이 아니라 **텍스트로도 전달**되어야 한다
- 브랜드명, 상품명 (2줄 말줄임 — `_mixins.scss` 의 `ellipsis(2)`)
- 가격 (아래 price 컴포넌트 include)
- 별점 요약 (다음 step에서 만들 review 컴포넌트 자리를 마커로 남긴다)
- 찜하기 버튼 — `aria-pressed` 로 토글 상태 표현

**접근성 핵심**: 카드 전체를 `<a>` 로 감싸지 마라. 카드 안에 찜하기 버튼 등 다른 인터랙티브 요소가 있으면 링크 중첩이 되어 마크업이 무효가 된다. 상품명에 링크를 걸고 이미지에는 `tabindex="-1"` 보조 링크를 두거나, 카드에 `::after` 확장 클릭 영역을 쓰는 방식 중 하나를 골라 일관되게 적용하라.

**품절 상태**: 이미지 오버레이 + 버튼 비활성 + 스크린리더용 텍스트. 시각적 흐림만으로 처리하지 마라.

`data-bind` 마커를 각 데이터 지점에 붙인다 (`data-bind="product.name"` 등).

### 2. `src/assets/components/ecommerce/price.html`

가격 표시는 이커머스에서 오류가 잦은 영역이다. 변형:
- 정가만
- 할인가 (정가 취소선 + 할인가 + 할인율)
- 가격 범위 (옵션에 따라 다를 때)

요구사항:
- 취소선 정가는 `<del>`, 할인가는 `<ins>` 또는 명확한 구조를 쓴다. **`text-decoration: line-through` 만으로 처리하지 마라** — 스크린리더가 구분하지 못한다
- 할인율은 `--color-danger` 를 쓴다
- 스크린리더용 보조 텍스트로 "정가 39,000원, 할인가 29,000원" 같이 읽히게 한다
- 통화 표기와 천 단위 구분 규칙을 주석에 명시한다

### 3. `src/assets/components/ecommerce/stepper.html`

수량 선택기.

- `<button>` (감소) + `<input type="number">` + `<button>` (증가)
- input에 `<label>` 연결 (시각적으로 숨기더라도 `sr-only` 로 존재해야 한다)
- 최소/최대 수량 경계에서 버튼 `disabled`
- **직접 입력도 허용한다.** 버튼만 두면 100개 담을 때 100번 눌러야 한다
- 버튼 최소 터치 영역 44×44px

### 4. `src/assets/js/common/stepper.js`

```js
export function initSteppers(root)   // 이벤트 위임
```

- 경계값 처리(min/max), 숫자가 아닌 입력 방어
- 값 변경 시 `change` 이벤트를 발생시켜 개발사가 후킹할 수 있게 한다
- **계산 로직이 필요하면 `util/` 에 순수 함수로 두고 테스트를 작성한 뒤 여기서 호출하라**

### 5. SCSS + 엔트리 연결

`src/assets/scss/ecommerce/_product-card.scss`, `_price.scss`, `_stepper.scss` 작성 후 엔트리 연결. `pc.js`/`mo.js` 에서 `initSteppers` 호출.

## Acceptance Criteria

```bash
node --test "src/__tests__/**/*.test.js"
node tools/build.js
node tools/check.js
node tools/serve.js --smoke
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. `node tools/serve.js` 후 360px / 1280px 양쪽에서 상품카드 그리드가 깨지지 않는지 확인한다.
3. **키보드만으로** 상품카드의 링크·찜하기·수량 조절에 전부 도달 가능한지 확인한다.
4. 상품명이 아주 길 때, 가격이 아주 클 때 레이아웃이 깨지지 않는지 확인한다.
5. `tools/vendor/axe.min.js` 로 violations 0건 확인 — 특히 **링크 중첩(nested interactive)** 경고가 없어야 한다.
6. 결과에 따라 `phases/1-components/index.json` 의 해당 step을 업데이트한다 (completed / error / blocked + 사유).

## 금지사항

- **상품카드 전체를 `<a>` 로 감싸고 그 안에 버튼을 넣지 마라.** 이유: 인터랙티브 요소 중첩은 HTML 무효이며 스크린리더·키보드 동작이 예측 불가가 된다.
- **`<img>` 를 직접 쓰지 마라.** `common/image.html` 을 include 한다. 이유: lazy loading·WebP·CLS 방지 속성이 누락된다.
- **할인 정가를 CSS `line-through` 만으로 표현하지 마라.** `<del>` 등 의미 있는 태그를 쓴다. 이유: 스크린리더 사용자가 정가와 판매가를 구분하지 못하면 가격을 오인한다.
- **품절을 시각적 흐림만으로 표시하지 마라.** 텍스트로도 전달한다.
- **수량을 버튼으로만 조절하게 하지 마라.** 직접 입력을 허용한다.
- **`ecommerce/` 컴포넌트를 `common/` 에 넣지 마라.** 이유: `ecommerce/` 만 들어내면 타 프로젝트에 재사용 가능해야 한다는 것이 이 보일러플레이트의 설계 목적이다.
- 색·크기 리터럴 금지. `var(--...)` 만.
