# Step 6: ecommerce-order

## 읽어야 할 파일

- `/docs/UI_GUIDE.md` — 색상 토큰, 타이포 스케일(가격 17px/700)
- `/docs/ARCHITECTURE.md` — 적응형 전략, `--safe-bottom` 토큰
- `/src/assets/components/ecommerce/price.html` — **가격 표시는 반드시 이것을 재사용한다.** 주문 합계에서 가격 마크업을 다시 짜지 마라
- `/src/assets/components/ecommerce/stepper.html` — 장바구니 수량 조절에 재사용
- `/src/assets/components/common/form.html` — 쿠폰 입력·주소 입력 마크업 규약
- `/src/assets/components/common/button.html` — CTA 버튼 규약
- `src/assets/scss/tokens/`, `src/assets/scss/abstracts/_mixins.scss`

## 작업

### 1. `src/assets/components/ecommerce/step-indicator.html`

주문 흐름(장바구니 → 주문/결제 → 완료)의 현재 위치 표시.

- `<nav aria-label="주문 진행 단계">` + `<ol>`
- 현재 단계에 `aria-current="step"`
- 완료된 단계 / 현재 단계 / 남은 단계를 **시각 표시만이 아니라 텍스트로도 구분**한다 (`sr-only` 로 "완료", "현재 단계")
- MO에서 단계명이 길 때 처리 방법을 정한다 (번호만 표시 + 현재 단계명만 노출 등)

### 2. `src/assets/components/ecommerce/cart-summary.html`

주문 금액 요약. **이커머스에서 금액 오류는 가장 치명적인 버그이므로 구조를 명확히 한다.**

- 상품금액 / 배송비 / 할인금액 / **최종 결제금액** 을 `<dl>` 구조로 표현한다 (항목-값 쌍이므로 의미적으로 맞다)
- 최종 결제금액은 시각적으로도 의미적으로도 강조한다
- 각 금액에 `data-bind` 마커
- 무료배송 조건 안내("N원 더 담으면 무료배송") 자리를 제공한다
- 가격 표기는 `price.html` 재사용

**PC/MO 배치 차이**:
- PC: 우측 사이드바에 `position: sticky` 로 고정
- MO: **하단 고정 바**. 이때 `--safe-bottom`(safe-area-inset-bottom)을 반드시 반영한다. 반영하지 않으면 아이폰 홈 인디케이터에 결제 버튼이 가린다
- 하단 고정 바가 콘텐츠 마지막을 가리지 않도록 본문에 하단 여백을 확보하는 방법을 주석에 명시한다

### 3. `src/assets/components/ecommerce/coupon.html`

- 쿠폰 코드 입력 + 적용 버튼 (`common/form.html` 규약)
- 보유 쿠폰 목록에서 선택하는 변형 (`@variant list`)
- **적용 결과 피드백**: 성공/실패 메시지를 `role="status"` / `role="alert"` 로 전달한다. 시각적 색상만으로 성공·실패를 구분하지 마라 (WCAG 1.4.1)
- 적용된 쿠폰 해제 버튼

### 4. SCSS + 엔트리 연결

`src/assets/scss/ecommerce/_step-indicator.scss`, `_cart-summary.scss`, `_coupon.scss` 작성 후 엔트리 연결.

MO 하단 고정 바:
```scss
padding-bottom: calc(var(--space-4) + var(--safe-bottom));
```

### 5. JS

새 모듈이 꼭 필요한지 먼저 판단하라. 수량 조절은 `stepper.js`, 쿠폰 목록 열기는 `modal.js` 로 충분하다. **금액 계산 로직은 구현하지 마라** — 서버·개발사 몫이다.

만약 순수 계산 함수가 필요하다고 판단되면 `util/` 에 두고 **테스트를 먼저 작성**하라 (`tdd-guard.sh` 가 강제한다).

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
   - 360px에서 하단 고정 결제 바가 콘텐츠를 가리지 않는가
   - 1280px에서 sticky 요약이 스크롤을 따라오는가
   - 긴 상품명·큰 금액에서 레이아웃이 깨지지 않는가
3. **iOS Safari 실기기 또는 에뮬레이터**에서 하단 고정 바가 홈 인디케이터에 가리지 않는지 확인한다. 이 검증은 `--safe-bottom` 이 실제로 먹었는지 확인하는 유일한 방법이다.
4. 쿠폰 적용 실패 메시지가 색상 없이도(흑백으로 봐도) 이해되는지 확인한다.
5. `tools/vendor/axe.min.js` 로 violations 0건 확인.
6. 결과에 따라 `phases/1-components/index.json` 의 해당 step을 업데이트한다 (completed / error / blocked + 사유).

## 금지사항

- **MO 하단 고정 바에서 `--safe-bottom` 을 빠뜨리지 마라.** 이유: 아이폰에서 결제 버튼이 홈 인디케이터에 가려 눌리지 않는다. 이커머스에서 이건 매출 손실로 직결된다.
- **가격 마크업을 새로 짜지 마라.** `price.html` 을 재사용한다. 이유: 가격 표기가 두 벌이 되면 통화·천단위·할인 표시 규칙이 갈라진다.
- **성공/실패를 색상만으로 구분하지 마라.** 아이콘 또는 텍스트를 병행한다 (WCAG 1.4.1).
- **금액 계산 로직을 구현하지 마라.** 이유: 퍼블리싱 산출물은 데이터를 갖지 않으며, 잘못된 계산 코드가 이관되면 개발사가 그것을 신뢰하고 쓸 위험이 있다.
- **최종 결제금액을 다른 금액과 같은 시각 위계로 두지 마라.** 사용자가 실제로 결제할 금액이 무엇인지 즉시 알아야 한다.
- 색·크기 리터럴 금지. `ecommerce/` 컴포넌트를 `common/` 에 넣지 마라.
