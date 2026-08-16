# Step 3: common-media

## 읽어야 할 파일

- `/docs/PRD.md` — 산출물 정의, 성능 요구(lazy loading, WebP)
- `/docs/UI_GUIDE.md` — 색상 토큰, 애니메이션 규칙
- `/tools/check.js` — **`checkImages()` 를 반드시 읽어라.** `alt` 누락은 에러, `loading`·`width`/`height` 누락은 경고로 잡는다. 이 step의 산출물이 그 검사를 통과해야 한다
- `/docs/ARCHITECTURE.md` — 컴포넌트 구조

## 작업

### 1. `src/assets/components/common/image.html` — 이 step의 핵심

계약 우대사항에 "웹 퍼포먼스 최적화 (이미지 lazy loading, WebP 대응)"가 명시되어 있다. **이 프로젝트의 모든 이미지는 이 fragment를 통해서만 들어간다.**

```html
<!-- @component 반응형 이미지
     @category common
     @variant  default | eager | fixed-ratio
     @a11y     의미 있는 이미지는 alt 필수. 장식용은 alt="" 로 명시
     @snippet  img
-->
<picture>
  <source type="image/webp" srcset="... 1x, ... 2x">
  <img src="...jpg" alt="" width="600" height="600" loading="lazy" decoding="async">
</picture>
```

요구사항 — **전부 필수**:
- `<picture>` + `<source type="image/webp">` + `<img>` 폴백 구조
- `srcset`/`sizes` 로 해상도 대응 (1x/2x, 그리고 PC/MO 폭 차이)
- `loading="lazy"` 기본. **단 첫 화면(above the fold) 이미지는 `loading="eager"` + `fetchpriority="high"`** — 이 변형을 `@variant eager` 로 별도 제공한다
- `width`/`height` 를 **항상** 명시한다 (CLS 방지). 실제 렌더 크기는 CSS가 정하고, 속성은 종횡비 계산용이다
- `decoding="async"`
- 고정 비율 컨테이너 변형(`@variant fixed-ratio`) — 상품 이미지처럼 비율이 정해진 경우 `aspect-ratio` 로 처리

`@component` 주석에 **"장식용 이미지는 `alt=""` 를 명시하고 생략하지 말 것"** 을 적어라. 빈 alt와 alt 누락은 스크린리더에서 완전히 다르게 동작한다.

### 2. `src/assets/components/common/skeleton.html`

로딩 상태 자리표시자. `util/api.js` 의 요청 중 상태와 대응한다.

- `aria-hidden="true"` (스크린리더에 읽힐 내용이 아니다)
- 실제 콘텐츠와 **같은 크기**를 차지해야 한다. 그렇지 않으면 로딩 완료 시 CLS가 발생한다
- 변형: 텍스트 줄 / 이미지 블록 / 상품카드 형태
- 애니메이션은 `opacity` 또는 `transform` 만. `prefers-reduced-motion` 에서 정지

### 3. `src/assets/components/common/empty.html`

빈 상태. 이커머스에서 자주 쓰이는 맥락별 변형을 제공한다:
- 검색 결과 없음 / 장바구니 비어있음 / 주문 내역 없음 / **에러 발생**

각 변형은 **다음 행동(CTA)을 제시한다.** "결과가 없습니다"로 끝내지 말고 "다른 검색어로 찾아보기" 같은 경로를 준다.

에러 변형은 `role="alert"` 을 갖는다.

### 4. SCSS + 엔트리 연결

`_image.scss`, `_skeleton.scss`, `_empty.scss` 작성 후 `pc.scss`/`mo.scss` 에 연결.

### 5. JS

이 step에는 JS 바인딩이 필요 없다. `loading="lazy"` 는 브라우저 네이티브 기능이므로 **IntersectionObserver 폴리필을 만들지 마라.** 대상 브라우저(iOS Safari·Android Chrome 최신 2버전)가 전부 지원한다.

## Acceptance Criteria

```bash
node tools/build.js
node tools/check.js
node tools/serve.js --smoke
```

`check.js` 의 이미지 검사에서 **에러 0건, 경고 0건**이어야 한다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. `node tools/serve.js` 후 브라우저 개발자도구 네트워크 탭에서 확인한다:
   - WebP를 지원하는 브라우저가 `.webp` 를 받는가
   - 뷰포트 밖 이미지가 즉시 요청되지 않는가 (lazy 동작)
3. 이미지 로드 전후로 레이아웃이 흔들리지 않는지(CLS) 확인한다.
4. 아키텍처 체크리스트:
   - 모든 `<img>` 에 `alt`, `loading`, `width`, `height` 가 있는가?
   - 스켈레톤이 실제 콘텐츠와 같은 크기를 차지하는가?
5. 결과에 따라 `phases/1-components/index.json` 의 해당 step을 업데이트한다 (completed / error / blocked + 사유).

## 금지사항

- **`<img>` 를 `<picture>` 없이 단독으로 쓰지 마라.** 이유: WebP 폴백 구조가 빠지면 계약의 성능 요구를 충족하지 못한다.
- **`width`/`height` 를 생략하지 마라.** 이유: CLS가 발생하고 이는 성능 지표에 직접 반영된다.
- **모든 이미지에 `loading="lazy"` 를 붙이지 마라.** 첫 화면 이미지는 `eager` + `fetchpriority="high"` 다. 이유: 첫 화면을 lazy로 두면 LCP가 오히려 나빠진다.
- **장식용 이미지에서 `alt` 속성 자체를 생략하지 마라.** `alt=""` 를 명시한다. 이유: 누락 시 스크린리더가 파일명을 읽는다.
- **IntersectionObserver로 lazy loading을 직접 구현하지 마라.** 이유: 대상 브라우저가 네이티브 지원하며, 직접 구현하면 코드만 늘고 접근성 문제가 생긴다.
- 스켈레톤을 스크린리더에 노출하지 마라 (`aria-hidden="true"`).
