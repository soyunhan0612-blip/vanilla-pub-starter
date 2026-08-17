'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { resolveIncludes } = require('./include');

function createFixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'include-'));
  const componentsDir = path.join(root, 'src', 'assets', 'components');
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(componentsDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }
  return { root, componentsDir };
}

test('중첩 include를 끝까지 해소한다', () => {
  const fixture = createFixture({
    'common/button.html': '<button><!-- @include common/icon.html -->구매</button>',
    'common/icon.html': '<svg aria-hidden="true"></svg>',
  });
  try {
    const result = resolveIncludes('앞<!-- @include common/button.html -->뒤', fixture);
    assert.equal(result, '앞<button><svg aria-hidden="true"></svg>구매</button>뒤');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('순환 include를 경로 체인과 함께 거부한다', () => {
  const fixture = createFixture({
    'common/a.html': '<!-- @include common/b.html -->',
    'common/b.html': '<!-- @include common/a.html -->',
  });
  try {
    assert.throws(
      () => resolveIncludes('<!-- @include common/a.html -->', fixture),
      /순환 @include 감지: common\/a\.html -> common\/b\.html -> common\/a\.html/
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('대상 파일이 없으면 요청 경로를 포함해 실패한다', () => {
  const fixture = createFixture({});
  try {
    assert.throws(
      () => resolveIncludes('<!-- @include common/missing.html -->', fixture),
      /대상 파일이 없다: common\/missing\.html/
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('@component 메타데이터 주석을 결과물에서 제거한다', () => {
  const fixture = createFixture({
    'common/card.html': [
      '<!--',
      '  @component 상품 카드',
      '  @description 목록용 카드',
      '-->',
      '<article>상품</article>',
    ].join('\n'),
  });
  try {
    const result = resolveIncludes('<!-- @include common/card.html -->', fixture);
    assert.doesNotMatch(result, /@component/);
    assert.match(result, /<article>상품<\/article>/);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
