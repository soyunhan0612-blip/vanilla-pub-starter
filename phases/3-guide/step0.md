# Step 0: guide-generator

## 읽어야 할 파일

- `/docs/ADR.md` — **ADR-006을 반드시 읽어라.** Storybook을 채택하지 않고 자동 생성을 택한 이유가 이 step의 설계 근거다
- `/docs/ARCHITECTURE.md` — 빌드 파이프라인
- `/tools/build.js` — **이 파일에 기능을 추가한다.** 새 파일을 만들지 마라
- `/tools/include.js` — `@component` 주석 제거 로직이 이미 있다. 파싱 규칙을 여기와 일치시켜라
- `/tools/check.js` — `checkComponentDocs()` 가 `@component` 주석 존재를 강제한다
- `/src/assets/components/` 전체 — 파싱 대상. **실제 주석 형식을 눈으로 확인하고 그것에 맞춰라**
- `/tools/vendor/axe.min.js` — 가이드 페이지에 로드할 접근성 검사기

## 배경

Storybook을 쓰지 않는다. 컴포넌트 fragment의 `@component` 주석 자체가 문서 소스이고, `build.js` 가 이를 파싱해 두 산출물을 **자동 생성**한다. 컴포넌트를 추가하면 등록 작업 없이 자동 반영되는 것이 이 설계의 핵심이다.

## 작업

### 1. `@component` 주석 파서

`tools/build.js` 에 추가한다. 파싱 대상 태그:

| 태그 | 의미 | 필수 |
|---|---|---|
| `@component` | 컴포넌트 이름 (한국어) | 필수 |
| `@category` | common / ecommerce / layout | 필수 |
| `@variant` | 변형 목록 (`\|` 구분) | 선택 |
| `@size` | 크기 목록 | 선택 |
| `@a11y` | 접근성 주의사항 | 선택 |
| `@snippet` | 에디터 스니펫 트리거 문자열 | 선택 |

파서 요구사항:
- 여러 줄에 걸친 태그 값을 지원한다
- 태그가 없는 컴포넌트를 만나면 **에러가 아니라 경고**를 내고 건너뛴다 (`check.js` 가 이미 에러로 잡으므로 중복 실패시키지 않는다)
- 파싱 결과를 중간 자료구조로 만들어 두 생성기가 공유한다

### 2. `src/guide.html` 생성

정적 HTML 한 장으로 생성한다. **런타임에 fetch로 컴포넌트를 불러오지 말고, 생성 시점에 마크업을 인라인으로 박아라.** 이유: 파일을 그대로 개발사에 넘겨야 하는데 fetch 방식은 서버 없이 열면 CORS로 깨진다.

구성:

**(1) 컴포넌트 카탈로그**
- `@category` 별로 섹션 분리 (common / ecommerce / layout)
- 각 컴포넌트마다: 이름, 렌더된 실물, **마크업 소스 코드**(복사 버튼), variant/size/a11y 메타 정보
- 마크업 소스는 `<pre><code>` 에 이스케이프해서 넣는다

**(2) 레이아웃 케이스**
- `src/pc/*.html`, `src/mo/*.html` 14장을 `<iframe>` 으로 미리보기
- **뷰포트 토글 버튼**: 360 / 768 / 1024 / 1280px 로 iframe 폭을 바꾼다
- iframe 은 `loading="lazy"` (14개를 동시에 로드하면 느리다)

**(3) 디자인 토큰 표**
- `src/assets/scss/tokens/` 를 파싱해 CSS 변수 목록을 표로 출력한다
- 색상은 색상 칩을 함께 표시하고, `@contrast` 선언이 있는 쌍은 **계산된 대비값을 표시**한다
- 시안 수령 시 어디를 고쳐야 하는지가 이 표에서 바로 보여야 한다

**(4) 접근성 검사**
- `tools/vendor/axe.min.js` 를 `<script>` 로 로드
- 페이지 로드 후 axe를 실행해 결과를 화면에 표시한다 (위반 개수 + 상세)
- **npm 없이 동작해야 한다.** CDN을 참조하지 마라

가이드 페이지 자체의 스타일은 `assets/css/` 를 쓰지 말고 **인라인 `<style>` 로 자체 완결**시킨다. 이유: 프로젝트 CSS가 바뀌면 가이드 레이아웃이 깨지고, 가이드가 컴포넌트 스타일을 오염시킬 수도 있다. 단 컴포넌트 미리보기 영역에는 `pc.css`/`mo.css` 를 로드해야 실물이 보인다 — iframe 또는 스코프 처리 방법을 정하라.

### 3. `.vscode/publishing.code-snippets` 생성

`@snippet` 태그가 있는 컴포넌트만 대상으로 한다.

```json
{
  "버튼": {
    "scope": "html",
    "prefix": "btn",
    "body": ["<button type=\"button\" class=\"btn btn--${1|primary,secondary,outline,text|} btn--${2|sm,md,lg|}\">${3:버튼}</button>"],
    "description": "버튼 — primary | secondary | outline | text"
  }
}
```

- `@variant`/`@size` 가 있으면 **VS Code choice 문법(`${1|a,b,c|}`)으로 변환**한다. 현업에서 타이핑 시 변형을 바로 고를 수 있어야 체감 효과가 난다
- 텍스트 콘텐츠는 탭 정지점(`${3:...}`)으로 만든다
- JSON 이스케이프를 정확히 처리하라

### 4. `check.js` 연동 확인

`guide.html` 은 생성물이므로 `check.js` 의 HTML 검사 대상에서 제외되어 있다. 이미 그렇게 되어 있는지 확인하고, 아니면 최소한으로 수정하라.

## Acceptance Criteria

```bash
node tools/build.js
node tools/check.js
node tools/serve.js --smoke
```

빌드 후 `src/guide.html` 과 `.vscode/publishing.code-snippets` 가 생성되어야 한다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. **생성된 `src/guide.html` 을 `file://` 로 직접 열어본다** (서버 없이). 컴포넌트 카탈로그와 토큰 표가 보여야 한다. 깨지면 fetch 방식을 쓴 것이므로 인라인으로 고쳐라.
3. `node tools/serve.js --timeout=120` 으로 띄우고 확인한다 (**bare `node tools/serve.js` 를 쓰지 마라** — 스스로 끝나지 않아 하네스가 그 프로세스에 붙잡힌다):
   - 레이아웃 iframe 14개가 보이는가
   - 뷰포트 토글이 동작하는가
   - axe 결과가 화면에 표시되는가
4. `.vscode/publishing.code-snippets` 를 VS Code에서 실제로 써본다. `btn` 입력 → 버튼 마크업 + 변형 선택이 뜨는가.
5. **컴포넌트를 하나 임시로 추가하고 다시 빌드해, 등록 작업 없이 가이드와 스니펫에 자동 반영되는지 확인한다.** 이게 이 step의 핵심 가치다. 확인 후 임시 컴포넌트는 삭제한다.
6. 결과에 따라 `phases/3-guide/index.json` 의 해당 step을 업데이트한다 (completed / error / blocked + 사유).

## 금지사항

- **Storybook·Fractal·KSS 등 스타일가이드 도구를 도입하지 마라.** ADR-006에 채택하지 않은 이유가 기록되어 있다.
- **가이드 페이지에서 컴포넌트를 `fetch` 로 불러오지 마라.** 생성 시점에 인라인으로 박는다. 이유: 개발사가 파일을 그대로 열었을 때 CORS로 깨진다.
- **axe를 CDN에서 로드하지 마라.** `tools/vendor/axe.min.js` 를 쓴다. 이유: 폐쇄망에서 동작해야 한다.
- **`tools/` 에 새 파일을 만들지 마라.** `build.js` 에 기능을 추가한다.
- **`@component` 주석이 없다고 빌드를 실패시키지 마라.** 경고 후 건너뛴다. `check.js` 가 이미 에러로 처리하므로 중복이다.
- **`guide.html` 을 손으로 편집하지 마라.** 생성물이며 다음 빌드에 덮어쓰인다.
- 외부 npm 패키지를 `require` 하지 마라.
