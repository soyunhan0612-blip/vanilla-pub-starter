# 코딩 컨벤션

이 문서는 에이전트 설정과 하네스 문서를 제거한 뒤에도 남는 작업 규칙이다. 이 프로젝트는 완성된 쇼핑몰이 아니라, 폐쇄망에서 사람이 계속 확장할 수 있는 퍼블리싱 뼈대다. 따라서 `node_modules/`가 없어도 빌드·서빙·검증할 수 있어야 하고, 컴포넌트와 토큰은 한 곳에서만 관리한다.

## 작업 전 지켜야 할 원칙

- 필수 경로는 Node.js 18+ 내장 모듈과 동봉 자산만 사용한다. npm 패키지와 Vite는 편의 기능이며 전제가 아니다. 이유: 사내망에서 패키지 설치가 막혀도 작업과 품질 검증이 중단되면 안 된다.
- 검증 진입점은 항상 `node tools/check.js`다. 개별 테스트나 lint가 통과해도 이 명령을 생략하지 않는다. 이유: Tier 0 검사, 테스트, 설치되어 있을 때의 Tier 1 lint를 한 번에 실행하는 유일한 공통 게이트다.
- PC와 MO는 HTML만 분리하고 SCSS·JavaScript·컴포넌트 fragment는 공유한다. MO는 360~1023px, PC는 1024px 이상이며 768~1023px은 최대 767px의 MO 레이아웃을 중앙 정렬한다. 이유: 적응형 계약을 지키면서 두 구현의 차이를 최소화하기 위해서다.
- `src/guide.html`, `.vscode/publishing.code-snippets`, `dist/`, `src/assets/css/`는 빌드 산출물이다. 원본 fragment와 SCSS를 고친 뒤 `node tools/build.js`로 갱신한다. 생성물을 직접 고치면 다음 빌드에서 사라진다.

## 마크업과 컴포넌트

컴포넌트 마크업의 단일 소스는 `src/assets/components/`다. 페이지에 같은 마크업을 복사하지 말고 include 마커로 참조한다.

```html
<!-- 전체 fragment가 필요한 경우 -->
<!-- @include layout/footer.html -->

<!-- 한 변형만 필요한 경우 -->
<!-- @include common/image.html#fixed-ratio -->
```

한 파일에 여러 변형이 있으면 필요한 부분을 `@variant`와 `@endvariant`로 감싼다. 변형 이름은 상단 `@component` 메타데이터와 같아야 한다.

```html
<!-- @component 반응형 이미지
     @category common
     @variant  default | eager | fixed-ratio
     @a11y     의미 있는 이미지는 alt 필수
     @snippet  img
-->

<!-- @variant fixed-ratio -->
<picture class="responsive-image responsive-image--fixed-ratio">...</picture>
<!-- @endvariant -->
```

사용하지 않는 변형을 통째로 include한 뒤 `display: none`으로 숨기지 않는다. 숨겨진 DOM과 이미지 요청이 남고, 원본 fragment 순서에 페이지 CSS가 의존하며, 상위 `ecommerce/` 계층이 하위 `common/` 내부 구조를 알아야 하는 역방향 결합이 생기기 때문이다.

모든 `<input>`, `<select>`, `<textarea>`는 fragment 안에서 다음 중 하나로 이름을 얻어야 한다.

- 같은 파일의 `<label for="필드-id">`
- 입력을 감싸는 `<label>`
- 맥락상 보이는 레이블을 둘 수 없을 때의 `aria-label` 또는 `aria-labelledby`

페이지가 레이블을 대신 제공하는 구조는 쓰지 않는다. fragment만 가이드나 다른 페이지에서 렌더해도 자기완결적이어야 하며, 파일 단위 검사도 이 원칙을 강제한다.

페이지 문서는 `lang`, 페이지당 하나의 `h1`, `main`을 포함한 시맨틱 랜드마크, `viewport-fit=cover`가 든 viewport 메타를 유지한다. 의미 있는 이미지는 구체적인 `alt`, 장식 이미지는 `alt=""`를 명시한다. 첫 화면 밖 이미지는 `loading="lazy"`, 모든 이미지는 가능한 한 `width`와 `height`로 비율을 예약한다.

## SCSS와 디자인 토큰

색·타이포그래피·간격·레이아웃 값은 `src/assets/scss/tokens/`의 CSS Custom Properties로 정의한다. 예를 들어 컴포넌트는 `#171717`이나 `$brand`가 아니라 `var(--color-text-strong)`을 사용한다. 개발사가 Sass를 다시 컴파일하지 않고 토큰 값만 바꿀 수 있어야 하기 때문이다.

- 색상 리터럴(`#...`, `rgb()`, `rgba()`, `hsl()`, `hsla()`)은 `tokens/` 밖의 SCSS에서 사용하지 않는다. SCSS 변수로 한 번 감싸는 것도 금지다.
- `common/`, `ecommerce/`, `layout/`, `pages/`에서는 `padding`, `margin`, `gap`, `top/right/bottom/left`, `inset*`, `font-size`, `border-radius`에 `px`·`rem`·`em` 리터럴을 쓰지 않고 대응 토큰을 쓴다.
- `width`, `height`, `border-width`, `transform` 오프셋은 대응 토큰이 없으므로 필요한 물리값을 허용한다. 44×44px 터치 영역이 대표 사례다.
- `base/`와 `abstracts/`는 크기 리터럴 검사 대상이 아니다. iOS 입력 확대를 막는 리셋의 `font-size: 16px`처럼 플랫폼 대응값이 이 계층에 있기 때문이다. 색상은 이 계층에서도 토큰 파일 밖 리터럴을 쓰지 않는다.
- SCSS 변수는 CSS 변수를 쓸 수 없는 미디어쿼리 브레이크포인트 등에만 쓴다.
- 허용하는 전환은 `opacity`와 `transform`, 기본 200ms `ease-out`이다. `prefers-reduced-motion: reduce`에서 동작이 제거되는지 확인한다.

토큰을 추가하거나 색을 바꾸면 필요한 텍스트/배경 조합을 `_color.scss`의 `@contrast`에 선언한다. `check.js`는 선언된 쌍만 계산하므로, 선언되지 않은 실제 조합의 대비는 [가이드 토큰 표](src/guide.html#tokens)와 실화면에서 사람이 확인해야 한다.

## JavaScript 레이어

의존 방향은 `util/` → `common/` → `pc.js`·`mo.js` 한 방향이다. 화살표는 상위 레이어가 왼쪽 파일을 import한다는 뜻이며 역방향 import는 금지한다.

| 레이어 | 둬야 하는 것 | 두지 않는 것 | 이유 |
|---|---|---|---|
| `src/assets/js/util/` | 값 계산, 검증, 포커스 인덱스 계산, 요청·쿼리 같은 DOM 비의존 로직 | `document`, `window`, DOM 이벤트·선택자, 다른 프로젝트 레이어 import | jsdom 없이 `node --test`로 검증해야 폐쇄망에서도 테스트를 유지할 수 있다. |
| `src/assets/js/common/` | DOM 탐색, 이벤트 연결, ARIA·클래스·`hidden` 동기화, util 호출 | 페이지 데이터·비즈니스 로직, PC 전용 복제 모듈 | 행동과 DOM 결합을 한곳에 모아 PC/MO가 같은 구현을 공유하게 한다. |
| `src/assets/js/pc.js`, `mo.js` | common 모듈 import와 `init...()` 호출 | 계산 로직, 컴포넌트 내부 구현, 서로 다른 중복 구현 | 엔트리를 배선만으로 유지해야 기능을 한 번 수정해 양쪽에 반영할 수 있다. |

`util/` 구현을 쓰기 전에 `src/__tests__/<파일명>.test.js`를 먼저 작성한다. `tools/`의 실행 스크립트에도 `tools/<파일명>.test.js`가 필요하다. 새 DOM 기능은 가능하면 순수 판정을 util로 떼어 테스트하고, common에서는 DOM 바인딩만 한다.

## 네이밍

### 파일

- HTML, JavaScript, 이미지와 페이지 파일은 소문자 kebab-case를 쓴다: `product-card.html`, `focus-trap.js`, `product-detail.html`.
- SCSS partial은 같은 이름 앞에 `_`를 붙인다: `_product-card.scss`.
- 테스트는 구현 파일명에 `.test.js`를 붙인다: `focus-trap.test.js`, `build.test.js`.
- fragment와 SCSS는 같은 카테고리와 이름을 맞춘다: `components/ecommerce/product-card.html` ↔ `scss/ecommerce/_product-card.scss`.

### CSS 클래스

BEM을 기본으로 쓴다.

- 블록: `.product-card`
- 요소: `.product-card__media`
- 변형·크기: `.product-card--grid`, `.btn--primary`, `.btn--md`
- 일시적 상태: `.is-open`, `.is-error`, `.is-sold-out`
- 조상에 걸어 하위 배치를 보정하는 상태: `.has-cart-summary-bar`
- 범용 유틸리티는 의미가 분명한 짧은 이름을 허용한다: `.container`, `.sr-only`

요소 선택자 깊이를 늘리거나 다른 fragment의 내부 DOM 순서에 기대지 않는다. 블록의 공개 클래스와 `data-*` 훅으로 범위를 닫아야 fragment가 독립적으로 재사용된다.

### `data-*`

속성명과 동작 값은 소문자 kebab-case를 쓴다: `data-modal-open="address-search-modal"`, `data-stepper-action="increase"`. JavaScript 훅은 스타일 클래스와 분리해 `data-<컴포넌트>`를 루트에, `data-<컴포넌트>-<역할>`을 하위 요소에 둔다.

데이터 경로는 `data-bind="product.badges.soldOut"`처럼 점으로 계층을 나누고 각 구간은 lowerCamelCase를 쓴다. 목록 키는 `products`, `order.items`처럼 복수형을 쓴다. 연동 규약의 상세는 아래 절을 따른다.

## Figma에서 코드로 옮기기

시안 수령 직후 [DESIGN_REVIEW.md](DESIGN_REVIEW.md)로 누락 상태와 극단값을 먼저 질의한다. 화면을 그대로 좌표로 베끼기보다 Figma의 레이아웃 의도를 CSS 흐름으로 옮긴다.

| Figma | CSS | 주의점 |
|---|---|---|
| Auto layout 세로 / 가로 | `display: flex` + `flex-direction: column` / `row` | DOM 읽기 순서와 시각 순서를 같게 유지한다. |
| Gap | `gap` | 가장 가까운 `--space-*` 토큰을 사용한다. |
| Padding | `padding` | PC/MO 레이아웃 여백 토큰과 컴포넌트 간격 토큰을 구분한다. |
| Align / Distribute | `align-items` / `justify-content` | `space-between`이 긴 문구에서 과도한 간격을 만들지 확인한다. |
| Hug contents | `width: fit-content` 또는 기본값 | 불필요한 고정 폭을 만들지 않는다. |
| Fill container | `flex: 1` 또는 `width: 100%` | flex 자식이 넘치면 `min-width: 0`도 검토한다. |
| Fixed | 고정값 | 이미지 비율·아이콘 등 필요한 경우만 쓰고, 콘텐츠 영역은 되도록 `max-width`로 제한한다. |
| Absolute position | `position: absolute` | 배지·아이콘처럼 문서 흐름과 무관한 요소에만 쓰고 본문 배치에는 남용하지 않는다. |

Figma 변수는 `분류/역할/상태`를 소문자 kebab-case로 정규화한 뒤 `/`를 `-`로 바꾸고 앞에 `--`를 붙인다.

| Figma 변수 | CSS 변수 |
|---|---|
| `color/text/body` | `--color-text-body` |
| `color/bg/surface` | `--color-bg-surface` |
| `spacing/4` | 기존 스케일에 대응하는 `--space-4` |
| `radius/md` | `--radius-md` |
| `typography/size/page-title` | 기존 체계에 맞춘 `--font-size-page-title` |

동일 의미의 Figma 변수가 이미 있으면 새 토큰을 만들지 말고 기존 토큰에 매핑한다. 토큰 이름에는 화면명이나 임시 색 이름(`--product-detail-gray-2`)보다 역할을 쓴다. 그래야 테마나 시안이 바뀌어도 이름을 유지하고 값만 교체할 수 있다.

## 컴포넌트 추가 절차

1. `src/assets/components/<category>/<name>.html` fragment를 만든다. 폼 제어의 레이블과 접근성 상태까지 fragment 안에 둔다.
2. 파일 맨 위에 `@component`, `@category`, `@variant`, `@a11y`, `@snippet` 메타데이터를 적는다. 여러 조각 중 하나만 include할 수 있어야 하면 각 조각을 같은 이름의 `@variant` 마커로 감싼다.
3. 사용할 PC/MO 페이지에는 복사본이 아니라 `<!-- @include category/name.html#variant -->`를 추가한다.
4. `src/assets/scss/<category>/_<name>.scss`를 만들고 BEM과 CSS 변수만 사용한다. `pc.scss`와 `mo.scss` 양쪽에 같은 `@use '<category>/<name>';`를 연결한다.
5. 상호작용이 있으면 `src/assets/js/common/<name>.js`에 DOM 바인딩을 만들고 두 엔트리에 같은 init을 연결한다. 순수 로직이 필요하면 먼저 `src/__tests__/<name>.test.js`를 작성한 뒤 `util/`에 구현한다.
6. `node tools/build.js`를 실행한다.
7. `src/guide.html`에서 컴포넌트 미리보기·메타데이터·소스가 나타나는지, `.vscode/publishing.code-snippets`에 `@snippet` 항목이 생겼는지 확인한다. 생성 파일은 직접 편집하지 않는다.
8. `node tools/check.js`를 실행하고 실제 키보드 조작과 360/768/1024/1280 레이아웃도 확인한다.

## 개발사 데이터 연동 규약

`data-bind*`는 실제 바인딩 라이브러리가 아니라 서버 템플릿 이관 지점을 표시하는 계약이다. `src/assets/js/util/api.js`도 네트워크 요청 유틸과 이 마커 규약만 제공하며 데이터를 DOM에 주입하지 않는다. 개발사는 사용하는 템플릿 언어로 속성을 치환한 뒤 마커를 유지하거나 제거할 수 있다.

| 마커 | 의미 | 정적 마크업 | 서버 템플릿 예시 |
|---|---|---|---|
| `data-bind` | 요소의 텍스트 또는 표시 상태가 들어갈 지점 | `<strong data-bind="product.name">베이직 셔츠</strong>` | `<strong>{{ product.name }}</strong>` |
| `data-bind-src` | `src` 속성값이 들어갈 지점 | `<img src="/placeholder.jpg" data-bind-src="product.image" alt="...">` | `<img src="{{ product.image }}" alt="{{ product.imageAlt }}">` |
| `data-bind-href` | `href` 속성값이 들어갈 지점 | `<a href="/products/1" data-bind-href="product.url">...</a>` | `<a href="{{ product.url }}">...</a>` |
| `data-bind-list` | 목록 항목마다 반복할 템플릿 루트 | `<li data-bind-list="cart.items">...</li>` | `{% for item in cart.items %}<li>...</li>{% endfor %}` |
| `data-bind-event` | 개발사가 연결할 제출·삭제·필터 같은 행동 식별자 | `<button data-bind-event="delete-cart-item">삭제</button>` | 프로젝트 이벤트/컨트롤러의 `delete-cart-item` 처리기에 연결 |

예시는 특정 템플릿 문법을 강제하지 않는다. 연동할 때는 다음 원칙을 함께 지킨다.

- 텍스트는 HTML 이스케이프해 삽입한다. 상품 설명처럼 마크업을 허용해야 하는 필드는 별도 계약과 정제 정책을 세우고 일반 `data-bind`와 구분한다.
- 이미지에는 URL뿐 아니라 문맥에 맞는 대체 텍스트를 함께 제공한다. 상품명이 바뀌면 `alt`, 확대 보기 이름 등 관련 접근성 텍스트도 같이 갱신한다.
- 상태값은 보이는 글자와 ARIA를 함께 바꾼다. 예: 찜 여부는 `aria-pressed`, 로딩은 `aria-busy`, 오류는 `aria-invalid`·`aria-describedby`, 현재 단계는 `aria-current`까지 동기화한다.
- `data-bind-list`의 반복 단위 안에서는 `id`, `for`, `aria-labelledby`, `aria-describedby`가 항목마다 유일해야 한다. 서버의 상품·주문 식별자를 접미사로 붙인다.
- 빈 배열·요청 실패·로딩을 단순히 목록 0개로 취급하지 않는다. 각각 빈 상태, 오류 상태, 스켈레톤/로딩 상태를 명시적으로 렌더한다.
- `data-bind-event` 값은 동사-대상 kebab-case로 짓고(`submit-order`, `search-address`) 클릭뿐 아니라 폼 submit과 키보드 기본 동작으로도 실행되게 연결한다.
- 사용자 입력·가격·재고의 최종 검증은 서버가 담당한다. 이 마커는 도메인 로직이나 보안 검증을 대신하지 않는다.

## 웹폰트 도입 절차

현재는 `--font-family-base`에 시스템 폰트 스택을 사용한다. Figma 질의에서 웹폰트를 사용한다는 답을 받으면 먼저 [DESIGN_REVIEW.md의 폰트 항목](DESIGN_REVIEW.md#폰트와-텍스트)을 확정한 뒤 아래 순서로 진행한다.

1. **라이선스를 먼저 확인한다.** 계약서나 구매 내역에 웹 사용(webfont) 권한, 허용 도메인·트래픽·배포 범위가 포함되는지 법무/디자인 담당자에게 확인한다. 데스크톱 라이선스만 보유한 폰트를 서버에 올리면 계약 위반이므로 파일 작업 전에 끝낸다.
2. 사용할 family, 굵기, 기울임, 언어 범위를 확정한다. 실제로 쓰지 않는 weight를 함께 내려받지 않는다.
3. **한글은 서브셋을 필수로 만든다.** 전체 글리프는 보통 2~5MB지만 서브셋은 수십~수백 KB로 줄일 수 있다. 서브셋 도구와 라이선스가 변환을 허용하는지, 그 도구를 폐쇄망에 반입할 수 있는지도 함께 확인한다. 반입 승인은 오래 걸릴 수 있으므로 착수 전에 요청한다.
4. `woff2`를 우선 산출하고 정말 필요한 대상이 있을 때만 `woff` 폴백을 만든다. `tools/serve.js`에는 `woff2`의 `font/woff2` MIME이 이미 등록되어 있다. `woff`를 추가한다면 로컬 서버와 운영 서버 모두 `font/woff` MIME을 제공하는지 별도로 확인한다.
5. 승인된 파일을 `src/assets/font/`에 둔다. 파일명은 `family-subset-weight.woff2`처럼 용도와 굵기가 드러나는 kebab-case를 쓴다.
6. `src/assets/scss/base/_fonts.scss` 한 곳에 `@font-face`를 모으고 각 weight를 따로 선언한다. `font-display: swap`을 사용해 FOIT(로드 전 텍스트가 보이지 않음) 대신 FOUT(폴백 텍스트가 먼저 보이고 교체됨)을 택한다. 이커머스에서 상품명과 가격이 안 보이는 시간은 이탈로 직결된다.
7. `pc.scss`와 `mo.scss`에 `@use 'base/fonts';`를 같은 순서로 연결한다.
8. 교체 지점은 `src/assets/scss/tokens/_typography.scss`의 `--font-family-base` 한 곳뿐이다. 컴포넌트마다 font-family를 덮어쓰지 않는다.
9. 모든 페이지의 `<head>`에 본문에서 실제 사용하는 기본 폰트 **1개만** 우선 로드한다. `crossorigin`을 빠뜨리면 preload 응답을 재사용하지 못해 같은 파일을 두 번 받을 수 있다.

   ```html
   <link
     rel="preload"
     href="/assets/font/example-korean-regular.woff2"
     as="font"
     type="font/woff2"
     crossorigin
   >
   ```

10. 느린 네트워크에서 폴백 텍스트가 즉시 보이는지, 교체 시 줄바꿈·버튼 폭·CLS가 허용 범위인지, iOS Safari와 Android Chrome에서 한글 굵기 합성이 생기지 않는지 확인한다. 전송 크기와 요청 개수도 QA 기록에 남긴다.

## 커밋과 완료 기준

커밋 메시지는 `feat:`, `fix:`, `docs:`, `refactor:`, `chore:` 형식을 사용한다. 작업을 마치기 전 `node tools/build.js`와 `node tools/check.js`를 실행하고, 자동 검사가 못 보는 항목은 [QA_CHECKLIST.md](QA_CHECKLIST.md)로 수동 확인한다.
