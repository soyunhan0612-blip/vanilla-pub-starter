# Step 1: common-overlay

## 읽어야 할 파일

- `/docs/UI_GUIDE.md` — 색상 토큰, 애니메이션 규칙(opacity/transform만, 200ms, prefers-reduced-motion 대응)
- `/docs/ARCHITECTURE.md` — 레이어 규칙: `util/`(순수 로직) → `common/`(DOM 바인딩) → 엔트리
- `/CLAUDE.md` — CRITICAL 규칙 전체
- `src/assets/js/util/focus-trap.js` — **이 step의 핵심.** `nextFocusIndex`, `isFocusableSelector` 를 읽고 그 위에 DOM 바인딩을 얹는다. 로직을 다시 구현하지 마라
- `src/assets/components/common/button.html` — 이전 step의 마크업 규약과 클래스 네이밍을 맞춰라
- `src/assets/scss/abstracts/_mixins.scss`, `src/assets/scss/tokens/`

## 작업

### 1. `src/assets/components/common/modal.html`

3가지 변형을 한 fragment에 담는다:
- **기본** — 중앙 정렬 다이얼로그 (PC 주력)
- **풀스크린** — MO에서 전체 화면
- **바텀시트** — MO에서 하단에서 올라옴

각 변형은 `@variant` 로 문서화한다.

접근성 요구사항 — **전부 필수다**:
- 루트에 `role="dialog"` + `aria-modal="true"`
- `aria-labelledby` 로 제목 연결, 본문이 있으면 `aria-describedby`
- 닫기 버튼에 `aria-label="닫기"` (아이콘만 있는 경우)
- 열릴 때 첫 포커스 가능 요소로 포커스 이동, 닫힐 때 **열기 트리거로 포커스 복귀**
- Esc로 닫힌다
- 배경(backdrop) 클릭으로 닫힌다. 단 이건 보조 수단이며 닫기 버튼이 항상 있어야 한다
- 열려 있는 동안 배경 스크롤을 막는다

바텀시트는 `--safe-bottom`(safe-area-inset-bottom)을 반영해 홈 인디케이터에 가리지 않게 한다.

### 2. `src/assets/components/common/toast.html`

일시적 알림. 변형: 기본 / 성공 / 에러.

- 컨테이너에 `role="status"` `aria-live="polite"` (에러는 `role="alert"` `aria-live="assertive"`)
- **자동 사라짐 시간은 최소 5초.** 이유: WCAG 2.2.1(Timing Adjustable). 사용자가 읽을 시간을 줘야 한다
- 토스트가 화면의 다른 조작을 가리지 않게 배치한다

### 3. `src/assets/js/common/modal.js`

`util/focus-trap.js` 의 순수 로직을 DOM에 연결한다.

```js
// 시그니처 수준 지시 — 내부 구현은 재량
export function initModals(root)           // data-modal-open / data-modal-close 위임 바인딩
export function openModal(id)
export function closeModal(id)
```

**핵심 규칙**:
- 포커스 순환 계산은 반드시 `util/focus-trap.js` 의 `nextFocusIndex` 를 호출해서 한다. 여기서 인덱스 계산을 다시 짜지 마라
- 이벤트는 개별 요소가 아니라 **문서 레벨 위임**으로 바인딩한다. 이유: 페이지에 나중에 추가되는 모달도 동작해야 하고, 개발사가 마크업을 서버 템플릿으로 옮겨도 깨지지 않아야 한다
- 여러 모달이 중첩될 수 있다고 가정하고 스택으로 관리한다
- **PC 전용 분기를 넣지 마라.** PC/MO가 이 모듈을 공유한다

### 4. `src/assets/js/common/toast.js`

```js
export function showToast(message, options)   // { type, duration }
```

동일하게 위임 방식, PC/MO 공유.

### 5. SCSS

`src/assets/scss/common/_modal.scss`, `_toast.scss` 작성 후 엔트리에 연결.

애니메이션은 `opacity`/`transform` 만, 200ms, `ease-out`. `prefers-reduced-motion: reduce` 에서 비활성화(base reset에 전역 처리가 있다면 중복 선언 불필요).

### 6. 엔트리 연결

`src/assets/js/pc.js`, `mo.js` 에서 `initModals` 를 호출한다. 엔트리는 import + init 만 한다.

## Acceptance Criteria

```bash
node --test src/__tests__
node tools/build.js
node tools/check.js
node tools/serve.js --smoke
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. `node tools/serve.js` 로 띄우고 **키보드만으로** 검증한다:
   - 모달 열기 → 포커스가 모달 안으로 들어가는가
   - Tab을 계속 눌러 마지막 요소 다음에 첫 요소로 순환하는가
   - Esc로 닫히고 **포커스가 원래 트리거로 돌아오는가**
   - 모달이 열린 동안 배경 요소로 Tab이 새지 않는가
3. `tools/vendor/axe.min.js` 를 페이지에 로드해 violations 0건인지 확인한다.
4. 아키텍처 체크리스트:
   - `common/modal.js` 가 포커스 인덱스 계산을 직접 하지 않고 `util/focus-trap.js` 를 호출하는가?
   - `common/` 에 PC 전용 분기가 없는가?
   - 이벤트가 위임 방식인가?
5. 결과에 따라 `phases/1-components/index.json` 의 해당 step을 업데이트한다 (completed / error / blocked + 사유).

## 금지사항

- **`util/focus-trap.js` 의 로직을 `common/modal.js` 에 다시 구현하지 마라.** 이유: 순수 로직을 util에 분리한 유일한 목적이 테스트 가능성이며, 중복 구현하면 테스트가 실제 동작을 검증하지 못하게 된다.
- **`common/` 에 PC 전용 분기를 넣지 마라.** 이유: PC/MO가 동일 모듈을 공유하는 것이 적응형 유지보수 비용을 억제하는 유일한 장치다.
- **개별 요소에 이벤트를 직접 바인딩하지 마라.** 문서 레벨 위임을 쓴다. 이유: 개발사가 마크업을 서버 템플릿으로 옮기거나 동적으로 렌더링해도 동작해야 한다.
- **토스트 자동 사라짐을 5초 미만으로 두지 마라.** 이유: WCAG 2.2.1 위반.
- **모달을 닫기 버튼 없이 backdrop 클릭만으로 닫게 하지 마라.** 이유: 터치 기기와 스크린리더에서 발견 불가능하다.
- `util/` 파일을 수정하지 마라. 이 step은 `common/` 레이어다.
