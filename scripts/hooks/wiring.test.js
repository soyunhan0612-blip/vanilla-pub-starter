'use strict';

/**
 * 훅 *배선* 회귀 테스트.
 *
 * 이 저장소는 훅 때문에 같은 사고를 네 번 겪었고, 네 번 다 깨진 것은 판정 로직이
 * 아니라 배선 문자열이었다:
 *   ① jq 부재로 TDD 가드 무력화
 *   ② 셸 도구가 command 를 argv 배열로 보내는데 문자열만 검사
 *   ③ commandWindows 의 중첩 이스케이프가 cmd.exe 를 거치며 깨져 훅이 미기동
 *   ④ .claude/settings.json 이 존재하지 않는 $CLAUDE_TOOL_INPUT 을 읽어 무조건 통과
 *
 * 공통점은 전부 "훅이 실패했는데 작업은 그대로 진행된다" 는 조용한 무력화다.
 * 판정 로직 테스트는 이걸 하나도 잡지 못한다 — 배선 자체를 검사해야 한다.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { MODES } = require('./codex-hook');

const ROOT = path.resolve(__dirname, '..', '..');
const CODEX_HOOKS = path.join(ROOT, '.codex', 'hooks.json');
const CLAUDE_SETTINGS = path.join(ROOT, '.claude', 'settings.json');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/** { event, matcher, command, commandWindows } 목록으로 평탄화한다. */
function hookCommands(config) {
  const out = [];
  for (const [event, groups] of Object.entries(config.hooks || {})) {
    for (const group of groups || []) {
      for (const hook of group.hooks || []) {
        out.push({ event, matcher: group.matcher ?? '', ...hook });
      }
    }
  }
  return out;
}

const modeNames = Object.keys(MODES).join('|');

// ADR-009: 따옴표도 변수 확장도 없는 한 줄. Codex 는 훅을 저장소 루트에서 실행하고
// codex-hook.js 자신이 findRepoRoot(cwd) 로 위치를 잡으므로 상대 경로로 충분하다.
const CODEX_COMMAND = new RegExp(`^node scripts/hooks/codex-hook\\.js (${modeNames})$`);

// Claude 는 $CLAUDE_PROJECT_DIR 만 제공한다. 도구 입력은 stdin JSON 으로 온다.
const CLAUDE_COMMAND = new RegExp(
  `^node "\\$CLAUDE_PROJECT_DIR/(scripts/hooks/[a-z0-9-]+\\.js)"(?: (${modeNames}))?$`
);

/**
 * 한 번씩 실제로 훅을 죽였던 표현들. 배선에서 영구 추방한다.
 * 2>&1 은 stderr 를 stdout 에 합쳐 차단 사유가 에이전트에 전달되지 않게 만든다.
 */
const BANNED = [
  [/\$\(/, '명령 치환 $(...) — cmd.exe 를 거치며 깨진다 (ADR-009)'],
  [/powershell/i, 'PowerShell 래퍼 — 중첩 이스케이프가 깨진다 (ADR-009)'],
  [/\bgrep\b/, 'grep 의존 — 부재 시 조용히 통과한다 (ADR-007 의 jq 사고)'],
  [/CLAUDE_TOOL_INPUT/, '존재하지 않는 환경변수 — 도구 입력은 stdin JSON 이다'],
  [/2>&1/, 'stderr 병합 — 차단 사유가 에이전트에 전달되지 않는다'],
  [/\\{2,}"/, '중첩 이스케이프 — 셸을 거치며 깨진다 (ADR-009)'],
];

// ---------------------------------------------------------------------------
// .codex/hooks.json
// ---------------------------------------------------------------------------

test('.codex 배선은 codex-hook.js 를 따옴표 없는 한 줄로 부른다', () => {
  const entries = hookCommands(readJson(CODEX_HOOKS));
  assert.ok(entries.length, '훅이 하나도 배선되지 않았다');

  for (const entry of entries) {
    for (const key of ['command', 'commandWindows']) {
      assert.match(entry[key], CODEX_COMMAND, `${entry.event} ${key}`);
    }
    // OS 별 분기는 두지 않는다. 한쪽만 고치는 것이 ③번 사고의 형태였다.
    assert.equal(entry.command, entry.commandWindows, `${entry.event} 의 OS 별 명령이 다르다`);
  }
});

test('.codex 배선은 세 가지 책임을 모두 건다', () => {
  const wired = new Set(
    hookCommands(readJson(CODEX_HOOKS)).map((e) => e.command.split(' ').pop())
  );
  assert.deepEqual([...wired].sort(), Object.keys(MODES).sort());
});

// ---------------------------------------------------------------------------
// .claude/settings.json
// ---------------------------------------------------------------------------

test('.claude 배선은 인라인 셸이 아니라 scripts/hooks/ 스크립트를 부른다', () => {
  const entries = hookCommands(readJson(CLAUDE_SETTINGS));
  assert.ok(entries.length, '훅이 하나도 배선되지 않았다');

  for (const entry of entries) {
    const match = entry.command.match(CLAUDE_COMMAND);
    assert.ok(match, `${entry.event} 의 명령이 규약을 벗어난다: ${entry.command}`);
    assert.ok(
      fs.existsSync(path.join(ROOT, match[1])),
      `${match[1]} 가 없다 — 훅이 즉시 실패해 조용히 통과한다`
    );
  }
});

test('.claude 배선도 위험 명령 · TDD · 검증 세 가지를 모두 건다', () => {
  const entries = hookCommands(readJson(CLAUDE_SETTINGS));
  const find = (event, pattern) =>
    entries.find((e) => e.event === event && pattern.test(e.matcher));

  const bash = find('PreToolUse', /Bash/);
  assert.ok(bash, 'Bash 도구에 위험 명령 훅이 없다');
  assert.match(bash.command, /dangerous-command$/);

  const edit = find('PreToolUse', /Write|Edit/);
  assert.ok(edit, 'Write/Edit 도구에 TDD 가드가 없다');
  assert.match(edit.command, /tdd-guard\.js"$/);

  const stop = entries.find((e) => e.event === 'Stop');
  assert.ok(stop, 'Stop 게이트가 없다');
  // check.js 를 직접 부르면 exit 1 이 되는데, 두 에이전트 모두 exit 1 을 차단이
  // 아니라 "비차단 오류" 로 취급한다. stop-check 는 JSON 으로 block 을 낸다.
  assert.match(stop.command, /stop-check$/);
});

// ---------------------------------------------------------------------------
// 공통
// ---------------------------------------------------------------------------

test('배선에 과거 훅을 죽였던 표현이 없다', () => {
  for (const file of [CODEX_HOOKS, CLAUDE_SETTINGS]) {
    const commands = hookCommands(readJson(file))
      .flatMap((e) => [e.command, e.commandWindows])
      .filter(Boolean);

    for (const command of commands) {
      for (const [pattern, why] of BANNED) {
        assert.ok(!pattern.test(command), `${path.basename(file)}: ${why}\n  ${command}`);
      }
    }
  }
});

/**
 * Stop 게이트만 하위 프로세스(tools/check.js)를 띄운다. 기본 타임아웃(Claude 60초)은
 * check.js 가 src/ 테스트 · Tier 1 lint · pytest 를 다 안고 자라면 넘긴다. 넘기는 순간
 * 훅은 "실패"로 끝나고 작업은 그대로 진행된다 — 시간이 지나면 저절로 발생하는 무력화다.
 */
test('Stop 게이트는 timeout 을 명시한다', () => {
  for (const file of [CODEX_HOOKS, CLAUDE_SETTINGS]) {
    const stop = hookCommands(readJson(file)).filter((e) => /stop-check$/.test(e.command));
    assert.ok(stop.length, `${path.basename(file)}: Stop 게이트가 없다`);

    for (const entry of stop) {
      assert.ok(
        typeof entry.timeout === 'number' && entry.timeout > 60,
        `${path.basename(file)}: Stop 게이트의 timeout 이 없거나 기본값(60초) 이하다 — ` +
          `check.js 가 자라면 조용히 타임아웃된다 (현재: ${entry.timeout})`
      );
    }
  }
});

test('배선이 부르는 모드는 codex-hook.js 가 실제로 구현한 것뿐이다', () => {
  const commands = [CODEX_HOOKS, CLAUDE_SETTINGS]
    .flatMap((file) => hookCommands(readJson(file)))
    .flatMap((e) => [e.command, e.commandWindows])
    .filter((c) => c && c.includes('codex-hook.js'));

  assert.ok(commands.length, 'codex-hook.js 를 부르는 배선이 하나도 없다');
  for (const command of commands) {
    const mode = command.split(' ').pop();
    assert.ok(
      Object.prototype.hasOwnProperty.call(MODES, mode),
      `구현되지 않은 모드 '${mode}' — throw 로 exit 1 이 되어 훅이 조용히 빠진다`
    );
    assert.equal(typeof MODES[mode], 'function');
  }
});
