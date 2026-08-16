#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx'];

function blockPreToolUse(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}

/**
 * Codex 셸 도구는 command 를 `["bash", "-lc", "..."]` 형태의 argv 배열로 보낸다.
 * 문자열만 받으면 배열 페이로드가 통째로 검사를 빠져나가 훅이 조용히 무력화된다.
 */
function commandText(toolInput = {}) {
  const command = (toolInput && (toolInput.command ?? toolInput.cmd)) ?? '';
  return Array.isArray(command) ? command.join(' ') : String(command);
}

function dangerousCommandDecision(input) {
  const command = commandText(input && input.tool_input);
  if (!command) return {};

  const blockedPatterns = [
    /\brm\s+-rf\b/i,
    /\bgit\s+push\s+--force\b/i,
    /\bgit\s+reset\s+--hard\b/i,
    /\bdrop\s+table\b/i,
  ];

  if (!blockedPatterns.some((pattern) => pattern.test(command))) return {};

  return blockPreToolUse(
    '위험 명령이 감지되어 차단했습니다. 대상과 복구 방법을 확인한 뒤 안전한 명령을 사용하세요.'
  );
}

function extractChangedFiles(patch) {
  if (typeof patch !== 'string') return [];

  const files = [];
  for (const line of patch.split(/\r?\n/)) {
    const match = line.match(/^\*\*\* (Add|Update|Delete) File:\s*(.+?)\s*$/);
    if (!match || match[1] === 'Delete') continue;
    files.push(match[2]);
  }
  return files;
}

function normalizeForComparison(filePath) {
  const normalized = path.normalize(path.resolve(filePath));
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isTestFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  return (
    normalized.includes('/__tests__/') ||
    /(^|\/)[^/]*(?:test|spec)[^/]*\.(?:ts|tsx|js|jsx)$/.test(normalized)
  );
}

function shouldRequireTest(filePath) {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  const extension = path.extname(normalized).slice(1);

  if (!SCRIPT_EXTENSIONS.includes(extension) || isTestFile(normalized)) return false;
  if (/(^|\/)tools\//.test(normalized) || /(^|\/)scripts\/hooks\//.test(normalized)) {
    return false;
  }
  if (/\.config\.(?:ts|tsx|js|jsx)$/.test(normalized)) return false;
  if (/\/assets\/js\/(?:common|pages)\//.test(normalized)) return false;
  if (/\/assets\/js\/(?:pc|mo)\.(?:js|jsx)$/.test(normalized)) return false;

  return true;
}

function testCandidates(sourcePath, repoRoot) {
  const directory = path.dirname(sourcePath);
  const parent = path.dirname(directory);
  const basename = path.basename(sourcePath, path.extname(sourcePath));
  const candidates = [];

  for (const testExtension of SCRIPT_EXTENSIONS) {
    candidates.push(path.join(directory, `${basename}.test.${testExtension}`));
    candidates.push(path.join(directory, `${basename}.spec.${testExtension}`));
    candidates.push(path.join(directory, '__tests__', `${basename}.test.${testExtension}`));
    candidates.push(path.join(parent, '__tests__', `${basename}.test.${testExtension}`));
    candidates.push(path.join(repoRoot, 'src', '__tests__', `${basename}.test.${testExtension}`));
  }

  return candidates;
}

function findRepoRoot(cwd) {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
  return result.status === 0 && result.stdout.trim()
    ? path.resolve(result.stdout.trim())
    : path.resolve(cwd);
}

/**
 * 편집 대상 경로를 모은다. apply_patch 는 패치 본문으로, Edit·Write 는 file_path 로
 * 대상을 알린다. 한쪽만 읽으면 반대쪽 도구에서 가드가 조용히 통과한다.
 */
function editedPaths(toolInput = {}) {
  const fromPatch = extractChangedFiles(commandText(toolInput));
  const directPath = toolInput && typeof toolInput.file_path === 'string' ? [toolInput.file_path] : [];
  return [...new Set([...directPath, ...fromPatch])];
}

function tddGuardDecision(input, options = {}) {
  const cwd = path.resolve(options.cwd || (input && input.cwd) || process.cwd());
  const repoRoot = path.resolve(options.repoRoot || findRepoRoot(cwd));
  const changedFiles = editedPaths(input && input.tool_input);
  const changedAbsolutePaths = new Set(
    changedFiles.map((filePath) => normalizeForComparison(path.resolve(cwd, filePath)))
  );
  const missingTests = [];

  for (const changedFile of changedFiles) {
    const sourcePath = path.resolve(cwd, changedFile);
    if (!shouldRequireTest(sourcePath)) continue;

    const hasTest = testCandidates(sourcePath, repoRoot).some(
      (candidate) =>
        fs.existsSync(candidate) || changedAbsolutePaths.has(normalizeForComparison(candidate))
    );
    if (!hasTest) {
      missingTests.push(path.relative(repoRoot, sourcePath).replace(/\\/g, '/'));
    }
  }

  if (!missingTests.length) return {};

  return blockPreToolUse(
    `TDD GUARD: 테스트 파일이 없는 구현 파일을 수정하려고 했습니다: ${missingTests.join(
      ', '
    )}. 구현 전에 대응하는 *.test.* 또는 *.spec.* 파일을 먼저 추가하세요.`
  );
}

function stopCheckDecision(input, options = {}) {
  if (input && input.stop_hook_active) return {};

  const cwd = path.resolve(options.cwd || (input && input.cwd) || process.cwd());
  const repoRoot = path.resolve(options.repoRoot || findRepoRoot(cwd));
  const checkScript = path.join(repoRoot, 'tools', 'check.js');
  if (!fs.existsSync(checkScript)) return {};

  const result = spawnSync(process.execPath, [checkScript, '--quiet'], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status === 0) return {};

  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  const details = output.length > 8000 ? `${output.slice(0, 8000)}\n…(truncated)` : output;
  const reason = [
    '저장소 검증이 실패했습니다. 문제를 수정한 뒤 `node tools/check.js`를 다시 실행하세요.',
    details,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { decision: 'block', reason };
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      try {
        resolve(data.trim() ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    process.stdin.on('error', reject);
  });
}

async function main() {
  const mode = process.argv[2];
  const input = await readStdin();
  let output;

  if (mode === 'dangerous-command') output = dangerousCommandDecision(input);
  else if (mode === 'tdd-guard') output = tddGuardDecision(input);
  else if (mode === 'stop-check') output = stopCheckDecision(input);
  else throw new Error(`Unknown Codex hook mode: ${mode || '(missing)'}`);

  process.stdout.write(`${JSON.stringify(output)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Codex hook failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  commandText,
  dangerousCommandDecision,
  editedPaths,
  extractChangedFiles,
  shouldRequireTest,
  stopCheckDecision,
  tddGuardDecision,
  testCandidates,
};
