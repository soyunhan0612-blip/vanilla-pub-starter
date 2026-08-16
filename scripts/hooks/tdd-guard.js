#!/usr/bin/env node

'use strict';

// TDD Guard Hook — PreToolUse[Write|Edit]
// tools/check.js 의 checkTddGuard() 와 같은 범위를 훅 시점에 미리 알려주는 것이 전부다.
// 정본이 보지 않는 파일은 여기서도 보지 않는다 — 범위가 어긋나면 훅이 오탐을 내거나,
// 훅은 통과시켰는데 Stop 시점에 check.js 가 막는 드리프트가 생긴다.

const fs = require('node:fs');
const path = require('node:path');

// tools/check.js 의 SRC = <root>/src 기준. checkTddGuard() 는 이 폴더만 walk 한다.
const UTIL_SEGMENTS = ['src', 'assets', 'js', 'util'];
const TEST_SUFFIX = '.test.js';

function blockPreToolUse(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}

// Windows 는 드라이브 문자 대소문자와 구분자가 뒤섞여 들어온다.
function normalizeForComparison(filePath) {
  const normalized = path.normalize(path.resolve(filePath));
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isInside(childPath, parentDir) {
  const child = normalizeForComparison(childPath);
  const parent = normalizeForComparison(parentDir);
  return child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);
}

function shouldRequireTest(filePath, repoRoot) {
  if (path.extname(filePath) !== '.js') return false;
  if (path.basename(filePath).endsWith(TEST_SUFFIX)) return false;
  return isInside(filePath, path.join(repoRoot, ...UTIL_SEGMENTS));
}

// tools/check.js:290 의 candidates 와 동일하게 유지할 것.
function testCandidates(filePath, repoRoot) {
  const base = path.basename(filePath, '.js');
  return [
    path.join(repoRoot, 'src', '__tests__', `${base}${TEST_SUFFIX}`),
    path.join(repoRoot, ...UTIL_SEGMENTS, `${base}${TEST_SUFFIX}`),
  ];
}

function resolveRepoRoot(input, options) {
  const candidate =
    options.projectDir ||
    process.env.CLAUDE_PROJECT_DIR ||
    (input && input.cwd) ||
    process.cwd();
  return path.resolve(candidate);
}

function tddGuardDecision(input, options = {}) {
  const filePath = input && input.tool_input && input.tool_input.file_path;
  if (typeof filePath !== 'string' || !filePath) return {};

  const repoRoot = resolveRepoRoot(input, options);
  const sourcePath = path.resolve(repoRoot, filePath);
  if (!shouldRequireTest(sourcePath, repoRoot)) return {};

  const candidates = testCandidates(sourcePath, repoRoot);
  if (candidates.some((candidate) => fs.existsSync(candidate))) return {};

  const base = path.basename(sourcePath, '.js');
  return blockPreToolUse(
    `TDD GUARD: '${base}' 의 테스트 파일이 없습니다. util/ 은 순수 로직 레이어라 구현보다 테스트를 먼저 씁니다. ` +
      `src/__tests__/${base}${TEST_SUFFIX} 를 먼저 작성하세요.`
  );
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      try {
        resolve(data.trim() ? JSON.parse(data) : {});
      } catch (_) {
        resolve({}); // 입력이 깨졌으면 통과시킨다 — 정본이 백스톱으로 남아 있다.
      }
    });
    process.stdin.on('error', () => resolve({}));
  });
}

async function main() {
  let output = {};
  try {
    output = tddGuardDecision(await readStdin());
  } catch (_) {
    output = {}; // 훅이 깨졌다고 모든 쓰기를 막지는 않는다.
  }
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { shouldRequireTest, testCandidates, tddGuardDecision };
