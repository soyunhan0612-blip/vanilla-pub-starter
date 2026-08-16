'use strict';
/**
 * tools/include.js — HTML include 전처리. serve.js 와 build.js 가 공유한다.
 *
 * 마커 형식:  <!-- @include common/button.html -->
 * 기준 경로:  src/assets/components/
 *
 * 컴포넌트 마크업의 단일 소스를 유지하기 위한 장치다. 헤더 하나 고치려고
 * 14개 페이지를 여는 상황을 만들지 않는 것이 이 모듈의 존재 이유다.
 *
 * 의존성 0 (Node 내장 모듈만).
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_COMPONENTS_DIR = path.resolve(__dirname, '..', 'src', 'assets', 'components');

/**
 * check.js 의 INCLUDE_RE 와 같은 마커를 잡되, 들여쓰기 보존을 위해 앞선 공백까지 캡처한다.
 * 조립 결과가 사람이 읽을 수 있어야 개발사가 이관받아 수정할 수 있다.
 * 재귀 호출이 같은 정규식 객체의 lastIndex 를 건드리지 않도록 매번 새로 만든다.
 */
const includeRe = () => /([ \t]*)<!--\s*@include\s+([^\s]+?)\s*-->/g;

/** fragment 상단 `@component` 주석 블록 제거. 문서용 메타데이터이지 마크업이 아니다. */
function stripComponentDoc(text) {
  let out = text.replace(/^\uFEFF/, '');
  for (;;) {
    const m = out.match(/^\s*<!--[\s\S]*?-->/);
    if (!m || !m[0].includes('@component')) break;
    out = out.slice(m[0].length).replace(/^[ \t]*\r?\n/, '');
  }
  return out;
}

const indentBlock = (text, indent) =>
  text.split('\n').map((line) => (line ? indent + line : line)).join('\n');

function expand(html, componentsDir, stack) {
  return html.replace(includeRe(), (match, indent, ref, offset, whole) => {
    // check.js 는 "components/" 접두사를 허용한다. 동일하게 받아준다.
    const spec = ref.replace(/^components\//, '');
    const target = path.resolve(componentsDir, spec);

    const inside = path.relative(componentsDir, target);
    if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) {
      throw new Error(
        `@include 경로가 컴포넌트 디렉토리를 벗어난다: "${ref}"\n` +
          `  기준: ${componentsDir}\n  참조 위치: ${describe(stack)}`
      );
    }
    if (stack.includes(target)) {
      throw new Error(
        `@include 순환 참조: ${[...stack, target].map((p) => path.basename(p)).join(' -> ')}\n` +
          `  경로: ${target}`
      );
    }
    if (!fs.existsSync(target)) {
      throw new Error(
        `@include 대상 파일이 없다: "${ref}"\n` +
          `  찾은 경로: ${target}\n  참조 위치: ${describe(stack)}`
      );
    }

    const body = expand(
      stripComponentDoc(fs.readFileSync(target, 'utf8')),
      componentsDir,
      [...stack, target]
    ).replace(/\s+$/, '');

    // 줄 첫머리 마커면 fragment 전체를 그 들여쓰기만큼 밀어 넣는다.
    const atLineStart = offset === 0 || whole[offset - 1] === '\n';
    return atLineStart ? indentBlock(body, indent) : indent + body;
  });
}

const describe = (stack) => (stack.length ? stack[stack.length - 1] : '(입력 문자열)');

/**
 * include 마커를 해소한 HTML 을 돌려준다. 중첩 include 를 지원하고 순환 참조를 감지한다.
 *
 * @param {string} html 원본 HTML 문자열
 * @param {{componentsDir?: string, from?: string}} [opts]
 *        componentsDir — fragment 기준 경로 (기본 src/assets/components)
 *        from          — 에러 메시지에 표시할 원본 파일 경로
 * @returns {string}
 */
function resolveIncludes(html, opts = {}) {
  const componentsDir = opts.componentsDir
    ? path.resolve(opts.componentsDir)
    : DEFAULT_COMPONENTS_DIR;
  return expand(html, componentsDir, opts.from ? [path.resolve(opts.from)] : []);
}

module.exports = { resolveIncludes };
