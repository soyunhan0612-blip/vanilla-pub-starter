#!/usr/bin/env node
'use strict';
/**
 * tools/build.js — SCSS 컴파일 + dist/ 이관 산출물 생성.
 *
 *   node tools/build.js
 *   ├─ SCSS 컴파일   src/assets/scss/{pc,mo}.scss → src/assets/css/{pc,mo}.css
 *   └─ dist/ 생성    include 해소된 평면 HTML + css/js/img 복사
 *
 * 컴파일러(npm sass → 동봉 바이너리)를 못 찾거나 입력 SCSS 가 아직 없으면
 * 실패가 아니라 경고다. 커밋된 src/assets/css/ 가 안전망 3계층이기 때문이다(ADR-003).
 *
 * 의존성 0 (Node 내장 모듈 + 동봉 바이너리만).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolveIncludes } = require('./include.js');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const IS_WIN = process.platform === 'win32';

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const warnings = [];
const warn = (msg) => warnings.push(msg);
const log = (msg) => console.log(`  ${msg}`);

/** 재귀 디렉토리 순회. Node 18 호환을 위해 readdirSync 의 recursive 옵션을 쓰지 않는다. */
function walk(dir, exts) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    if (entry.isDirectory()) out.push(...walk(full, exts));
    else if (!exts || exts.includes(path.extname(entry.name))) out.push(full);
  }
  return out;
}

// ---------- 1. SCSS 컴파일 ----------

/** 탐색 순서: node_modules/.bin/sass → tools/vendor/sass/ 동봉 바이너리 → 없음 */
function findCompiler() {
  const local = path.join(ROOT, 'node_modules', '.bin', IS_WIN ? 'sass.cmd' : 'sass');
  if (fs.existsSync(local)) return { bin: local, label: 'node_modules/.bin/sass (Tier 1)' };

  const vendor = path.join(ROOT, 'tools', 'vendor', 'sass', IS_WIN ? 'sass.bat' : 'sass');
  if (fs.existsSync(vendor)) return { bin: vendor, label: `${rel(vendor)} (Tier 0 동봉)` };

  return null;
}

function runCompiler(bin, args) {
  // Windows 는 .bat/.cmd 를 shell 없이 실행할 수 없다(Node 20+ 보안 변경).
  const quote = (s) => (IS_WIN ? `"${s}"` : s);
  return spawnSync(quote(bin), args.map(quote), {
    cwd: ROOT,
    shell: IS_WIN,
    encoding: 'utf8',
  });
}

function compileScss() {
  const scssDir = path.join(SRC, 'assets', 'scss');
  const cssDir = path.join(SRC, 'assets', 'css');

  const entries = ['pc', 'mo']
    .map((name) => ({ name, input: path.join(scssDir, `${name}.scss`) }))
    .filter((e) => fs.existsSync(e.input));

  if (!entries.length) {
    // 폴더 스켈레톤만 있고 SCSS 는 다음 step 에서 작성된다. 실패 사유가 아니다.
    warn('SCSS 엔트리(src/assets/scss/pc.scss · mo.scss)가 없다 — 컴파일 건너뜀');
    return;
  }

  const compiler = findCompiler();
  if (!compiler) {
    warn(
      'SCSS 컴파일러를 찾지 못했다 — 컴파일 건너뜀. ' +
        '커밋된 src/assets/css/ 로 뼈대는 그대로 동작한다. ' +
        'npm install sass 또는 tools/vendor/sass/ 에 dart-sass 를 배치하라'
    );
    return;
  }

  fs.mkdirSync(cssDir, { recursive: true });
  for (const { name, input } of entries) {
    const output = path.join(cssDir, `${name}.css`);
    // expanded — 사람이 읽을 수 있어야 개발사가 이관받아 수정할 수 있다.
    const r = runCompiler(compiler.bin, ['--no-source-map', '--style=expanded', input, output]);
    if (r.status !== 0) {
      const detail = `${r.stdout || ''}${r.stderr || ''}`.trim() || `종료 코드 ${r.status}`;
      console.error(`\n  SCSS 컴파일 실패: ${rel(input)}\n${detail}\n`);
      process.exit(1);
    }
    log(`css   ${rel(input)} → ${rel(output)}`);
  }
  log(`컴파일러: ${compiler.label}`);
}

// ---------- 2. dist/ 생성 ----------

function copyDir(from, to) {
  if (!fs.existsSync(from)) return 0;
  let count = 0;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue; // .gitkeep 은 이관 산출물이 아니다
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) count += copyDir(src, dest);
    else {
      fs.copyFileSync(src, dest);
      count++;
    }
  }
  return count;
}

function buildDist() {
  const componentsDir = path.join(SRC, 'assets', 'components');

  // 이전 산출물이 남아 섞이지 않도록 비운다. dist/ 는 .gitignore 대상인 생성물이다.
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  // fragment 는 마크업 단일 소스일 뿐 배포 대상이 아니다.
  const pages = walk(SRC, ['.html']).filter((f) => !f.startsWith(componentsDir + path.sep));
  for (const file of pages) {
    const out = path.join(DIST, path.relative(SRC, file));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, resolveIncludes(fs.readFileSync(file, 'utf8'), { from: file }), 'utf8');
  }

  let assets = 0;
  for (const dir of ['css', 'js', 'img']) {
    assets += copyDir(path.join(SRC, 'assets', dir), path.join(DIST, 'assets', dir));
  }

  log(`dist  HTML ${pages.length}장 · 자산 ${assets}개 → ${rel(DIST)}/`);
  if (!pages.length) {
    // 페이지는 이후 phase 에서 생긴다. 빈 dist/ 가 이 시점의 정상 결과다.
    warn('조립할 HTML 이 없다 — 빈 dist/ 를 생성했다');
  }
}

// ---------- 실행 ----------

function main() {
  compileScss();
  buildDist();

  if (warnings.length) {
    console.log(`\n  경고 ${warnings.length}건`);
    for (const w of warnings) console.log(`    ~ ${w}`);
  }
  console.log(`\n  build 완료 (경고 ${warnings.length}건)\n`);
}

main();
