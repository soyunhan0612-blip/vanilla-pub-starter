# UI 디자인 가이드

> 시안 부재 상태의 **플레이스홀더 기준**이다. Figma 수령 시 `src/assets/scss/tokens/` 의 값만 교체하면 전체가 따라온다. 아래 색상은 전부 명도 대비 4.5:1 이상을 만족하도록 선별했으며 `tools/check.js` 가 이를 강제한다.

## 디자인 원칙

1. **상품이 주인공이고 UI는 비켜선다.** 이커머스는 도구다. 장식이 상품 이미지보다 눈에 띄면 실패다.
2. **상태가 보이는 것이 예쁜 것보다 중요하다.** hover/focus/disabled/error/loading/empty 를 전부 정의한다.
3. **키보드만으로 전부 조작 가능해야 한다.** 마우스 없이 구매를 완료할 수 있어야 한다.

## AI 슬롭 안티패턴 — 하지 마라

| 금지 사항 | 이유 |
|-----------|------|
| backdrop-filter: blur() | glass morphism은 AI 템플릿의 가장 흔한 징후 |
| gradient-text (배경 그라데이션 텍스트) | AI가 만든 SaaS 랜딩의 1번 특징 |
| "Powered by AI" 배지 | 기능이 아니라 장식. 사용자에게 가치 없음 |
| box-shadow 글로우 애니메이션 | 네온 글로우 = AI 슬롭 |
| 보라/인디고 브랜드 색상 | "AI = 보라색" 클리셰 |
| 모든 카드에 동일한 rounded-2xl | 균일한 둥근 모서리는 템플릿 느낌 |
| 배경 gradient orb (blur-3xl 원형) | 모든 AI 랜딩 페이지에 있는 장식 |

`tools/check.js` 가 위 항목 중 CSS로 검출 가능한 것을 자동 차단한다.

## 색상

### 배경
| 용도 | 토큰 | 값 |
|------|------|------|
| 페이지 | `--color-bg-page` | #ffffff |
| 카드/서브 | `--color-bg-surface` | #fafafa |
| muted | `--color-bg-muted` | #f5f5f5 |

### 텍스트
| 용도 | 토큰 | 값 | 페이지 배경 대비 |
|------|------|------|------|
| 강조 | `--color-text-strong` | #171717 | 17.9:1 |
| 본문 | `--color-text-body` | #404040 | 10.4:1 |
| 보조 | `--color-text-weak` | #737373 | 4.74:1 |
| 비활성 | `--color-text-disabled` | #a3a3a3 | 대비 요건 면제 (WCAG 1.4.3) |

### 경계
| 용도 | 토큰 | 값 |
|------|------|------|
| 기본 | `--color-border` | #e5e5e5 |
| 강조 | `--color-border-strong` | #d4d4d4 |

### 시맨틱
| 용도 | 토큰 | 값 | 대비 |
|------|------|------|------|
| 할인/에러 | `--color-danger` | #d92d20 | 4.83:1 |
| 성공/재고 | `--color-success` | #067647 | 5.69:1 |
| 정보/링크 | `--color-info` | #175cd3 | 5.99:1 |

**포인트 색은 할인 레드 하나뿐이다.** 보라/인디고는 안티패턴 목록에 따라 금지.

## 컴포넌트

### 카드
```
background: var(--color-bg-page);
border: 1px solid var(--color-border);
border-radius: var(--radius-md);   /* 8px — 카드마다 동일 반경을 쓰지 않는다 */
```

### 버튼
```
Primary:   bg var(--color-text-strong) / text #fff        (대비 17.9:1)
Secondary: bg transparent / border var(--color-border-strong)
Text:      color var(--color-text-weak) → hover var(--color-text-strong)
최소 터치 영역 44×44px (WCAG 2.5.5)
```

### 입력 필드
```
border: 1px solid var(--color-border-strong);
border-radius: var(--radius-sm);
padding: var(--space-3) var(--space-4);
font-size: 16px;   /* CRITICAL: iOS Safari 자동 확대 방지. 16px 미만 금지 */
```

## 타이포그래피

폰트 스택 (한글 포함, 웹폰트 없이 시스템 폰트):
```
-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo",
"Malgun Gothic", "맑은 고딕", sans-serif
```

| 용도 | 크기 / 굵기 |
|------|--------|
| 페이지 제목 | 28px / 600 (MO 22px) |
| 섹션 제목 | 20px / 600 (MO 18px) |
| 상품명 | 15px / 400 |
| 가격 | 17px / 700 |
| 본문 | 15px / 400, line-height 1.6 |
| 캡션 | 13px / 400 |

## 레이아웃

| 항목 | PC | MO |
|------|------|------|
| 컨텐츠 폭 | 1280px | 100% (768~1023은 max-width 767 중앙정렬) |
| 좌우 여백 | 40px | 16px |
| 정렬 | 좌측 정렬 기본 | 좌측 정렬 기본 |

간격 스케일은 4px 배수: `--space-1`(4) ~ `--space-10`(40).

## 애니메이션

- 허용: `opacity` / `transform` 전환만. 200ms, `ease-out`
- 그 외 모든 애니메이션 금지. 특히 글로우·펄스·플로팅
- `prefers-reduced-motion: reduce` 에서 전부 비활성화 (WCAG 2.3.3)

## 아이콘

- SVG 인라인, `stroke-width: 1.5`, `currentColor` 사용
- 아이콘 컨테이너(둥근 배경 박스)로 감싸지 않는다
- 의미를 전달하는 아이콘은 `aria-label` 필수. 장식용은 `aria-hidden="true"`
