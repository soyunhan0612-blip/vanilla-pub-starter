#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_COMPONENTS_DIR = path.join(__dirname, '..', 'src', 'assets', 'components');
const INCLUDE_RE = /<!--\s*@include\s+([^\s]+?)\s*-->/g;
const COMPONENT_COMMENT_RE = /<!--(?:(?!-->)[\s\S])*?@component\b(?:(?!-->)[\s\S])*?-->/g;
// 변형 마커. exec 루프에서 쓰므로 매번 새로 만든다 — /g 정규식을 모듈 수준에서
// 공유하면 lastIndex 가 호출 사이에 남아 다음 스캔이 중간부터 시작한다.
const variantMarkerRe = () => /<!--\s*@(?:(variant)\s+([^\s-][^\s]*)|(endvariant))\s*-->/g;

function stripComponentComments(html) {
  return html.replace(COMPONENT_COMMENT_RE, '');
}

function stripVariantMarkers(html) {
  return html.replace(variantMarkerRe(), '');
}

function splitRequest(request) {
  const hashAt = request.indexOf('#');
  if (hashAt === -1) return { requestedPath: request, variant: null };
  return { requestedPath: request.slice(0, hashAt), variant: request.slice(hashAt + 1) };
}

/**
 * fragment 안의 `<!-- @variant name -->` ~ `<!-- @endvariant -->` 구간을 이름별로 모은다.
 * 마커는 주석이므로 쇼케이스 전체를 그대로 렌더하는 경로에는 영향이 없고,
 * include 쪽에서만 한 조각을 골라낼 수 있게 한다.
 */
function collectVariants(source, label) {
  const regions = new Map();
  const re = variantMarkerRe();
  let open = null;
  let match;

  while ((match = re.exec(source)) !== null) {
    const [marker, isStart, name] = match;
    if (isStart) {
      if (open) throw new Error(`@variant 가 중첩됐다: ${label}#${name}`);
      if (regions.has(name)) throw new Error(`@variant 이름이 중복됐다: ${label}#${name}`);
      open = { name, start: match.index + marker.length };
    } else {
      if (!open) throw new Error(`짝이 없는 @endvariant: ${label}`);
      regions.set(open.name, source.slice(open.start, match.index));
      open = null;
    }
  }

  if (open) throw new Error(`@variant 가 닫히지 않았다: ${label}#${open.name}`);
  return regions;
}

function selectVariant(source, variant, label) {
  const regions = collectVariants(source, label);
  if (!regions.has(variant)) {
    const available = regions.size ? [...regions.keys()].join(', ') : '없음';
    throw new Error(`@include 변형을 찾을 수 없다: ${label}#${variant} (사용 가능: ${available})`);
  }
  return regions.get(variant);
}

function resolveIncludes(html, opts = {}) {
  const componentsDir = path.resolve(opts.componentsDir || DEFAULT_COMPONENTS_DIR);

  const toLabel = (target) => path.relative(componentsDir, target).replace(/\\/g, '/');

  function resolve(source, stack) {
    const resolved = source.replace(INCLUDE_RE, (_marker, request) => {
      const { requestedPath, variant } = splitRequest(request);
      if (variant === '') throw new Error(`@include 변형 이름이 비어 있다: ${request}`);

      const relativePath = requestedPath.replace(/^components[\\/]/, '');
      const target = path.resolve(componentsDir, relativePath);
      const relativeToRoot = path.relative(componentsDir, target);

      if (relativeToRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToRoot)) {
        throw new Error(`@include 경로가 컴포넌트 루트를 벗어났다: ${requestedPath}`);
      }
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        throw new Error(`@include 대상 파일이 없다: ${requestedPath}`);
      }

      // 순환 판정은 파일이 아니라 (파일, 변형) 쌍으로 한다. 같은 파일의 다른 변형을
      // 가져오는 것은 유한하게 끝나므로 순환이 아니다.
      const label = variant ? `${toLabel(target)}#${variant}` : toLabel(target);
      const key = variant ? `${target}#${variant}` : target;
      const cycleAt = stack.findIndex((entry) => entry.key === key);
      if (cycleAt !== -1) {
        const chain = [...stack.slice(cycleAt), { label }].map((entry) => entry.label).join(' -> ');
        throw new Error(`순환 @include 감지: ${chain}`);
      }

      const source = fs.readFileSync(target, 'utf8');
      const fragment = variant ? selectVariant(source, variant, toLabel(target)) : source;
      return resolve(fragment, [...stack, { key, label }]);
    });

    return stripVariantMarkers(stripComponentComments(resolved));
  }

  return resolve(String(html), []);
}

module.exports = {
  collectVariants,
  resolveIncludes,
  selectVariant,
  splitRequest,
  stripComponentComments,
  stripVariantMarkers,
};
