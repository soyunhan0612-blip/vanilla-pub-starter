# Step 2: js-core

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` — 레이어 규칙(`util/` → `common/` → 엔트리), 데이터 흐름
- `/CLAUDE.md` — CRITICAL: `util/` 은 DOM에 의존하지 않는다
- `/tools/check.js` — `checkTddGuard()` 를 읽어라. `util/` 의 `document`·`window` 참조를 검출해 **에러로 처리**하며, 테스트 파일이 없어도 에러다
- `/scripts/hooks/tdd-guard.sh` — 이 훅이 `assets/js/util/` 에 대해 테스트 선작성을 강제한다. 테스트 없이 구현 파일을 쓰려 하면 **차단된다**
- `/src/package.json` — 이전 step 산출물. `{ "type": "module" }` 한 줄이며, `src/` 아래를 ESM 스코프로 만드는 근거다
- 이전 step 산출물: `src/assets/scss/tokens/`, `tools/build.js`

## 작업

이 step은 **TDD로 진행한다.** 각 모듈마다 `src/__tests__/{name}.test.js` 를 먼저 쓰고, 그다음 구현을 쓴다. 순서를 지키지 않으면 훅에 차단된다.

테스트는 Node 내장 러너를 쓴다. **vitest·jest를 쓰지 마라.**

### 모듈 형식 — 이미 확정되어 있다. 다시 판단하지 마라

이전 step에서 `src/package.json` 에 `{ "type": "module" }` 이 만들어졌다. Node는 모듈 파일에서 위로 올라가며 가장 가까운 `package.json` 을 찾으므로, **`src/` 아래는 구현·테스트 모두 ESM이고 `tools/` 는 CommonJS로 남는다.** 이 분리가 있어야 CommonJS로 작성된 `tools/check.js` 가 계속 동작한다.

따라서 구현과 테스트를 모두 아래 형식으로 쓴다:

```js
// src/__tests__/validate.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEmail } from '../assets/js/util/validate.js';
```

```js
// src/assets/js/util/validate.js
export function validateEmail(value) { /* ... */ }
```

**상대 import 경로에 `.js` 확장자를 반드시 붙여라.** Node의 ESM 로더는 CommonJS와 달리 확장자 생략을 허용하지 않는다. `from '../assets/js/util/validate'` 는 `ERR_MODULE_NOT_FOUND` 로 실패한다.

이 방식은 `npm install` 없이 동작하며, 브라우저의 `<script type="module">` 로딩과도 무관하게 성립한다.

### 1. `src/assets/js/util/dom.js`

DOM을 **다루지 않는다.** 셀렉터 문자열 조립, 클래스명 계산, 속성값 파싱 같은 순수 함수만 둔다. 실제 `querySelector` 호출은 `common/` 의 몫이다.

예: `buildClassName(base, modifiers)`, `parseDataAttr(value)` 등. 필요한 것만 만들고 추측으로 늘리지 마라.

### 2. `src/assets/js/util/focus-trap.js`

모달·드로어의 포커스 가둠 **로직**만 담당한다. DOM에 접근하지 않고, 요소 배열을 입력받아 다음 포커스 대상 인덱스를 계산한다.

```js
// 시그니처 수준 지시 — 내부 구현은 재량
export function nextFocusIndex(count, current, direction)  // Tab/Shift+Tab 순환 인덱스
export function isFocusableSelector()                       // 포커스 가능 요소 셀렉터 문자열
```

**핵심 규칙**: 마지막 요소에서 Tab을 누르면 첫 요소로, 첫 요소에서 Shift+Tab을 누르면 마지막으로 순환해야 한다 (WCAG 2.1.2 키보드 트랩 방지의 정반대 — 모달 안에서는 의도적으로 가두되 Esc로 탈출 가능해야 한다). 경계 조건을 테스트로 전부 덮어라.

### 3. `src/assets/js/util/validate.js`

폼 검증 규칙. 이커머스에서 실제로 쓰는 것만:

```js
export function validateRequired(value)
export function validateEmail(value)
export function validatePhone(value)      // 한국 휴대폰 번호
export function validatePassword(value)   // 규칙은 주석으로 명시
export function formatPhone(value)        // 010-1234-5678 형태로 정규화
```

각 함수는 `{ valid: boolean, message: string }` 처럼 **일관된 형태**를 반환한다. 메시지는 한국어로, 사용자가 무엇을 고쳐야 하는지 알 수 있게 쓴다 ("올바르지 않습니다" 금지).

### 4. `src/assets/js/util/api.js`

개발사 연동을 위한 fetch 래퍼. **DOM에 접근하지 않으므로 util에 둔다.**

```js
export async function request(url, options)   // 타임아웃·에러 정규화·JSON 파싱
export function buildQuery(params)            // 쿼리스트링 조립 (순수 함수 — 테스트 대상)
export class ApiError extends Error {}        // status, code 를 갖는다
```

요구사항:
- 네트워크 오류·HTTP 오류·JSON 파싱 오류를 **모두 `ApiError` 로 정규화**한다. 호출부가 분기 하나로 처리할 수 있어야 한다
- 타임아웃을 지원한다 (`AbortController`)
- **`buildQuery` 는 순수 함수이므로 반드시 테스트한다.** `request` 는 네트워크에 의존하므로 테스트 대상에서 제외해도 된다

### 5. `data-bind` 규약 문서화

개발사가 API 데이터를 꽂을 지점을 마크업에서 식별할 수 있어야 한다. 규약을 정하고 `util/api.js` 상단 주석에 기록하라. 최소한 아래를 정의한다:

- `data-bind="product.name"` — 텍스트가 들어갈 지점
- `data-bind-src`, `data-bind-href` — 속성이 들어갈 지점
- `data-bind-list="products"` — 반복될 템플릿 루트

**실제 바인딩 구현은 하지 마라.** 퍼블리싱 산출물은 데이터를 갖지 않는다. 규약과 마커만 정의한다.

### 6. 엔트리 스텁

`src/assets/js/pc.js`, `mo.js` 는 이 step에서 빈 스텁으로 만든다. 아직 import할 `common/` 모듈이 없다.

## Acceptance Criteria

```bash
node --test src/__tests__
node tools/check.js
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. `util/` 의 모든 `.js` 파일에 대응하는 테스트 파일이 있는지 확인한다 (`check.js` 가 강제).
3. 아키텍처 체크리스트:
   - `util/` 어디에도 `document`·`window` 참조가 없는가?
   - `util/` 이 다른 모듈을 import 하지 않는가? (역방향 의존 금지)
   - 외부 npm 패키지를 쓰지 않았는가?
4. 결과에 따라 `phases/0-foundation/index.json` 의 해당 step을 업데이트한다 (completed / error / blocked + 사유).

## 금지사항

- **`util/` 에서 `document`·`window` 를 참조하지 마라.** 이유: jsdom 없이 `node --test` 로 검증해야 하며, 그것이 폐쇄망에서 테스트를 유지하는 유일한 조건이다. `check.js` 가 에러로 차단한다.
- **테스트보다 구현을 먼저 쓰지 마라.** `tdd-guard.sh` 훅이 파일 쓰기를 차단한다.
- **vitest·jest·jsdom 을 도입하지 마라.** 이유: npm 의존이며 폐쇄망에서 동작하지 않는다. `node --test` 만 쓴다.
- **`.mjs` 확장자를 쓰지 마라.** 전부 `.js` 다. 이유: `tools/check.js` 의 `checkTddGuard()` 가 `walk(utilDir, ['.js'])` 로 `.js` 만 순회한다. `.mjs` 로 두면 테스트 파일 존재 강제와 `document`/`window` 참조 검출이 **둘 다 조용히 무력화**되어, 검사를 통과했는데 실제로는 아무것도 검사되지 않은 상태가 된다.
- **root `package.json` 에 `"type": "module"` 을 넣지 마라.** ESM 선언은 `src/package.json` 에만 있다. 이유: root에 넣으면 `tools/*.js` 의 CommonJS 스코프를 덮어써 `node tools/check.js` 가 `require is not defined in ES module scope` 로 죽는다. 이 파일은 Stop 훅·pre-commit·모든 step의 AC가 호출하는 단일 진입점이다.
- **`require()` 로 테스트를 작성하지 마라.** `src/` 아래는 ESM이므로 `import` 를 쓴다.
- **`data-bind` 의 실제 바인딩 로직을 구현하지 마라.** 이유: 퍼블리싱 산출물은 데이터를 갖지 않으며, 이는 개발사 몫이다. 규약과 마커까지만.
- 추측으로 유틸 함수를 늘리지 마라. 위에 명시된 것만 만든다.
