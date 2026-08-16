# Step 1: shell-mo

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` — 적응형 전략(MO 360~1023, 768~1023은 max-width 767 중앙정렬)
- `/docs/UI_GUIDE.md` — 색상·타이포·레이아웃 값
- `/src/assets/components/layout/header-pc.html`, `gnb-pc.html`, `footer.html` — 이전 step 산출물. **푸터는 공용이므로 재사용한다**
- `/src/assets/js/common/gnb.js` — **이전 step에서 만든 모듈을 그대로 쓴다.** MO 전용 GNB 모듈을 새로 만들지 마라
- `/src/assets/js/common/modal.js` — 드로어는 모달의 포커스 트랩·스크롤 잠금과 같은 문제를 갖는다. 재사용 가능한지 먼저 검토하라
- `/src/pc/_template.html` — 구조를 참고하되 MO용으로 조정한다
- `/src/assets/scss/base/_reset.scss` — `--safe-bottom` 등 iOS 대응 토큰 확인

## 작업

### 1. `src/assets/components/layout/header-mo.html`

- 좌: 햄버거 버튼(`aria-label="메뉴 열기"`, `aria-expanded`, `aria-controls`)
- 중앙: 로고
- 우: 검색·장바구니 아이콘 (개수 배지 + sr-only 텍스트)
- 스크롤 시 축소/고정 동작을 넣을지 정하고 주석에 명시한다

### 2. `src/assets/components/layout/gnb-mo.html`

좌측에서 슬라이드하는 드로어.

- **PC 메가메뉴와 동일한 카테고리 데이터 구조**를 쓴다. 마크업은 다르되 클래스·`data-*` 규약을 맞춰 `gnb.js` 가 양쪽을 처리할 수 있게 한다
- 드로어는 모달과 같은 접근성 요구를 갖는다:
  - 열릴 때 포커스가 드로어 안으로, 닫힐 때 햄버거 버튼으로 복귀
  - 포커스 트랩 (`util/focus-trap.js` 경유)
  - Esc로 닫힘
  - 열린 동안 배경 스크롤 잠금
- 2뎁스 카테고리는 아코디언 방식으로 펼친다

### 3. `src/assets/components/layout/bottom-nav.html`

MO 하단 고정 네비 (홈 / 카테고리 / 검색 / 찜 / 마이).

- `<nav aria-label="주요 메뉴">`
- 현재 위치에 `aria-current="page"`
- **`--safe-bottom` 반드시 반영** — 반영하지 않으면 아이폰 홈 인디케이터에 가린다
- 각 항목 최소 터치 영역 44×44px
- 아이콘 + 텍스트 레이블 병행. 아이콘만 두지 마라

### 4. `src/mo/_template.html`

`src/pc/_template.html` 과 같은 구조로 만들되:
- `/assets/css/mo.css`, `/assets/js/mo.js` 참조
- `header-mo` / `gnb-mo` / `bottom-nav` include
- 푸터는 **동일한 `layout/footer.html`** 을 include
- 스킵 네비 포함
- 하단 고정 네비가 본문 마지막을 가리지 않도록 `<main>` 에 하단 여백 확보

### 5. SCSS

`src/assets/scss/layout/` 의 기존 파일에 MO 스타일을 추가한다. **파일을 새로 만들지 말고 `respond-mo` 믹스인으로 같은 파일 안에서 분기하라** — 헤더 스타일이 두 파일로 갈라지면 유지보수 비용이 두 배가 된다.

`_bottom-nav.scss` 는 MO 전용이므로 새 파일로 만든다.

768~1023 구간: `mo.css` 의 컨테이너에 `max-width: 767px; margin: 0 auto;` 를 적용한다.

### 6. `src/assets/js/mo.js`

`pc.js` 와 **같은 모듈들을** import 해서 init 한다. 차이는 초기화 대상 셀렉터 정도여야 한다.

## Acceptance Criteria

```bash
node --test src/__tests__
node tools/build.js
node tools/check.js
node tools/serve.js --smoke
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. `node tools/serve.js` 후 `/mo/_template.html` 을 360px 뷰포트로 연다:
   - 햄버거 → 드로어가 열리고 포커스가 이동하는가
   - Esc로 닫히고 포커스가 햄버거로 복귀하는가
   - 하단 네비가 콘텐츠를 가리지 않는가
3. **900px 뷰포트**로 확인한다 — MO 레이아웃이 `max-width: 767px` 로 중앙정렬되는가 (태블릿 구간 규칙).
4. **iOS Safari 실기기 또는 에뮬레이터**에서 하단 네비가 홈 인디케이터에 가리지 않는지 확인한다.
5. `tools/vendor/axe.min.js` 로 violations 0건 확인.
6. 결과에 따라 `phases/2-layout/index.json` 의 해당 step을 업데이트한다 (completed / error / blocked + 사유).

## 금지사항

- **MO 전용 GNB 모듈을 새로 만들지 마라.** `common/gnb.js` 를 재사용한다. 이유: PC/MO가 동일 모듈을 공유하는 것이 적응형 유지보수 비용을 억제하는 유일한 장치다.
- **푸터를 MO용으로 따로 만들지 마라.** `layout/footer.html` 공용이다.
- **헤더 SCSS를 PC용·MO용 파일로 분리하지 마라.** 같은 파일 안에서 `respond-*` 믹스인으로 분기한다.
- **하단 고정 네비에서 `--safe-bottom` 을 빠뜨리지 마라.** 이유: 아이폰에서 네비가 홈 인디케이터에 가려 눌리지 않는다.
- **드로어를 포커스 트랩 없이 만들지 마라.** 열린 상태에서 Tab이 배경으로 새면 사용자가 길을 잃는다.
- **하단 네비를 아이콘만으로 만들지 마라.** 텍스트 레이블을 병행한다.
- 아직 페이지 콘텐츠를 만들지 마라. 이 step은 셸까지다.
