# Step 2: common-nav

## 읽어야 할 파일

- `/docs/UI_GUIDE.md` — 색상 토큰, 타이포 스케일, 애니메이션 규칙
- `/docs/ARCHITECTURE.md` — 레이어 규칙, 적응형 전략(MO 360~1023 / PC 1024~)
- `/src/assets/components/common/button.html` — 클래스 네이밍 규약을 맞춰라
- `/src/assets/js/common/modal.js` — 이벤트 위임 패턴의 참조 구현. 동일 방식을 따른다
- `src/assets/scss/abstracts/_mixins.scss`, `src/assets/scss/tokens/`

## 작업

### 1. `src/assets/components/common/tab.html`

- 컨테이너 `role="tablist"`, 각 탭 `role="tab"` + `aria-selected` + `aria-controls`, 패널 `role="tabpanel"` + `aria-labelledby`
- **키보드**: ←/→ 로 탭 이동, Home/End 로 처음/끝. Tab 키는 탭 목록 전체를 하나의 정지점으로 취급한다 (선택된 탭만 `tabindex="0"`, 나머지는 `-1`)
- MO에서 탭이 넘칠 때 가로 스크롤 처리. 스크롤바를 숨기되 스크롤 자체는 유지한다

### 2. `src/assets/components/common/accordion.html`

상품 상세정보·FAQ에 쓰인다.

- 헤더는 `<button aria-expanded aria-controls>`, 본문은 대응 id를 갖는다
- `<details>`/`<summary>` 를 쓸지 button 방식으로 갈지 정하고 일관되게 적용하라. **하나만 골라라.** 섞으면 스타일과 JS가 두 벌이 된다
- 여러 개 동시 열림 / 하나만 열림 두 모드를 `@variant` 로 제공한다

### 3. `src/assets/components/common/pagination.html`

- `<nav aria-label="페이지 탐색">` 으로 감싼다
- 현재 페이지는 `aria-current="page"`
- 이전/다음 버튼에 텍스트 레이블 (아이콘만이면 `aria-label`)
- 페이지 수가 많을 때 생략(`…`) 처리 규칙을 마크업으로 보여준다
- **모바일 변형**: 이커머스 상품리스트는 페이지네이션 대신 "더보기" 버튼을 쓰는 경우가 많다. `@variant` 로 more 버튼 형태도 제공한다

### 4. `src/assets/components/common/breadcrumb.html`

- `<nav aria-label="현재 위치">` + `<ol>`
- 마지막 항목은 링크가 아니라 `aria-current="page"` 텍스트
- MO에서 길어질 때 처리(첫 항목 + … + 마지막, 또는 가로 스크롤)를 정하고 적용한다

### 5. `src/assets/js/common/tab.js`, `accordion.js`

```js
export function initTabs(root)
export function initAccordions(root)
```

- **이벤트 위임**으로 바인딩한다 (`modal.js` 와 동일 패턴)
- 키보드 조작을 반드시 구현한다. 마우스만 되는 탭은 미완성이다
- PC 전용 분기 금지

### 6. SCSS + 엔트리 연결

`_tab.scss`, `_accordion.scss`, `_pagination.scss`, `_breadcrumb.scss` 작성 후 `pc.scss`/`mo.scss` 에 연결. `pc.js`/`mo.js` 에서 init 호출.

## Acceptance Criteria

```bash
node --test "src/__tests__/**/*.test.js"
node tools/build.js
node tools/check.js
node tools/serve.js --smoke
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. `node tools/serve.js` 후 **키보드만으로** 검증한다:
   - 탭: ←/→ 이동, Home/End 동작, Tab 한 번으로 탭 목록을 지나가는가
   - 아코디언: Enter/Space로 열고 닫히는가, `aria-expanded` 가 실제로 바뀌는가
   - 페이지네이션·브레드크럼: 현재 위치가 스크린리더에 전달되는가(`aria-current`)
3. 360px / 1280px 양쪽에서 넘침 처리가 동작하는지 확인한다.
4. `tools/vendor/axe.min.js` 로 violations 0건 확인.
5. 결과에 따라 `phases/1-components/index.json` 의 해당 step을 업데이트한다 (completed / error / blocked + 사유).

## 금지사항

- **탭·아코디언을 마우스 전용으로 만들지 마라.** 키보드 조작이 없으면 이 step은 미완성이다 (WCAG 2.1.1).
- **탭 목록의 모든 탭을 `tabindex="0"` 으로 두지 마라.** 선택된 것만 0, 나머지는 -1이다. 이유: Tab 키로 탭 개수만큼 정지하면 탐색이 지옥이 된다.
- **`<details>` 와 button 방식을 섞지 마라.** 하나만 골라 일관되게 쓴다. 이유: 스타일과 JS가 두 벌이 되고 유지보수가 두 배가 된다.
- **`common/` 에 PC 전용 분기를 넣지 마라.**
- **개별 요소 직접 바인딩 금지.** 위임을 쓴다.
- `util/` 파일을 수정하지 마라.
