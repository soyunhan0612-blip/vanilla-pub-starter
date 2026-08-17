#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_COMPONENTS_DIR = path.join(__dirname, '..', 'src', 'assets', 'components');
const INCLUDE_RE = /<!--\s*@include\s+([^\s]+?)\s*-->/g;
const COMPONENT_COMMENT_RE = /<!--(?:(?!-->)[\s\S])*?@component\b(?:(?!-->)[\s\S])*?-->/g;

function stripComponentComments(html) {
  return html.replace(COMPONENT_COMMENT_RE, '');
}

function resolveIncludes(html, opts = {}) {
  const componentsDir = path.resolve(opts.componentsDir || DEFAULT_COMPONENTS_DIR);

  function resolve(source, stack) {
    const resolved = source.replace(INCLUDE_RE, (_marker, requestedPath) => {
      const relativePath = requestedPath.replace(/^components[\\/]/, '');
      const target = path.resolve(componentsDir, relativePath);
      const relativeToRoot = path.relative(componentsDir, target);

      if (relativeToRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToRoot)) {
        throw new Error(`@include 경로가 컴포넌트 루트를 벗어났다: ${requestedPath}`);
      }
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        throw new Error(`@include 대상 파일이 없다: ${requestedPath}`);
      }

      const cycleAt = stack.indexOf(target);
      if (cycleAt !== -1) {
        const chain = [...stack.slice(cycleAt), target]
          .map((file) => path.relative(componentsDir, file).replace(/\\/g, '/'))
          .join(' -> ');
        throw new Error(`순환 @include 감지: ${chain}`);
      }

      const fragment = fs.readFileSync(target, 'utf8');
      return resolve(fragment, [...stack, target]);
    });

    return stripComponentComments(resolved);
  }

  return resolve(String(html), []);
}

module.exports = {
  resolveIncludes,
  stripComponentComments,
};
