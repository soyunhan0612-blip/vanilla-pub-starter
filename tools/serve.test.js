'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const { getListenPort, getMimeType, parseArgs, readServedFile, resolveFilePath } = require('./serve');

const SERVE = path.join(__dirname, 'serve.js');

test('요구된 정적 자산 MIME 타입을 반환한다', () => {
  const expected = {
    'index.html': 'text/html; charset=utf-8',
    'app.css': 'text/css; charset=utf-8',
    'app.js': 'text/javascript; charset=utf-8',
    'data.json': 'application/json; charset=utf-8',
    'icon.svg': 'image/svg+xml; charset=utf-8',
    'image.png': 'image/png',
    'image.jpg': 'image/jpeg',
    'image.webp': 'image/webp',
    'font.woff2': 'font/woff2',
  };
  for (const [file, mime] of Object.entries(expected)) assert.equal(getMimeType(file), mime);
});

test('일반 서버는 기본 포트 3000, 포트 미지정 smoke는 임시 포트를 쓴다', () => {
  assert.equal(getListenPort(parseArgs([])), 3000);
  assert.equal(getListenPort(parseArgs(['--smoke'])), 0);
  assert.equal(getListenPort(parseArgs(['--smoke', '--port=3100'])), 3100);
});

test('디렉토리 요청은 index.html로 해석한다', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-dir-'));
  try {
    const index = path.join(root, 'catalog', 'index.html');
    fs.mkdirSync(path.dirname(index), { recursive: true });
    fs.writeFileSync(index, '<main>catalog</main>', 'utf8');
    assert.equal(resolveFilePath('/catalog/', root), index);
    assert.equal(resolveFilePath('/catalog', root), index);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('HTML 응답에서 include를 실시간 해소한다', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-html-'));
  try {
    const page = path.join(root, 'index.html');
    const component = path.join(root, 'assets', 'components', 'common', 'button.html');
    fs.mkdirSync(path.dirname(component), { recursive: true });
    fs.writeFileSync(page, '<main><!-- @include common/button.html --></main>', 'utf8');
    fs.writeFileSync(component, '<button>구매</button>', 'utf8');
    assert.equal(readServedFile(page, root).toString('utf8'), '<main><button>구매</button></main>');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--timeout 은 초 단위로 파싱하고 기본값은 없다', () => {
  assert.equal(parseArgs([]).timeout, null);
  assert.equal(parseArgs(['--timeout=5']).timeout, 5);
  assert.equal(parseArgs(['--timeout', '5']).timeout, 5);
});

test('--timeout 은 양수만 받는다', () => {
  assert.throws(() => parseArgs(['--timeout=0']), /timeout/);
  assert.throws(() => parseArgs(['--timeout=-1']), /timeout/);
  assert.throws(() => parseArgs(['--timeout=abc']), /timeout/);
});

// bare `serve.js` 는 리스닝 소켓이 이벤트 루프를 붙잡아 스스로 끝나지 않는다.
// 자동화가 띄운 서버가 그대로 남으면 포트를 문 채 쌓여 다음 기동이 EADDRINUSE 로
// 실패한다. --timeout 은 그 서버가 구조적으로 불멸일 수 없게 만드는 자리다.
test('--timeout 이 지나면 서버가 스스로 종료한다', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-timeout-'));
  try {
    const result = spawnSync(
      process.execPath,
      [SERVE, '--port=0', '--timeout=1', `--root=${root}`],
      { encoding: 'utf8', timeout: 15000 }
    );
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    assert.equal(result.status, 0, output);
    assert.equal(result.signal, null, `시간 안에 스스로 끝나지 않았다: ${output}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--smoke는 빈 문서 루트의 HTTP 404 응답도 성공으로 처리한다', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-smoke-'));
  try {
    const result = spawnSync(
      process.execPath,
      [SERVE, '--smoke', `--root=${root}`],
      { encoding: 'utf8', timeout: 10000 }
    );
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    assert.equal(result.status, 0, output);
    assert.match(output, /smoke 통과 \(HTTP 404\)/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
