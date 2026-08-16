#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// TDD 가드의 범위 판정은 tdd-guard.js 하나만 갖는다. Codex 가 Claude 보다 넓은
// 범위를 막으면 같은 파일이 에이전트에 따라 통과/차단으로 갈리고, 어느 쪽도
// 정본(tools/check.js 의 checkTddGuard)과 일치하지 않게 된다.
const { shouldRequireTest, testCandidates } = require('./tdd-guard');

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
    // `--force-with-lease` 는 --force 의 안전한 대체재다. 그것까지 막으면 남는
    // 선택지가 없어져 우회를 부른다. 반대로 `-f` 단축형은 막는 쪽과 같은 일을 한다.
    /\bgit\s+push\s+(?:-f\b|--force(?!-with-lease))/i,
    /\bgit\s+reset\s+--hard\b/i,
    /\bdrop\s+table\b/i,
    // PowerShell 의 재귀 강제 삭제. `rm -rf` 와 같은 일을 하지만 표현이 다르다.
    //
    // rm·rd·rmdir·del·erase·ri 는 **전부 Remove-Item 의 별칭**이고, 스위치는
    // 고유 접두사까지 줄여 쓸 수 있다 (-r 은 -Recurse, -fo 는 -Force 의 유일 접두사).
    // Remove-Item 과 -rec/-for 만 보면 `rm -r -fo` 가 그대로 통과한다.
    // 두 스위치가 **모두** 있을 때만 잡는다 — 하나만으로는 위험하다고 단정할 수 없다.
    /\b(?:remove-item|rm|rd|rmdir|del|erase|ri)\b(?=[^|;]*\s-r(?:ec[a-z]*)?\b)(?=[^|;]*\s-fo(?:r[a-z]*)?\b)/i,
    // cmd.exe 형태. PowerShell 안에서도 그대로 실행된다.
    /\brmdir\s+\/s\b/i,
    /\bdel\s+\/s\b/i,
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

/**
 * `.git` 을 찾아 위로 올라간다. `git rev-parse` 를 띄우지 않는 이유는 이 훅이
 * 모든 Edit·Write·셸 호출마다 새 프로세스로 뜨기 때문이다 — 그 안에서 다시
 * 프로세스를 하나 더 띄우면 비용이 도구 호출 수만큼 곱해진다.
 * worktree·submodule 은 `.git` 이 디렉토리가 아니라 파일이므로 존재만 본다.
 */
function findRepoRoot(cwd) {
  let dir = path.resolve(cwd);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(cwd);
    dir = parent;
  }
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
    if (!shouldRequireTest(sourcePath, repoRoot)) continue;

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

/**
 * 배선(.codex/hooks.json · .claude/settings.json)이 부를 수 있는 모드 전부.
 * 테이블로 두는 이유: wiring.test.js 가 배선 문자열의 모드 이름을 이 키 목록과
 * 대조한다. 오타 난 모드는 throw → exit 1 이고, 두 에이전트 모두 exit 1 을
 * "차단"이 아니라 "훅 실패"로 처리해 그대로 작업을 진행한다 (ADR-009).
 */
const MODES = {
  'dangerous-command': dangerousCommandDecision,
  'tdd-guard': tddGuardDecision,
  'stop-check': stopCheckDecision,
};

async function main() {
  const mode = process.argv[2];
  const decide = Object.prototype.hasOwnProperty.call(MODES, mode) ? MODES[mode] : null;
  if (!decide) throw new Error(`Unknown Codex hook mode: ${mode || '(missing)'}`);

  process.stdout.write(`${JSON.stringify(decide(await readStdin()))}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Codex hook failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  MODES,
  commandText,
  dangerousCommandDecision,
  editedPaths,
  extractChangedFiles,
  findRepoRoot,
  shouldRequireTest,
  stopCheckDecision,
  tddGuardDecision,
  testCandidates,
};
