'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  commandText,
  dangerousCommandDecision,
  extractChangedFiles,
  shouldRequireTest,
  stopCheckDecision,
  tddGuardDecision,
} = require('./codex-hook');

/** 훅이 실제로 받는 페이로드는 임시 저장소 기준으로 만든다. */
function withTempRepo(run) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hook-'));
  try {
    return run(repoRoot);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// commandText — Codex 셸 도구는 command 를 배열로 보낸다
// ---------------------------------------------------------------------------

test('commandText joins array commands', () => {
  assert.equal(commandText({ command: ['bash', '-lc', 'ls -al'] }), 'bash -lc ls -al');
});

test('commandText falls back to cmd and to an empty string', () => {
  assert.equal(commandText({ cmd: 'git status' }), 'git status');
  assert.equal(commandText({}), '');
  assert.equal(commandText(), '');
});

// ---------------------------------------------------------------------------
// dangerousCommandDecision
// ---------------------------------------------------------------------------

test('dangerous command hook blocks destructive commands', () => {
  const result = dangerousCommandDecision({ tool_input: { command: 'git reset --hard HEAD~1' } });
  assert.equal(result.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(result.hookSpecificOutput.permissionDecisionReason, /위험 명령/);
});

test('dangerous command hook blocks destructive commands passed as an argv array', () => {
  const result = dangerousCommandDecision({
    tool_input: { command: ['bash', '-lc', 'rm -rf src'] },
  });
  assert.equal(result.hookSpecificOutput.permissionDecision, 'deny');
});

test('dangerous command hook allows ordinary commands', () => {
  assert.deepEqual(dangerousCommandDecision({ tool_input: { command: 'git status --short' } }), {});
  assert.deepEqual(
    dangerousCommandDecision({ tool_input: { command: ['git', 'status', '--short'] } }),
    {}
  );
});

// ---------------------------------------------------------------------------
// extractChangedFiles
// ---------------------------------------------------------------------------

test('patch parser ignores deletes and returns added or updated files', () => {
  const patch = [
    '*** Begin Patch',
    '*** Update File: src/example.js',
    '*** Add File: src/example.test.js',
    '*** Delete File: src/old.js',
    '*** End Patch',
  ].join('\n');
  assert.deepEqual(extractChangedFiles(patch), ['src/example.js', 'src/example.test.js']);
});

// ---------------------------------------------------------------------------
// shouldRequireTest — CLAUDE.md 레이어 규칙을 코드로 옮긴 지점
// ---------------------------------------------------------------------------

test('shouldRequireTest demands a test for util/ logic', () => {
  assert.equal(shouldRequireTest('/repo/src/assets/js/util/format.js'), true);
});

test('shouldRequireTest exempts the layers that cannot be unit-tested without a DOM', () => {
  for (const exempt of [
    '/repo/tools/build.js',
    '/repo/scripts/hooks/codex-hook.js',
    '/repo/vite.config.js',
    '/repo/src/assets/js/common/header.js',
    '/repo/src/assets/js/pages/main.js',
    '/repo/src/assets/js/pc.js',
    '/repo/src/assets/js/mo.js',
    '/repo/src/assets/js/util/format.test.js',
    '/repo/src/assets/scss/_tokens.scss',
    '/repo/README.md',
  ]) {
    assert.equal(shouldRequireTest(exempt), false, exempt);
  }
});

// ---------------------------------------------------------------------------
// tddGuardDecision
// ---------------------------------------------------------------------------

test('TDD hook accepts an implementation and its test in the same patch', () => {
  withTempRepo((repoRoot) => {
    const patch = [
      '*** Begin Patch',
      '*** Add File: src/assets/js/util/example.js',
      '*** Add File: src/assets/js/util/example.test.js',
      '*** End Patch',
    ].join('\n');
    assert.deepEqual(
      tddGuardDecision({ cwd: repoRoot, tool_input: { command: patch } }, { repoRoot }),
      {}
    );
  });
});

test('TDD hook blocks an implementation without a test', () => {
  withTempRepo((repoRoot) => {
    const patch = [
      '*** Begin Patch',
      '*** Add File: src/assets/js/util/example.js',
      '*** End Patch',
    ].join('\n');
    const result = tddGuardDecision({ cwd: repoRoot, tool_input: { command: patch } }, { repoRoot });
    assert.equal(result.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(
      result.hookSpecificOutput.permissionDecisionReason,
      /src\/assets\/js\/util\/example\.js/
    );
  });
});

test('TDD hook reads apply_patch bodies delivered as an argv array', () => {
  withTempRepo((repoRoot) => {
    const patch = [
      '*** Begin Patch',
      '*** Add File: src/assets/js/util/example.js',
      '*** End Patch',
    ].join('\n');
    const result = tddGuardDecision(
      { cwd: repoRoot, tool_input: { command: ['apply_patch', patch] } },
      { repoRoot }
    );
    assert.equal(result.hookSpecificOutput.permissionDecision, 'deny');
  });
});

test('TDD hook blocks an Edit/Write payload that carries file_path only', () => {
  withTempRepo((repoRoot) => {
    const result = tddGuardDecision(
      { cwd: repoRoot, tool_input: { file_path: 'src/assets/js/util/example.js' } },
      { repoRoot }
    );
    assert.equal(result.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(
      result.hookSpecificOutput.permissionDecisionReason,
      /src\/assets\/js\/util\/example\.js/
    );
  });
});

test('TDD hook accepts a file_path whose test already exists on disk', () => {
  withTempRepo((repoRoot) => {
    const utilDir = path.join(repoRoot, 'src', 'assets', 'js', 'util');
    fs.mkdirSync(utilDir, { recursive: true });
    fs.writeFileSync(path.join(utilDir, 'example.test.js'), '');
    assert.deepEqual(
      tddGuardDecision(
        { cwd: repoRoot, tool_input: { file_path: 'src/assets/js/util/example.js' } },
        { repoRoot }
      ),
      {}
    );
  });
});

test('TDD hook ignores payloads it cannot read a path out of', () => {
  withTempRepo((repoRoot) => {
    assert.deepEqual(tddGuardDecision({ cwd: repoRoot, tool_input: {} }, { repoRoot }), {});
  });
});

// ---------------------------------------------------------------------------
// stopCheckDecision
// ---------------------------------------------------------------------------

test('stop hook does not recurse when it is already active', () => {
  withTempRepo((repoRoot) => {
    assert.deepEqual(stopCheckDecision({ stop_hook_active: true }, { repoRoot, cwd: repoRoot }), {});
  });
});

test('stop hook passes when the repository has no check script', () => {
  withTempRepo((repoRoot) => {
    assert.deepEqual(stopCheckDecision({}, { repoRoot, cwd: repoRoot }), {});
  });
});

test('stop hook blocks and reports when check.js fails', () => {
  withTempRepo((repoRoot) => {
    fs.mkdirSync(path.join(repoRoot, 'tools'), { recursive: true });
    fs.writeFileSync(
      path.join(repoRoot, 'tools', 'check.js'),
      'console.log("검증 실패 상세");\nprocess.exit(1);\n'
    );
    const result = stopCheckDecision({}, { repoRoot, cwd: repoRoot });
    assert.equal(result.decision, 'block');
    assert.match(result.reason, /node tools\/check\.js/);
    assert.match(result.reason, /검증 실패 상세/);
  });
});

test('stop hook passes when check.js succeeds', () => {
  withTempRepo((repoRoot) => {
    fs.mkdirSync(path.join(repoRoot, 'tools'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'tools', 'check.js'), 'process.exit(0);\n');
    assert.deepEqual(stopCheckDecision({}, { repoRoot, cwd: repoRoot }), {});
  });
});
