#!/usr/bin/env node
/**
 * tools/check.js — 이 프로젝트의 단일 검증 경로.
 *
 * Claude Code Stop 훅 / .githooks/pre-commit / npm run check / 각 step의 AC가
 * 전부 이 파일 하나를 호출한다. 검증 로직이 Claude 훅이 아니라 평범한 Node
 * 스크립트에 살아 있어야 .claude/ 를 삭제해도 품질 기준이 남는다.
 *
 * 의존성 0 (Node 내장 모듈만). node_modules/ 가 있으면 Tier 1 도구를 추가로 돌린다.
 *
 * Usage: node tools/check.js [--quiet]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const QUIET = process.argv.includes('--quiet');

const errors = [];
const warnings = [];

const err = (file, msg) => errors.push({ file: rel(file), msg });
const warn = (file, msg) => warnings.push({ file: rel(file), msg });
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

// ---------- 파일 탐색 ----------

/** 재귀 디렉토리 순회. Node 18 호환을 위해 readdirSync recursive 옵션을 쓰지 않는다. */
function walk(dir, exts) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      out.push(...walk(full, exts));
    } else if (!exts || exts.includes(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

const read = (p) => fs.readFileSync(p, 'utf8');
/** HTML 주석을 제거한 사본. 주석 안의 예시 마크업이 검사에 걸리지 않게 한다. */
const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, '');

// ---------- 1. HTML ----------

function checkHtml(files) {
  for (const file of files) {
    const raw = read(file);
    const html = stripComments(raw);
    const isFragment = file.includes(`${path.sep}components${path.sep}`);

    if (!isFragment) {
      if (!/<html[^>]*\slang\s*=/i.test(html)) {
        err(file, '<html> 에 lang 속성이 없다 (WCAG 3.1.1)');
      }
      if (!/<h1[\s>]/i.test(html)) {
        warn(file, 'h1 이 없다 — 페이지마다 최상위 제목이 하나 있어야 한다');
      }
      const hasLandmark = /<(main|header|footer|nav)[\s>]/i.test(html);
      if (!hasLandmark) {
        err(file, '시맨틱 랜드마크(main/header/footer/nav)가 하나도 없다');
      }

      // iOS 노치·홈 인디케이터. base/_reset.scss 의 --safe-* 토큰 4개는 이 메타가
      // 없으면 env() 가 전부 0 을 돌려줘 조용히 무력화된다 — 실기기에서만 드러난다.
      const viewport = (html.match(/<meta[^>]*name\s*=\s*["']viewport["'][^>]*>/i) || [])[0];
      if (!viewport) {
        warn(file, '<meta name="viewport"> 가 없다 — 모바일에서 레이아웃이 축소된다');
      } else if (!/viewport-fit\s*=\s*cover/i.test(viewport)) {
        warn(
          file,
          'viewport 메타에 viewport-fit=cover 가 없다 — base/_reset.scss 의 --safe-* 토큰이 전부 0 이 된다'
        );
      }
    }

    // 인라인 style 의 색상 리터럴. SCSS 에만 차단을 걸어두면 마크업으로 새 나간다.
    // style 속성 자체를 막지는 않는다 — display:none 같은 용법까지 막으면 우회하게 된다.
    for (const m of html.matchAll(/\sstyle\s*=\s*["']([^"']*)["']/gi)) {
      if (COLOR_LITERAL.test(m[1])) {
        err(
          file,
          `인라인 style 에 색상 리터럴 사용: style="${m[1]}" — var(--...) 만 쓴다. ` +
            '재사용성이 토큰 단일 지점에 달려 있다'
        );
      }
    }

    // 중복 id
    const ids = [...html.matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    for (const id of new Set(dup)) err(file, `id 중복: "${id}"`);

    // heading 레벨 건너뛰기
    const levels = [...html.matchAll(/<h([1-6])[\s>]/gi)].map((m) => Number(m[1]));
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] - levels[i - 1] > 1) {
        warn(file, `heading 레벨 건너뜀: h${levels[i - 1]} → h${levels[i]}`);
        break;
      }
    }

    // 폼 레이블 연결
    for (const m of html.matchAll(/<input\b([^>]*)>/gi)) {
      const attrs = m[1];
      const type = (attrs.match(/type\s*=\s*["']([^"']+)["']/i) || [])[1] || 'text';
      if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type.toLowerCase())) continue;
      const hasLabel =
        /\sid\s*=/.test(attrs) || /aria-label/i.test(attrs) || /aria-labelledby/i.test(attrs);
      if (!hasLabel) {
        err(file, `<input type="${type}"> 에 레이블 연결 수단(id/aria-label)이 없다 (WCAG 1.3.1)`);
      }
    }
  }
}

// ---------- 2. 이미지 ----------

function checkImages(files) {
  for (const file of files) {
    const html = stripComments(read(file));
    for (const m of html.matchAll(/<img\b([^>]*)>/gi)) {
      const attrs = m[1];
      const src = (attrs.match(/src\s*=\s*["']([^"']*)["']/i) || [])[1] || '(src 없음)';
      if (!/\salt\s*=/i.test(attrs)) {
        err(file, `<img src="${src}"> 에 alt 가 없다 (WCAG 1.1.1). 장식용이면 alt="" 를 명시하라`);
      }
      if (!/\sloading\s*=/i.test(attrs)) {
        warn(file, `<img src="${src}"> 에 loading 속성이 없다 — 뷰포트 밖 이미지는 loading="lazy"`);
      }
      const hasSize = /\swidth\s*=/i.test(attrs) && /\sheight\s*=/i.test(attrs);
      if (!hasSize) {
        warn(file, `<img src="${src}"> 에 width/height 가 없다 — CLS 발생 원인`);
      }
    }
  }
}

// ---------- 3. include 마커 ----------

const INCLUDE_RE = /<!--\s*@include\s+([^\s]+?)\s*-->/g;

function checkIncludes(files) {
  const componentsDir = path.join(SRC, 'assets', 'components');
  for (const file of files) {
    for (const m of read(file).matchAll(INCLUDE_RE)) {
      const target = path.join(componentsDir, m[1].replace(/^components\//, ''));
      if (!fs.existsSync(target)) {
        err(file, `@include 대상이 없다: ${m[1]}`);
      }
    }
  }
}

// ---------- 4. SCSS 하드코딩 / 안티패턴 ----------

const COLOR_LITERAL = /(#[0-9a-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\()/i;

const ANTI_PATTERNS = [
  [/backdrop-filter\s*:\s*blur/i, 'backdrop-filter: blur() — glass morphism 금지 (UI_GUIDE.md)'],
  [/-webkit-background-clip\s*:\s*text/i, 'gradient-text 금지 (UI_GUIDE.md)'],
  [/text-shadow\s*:[^;]*\b(0\s+0|glow)/i, '글로우 텍스트 그림자 금지 (UI_GUIDE.md)'],
  [/filter\s*:\s*blur\(\s*[4-9]\d*px/i, 'blur-3xl 계열 배경 orb 금지 (UI_GUIDE.md)'],
];

function checkScss() {
  const scssDir = path.join(SRC, 'assets', 'scss');
  for (const file of walk(scssDir, ['.scss'])) {
    const isTokenFile = file.includes(`${path.sep}tokens${path.sep}`);
    const lines = read(file).split(/\r?\n/);

    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '').trim();
      if (!code) return;

      for (const [re, msg] of ANTI_PATTERNS) {
        if (re.test(code)) err(file, `${i + 1}행: ${msg}`);
      }

      // 토큰 파일 밖에서 색상 리터럴 금지
      if (!isTokenFile && COLOR_LITERAL.test(code) && !/^\$/.test(code)) {
        err(
          file,
          `${i + 1}행: 색상 리터럴 사용 — var(--...) 만 쓴다. 재사용성이 토큰 단일 지점에 달려 있다`
        );
      }
    });
  }
}

// ---------- 5. 색상 대비 (WCAG 1.4.3) ----------

function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * 토큰 파일에서 CSS 변수 정의를 수집하고, `@contrast <fg> on <bg> [min]` 주석으로
 * 선언된 쌍의 명도 대비를 계산한다. 기본 기준 4.5:1 (WCAG 2.1 AA 본문).
 */
function checkContrast() {
  const tokensDir = path.join(SRC, 'assets', 'scss', 'tokens');
  const files = walk(tokensDir, ['.scss']);
  if (!files.length) return;

  const vars = new Map();
  const pairs = [];

  for (const file of files) {
    const text = read(file);
    for (const m of text.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
      vars.set(m[1], m[2]);
    }
    for (const m of text.matchAll(
      /@contrast\s+(--[\w-]+)\s+on\s+(--[\w-]+)(?:\s+([\d.]+))?/g
    )) {
      pairs.push({ file, fg: m[1], bg: m[2], min: m[3] ? Number(m[3]) : 4.5 });
    }
  }

  if (vars.size && !pairs.length) {
    warn(
      path.join(tokensDir, '_color.scss'),
      '색상 토큰은 있으나 @contrast 선언이 없다 — 최소한 본문/배경 쌍은 선언하라'
    );
  }

  for (const { file, fg, bg, min } of pairs) {
    const fgHex = vars.get(fg);
    const bgHex = vars.get(bg);
    if (!fgHex || !bgHex) {
      err(file, `@contrast 대상 토큰을 찾을 수 없다: ${!fgHex ? fg : bg}`);
      continue;
    }
    const a = hexToRgb(fgHex);
    const b = hexToRgb(bgHex);
    if (!a || !b) continue;
    const ratio = contrastRatio(a, b);
    if (ratio < min) {
      err(
        file,
        `색상 대비 미달: ${fg}(${fgHex}) on ${bg}(${bgHex}) = ${ratio.toFixed(2)}:1 < ${min}:1 (WCAG 1.4.3)`
      );
    }
  }
}

// ---------- 6. @component 주석 ----------

function checkComponentDocs() {
  const componentsDir = path.join(SRC, 'assets', 'components');
  for (const file of walk(componentsDir, ['.html'])) {
    if (!/@component\s+\S/.test(read(file))) {
      err(
        file,
        '@component 주석이 없다 — build.js 가 guide.html 과 스니펫을 생성하지 못한다'
      );
    }
  }
}

// ---------- 7. SCSS ↔ CSS 동기화 ----------

function checkSync() {
  const scssFiles = walk(path.join(SRC, 'assets', 'scss'), ['.scss']);
  const cssFiles = walk(path.join(SRC, 'assets', 'css'), ['.css']);
  if (!scssFiles.length || !cssFiles.length) return;

  const newestScss = Math.max(...scssFiles.map((f) => fs.statSync(f).mtimeMs));
  const oldestCss = Math.min(...cssFiles.map((f) => fs.statSync(f).mtimeMs));
  if (newestScss > oldestCss) {
    warn(
      'src/assets/css',
      'SCSS 가 컴파일된 CSS 보다 최신이다 — node tools/build.js 로 다시 컴파일하라'
    );
  }
}

// ---------- 8. TDD 가드 (util/ 은 테스트 필수) ----------

function checkTddGuard() {
  const utilDir = path.join(SRC, 'assets', 'js', 'util');
  const testDir = path.join(SRC, '__tests__');
  for (const file of walk(utilDir, ['.js'])) {
    const base = path.basename(file, '.js');
    // util/ 안에 놓인 테스트 파일은 그 자신이 구현이 아니다.
    // 거르지 않으면 foo.test.js 가 foo.test.test.js 를 요구하게 된다.
    if (!file.endsWith('.test.js')) {
      const candidates = [
        path.join(testDir, `${base}.test.js`),
        path.join(utilDir, `${base}.test.js`),
      ];
      if (!candidates.some((p) => fs.existsSync(p))) {
        err(file, `테스트 파일이 없다 — src/__tests__/${base}.test.js 를 먼저 작성하라`);
      }
    }
    // util/ 은 DOM 비의존이어야 node --test 로 검증할 수 있다
    const code = read(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const domRef = code.match(/\b(document|window)\b/);
    if (domRef) {
      err(
        file,
        `util/ 에서 ${domRef[1]} 를 참조한다 — DOM 바인딩은 assets/js/common/ 으로 옮겨라. ` +
          '이유: jsdom 없이 node --test 로 검증해야 하며, 그것이 폐쇄망에서 테스트를 유지하는 조건이다'
      );
    }
  }
}

// ---------- 9. 테스트 실행 ----------

/** node --test 실행. 대상이 없으면 아무것도 하지 않는다. */
function runNodeTests(targets, label) {
  if (!targets.length) return;

  const r = spawnSync(process.execPath, ['--test', ...targets], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
    err(label, `node --test 실패\n${indent(out)}`);
  }
}

/**
 * --test 에 디렉토리를 넘기면 Node 는 그것을 CommonJS 모듈로 resolve 한다 (재귀 탐색이 아니다).
 * index.js 가 있으면 그 파일 하나만 돌고 나머지 테스트는 조용히 건너뛴 채 exit 0 이 된다.
 * 테스트가 안 돌았는데 통과로 보이는 것이 최악이므로 파일 경로를 직접 넘긴다.
 */
function runTests() {
  const testDir = path.join(SRC, '__tests__');
  const tests = walk(testDir, ['.js']).filter((f) => f.endsWith('.test.js'));
  runNodeTests(tests, 'src/__tests__');
}

/**
 * 훅 테스트. src/ 가 아직 없어도 돌린다 — 훅이 조용히 깨지면 TDD 강제 자체가
 * 무력화되므로, 검사할 소스가 없는 시점에도 하네스는 살아 있어야 한다.
 * scripts/hooks/ 에는 index.js 가 없으므로 파일 경로를 직접 넘긴다.
 */
function runHookTests() {
  const tests = walk(path.join(ROOT, 'scripts', 'hooks'), ['.js']).filter((f) =>
    f.endsWith('.test.js')
  );
  runNodeTests(tests, 'scripts/hooks');
}

/**
 * 하네스(Python) 테스트. 하네스는 걷어내기 리허설에서 통째로 삭제되므로 폐쇄망에 가지
 * 않는다 — 따라서 pytest 는 Tier 1 로 둔다. 다만 아무도 안 돌리면 조용히 썩으므로,
 * pytest 가 있으면 돌리고 없으면 경고로 남긴다 (runTier1 과 같은 방식).
 */
/**
 * 쓸 파이썬을 고른다. `.venv` 가 있으면 그것을 먼저 본다 — pytest 는 보통
 * 가상환경에만 깔리는데 bare `python` 만 찾으면 프로브가 실패해 하네스 테스트가
 * 통째로 건너뛰어진다. 그러면 check.js 는 에러 0건으로 통과하고, 테스트가 안 돌았는데
 * 통과로 보이는 최악의 상태가 된다.
 */
function findPython() {
  const isWin = process.platform === 'win32';
  const venv = path.join(ROOT, '.venv', isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');
  if (fs.existsSync(venv)) return venv;
  return isWin ? 'python' : 'python3';
}

function runHarnessTests() {
  const testFile = path.join(ROOT, 'scripts', 'test_execute.py');
  if (!fs.existsSync(testFile)) return;

  const python = findPython();
  const probe = spawnSync(python, ['-c', 'import pytest'], { cwd: ROOT, encoding: 'utf8' });
  if (probe.status !== 0) {
    warn(
      'scripts/test_execute.py',
      `pytest 가 없어 하네스 테스트를 건너뛴다 (${path.isAbsolute(python) ? rel(python) : python}) — ` +
        'python -m venv .venv && .venv/Scripts/pip install pytest'
    );
    return;
  }

  const r = spawnSync(python, ['-m', 'pytest', 'scripts/test_execute.py', '-q'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  if (r.status !== 0) {
    err('scripts/test_execute.py', `pytest 실패\n${indent(`${r.stdout || ''}${r.stderr || ''}`.trim())}`);
  }
}

// ---------- 10. Tier 1 (npm 이 있을 때만) ----------

function runTier1() {
  const pkgPath = path.join(ROOT, 'package.json');
  if (!fs.existsSync(pkgPath) || !fs.existsSync(path.join(ROOT, 'node_modules'))) return;

  let scripts = {};
  try {
    scripts = JSON.parse(read(pkgPath)).scripts || {};
  } catch {
    err('package.json', 'JSON 파싱 실패');
    return;
  }

  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  for (const name of ['lint:js', 'lint:css', 'lint:html']) {
    if (!scripts[name]) continue;
    const r = spawnSync(npm, ['run', '--silent', name], { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) {
      err('package.json', `${name} 실패\n${indent(`${r.stdout || ''}${r.stderr || ''}`.trim())}`);
    }
  }
}

// ---------- 출력 ----------

const indent = (s) => s.split('\n').map((l) => `      ${l}`).join('\n');

function report() {
  if (warnings.length && !QUIET) {
    console.log(`\n  경고 ${warnings.length}건`);
    for (const w of warnings) console.log(`    ~ ${w.file}\n      ${w.msg}`);
  }
  if (errors.length) {
    console.error(`\n  오류 ${errors.length}건`);
    for (const e of errors) console.error(`    x ${e.file}\n      ${e.msg}`);
    console.error('');
    process.exit(1);
  }
  if (!QUIET) console.log(`\n  check 통과 (경고 ${warnings.length}건)\n`);
}

// ---------- 실행 ----------

function main() {
  // 훅은 src/ 유무와 무관하게 존재한다. 하네스가 깨진 채로 통과하지 않도록 먼저 검증한다.
  runHookTests();
  runHarnessTests();

  if (!fs.existsSync(SRC)) {
    if (!QUIET) console.log('  src/ 가 아직 없다 — src 검사는 건너뛴다');
    report();
    return;
  }

  const htmlFiles = walk(SRC, ['.html']).filter(
    (f) => path.basename(f) !== 'guide.html' // 생성물은 검사 대상 아님
  );

  checkHtml(htmlFiles);
  checkImages(htmlFiles);
  checkIncludes(htmlFiles);
  checkScss();
  checkContrast();
  checkComponentDocs();
  checkSync();
  checkTddGuard();
  runTests();
  runTier1();

  report();
}

main();
