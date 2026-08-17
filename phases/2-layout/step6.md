# Step 6: layout-mypage

## 읽어야 할 파일

- `/docs/PRD.md` — 레이아웃 스켈레톤의 정의(영역 구조·그리드만, 스타일 비움)
- `/docs/ARCHITECTURE.md` — 적응형 전략
- `/src/pc/order.html`, `/src/mo/order.html` — 이전 step. 폼 마크업 규약을 그대로 이어간다
- `/src/assets/components/common/tab.html`, `accordion.html`, `pagination.html`, `empty.html`, `breadcrumb.html`
- `/src/assets/components/ecommerce/product-card.html`(list 변형), `price.html`, `step-indicator.html`, `review.html`

## 작업

### 1. `src/pc/mypage.html`

PC 마이페이지는 **좌측 메뉴 + 우측 콘텐츠 2단**이 표준이다.

```
[브레드크럼]
┌──────────────┬────────────────────────────┐
│ [사이드 메뉴]   │ [회원 요약]                  │
│  주문/배송조회  │   등급·포인트·쿠폰 개수         │
│  취소/반품/교환 │ [최근 주문 내역]              │
│  찜한 상품     │   주문번호·날짜·상품·상태·버튼   │
│  리뷰 관리     │ [바로가기 카드]               │
│  쿠폰/포인트   │                            │
│  회원정보 수정  │                            │
│  배송지 관리   │                            │
└──────────────┴────────────────────────────┘
```

사이드 메뉴는 `<nav aria-label="마이페이지 메뉴">`, 현재 항목에 `aria-current="page"`.

**주문 내역 목록**은 `<table>` 이 아니라 카드/리스트 구조를 권장한다. MO에서 테이블은 거의 항상 깨진다. 다만 **주문 상태 이력처럼 진짜 표 데이터라면 `<table>` + `<caption>` + `<th scope>` 를 제대로 쓴다.**

주문 상태(결제완료/배송준비/배송중/배송완료)는 `step-indicator` 또는 배지로 표현하되 **색상만으로 구분하지 마라.**

### 2. `src/mo/mypage.html`

```
[회원 요약]           — 등급·포인트·쿠폰
[빠른 메뉴 그리드]     — 아이콘 4~6개
[최근 주문 내역]       — 카드 리스트
[전체 메뉴 목록]       — accordion 또는 리스트
```

MO는 사이드 메뉴 대신 **세로 목록**으로 간다.

### 3. 반드시 포함할 상태

- **빈 주문 내역** — `empty.html` 의 "주문 내역 없음" 변형 + 쇼핑하러 가기 CTA
- **비로그인 상태** — 로그인 유도 영역. 이유: 마이페이지는 비로그인 진입이 잦은데 시안에 없는 경우가 많다
- 각 상태를 주석으로 감싸 페이지 하단에 함께 배치한다

### 4. SCSS

`src/assets/scss/pages/_mypage.scss` 작성 후 엔트리 연결.

- PC 2단은 CSS Grid, 사이드 고정폭 + 본문 가변
- **테이블을 쓴 곳이 있다면** MO에서 가로 스크롤 컨테이너(`overflow-x: auto`)로 감싸고, 컨테이너에 `tabindex="0"` + `role="region"` + `aria-label` 을 붙여 키보드로 스크롤 가능하게 한다
- **색·그림자 금지.** 영역 경계는 `--color-border` 까지만

### 5. JS

새 모듈이 필요 없어야 정상이다. 탭·아코디언은 기존 모듈로 처리된다.

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
3. 320px까지 좁혀도 가로 스크롤이 없는지 확인한다. **테이블을 썼다면 표만 자체 스크롤되고 페이지는 스크롤되지 않아야 한다.**
4. 빈 주문 내역·비로그인 상태가 렌더되는지 확인한다.
5. `tools/vendor/axe.min.js` 로 violations 0건 확인.
6. **이 step이 phase 2의 마지막이다.** 14장 전체(`src/pc/*.html` 7장 + `src/mo/*.html` 7장)가 존재하고 `check.js` 를 통과하는지 확인한다.
7. 결과에 따라 `phases/2-layout/index.json` 의 해당 step을 업데이트한다 (completed / error / blocked + 사유).

## 금지사항

- **디자인 스타일을 입히지 마라.** 영역 구조와 그리드까지만.
- **주문 내역을 `<table>` 로 만들고 MO 대응을 하지 마라.** 카드/리스트를 권장하며, 표를 쓴다면 가로 스크롤 컨테이너와 키보드 접근을 반드시 갖춰라.
- **주문 상태를 색상만으로 구분하지 마라.** 텍스트를 병행한다 (WCAG 1.4.1).
- **비로그인 상태를 빠뜨리지 마라.** 마이페이지는 비로그인 진입이 잦다.
- **회원 개인정보를 더미로라도 실제처럼 보이게 채우지 마라.** 명백한 자리표시자(`홍길동`, `010-0000-0000`)를 쓴다. 이유: 이관 시 실제 데이터로 오인될 수 있다.
- **컴포넌트 마크업을 복붙하지 마라.** `@include` 로 참조한다.
- 새 컴포넌트를 만들지 마라. 필요하면 summary에 기록하라.
