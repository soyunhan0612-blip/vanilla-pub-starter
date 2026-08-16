# 아키텍처

## 2-tier 원칙

이 프로젝트를 관통하는 단 하나의 원칙. **Tier 1이 전부 없어도 뼈대는 100% 동작해야 한다.**

| | Tier 0 — 의존성 0 (필수) | Tier 1 — npm 필요 (선택) |
|---|---|---|
| SCSS 컴파일 | `tools/vendor/sass/` 단독 실행 파일 | `npm install sass` |
| 개발 서버 | `node tools/serve.js` | vite dev server |
| HTML 조립 | `tools/include.js` | — |
| 테스트 | `node --test` (Node 18+ 내장) | vitest |
| 검증 | `node tools/check.js` | eslint · stylelint · html-validate |
| 접근성 | vendored `axe.min.js` + check.js 대비 계산 | — |
| 카탈로그·스니펫 | `build.js` 자동 생성 | — |

## 디렉토리 구조

```
src/
├── pc/                     # PC HTML 7장 (@include 마커 포함)
├── mo/                     # MO HTML 7장 (동일 파일명)
├── guide.html              # 자동 생성 — 직접 편집 금지
├── assets/
│   ├── components/         # 마크업 단일 소스 + @component 주석 = 문서 소스
│   │   ├── layout/         # header-pc header-mo gnb-pc gnb-mo footer bottom-nav
│   │   ├── common/         # 범용 11종
│   │   └── ecommerce/      # 도메인 8종
│   ├── scss/
│   │   ├── abstracts/      # _variables(브레이크포인트) _mixins(respond-to 등)
│   │   ├── tokens/         # _color _typography _spacing _layout → CSS 변수로 출력
│   │   ├── base/           # _reset(iOS 대응) _base
│   │   ├── common/ ecommerce/ layout/ pages/
│   │   └── pc.scss  mo.scss
│   ├── css/                # 컴파일 산출물 — 커밋한다 (폐쇄망 안전망)
│   ├── js/
│   │   ├── util/           # 순수 로직. DOM 비의존. 테스트 강제
│   │   ├── common/         # DOM 바인딩 레이어
│   │   └── pc.js  mo.js    # 엔트리
│   └── img/
└── __tests__/              # node --test 대상
tools/                      # serve include build check ua-redirect + vendor/
.githooks/pre-commit
```

## 레이어 규칙

```
util/ (순수 로직, 테스트 필수)
  ↑ import
common/ (DOM 바인딩)
  ↑ import
pc.js / mo.js (엔트리 — import + init 만)
```

역방향 의존 금지. `util/` 은 아무것도 import 하지 않는다.

## 데이터 흐름

```
정적 마크업 (@include 로 조립)
  → 개발사가 서버 템플릿으로 이관
  → data-bind 로 표시된 지점에 실제 데이터 주입
```

퍼블리싱 산출물은 데이터를 갖지 않는다. **연동 지점만 `data-bind` 속성으로 표시**해 개발사가 즉시 식별할 수 있게 한다.

## 적응형 전략

| 구간 | 처리 |
|---|---|
| 360 ~ 767 | MO 레이아웃 (기준 375) |
| 768 ~ 1023 | MO 레이아웃을 `max-width: 767px` 중앙정렬 |
| 1024 ~ | PC 레이아웃 (컨텐츠 폭 1280) |

UA 분기 임계값 1024px. 판별 주체는 서버이며 `tools/ua-redirect.js` 는 참조 구현이다.

**HTML만 2벌이고 SCSS·JS는 단일 소스를 공유한다.** 이것이 적응형의 유지보수 비용을 억제하는 유일한 장치다.

## 빌드 파이프라인

```
node tools/build.js
├─ SCSS 컴파일   (npm sass → 동봉 바이너리 순으로 자동 감지)
├─ @include 해소 → dist/ 평면 HTML (이관 산출물)
├─ guide.html 생성        (@component 주석 파싱)
└─ .code-snippets 생성    (동일 소스)
```
