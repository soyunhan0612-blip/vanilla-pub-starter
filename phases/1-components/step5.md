# Step 5: ecommerce-list

## 읽어야 할 파일

- `/docs/UI_GUIDE.md` — 색상 토큰, 타이포 스케일
- `/docs/ARCHITECTURE.md` — 적응형 전략. **필터 UI는 PC와 MO의 형태가 가장 크게 갈리는 컴포넌트다**
- `/src/assets/components/ecommerce/product-card.html` — 이전 step. 별점 자리 마커를 남겨뒀으니 여기서 채운다
- `/src/assets/components/common/modal.html` — MO 필터는 바텀시트 변형을 재사용한다. **새로 만들지 마라**
- `/src/assets/components/common/form.html` — 체크박스·라디오 마크업 규약을 그대로 쓴다
- `/src/assets/js/common/modal.js` — MO 필터 열기/닫기에 재사용

## 작업

### 1. `src/assets/components/ecommerce/filter-bar.html`

상품리스트·검색결과의 필터와 정렬.

**PC 변형** (`@variant pc`):
- 좌측 사이드바 또는 상단 가로 바. 카테고리·가격대·브랜드·색상 등 필터 그룹
- 각 필터 그룹은 `<fieldset>` + `<legend>` 로 묶는다. 이유: 스크린리더가 "이 체크박스들이 무엇에 대한 것인지" 알 수 있어야 한다
- 적용된 필터를 칩(chip) 형태로 표시하고 개별 제거 가능. 각 칩의 제거 버튼에 `aria-label="{필터명} 제거"`

**MO 변형** (`@variant mo`):
- 상단에 필터/정렬 트리거 버튼 2개
- 실제 필터 UI는 **`common/modal.html` 의 바텀시트 변형을 재사용**한다. 필터 전용 오버레이를 새로 만들지 마라
- 적용된 필터 개수를 트리거 버튼에 배지로 표시

**정렬**:
- `<select>` 또는 라디오 그룹. 어느 쪽이든 `<label>` 이 있어야 한다
- 정렬 변경 시 결과가 바뀐다는 것을 스크린리더에 알린다 (`aria-live` 영역에 "N개 상품" 갱신)

**결과 개수 표시**: `role="status"` 로 "총 123개 상품" 을 노출한다. 필터 적용 시 이 값이 갱신되어야 사용자가 필터가 먹혔는지 안다.

### 2. `src/assets/components/ecommerce/review.html`

두 가지 용도를 모두 제공한다:

**별점 요약** (`@variant summary` — 상품카드·상품상세 상단용):
- 별 아이콘 5개 + 평점 숫자 + 리뷰 개수
- **핵심**: 별 아이콘은 장식이다. `aria-hidden="true"` 로 숨기고, **실제 값은 텍스트로 제공**한다 (예: `<span class="sr-only">5점 만점에 4.3점, 리뷰 128개</span>`). 별 개수를 스크린리더가 세게 하지 마라
- 부분 별(4.3점 → 별 4.3개) 표현 방법을 정하고 주석에 명시한다

**리뷰 목록 아이템** (`@variant item`):
- 작성자(마스킹), 작성일(`<time datetime>`), 별점, 본문, 첨부 이미지, 도움돼요 버튼
- 본문이 길 때 접기/펼치기 — `common/accordion.js` 의 패턴을 따르되 별도 마크업이 필요하면 만든다
- 첨부 이미지는 `common/image.html` 을 include

**별점 입력** (`@variant input` — 리뷰 작성용):
- 라디오 그룹으로 구현한다. `<input type="radio">` 5개 + label
- 이유: 마우스 hover만으로 동작하는 별점 입력은 키보드로 쓸 수 없다. 라디오면 화살표 키로 조작된다

### 3. SCSS + 엔트리 연결

`src/assets/scss/ecommerce/_filter-bar.scss`, `_review.scss` 작성 후 엔트리 연결.

- 필터 사이드바는 PC에서만 표시, MO에서는 숨김. 반대로 MO 트리거는 PC에서 숨김. **`_mixins.scss` 의 `respond-pc`/`respond-mo` 를 쓴다**
- 별 아이콘은 SVG 인라인, `currentColor`

### 4. JS

`src/assets/js/common/` 에 새 파일이 필요한지 먼저 판단하라. 필터 열기/닫기는 `modal.js` 로 충분하다. **꼭 필요한 것만 만들고, 만든다면 이벤트 위임 + PC/MO 공유 규칙을 지켜라.**

실제 필터링 로직은 구현하지 마라 — 서버·개발사 몫이다. `data-bind` 마커와 UI 상태 전환까지가 퍼블리싱 범위다.

## Acceptance Criteria

```bash
node --test src/__tests__
node tools/build.js
node tools/check.js
node tools/serve.js --smoke
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. `node tools/serve.js` 후 확인:
   - 1280px에서 PC 필터가, 360px에서 MO 트리거가 보이는가
   - MO 필터 바텀시트가 `modal.js` 로 열리고 Esc·포커스 복귀가 동작하는가
3. **키보드만으로** 필터 선택, 정렬 변경, 별점 입력이 가능한지 확인한다.
4. 스크린리더 관점 확인: 별점이 숫자로 읽히는가? 필터 그룹이 `<legend>` 로 맥락을 갖는가?
5. `tools/vendor/axe.min.js` 로 violations 0건 확인.
6. 결과에 따라 `phases/1-components/index.json` 의 해당 step을 업데이트한다 (completed / error / blocked + 사유).

## 금지사항

- **MO 필터용 오버레이를 새로 만들지 마라.** `common/modal.html` 의 바텀시트 변형을 재사용한다. 이유: 오버레이가 두 벌이 되면 포커스 트랩·스크롤 잠금 버그가 두 곳에서 각각 발생한다.
- **별 아이콘을 스크린리더에 노출하지 마라.** `aria-hidden` + 텍스트 병행. 이유: "별 별 별 별 별" 로 읽히면 평점을 알 수 없다.
- **별점 입력을 hover 기반으로 만들지 마라.** 라디오 그룹을 쓴다. 이유: 키보드·터치에서 조작 불가능해진다.
- **필터 체크박스를 `<fieldset>`/`<legend>` 없이 나열하지 마라.** 이유: 스크린리더가 각 체크박스의 소속을 알 수 없다.
- **실제 필터링·정렬 로직을 구현하지 마라.** 이유: 퍼블리싱 산출물은 데이터를 갖지 않으며 개발사 몫이다.
- 색·크기 리터럴 금지. `ecommerce/` 컴포넌트를 `common/` 에 넣지 마라.
