# Step 1: design-tokens

## 읽어야 할 파일

- `/docs/UI_GUIDE.md` — **색·타이포·간격·레이아웃 값이 전부 표로 정의되어 있다. 이 값을 그대로 쓴다.**
- `/docs/ADR.md` — ADR-001(브레이크포인트), ADR-004(토큰을 CSS 변수로), ADR-005(대비 3중 검증)
- `/docs/ARCHITECTURE.md` — 적응형 전략, SCSS 디렉토리 구조
- `/tools/check.js` — `checkContrast()` 와 `checkScss()` 를 읽어라. 이 step의 산출물이 통과해야 할 검사가 그대로 코드로 있다
- 이전 step 산출물: `tools/build.js`, `tools/serve.js`

## 작업

### 1. `src/assets/scss/abstracts/_variables.scss`

CSS 변수로 표현할 수 **없는** 값만 SCSS 변수로 둔다. 미디어쿼리 조건이 대표적이다.

```scss
$bp-mo-max: 1023px;   // MO 레이아웃 상한
$bp-pc: 1024px;       // PC 진입점 = UA 분기 임계값
$mo-content-max: 767px; // 768~1023 구간에서 MO 레이아웃 중앙정렬 폭
$pc-content: 1280px;
```

### 2. `src/assets/scss/abstracts/_mixins.scss`

최소한 아래를 제공한다:
- `respond-pc` / `respond-mo` — 미디어쿼리 축약
- `ellipsis($lines)` — 1줄이면 `text-overflow`, 2줄 이상이면 `-webkit-line-clamp`
- `sr-only` — 스크린리더 전용 텍스트
- `focus-ring` — 키보드 포커스 표시. **`outline: none` 만 하고 끝내는 코드를 절대 만들지 마라** (WCAG 2.4.7)

### 3. `src/assets/scss/tokens/` — CSS 변수로 출력

`_color.scss` `_typography.scss` `_spacing.scss` `_layout.scss` 네 파일. 전부 `:root { --... }` 형태로 출력한다.

`_color.scss` 에는 **`@contrast` 주석을 반드시 선언한다.** `tools/check.js` 가 이 주석을 파싱해 명도 대비를 계산하고, 4.5:1 미만이면 빌드를 실패시킨다. 형식:

```scss
:root {
  /* @contrast --color-text-strong on --color-bg-page */
  /* @contrast --color-text-body on --color-bg-page */
  /* @contrast --color-text-weak on --color-bg-page */
  /* @contrast --color-danger on --color-bg-page */
  /* @contrast --color-success on --color-bg-page */
  /* @contrast --color-info on --color-bg-page */
  --color-bg-page: #ffffff;
  ...
}
```

UI_GUIDE.md 의 색상 표에 있는 값을 그대로 쓴다. **`--color-text-disabled` 는 `@contrast` 선언에서 제외한다** — WCAG 1.4.3이 비활성 컨트롤을 명시적으로 면제하기 때문이다.

간격은 4px 배수로 `--space-1`(4px) ~ `--space-10`(40px), 반경은 `--radius-sm`/`--radius-md`/`--radius-lg`.

`_typography.scss` 에는 크기·굵기뿐 아니라 **폰트 스택도 CSS 변수로 출력한다**:

```scss
:root {
  /* 시안 확정 후 웹폰트를 도입할 때 이 한 줄만 교체한다.
     @font-face 선언은 base/_fonts.scss 에 따로 모은다. */
  --font-family-base: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo",
                      "Malgun Gothic", "맑은 고딕", sans-serif;
}
```

이유: 지금은 시스템 폰트만 쓰지만 시안 수령 후 웹폰트가 확정될 수 있다. 폰트 패밀리를 CSS 변수로 두면 교체 지점이 한 곳이고, 개발사도 SCSS 컴파일 없이 바꿀 수 있다 (ADR-004). `_base.scss` 의 `body` 는 이 변수를 참조한다.

### 4. `src/assets/scss/base/_reset.scss` — iOS Safari 대응이 핵심

일반적인 리셋에 더해 **아래 항목을 반드시 포함한다.** 이것들이 없으면 실기기에서 즉시 문제가 드러난다:

| 항목 | 처리 | 이유 |
|---|---|---|
| 입력 자동 확대 | `input, select, textarea { font-size: 16px; }` | iOS Safari는 16px 미만 입력에 포커스하면 화면을 확대한다 |
| 노치/홈 인디케이터 | `--safe-bottom: env(safe-area-inset-bottom, 0px)` 등을 토큰으로 노출 | MO 하단 고정 네비가 홈 인디케이터에 가린다 |
| 뷰포트 높이 | `100dvh` 사용 (`100vh` 폴백 병기) | iOS 주소창 때문에 `100vh` 가 화면보다 크다 |
| 탭 하이라이트 | `-webkit-tap-highlight-color: transparent` | 터치 시 회색 박스가 뜬다 |
| 모션 감소 | `@media (prefers-reduced-motion: reduce)` 에서 transition/animation 무력화 | WCAG 2.3.3 |

### 5. `src/assets/scss/base/_base.scss`

기본 타이포그래피(UI_GUIDE.md 표 그대로), 링크·포커스 기본 스타일, `.sr-only` 유틸, 스킵 네비 스타일.

### 6. 엔트리 `pc.scss` / `mo.scss`

`@use` 로 abstracts → tokens → base 순으로 조합한다. 컴포넌트는 아직 없으므로 import 하지 않는다.

**PC용 CSS에도 1024px 미만 축소 대응을 최소한으로 넣어라.** 이유: WCAG 1.4.10(Reflow)은 400% 확대 시 320px 상당 뷰포트에서 가로 스크롤이 없을 것을 요구하는데, 확대해도 UA는 바뀌지 않아 MO로 분기되지 않는다. 컨테이너에 `max-width: 100%` 와 가로 오버플로 방지를 적용하라.

### 7. 컴파일 결과 커밋

`node tools/build.js` 를 실행해 `src/assets/css/pc.css`, `mo.css` 를 생성한다. **이 CSS는 커밋 대상이다** (`.gitignore` 에서 제외하지 않음). 폐쇄망 안전망 3계층이다.

## Acceptance Criteria

```bash
node tools/build.js
node tools/check.js
```

`check.js` 의 색상 대비 검사와 하드코딩 색상 검사를 반드시 통과해야 한다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. `src/assets/css/pc.css` 를 열어 `:root` 에 CSS 변수가 실제로 출력되었는지 눈으로 확인한다.
3. 아키텍처 체크리스트:
   - 색·크기가 SCSS 변수가 아니라 CSS 변수로 나갔는가? (ADR-004)
   - `@contrast` 선언이 있고 전부 통과하는가?
   - iOS 대응 5종이 `_reset.scss` 에 들어갔는가?
4. 결과에 따라 `phases/0-foundation/index.json` 의 해당 step을 업데이트한다 (completed / error / blocked + 사유).

## 금지사항

- **토큰을 `$color-primary` 같은 SCSS 변수로 정의하지 마라.** `--color-primary` CSS 변수로 출력하라. 이유: 개발사가 SCSS 컴파일 체인 없이 값을 수정할 수 있어야 이관이 실제로 굴러간다.
- **`outline: none` 을 포커스 대체 스타일 없이 쓰지 마라.** 이유: 키보드 사용자가 현재 위치를 잃는다 (WCAG 2.4.7).
- **입력 요소 `font-size` 를 16px 미만으로 두지 마라.** 이유: iOS Safari가 포커스 시 화면을 확대해 레이아웃이 깨진다.
- UI_GUIDE.md 의 AI 슬롭 안티패턴 표에 있는 CSS를 쓰지 마라. `check.js` 가 차단한다.
- 아직 컴포넌트 SCSS를 만들지 마라. 이 step은 토큰과 base까지다.
