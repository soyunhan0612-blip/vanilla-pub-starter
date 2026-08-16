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
  findRepoRoot,
  shouldRequireTest,
  stopCheckDecision,
  tddGuardDecision,
  testCandidates,
} = require('./codex-hook');
const tddGuard = require('./tdd-guard');

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

/** 주 셸이 PowerShell 인 환경에서 `rm -rf` 패턴만 두면 삭제가 그대로 통과한다. */
test('dangerous command hook blocks PowerShell recursive force deletes', () => {
  for (const command of [
    'Remove-Item -Recurse -Force C:\\sample\\src',
    'Remove-Item C:\\sample\\src -Force -Recurse',
    'Get-ChildItem x | Remove-Item -rec -for',
  ]) {
    const result = dangerousCommandDecision({ tool_input: { command } });
    assert.equal(result.hookSpecificOutput?.permissionDecision, 'deny', command);
  }
});

/**
 * rm·rd·rmdir·del·erase 는 전부 Remove-Item 의 별칭이고, PowerShell 은 스위치를
 * 고유 접두사까지 줄여 받는다. Remove-Item 과 3글자 스위치만 보면 아래가 전부
 * 통과한다 — 실제로 통과했다.
 */
test('dangerous command hook blocks Remove-Item aliases and abbreviated switches', () => {
  for (const command of [
    'Remove-Item -r -fo C:\\sample\\src',
    'rm -r -fo C:\\sample\\src',
    'rd -r -fo C:\\sample\\src',
    'del -Recurse -Force C:\\sample\\src',
    'erase -r -fo C:\\sample\\src',
    'rmdir /s /q C:\\sample\\src',
  ]) {
    const result = dangerousCommandDecision({ tool_input: { command } });
    assert.equal(result.hookSpecificOutput?.permissionDecision, 'deny', command);
  }
});

test('dangerous command hook blocks git push -f but allows --force-with-lease', () => {
  // -f 는 --force 와 같은 일을 한다. 반대로 --force-with-lease 는 안전한 대체재이므로
  // 막으면 남는 선택지가 없어져 우회를 부른다.
  assert.equal(
    dangerousCommandDecision({ tool_input: { command: 'git push -f origin master' } })
      .hookSpecificOutput?.permissionDecision,
    'deny'
  );
  assert.deepEqual(
    dangerousCommandDecision({ tool_input: { command: 'git push --force-with-lease' } }),
    {}
  );
});

test('dangerous command hook leaves non-destructive Remove-Item alone', () => {
  // 스위치 하나만으로는 위험하다고 단정할 수 없다. 과잉 차단은 우회를 부른다.
  for (const command of [
    'Remove-Item C:\\sample\\tmp\\one.txt',
    'Remove-Item C:\\sample\\tmp -Recurse',
    'Remove-Item C:\\sample\\tmp\\one.txt -Force',
  ]) {
    assert.deepEqual(dangerousCommandDecision({ tool_input: { command } }), {}, command);
  }
});

// ---------------------------------------------------------------------------
// findRepoRoot — 훅마다 새 프로세스로 뜨므로 git 을 또 띄우지 않는다
// ---------------------------------------------------------------------------

test('findRepoRoot walks up to the directory that owns .git', () => {
  withTempRepo((repoRoot) => {
    const nested = path.join(repoRoot, 'src', 'assets', 'js');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(repoRoot, '.git'), 'gitdir: elsewhere\n'); // worktree 형태
    assert.equal(fs.realpathSync(findRepoRoot(nested)), fs.realpathSync(repoRoot));
  });
});

test('findRepoRoot falls back to cwd outside a repository', () => {
  withTempRepo((repoRoot) => {
    // .git 이 없으면 위로 끝까지 올라가지 않고 cwd 를 그대로 쓴다.
    const result = findRepoRoot(repoRoot);
    assert.ok(result === repoRoot || fs.existsSync(path.join(result, '.git')));
  });
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
// shouldRequireTest — AGENTS.md 레이어 규칙을 코드로 옮긴 지점
// ---------------------------------------------------------------------------

test('shouldRequireTest demands a test for util/ logic', () => {
  assert.equal(shouldRequireTest('/repo/src/assets/js/util/format.js', '/repo'), true);
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
    '/repo/src/assets/js/lib/helper.js',
    '/repo/dist/assets/js/util/format.js',
    '/repo/src/assets/js/util/format.test.js',
    '/repo/src/assets/scss/_tokens.scss',
    '/repo/README.md',
  ]) {
    assert.equal(shouldRequireTest(exempt, '/repo'), false, exempt);
  }
});

/**
 * 범위 판정을 두 벌 갖지 않는다. 두 벌이 되면 같은 파일이 Codex 에서는 차단,
 * Claude 에서는 통과가 되고 어느 쪽도 tools/check.js 의 checkTddGuard 와
 * 일치하지 않는다 — 실제로 그런 드리프트가 있었다.
 */
test('TDD 범위 판정은 tdd-guard.js 를 그대로 재사용한다 (두 벌 금지)', () => {
  assert.equal(shouldRequireTest, tddGuard.shouldRequireTest);
  assert.equal(testCandidates, tddGuard.testCandidates);
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
