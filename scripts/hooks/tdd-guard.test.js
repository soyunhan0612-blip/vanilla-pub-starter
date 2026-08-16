'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const { shouldRequireTest, testCandidates, tddGuardDecision } = require('./tdd-guard');

const HOOK_SCRIPT = path.join(__dirname, 'tdd-guard.js');

// tools/check.js 의 checkTddGuard() 와 같은 레이아웃을 임시 저장소에 만든다.
function makeRepo() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tdd-guard-')));
  for (const dir of [
    ['src', 'assets', 'js', 'util'],
    ['src', 'assets', 'js', 'common'],
    ['src', '__tests__'],
    ['dist', 'assets', 'js', 'util'],
    ['scripts', 'hooks'],
    ['tools'],
  ]) {
    fs.mkdirSync(path.join(root, ...dir), { recursive: true });
  }
  return root;
}

function withRepo(fn) {
  const root = makeRepo();
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function decide(root, filePath) {
  return tddGuardDecision({ tool_input: { file_path: filePath } }, { projectDir: root });
}

function assertDenied(result, expectedInReason) {
  assert.equal(result.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(result.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(result.hookSpecificOutput.permissionDecisionReason, expectedInReason);
}

// --- 1. 검사 대상: util/ 의 구현 파일 ---

test('테스트가 없는 util/ 구현 파일은 차단한다', () => {
  withRepo((root) => {
    const target = path.join(root, 'src', 'assets', 'js', 'util', 'format.js');
    assertDenied(decide(root, target), /format/);
  });
});

test('src/__tests__/<base>.test.js 가 있으면 통과한다', () => {
  withRepo((root) => {
    fs.writeFileSync(path.join(root, 'src', '__tests__', 'format.test.js'), '');
    const target = path.join(root, 'src', 'assets', 'js', 'util', 'format.js');
    assert.deepEqual(decide(root, target), {});
  });
});

test('util/ 옆의 <base>.test.js 가 있어도 통과한다 (check.js 의 2번째 후보)', () => {
  withRepo((root) => {
    const utilDir = path.join(root, 'src', 'assets', 'js', 'util');
    fs.writeFileSync(path.join(utilDir, 'format.test.js'), '');
    assert.deepEqual(decide(root, path.join(utilDir, 'format.js')), {});
  });
});

test('테스트 파일 자체를 수정하는 것은 통과한다', () => {
  withRepo((root) => {
    const target = path.join(root, 'src', 'assets', 'js', 'util', 'format.test.js');
    assert.deepEqual(decide(root, target), {});
  });
});

test('util/ 하위 폴더의 구현 파일도 검사 대상이다', () => {
  withRepo((root) => {
    const nested = path.join(root, 'src', 'assets', 'js', 'util', 'nested');
    fs.mkdirSync(nested, { recursive: true });
    assertDenied(decide(root, path.join(nested, 'deep.js')), /deep/);
  });
});

// --- 2. 검사 대상 밖 (이번 수정의 핵심) ---

test('저장소 밖 절대경로는 통과한다', () => {
  withRepo((root) => {
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tdd-guard-outside-')));
    try {
      assert.deepEqual(decide(root, path.join(outside, 'scratch', 'cfg.js')), {});
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

test('scripts/hooks/ 의 스크립트는 통과한다', () => {
  withRepo((root) => {
    assert.deepEqual(decide(root, path.join(root, 'scripts', 'hooks', 'codex-hook.js')), {});
  });
});

test('dist/ 의 빌드 산출물은 통과한다', () => {
  withRepo((root) => {
    const target = path.join(root, 'dist', 'assets', 'js', 'util', 'api.js');
    assert.deepEqual(decide(root, target), {});
  });
});

test('tools/ 의 도구는 통과한다', () => {
  withRepo((root) => {
    assert.deepEqual(decide(root, path.join(root, 'tools', 'check.js')), {});
  });
});

test('util/ 이 아닌 assets/js 하위는 통과한다', () => {
  withRepo((root) => {
    const target = path.join(root, 'src', 'assets', 'js', 'common', 'header.js');
    assert.deepEqual(decide(root, target), {});
    assert.deepEqual(decide(root, path.join(root, 'src', 'assets', 'js', 'pc.js')), {});
  });
});

test('util/ 안이라도 .js 가 아니면 통과한다', () => {
  withRepo((root) => {
    const utilDir = path.join(root, 'src', 'assets', 'js', 'util');
    for (const name of ['notes.md', 'data.json', 'legacy.ts']) {
      assert.deepEqual(decide(root, path.join(utilDir, name)), {}, name);
    }
  });
});

// --- 3. 입력 형태 ---

test('상대 경로는 저장소 루트 기준으로 해석한다', () => {
  withRepo((root) => {
    assertDenied(decide(root, 'src/assets/js/util/format.js'), /format/);
    assert.deepEqual(decide(root, 'tools/check.js'), {});
  });
});

test('역슬래시·대소문자가 섞인 Windows 경로도 같은 판정을 낸다', { skip: process.platform !== 'win32' }, () => {
  withRepo((root) => {
    const messy = `${root.toUpperCase()}\\src\\assets\\js\\util\\format.js`;
    assertDenied(decide(root, messy), /format/);

    fs.writeFileSync(path.join(root, 'src', '__tests__', 'format.test.js'), '');
    assert.deepEqual(decide(root, messy), {});
  });
});

test('file_path 가 없으면 통과한다 (fail-open)', () => {
  withRepo((root) => {
    assert.deepEqual(tddGuardDecision({}, { projectDir: root }), {});
    assert.deepEqual(tddGuardDecision({ tool_input: {} }, { projectDir: root }), {});
    assert.deepEqual(tddGuardDecision({ tool_input: { file_path: '' } }, { projectDir: root }), {});
    assert.deepEqual(tddGuardDecision(null, { projectDir: root }), {});
  });
});

// --- 4. 보조 함수 ---

test('testCandidates 는 check.js 와 같은 2개 후보를 낸다', () => {
  withRepo((root) => {
    const target = path.join(root, 'src', 'assets', 'js', 'util', 'format.js');
    assert.deepEqual(testCandidates(target, root), [
      path.join(root, 'src', '__tests__', 'format.test.js'),
      path.join(root, 'src', 'assets', 'js', 'util', 'format.test.js'),
    ]);
  });
});

test('shouldRequireTest 는 util/ 구현 파일에만 true 를 낸다', () => {
  withRepo((root) => {
    const util = path.join(root, 'src', 'assets', 'js', 'util');
    assert.equal(shouldRequireTest(path.join(util, 'format.js'), root), true);
    assert.equal(shouldRequireTest(path.join(util, 'format.test.js'), root), false);
    assert.equal(shouldRequireTest(path.join(root, 'tools', 'check.js'), root), false);
  });
});

// --- 5. CLI 계층 ---

function runHook(stdin, cwd) {
  return spawnSync(process.execPath, [HOOK_SCRIPT], {
    input: stdin,
    encoding: 'utf8',
    cwd,
    env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
    windowsHide: true,
  });
}

test('CLI: 깨진 JSON 이 들어와도 exit 0 으로 통과시킨다 (fail-open)', () => {
  withRepo((root) => {
    const r = runHook('{ not json', root);
    assert.equal(r.status, 0);
    assert.deepEqual(JSON.parse(r.stdout), {});
  });
});

test('CLI: 빈 입력도 exit 0 으로 통과시킨다', () => {
  withRepo((root) => {
    const r = runHook('', root);
    assert.equal(r.status, 0);
    assert.deepEqual(JSON.parse(r.stdout), {});
  });
});

test('CLI: CLAUDE_PROJECT_DIR 을 저장소 루트로 사용한다', () => {
  withRepo((root) => {
    const payload = JSON.stringify({
      tool_input: { file_path: path.join(root, 'src', 'assets', 'js', 'util', 'format.js') },
    });
    const denied = runHook(payload, root);
    assert.equal(denied.status, 0);
    assertDenied(JSON.parse(denied.stdout), /format/);

    fs.writeFileSync(path.join(root, 'src', '__tests__', 'format.test.js'), '');
    const allowed = runHook(payload, root);
    assert.equal(allowed.status, 0);
    assert.deepEqual(JSON.parse(allowed.stdout), {});
  });
});
