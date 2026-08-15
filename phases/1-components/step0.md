# Step 0: common-form

## 읽어야 할 파일

- `/docs/UI_GUIDE.md` — 버튼·입력 필드 스펙, 색상 토큰명, 최소 터치 영역 44×44px
- `/docs/ARCHITECTURE.md` — 컴포넌트 디렉토리 구조, 레이어 규칙
- `/tools/check.js` — `checkComponentDocs()`, `checkHtml()` 의 폼 레이블 검사를 읽어라
- `src/assets/scss/tokens/` — 이전 phase에서 정의된 CSS 변수 전체. **여기 있는 토큰만 쓴다**
- `src/assets/scss/abstracts/_mixins.scss` — `focus-ring`, `sr-only` 등 제공되는 믹스인
- `src/assets/js/util/validate.js` — 폼 검증 규칙. 마크업의 에러 표시와 대응시켜라

## 컴포넌트 fragment 작성 규약

모든 fragment는 `src/assets/components/` 아래에 두고, **상단에 `@component` 주석을 반드시 넣는다.** 이 주석이 `guide.html` 과 에디터 스니펫의 생성 소스다. 없으면 `check.js` 가 에러를 낸다.

```html
<!-- @component 버튼
     @category common
     @variant  primary | secondary | outline | text
     @size     sm | md | lg
     @a11y     최소 터치 영역 44×44px. disabled 는 aria-disabled 가 아니라 disabled 속성 사용
     @snippet  btn
-->
<button type="button" class="btn btn--primary btn--md">버튼</button>
```

`@snippet` 은 에디터 스니펫의 트리거 문자열이다.

## 작업

### 1. `src/assets/components/common/button.html`

4가지 변형(primary / secondary / outline / text) × 3가지 크기(sm / md / lg)와 상태(기본 / hover / disabled / loading)를 **한 fragment 안에 나란히** 배치한다. 격리 렌더링이 필요 없으므로 예시를 나열하는 방식이 맞다.

- `<button>` 과 `<a class="btn">` 두 형태를 모두 제공한다. 링크로 쓸 때 `role` 을 붙이지 말고 실제 `<a>` 를 쓴다
- loading 상태는 `aria-busy="true"` 로 표현하고 시각적 스피너를 병행한다

### 2. `src/assets/components/common/form.html`

input(text/email/tel/password/number), textarea, select, checkbox, radio, switch.

**모든 입력에 `<label for>` 을 연결한다.** `check.js` 가 레이블 없는 input을 에러로 잡는다. placeholder를 레이블 대신 쓰지 마라.

각 필드마다 아래 상태를 함께 보여준다:
- 기본 / 포커스 / disabled / readonly
- **에러**: `aria-invalid="true"` + `aria-describedby` 로 에러 메시지 연결
- **성공**: 시각 표시 + 스크린리더용 텍스트

에러 메시지는 `util/validate.js` 가 반환하는 문구와 형식을 맞춘다.

### 3. SCSS

`src/assets/scss/common/_button.scss`, `_form.scss` 를 작성하고 `pc.scss`/`mo.scss` 엔트리에 `@use` 로 연결한다.

- **색·크기 리터럴 금지.** `var(--...)` 만 쓴다
- 입력 요소 `font-size` 는 16px 이상 (iOS 자동 확대 방지 — base reset에 있지만 컴포넌트에서 덮어쓰지 마라)
- 포커스는 `_mixins.scss` 의 `focus-ring` 을 쓴다. `outline: none` 단독 금지
- 버튼 최소 크기 44×44px 확보 (WCAG 2.5.5). `sm` 사이즈도 터치 영역은 44px를 유지하되 시각 크기만 작게 하는 방식을 쓴다

### 4. JS

이 step에서는 JS 바인딩이 필요 없다. 폼 검증 연결은 실제 페이지 작업 시점의 몫이며, 뼈대는 마크업 규약까지만 제공한다. **`common/` 에 파일을 만들지 마라.**

## Acceptance Criteria

```bash
node tools/build.js
node tools/check.js
node tools/serve.js --smoke
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. `node tools/serve.js` 로 띄우고 fragment를 브라우저에서 확인한다. 360px과 1280px 양쪽에서 깨지지 않아야 한다.
3. **키보드만으로** 모든 폼 요소를 순회할 수 있는지, 포커스 표시가 보이는지 확인한다.
4. 아키텍처 체크리스트:
   - `@component` 주석이 모든 fragment에 있는가?
   - SCSS에 색·크기 리터럴이 없는가?
   - 모든 input에 label이 연결되었는가?
5. 결과에 따라 `phases/1-components/index.json` 의 해당 step을 업데이트한다 (completed / error / blocked + 사유).

## 금지사항

- **placeholder를 label 대신 쓰지 마라.** 이유: 입력 시작과 동시에 사라져 맥락을 잃는다 (WCAG 3.3.2).
- **`outline: none` 을 대체 포커스 스타일 없이 쓰지 마라.** 이유: 키보드 사용자가 현재 위치를 잃는다.
- **`<div>` 나 `<span>` 에 `role="button"` 을 붙이지 마라.** 실제 `<button>` 을 써라. 이유: 키보드 동작·폼 연동을 직접 재구현해야 하고 대부분 빠뜨린다.
- **색·크기 리터럴을 쓰지 마라.** `var(--...)` 만. 이유: 재사용성이 토큰 단일 지점에 달려 있다.
- 이 step 범위 밖의 컴포넌트를 만들지 마라. 모달·토스트는 다음 step이다.
