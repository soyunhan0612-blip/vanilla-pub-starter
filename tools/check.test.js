'use strict';

/**
 * tools/check.js 회귀 테스트.
 *
 * check.js 는 이 저장소의 유일한 검증 경로다. 여기가 조용히 느슨해지면 다른
 * 모든 규칙이 함께 무력화되는데, 그동안 이 파일만 테스트가 없었다.
 * `--root=` 로 임시 픽스처 저장소를 겨눠 실제 프로세스를 돌린다.
 *
 * 환경변수가 아니라 인자인 이유는 check.js 의 ROOT 주석에 있다 — 환경변수는
 * 자식 프로세스로 상속되므로 유일한 관문을 조용히 갈아끼울 수 있다.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const CHECK = path.join(__dirname, 'check.js');

/** { 상대경로: 내용 } 으로 픽스처 저장소를 만들고 check.js 를 돌린다. */
function runCheck(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-'));
  try {
    for (const [relative, content] of Object.entries(files)) {
      const full = path.join(root, relative);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, 'utf8');
    }
    const result = spawnSync(process.execPath, [CHECK, `--root=${root}`], { encoding: 'utf8' });
    return { status: result.status, output: `${result.stdout || ''}${result.stderr || ''}` };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const passes = (files) => {
  const { status, output } = runCheck(files);
  assert.equal(status, 0, `통과해야 하는데 실패했다:\n${output}`);
};

const failsWith = (files, pattern) => {
  const { status, output } = runCheck(files);
  assert.equal(status, 1, `실패해야 하는데 통과했다:\n${output}`);
  assert.match(output, pattern);
};

/** 색·크기 검사와 무관한 오류가 섞이지 않도록 최소 요건을 갖춘 페이지. */
const page = (body) => `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>t</title>
</head>
<body><main><h1>t</h1>
${body}
</main></body>
</html>
`;

const SCSS = 'src/assets/scss/common/_c.scss';

// ---------------------------------------------------------------------------
// 색상 리터럴 (ADR-004)
// ---------------------------------------------------------------------------

test('색: SCSS 변수로 감싸도 잡는다', () => {
  failsWith({ [SCSS]: '$brand: #d92d20;\n' }, /색상 리터럴/);
});

test('색: 선언 값의 리터럴을 잡는다', () => {
  failsWith({ [SCSS]: '.a { color: rgba(0, 0, 0, 0.5); }\n' }, /색상 리터럴/);
});

test('색: tokens/ 는 리터럴이 허용되는 유일한 자리다', () => {
  passes({ 'src/assets/scss/tokens/_color.scss': ':root { --c: #ffffff; }\n' });
});

test('색: 블록 주석 안의 색은 위반이 아니다', () => {
  passes({ [SCSS]: '/* 원래 #d92d20 이었다 */\n.a { color: var(--c); }\n' });
});

test('색: 라인 주석 안의 색은 위반이 아니다', () => {
  passes({ [SCSS]: '.a {\n  // 원래 #ffffff\n  color: var(--c);\n}\n' });
});

test('색: id 선택자와 url(#…) SVG 참조는 색이 아니다', () => {
  passes({ [SCSS]: '#abc123 { color: var(--c); }\n.b { fill: url(#f00bad); }\n' });
});

test('색: id 선택자를 건너뛰되 같은 줄의 진짜 위반은 잡는다', () => {
  failsWith({ [SCSS]: '#abc123 { color: #fff; }\n' }, /색상 리터럴/);
});

test('색: 같은 줄에서 { 앞에 있는 선언도 잡는다', () => {
  // 첫 { 앞을 통째로 버리면 이 위반이 사라진다.
  failsWith({ [SCSS]: '$c: #ff0000; .a { color: var(--x); }\n' }, /색상 리터럴/);
});

test('색: 프로토콜 상대 URL 뒤의 색도 잡는다', () => {
  // url(//cdn/…) 의 // 를 주석으로 오인하면 줄 나머지가 통째로 사라진다.
  failsWith({ [SCSS]: '.a { background: url(//cdn/x.png) #ff0000; }\n' }, /색상 리터럴/);
});

test('색: 문자열 안의 // 뒤에 있는 색도 잡는다', () => {
  // content: "//" 의 // 를 주석으로 보면 뒤쪽 선언이 통째로 사라진다.
  // checkTddGuard 와 같은 파이프라인(문자열 → 주석)을 써야 강도가 같아진다.
  failsWith({ [SCSS]: '.a { content: "//"; color: #ff0000; }\n' }, /색상 리터럴/);
});

// ---------------------------------------------------------------------------
// 크기 리터럴
// ---------------------------------------------------------------------------

test('크기: 한 줄 규칙셋 안의 리터럴도 잡는다', () => {
  // 정규식을 줄 시작에 앵커하면 이 형태가 통째로 빠져나간다.
  failsWith({ [SCSS]: '.a { padding: 12px 16px; }\n' }, /크기 리터럴/);
});

test('크기: 토큰이 있는 속성 전부를 본다', () => {
  for (const declaration of ['font-size: 15px', 'border-radius: 8px', 'gap: 4px', 'margin: -4px']) {
    failsWith({ [SCSS]: `.a {\n  ${declaration};\n}\n` }, /크기 리터럴/);
  }
});

test('크기: 토큰이 없는 자리의 물리값은 막지 않는다', () => {
  passes({
    [SCSS]: [
      '.a { padding: var(--space-3) var(--space-4); }',
      '.b { border: 1px solid var(--color-border); }',
      '.c { transform: translateY(-2px); }',
      '.d { margin: 0; }',
      '@media (min-width: 768px) { .e { gap: var(--space-2); } }',
      '',
    ].join('\n'),
  });
});

test('크기: base/ 는 물리값이 정당한 계층이다 (iOS 입력 16px)', () => {
  passes({ 'src/assets/scss/base/_reset.scss': 'input { font-size: 16px; }\n' });
});

test('크기: rem·em 도 우회로가 되지 않는다', () => {
  // px 만 막으면 같은 값을 rem 으로 적어 토큰 단일 지점을 빠져나간다.
  for (const declaration of ['padding: 1.5rem', 'font-size: 0.875rem', 'gap: 2em']) {
    failsWith({ [SCSS]: `.a {\n  ${declaration};\n}\n` }, /크기 리터럴/);
  }
});

test('크기: 프로토콜 상대 URL 뒤의 크기도 잡는다', () => {
  failsWith({ [SCSS]: '.a { background: url(//cdn/x.png); padding: 12px; }\n' }, /크기 리터럴/);
});

test('크기: 위치 오프셋으로 옮겨 적어도 빠져나가지 못한다', () => {
  // padding 만 막으면 같은 값을 top/left 로 옮겨 토큰 단일 지점을 우회한다.
  for (const declaration of ['top: 12px', 'left: 4px', 'inset: 8px', 'bottom: 0.5rem']) {
    failsWith({ [SCSS]: `.a {\n  position: absolute;\n  ${declaration};\n}\n` }, /크기 리터럴/);
  }
});

test('크기: 토큰이 없는 width/height 는 계속 허용한다', () => {
  // UI_GUIDE.md 의 최소 터치 영역 44×44px — 과잉 차단하면 가이드 자체가 위반이 된다.
  passes({ [SCSS]: '.a { min-width: 44px; min-height: 44px; width: 320px; }\n' });
});

// ---------------------------------------------------------------------------
// 폼 레이블 (WCAG 1.3.1)
// ---------------------------------------------------------------------------

test('레이블: 유효한 연결 네 형태를 모두 통과시킨다', () => {
  passes({
    'src/p.html': page(
      [
        '<label for="a">이름</label><input type="text" id="a">',
        '<label>메일 <input type="email" id="b"></label>',
        '<input type="search" aria-label="검색어">',
        '<input type="tel" aria-labelledby="a">',
      ].join('\n')
    ),
  });
});

test('레이블: id 만 있고 가리키는 label 이 없으면 잡는다', () => {
  // id 존재만 확인하면 레이블 없는 입력이 그대로 통과한다.
  failsWith({ 'src/p.html': page('<input type="text" id="orphan">') }, /레이블이 연결되지 않았다/);
});

test('레이블: 아무 연결도 없으면 잡는다', () => {
  failsWith({ 'src/p.html': page('<input type="password">') }, /레이블이 연결되지 않았다/);
});

test('레이블: select·textarea 도 연결되어 있으면 통과한다', () => {
  passes({
    'src/p.html': page(
      [
        '<label for="a">요청사항</label><textarea id="a"></textarea>',
        '<label>사이즈 <select id="b"><option>M</option></select></label>',
      ].join('\n')
    ),
  });
});

test('레이블: 연결되지 않은 select 를 잡는다', () => {
  // 이커머스 폼에서 가장 흔한 옵션 필드다. input 만 보면 통째로 빠진다.
  failsWith(
    { 'src/p.html': page('<select id="size"><option>M</option></select>') },
    /레이블이 연결되지 않았다/
  );
});

test('레이블: 연결되지 않은 textarea 를 잡는다', () => {
  failsWith({ 'src/p.html': page('<textarea></textarea>') }, /레이블이 연결되지 않았다/);
});

// ---------------------------------------------------------------------------
// 도구 테스트 강제 — 훅의 TDD 가드가 보지 않는 범위
// ---------------------------------------------------------------------------

/** 가드를 실제로 충족하는 최소 테스트 파일. */
const REAL_TEST = "const test = require('node:test');\ntest('t', () => {});\n";

test('도구: 테스트 없는 tools/*.js 를 잡는다', () => {
  failsWith({ 'tools/serve.js': 'module.exports = {};\n' }, /tools\/serve\.test\.js/);
});

test('도구: 형제 테스트가 있으면 통과한다', () => {
  passes({ 'tools/serve.js': 'module.exports = {};\n', 'tools/serve.test.js': REAL_TEST });
});

test('도구: __tests__/ 에 둬도 통과한다', () => {
  passes({
    'tools/serve.js': 'module.exports = {};\n',
    'tools/__tests__/serve.test.js': REAL_TEST,
  });
});

test('도구: 빈 테스트 파일은 가드를 충족하지 않는다', () => {
  // 파일명만 보면 빈 파일 하나로 가드가 조용히 만족된다 — 가드가 아니게 된다.
  failsWith(
    { 'tools/serve.js': 'module.exports = {};\n', 'tools/serve.test.js': '\n' },
    /테스트가 하나도 없다/
  );
});

test('도구: vendor/ 의 서드파티는 면제한다', () => {
  // 동봉한 dart-sass·axe-core 에 테스트를 요구할 수는 없다.
  passes({ 'tools/vendor/axe.min.js': '/* third party */\n' });
});

// ---------------------------------------------------------------------------
// util/ 레이어 (AGENTS.md CRITICAL)
// ---------------------------------------------------------------------------

const UTIL = 'src/assets/js/util/u.js';
const UTIL_TEST = 'src/__tests__/u.test.js';

test('util: 테스트 파일이 없으면 잡는다', () => {
  failsWith({ [UTIL]: 'export const a = 1;\n' }, /테스트 파일이 없다/);
});

test('util: DOM 참조를 잡는다', () => {
  failsWith({ [UTIL]: 'export const t = () => document.title;\n', [UTIL_TEST]: '' }, /document/);
});

test('util: URL 뒤에 숨은 DOM 참조도 잡는다', () => {
  // '//' 를 무조건 주석으로 보면 https:// 뒤가 통째로 사라져 위반이 통과한다.
  failsWith(
    {
      [UTIL]: "const API = 'https://x';\nexport const t = () => document.title;\n",
      [UTIL_TEST]: '',
    },
    /document/
  );
});

test('util: 문자열 안 // 뒤에 숨은 DOM 참조도 잡는다', () => {
  // 프로토콜 상대 URL 의 // 를 주석으로 보면 같은 줄 뒤쪽이 통째로 사라진다.
  failsWith(
    {
      [UTIL]: "export const t = () => { const u = '//api/x'; return document.title; };\n",
      [UTIL_TEST]: '',
    },
    /document/
  );
});

test('util: 주석 안의 document 는 위반이 아니다', () => {
  passes({
    [UTIL]: '// document 를 쓰지 마라\n/* window 도 마찬가지다 */\nexport const a = 1;\n',
    [UTIL_TEST]: '',
  });
});

test('util: 문자열 안의 document 는 위반이 아니다', () => {
  // 문자열을 비우고 나면 남는 // 는 예외 없이 주석이다 — 그 부작용으로 이것도 통과한다.
  passes({ [UTIL]: "export const msg = 'document 를 쓰지 마라';\n", [UTIL_TEST]: '' });
});

test('util: 템플릿 리터럴 보간 안의 DOM 참조를 잡는다', () => {
  // ${...} 는 문자열이 아니라 코드다. 통째로 덮으면 오탐을 없애려던 처리가
  // 정반대로 CRITICAL 위반을 통과시킨다.
  failsWith(
    { [UTIL]: 'export const t = () => `${document.title}`;\n', [UTIL_TEST]: '' },
    /document/
  );
});

test('util: 템플릿 리터럴의 문자열 부분은 여전히 위반이 아니다', () => {
  passes({ [UTIL]: 'export const msg = `document 를 쓰지 마라`;\n', [UTIL_TEST]: '' });
});

// ---------------------------------------------------------------------------
// --root= — 유일한 관문을 통째로 돌리는 스위치이므로 조용하면 안 된다
// ---------------------------------------------------------------------------

test('--root= 로 겨눈 경로를 출력한다', () => {
  const { output } = runCheck({});
  assert.match(output, /--root=/);
});

test('환경변수로는 검사 대상을 갈아끼울 수 없다', () => {
  // 환경변수는 자식 프로세스로 상속된다. 유일한 관문이 그렇게 우회되면,
  // Stop 훅은 exit 0 만 보고 stdout 을 버리므로 아무도 알아채지 못한다.
  // 위반이 든 트리를 인자로, 빈 트리를 환경변수로 겨눈다 — 환경변수가 이기면 통과해버린다.
  const violating = fs.mkdtempSync(path.join(os.tmpdir(), 'check-arg-'));
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'check-env-'));
  try {
    const scss = path.join(violating, SCSS);
    fs.mkdirSync(path.dirname(scss), { recursive: true });
    fs.writeFileSync(scss, '$brand: #d92d20;\n', 'utf8');

    const result = spawnSync(process.execPath, [CHECK, `--root=${violating}`], {
      encoding: 'utf8',
      env: { ...process.env, CHECK_ROOT: empty },
    });
    assert.equal(result.status, 1, 'CHECK_ROOT 가 --root= 를 덮어써 빈 트리를 검사했다');
  } finally {
    for (const dir of [violating, empty]) fs.rmSync(dir, { recursive: true, force: true });
  }
});
