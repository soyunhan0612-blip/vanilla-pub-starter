# Step 0: shell-pc

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` — 적응형 전략(PC 1024~, 컨텐츠 1280), 디렉토리 구조
- `/docs/UI_GUIDE.md` — 색상·타이포·레이아웃 값
- `/tools/include.js` — **include 마커 형식을 정확히 확인하라.** 페이지가 컴포넌트를 참조하는 방식이다
- `/tools/check.js` — `checkHtml()` 의 랜드마크·lang·heading 검사
- `/src/assets/components/common/` 전체 — 기존 컴포넌트를 재사용한다
- `/src/assets/js/common/modal.js` — 이벤트 위임 패턴 참조

## 작업

### 1. `src/assets/components/layout/header-pc.html`

이커머스 PC 헤더의 표준 구성:
- **상단 유틸 바**: 로그인/회원가입, 주문조회, 고객센터 (`<nav aria-label="유틸리티">`)
- **메인 바**: 로고(`<h1>` 또는 `<a>` — 메인 페이지에서만 h1), 검색창, 장바구니/찜 아이콘(개수 배지)
- **GNB**: 카테고리 내비게이션

검색창은 `<form role="search">` + `<label>`(sr-only) + `<input type="search">`.
장바구니 배지는 개수를 텍스트로도 전달한다 (`<span class="sr-only">장바구니 3개</span>`).

### 2. `src/assets/components/layout/gnb-pc.html`

메가메뉴 드롭다운.

- `<nav aria-label="주요 메뉴">` + `<ul>`
- 각 최상위 항목은 `<button aria-expanded aria-controls>` (하위가 있는 경우) 또는 `<a>` (없는 경우)
- **키보드 조작 필수**: Tab으로 최상위 이동, Enter/Space로 열기, Esc로 닫기, 열린 상태에서 화살표로 하위 항목 이동
- **hover만으로 동작하게 만들지 마라.** hover는 보조 수단이고 클릭/키보드가 주 경로다
- 마우스가 메뉴를 벗어날 때 즉시 닫으면 대각선 이동 시 메뉴가 사라진다. 짧은 지연을 두거나 안전 영역을 확보하라

### 3. `src/assets/components/layout/footer.html`

**PC/MO 공용이다.** 별도로 만들지 마라.

- `<footer>` 랜드마크
- 회사 정보(사업자등록번호 등 이커머스 필수 표기 자리), 고객센터, 이용약관/개인정보처리방침 링크
- 개인정보처리방침 링크는 관례상 강조(bold)한다
- SNS 링크는 아이콘 + `aria-label`

### 4. `src/pc/_template.html`

모든 PC 페이지의 시작점.

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>...</title>
  <link rel="stylesheet" href="/assets/css/pc.css">
</head>
<body>
  <a class="skip-nav" href="#main">본문 바로가기</a>
  <!-- @include layout/header-pc.html -->
  <main id="main">
    <!-- 페이지 내용 -->
  </main>
  <!-- @include layout/footer.html -->
  <script type="module" src="/assets/js/pc.js"></script>
</body>
</html>
```

**스킵 네비는 필수다** (WCAG 2.4.1). 평소 숨겨져 있다가 포커스되면 보이게 한다.

### 5. `src/assets/js/common/gnb.js`

```js
export function initGnb(root)   // 이벤트 위임
```

- PC 메가메뉴와 MO 드로어가 **같은 모듈을 공유한다.** 다음 step에서 MO를 붙일 때 이 파일을 재사용하므로, PC 전용 분기를 넣지 마라
- 열림/닫힘 상태는 `aria-expanded` 를 단일 진실 공급원으로 삼는다

### 6. SCSS

`src/assets/scss/layout/_header.scss`, `_gnb.scss`, `_footer.scss`, `_container.scss`, `_grid.scss` 작성 후 `pc.scss` 에 연결.

`_container.scss` 는 컨텐츠 폭(PC 1280, 좌우 여백 40px)을 담당한다. **`max-width: 100%` 와 가로 오버플로 방지를 반드시 포함하라** — WCAG 1.4.10(Reflow) 대응이다.

`_grid.scss` 는 이후 페이지들이 쓸 그리드 유틸이다. Flexbox/Grid만 쓴다.

## Acceptance Criteria

```bash
node --test src/__tests__
node tools/build.js
node tools/check.js
node tools/serve.js --smoke
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. `node tools/serve.js` 후 `/pc/_template.html` 을 연다:
   - 헤더·푸터가 include로 조립되어 보이는가
   - Tab을 처음 누르면 스킵 네비가 나타나는가
3. **키보드만으로** GNB 메가메뉴를 열고 하위 항목으로 이동하고 Esc로 닫을 수 있는지 확인한다.
4. **브라우저를 320px까지 좁혀도** 가로 스크롤이 생기지 않는지 확인한다 (WCAG 1.4.10).
5. `tools/vendor/axe.min.js` 로 violations 0건 확인.
6. 결과에 따라 `phases/2-layout/index.json` 의 해당 step을 업데이트한다 (completed / error / blocked + 사유).

## 금지사항

- **GNB를 hover 전용으로 만들지 마라.** 클릭/키보드가 주 경로다. 이유: 터치 기기와 키보드 사용자가 메뉴에 접근할 수 없다.
- **`common/gnb.js` 에 PC 전용 분기를 넣지 마라.** 다음 step에서 MO 드로어가 같은 모듈을 쓴다.
- **스킵 네비를 생략하지 마라** (WCAG 2.4.1). 키보드 사용자가 매 페이지 GNB 전체를 지나야 한다.
- **푸터를 PC/MO 따로 만들지 마라.** 공용이다.
- **컨테이너에 고정 `width` 를 쓰지 마라.** `max-width` + `100%` 로 축소 대응을 확보한다. 이유: WCAG 1.4.10에서 400% 확대 시 가로 스크롤이 발생하면 탈락한다.
- 아직 페이지 콘텐츠를 만들지 마라. 이 step은 셸까지다.
