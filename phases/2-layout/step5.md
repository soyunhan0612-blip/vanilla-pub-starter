# Step 5: layout-order

## 읽어야 할 파일

- `/docs/PRD.md` — 레이아웃 스켈레톤의 정의(영역 구조·그리드만, 스타일 비움)
- `/docs/ARCHITECTURE.md` — 적응형 전략, `--safe-bottom` 토큰
- `/src/pc/product-detail.html`, `/src/mo/product-detail.html` — 이전 step. 하단 고정 바 패턴을 이어간다
- `/src/assets/components/ecommerce/cart-summary.html`, `step-indicator.html`, `coupon.html`, `price.html`, `stepper.html`
- `/src/assets/components/common/form.html`, `empty.html`, `modal.html`, `product-card.html`(list 변형)

## 작업

이 step은 **4장**을 만든다: 장바구니 PC/MO, 주문결제 PC/MO.

### 1. 장바구니 — `src/pc/cart.html`, `src/mo/cart.html`

```
[스텝 인디케이터]        step-indicator (1단계)
[전체 선택 / 선택 삭제]
[장바구니 목록]
  └ 각 항목: 체크박스 + 상품이미지 + 상품명/옵션 + 수량(stepper) + 가격(price) + 삭제
[배송비 안내]
[주문 요약]             cart-summary
[주문하기 버튼]
```

**PC**: 목록 좌측 + 요약 우측 sticky 2단.
**MO**: 목록 1단 + **하단 고정 주문 바** (`--safe-bottom` 필수).

**반드시 포함할 것**:
- **빈 장바구니 상태** — `empty.html` 의 "장바구니 비어있음" 변형. 다음 행동(쇼핑하러 가기) CTA 포함
- 품절 항목 처리 — 체크박스 비활성 + "품절" 텍스트 + 삭제만 가능
- 삭제 확인 — `modal.html` 재사용

각 상품 행의 체크박스에 `<label>` 을 연결한다 (`sr-only` 로 "{상품명} 선택").
수량 변경·삭제 시 합계가 갱신된다는 것을 `role="status"` 로 알린다.

### 2. 주문/결제 — `src/pc/order.html`, `src/mo/order.html`

이커머스에서 **폼 접근성이 가장 중요한 페이지**다.

```
[스텝 인디케이터]        step-indicator (2단계)
[주문 상품 목록]         — 접기/펼치기 가능
[배송지 정보]
  └ 배송지 선택/신규입력, 우편번호 찾기(modal), 배송 요청사항
[배송 방법]
[쿠폰/포인트]           coupon
[결제 수단]
  └ 라디오 그룹 (카드/계좌이체/간편결제/휴대폰)
[결제 정보 동의]
  └ 필수/선택 약관 체크박스 + 전체동의
[최종 결제 금액]         cart-summary
[결제하기 버튼]
```

**폼 요구사항 — 전부 필수**:
- 모든 입력에 `<label for>` 연결. placeholder 대체 금지
- 관련 입력을 `<fieldset>` + `<legend>` 로 묶는다 (배송지, 결제 수단, 약관)
- 필수 항목은 `required` + 시각 표시 + `aria-required`
- 에러는 `aria-invalid` + `aria-describedby` 로 메시지 연결
- **약관 동의에서 "필수"와 "선택"을 텍스트로 구분한다.** 색상만으로 구분하지 마라
- 우편번호 찾기는 `modal.html` 재사용

**자동완성 힌트**: `autocomplete` 속성을 정확히 넣는다 (`name`, `tel`, `postal-code`, `street-address`, `address-level1` 등). 이커머스 주문 폼에서 이건 접근성이자 전환율 문제다.

### 3. SCSS

`src/assets/scss/pages/_cart.scss`, `_order.scss` 작성 후 엔트리 연결.

- PC 2단은 CSS Grid, 요약 영역 `position: sticky`
- MO 하단 고정 바는 `--safe-bottom` 반영, `<main>` 에 하단 여백 확보
- **색·그림자 금지.** 영역 경계는 `--color-border` 까지만

### 4. JS

**금액 계산·결제 로직을 구현하지 마라.** 서버·개발사 몫이다.

전체선택 체크박스 연동 같은 순수 UI 로직이 필요하면 `common/` 에 위임 방식으로 추가하되, 계산이 들어가면 `util/` 에 순수 함수로 두고 **테스트를 먼저 작성**하라.

## Acceptance Criteria

```bash
node --test "src/__tests__/**/*.test.js"
node tools/build.js
node tools/check.js
node tools/serve.js --smoke
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. `node tools/serve.js` 후 4장을 PC 1280px / MO 360px로 확인한다.
3. **키보드만으로 주문 폼 전체를 완주**할 수 있는지 확인한다. 이 페이지에서 막히면 구매가 불가능하다는 뜻이다.
4. `check.js` 의 폼 레이블 검사에서 에러 0건인지 확인한다.
5. MO에서 하단 고정 바가 홈 인디케이터에 가리지 않는지 확인한다.
6. 빈 장바구니 상태가 렌더되는지 확인한다.
7. `tools/vendor/axe.min.js` 로 4장 모두 violations 0건 확인.
8. 결과에 따라 `phases/2-layout/index.json` 의 해당 step을 업데이트한다 (completed / error / blocked + 사유).

## 금지사항

- **디자인 스타일을 입히지 마라.** 영역 구조와 그리드까지만.
- **금액 계산·결제 로직을 구현하지 마라.** 이유: 퍼블리싱 산출물은 데이터를 갖지 않으며, 잘못된 계산 코드가 이관되면 개발사가 신뢰하고 쓸 위험이 있다.
- **placeholder를 label 대신 쓰지 마라.** 입력 시작과 동시에 사라져 맥락을 잃는다.
- **필수/선택 약관을 색상만으로 구분하지 마라.** 텍스트로 명시한다 (WCAG 1.4.1).
- **`autocomplete` 속성을 빠뜨리지 마라.** 주문 폼에서 이건 접근성이자 전환율 문제다.
- **빈 장바구니 상태를 빠뜨리지 마라.** 실무에서 가장 자주 누락된다.
- **우편번호 찾기용 오버레이를 새로 만들지 마라.** `modal.html` 재사용.
- **MO 하단 고정 바에서 `--safe-bottom` 을 빠뜨리지 마라.**
- 새 컴포넌트를 만들지 마라. 필요하면 summary에 기록하라.
