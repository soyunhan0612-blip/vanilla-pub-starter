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

test('#변형을 지정하면 해당 블록만 가져온다', () => {
  const fixture = createFixture({
    'common/image.html': [
      '<section class="showcase">',
      '  <h2>반응형 이미지</h2>',
      '  <!-- @variant default -->',
      '  <picture class="a"></picture>',
      '  <!-- @endvariant -->',
      '  <!-- @variant fixed-ratio -->',
      '  <picture class="b"></picture>',
      '  <!-- @endvariant -->',
      '</section>',
    ].join('\n'),
  });
  try {
    const result = resolveIncludes('<!-- @include common/image.html#fixed-ratio -->', fixture);
    assert.match(result, /<picture class="b"><\/picture>/);
    assert.doesNotMatch(result, /<picture class="a">/);
    assert.doesNotMatch(result, /<h2>/);
    assert.doesNotMatch(result, /<section/);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('변형을 지정하지 않으면 파일 전체를 가져오고 마커만 사라진다', () => {
  const fixture = createFixture({
    'common/image.html': [
      '<section>',
      '  <!-- @variant default -->',
      '  <picture class="a"></picture>',
      '  <!-- @endvariant -->',
      '</section>',
    ].join('\n'),
  });
  try {
    const result = resolveIncludes('<!-- @include common/image.html -->', fixture);
    assert.match(result, /<section>/);
    assert.match(result, /<picture class="a"><\/picture>/);
    assert.doesNotMatch(result, /@variant/);
    assert.doesNotMatch(result, /@endvariant/);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('없는 변형을 요청하면 사용 가능한 이름과 함께 실패한다', () => {
  const fixture = createFixture({
    'common/image.html': '<!-- @variant default --><picture></picture><!-- @endvariant -->',
  });
  try {
    assert.throws(
      () => resolveIncludes('<!-- @include common/image.html#eager -->', fixture),
      /변형을 찾을 수 없다: common\/image\.html#eager \(사용 가능: default\)/
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('변형이 하나도 없는 파일에 #을 쓰면 사용 가능 목록을 없음으로 알린다', () => {
  const fixture = createFixture({ 'common/image.html': '<picture></picture>' });
  try {
    assert.throws(
      () => resolveIncludes('<!-- @include common/image.html#eager -->', fixture),
      /변형을 찾을 수 없다: common\/image\.html#eager \(사용 가능: 없음\)/
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('같은 이름의 변형이 두 번 선언되면 실패한다', () => {
  const fixture = createFixture({
    'common/image.html': [
      '<!-- @variant default --><picture class="a"></picture><!-- @endvariant -->',
      '<!-- @variant default --><picture class="b"></picture><!-- @endvariant -->',
    ].join('\n'),
  });
  try {
    assert.throws(
      () => resolveIncludes('<!-- @include common/image.html#default -->', fixture),
      /@variant 이름이 중복됐다: common\/image\.html#default/
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('닫히지 않은 변형 마커는 실패한다', () => {
  const fixture = createFixture({
    'common/image.html': '<!-- @variant default --><picture></picture>',
  });
  try {
    assert.throws(
      () => resolveIncludes('<!-- @include common/image.html#default -->', fixture),
      /@variant 가 닫히지 않았다: common\/image\.html#default/
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('짝이 없는 @endvariant는 실패한다', () => {
  const fixture = createFixture({
    'common/image.html': '<picture></picture><!-- @endvariant -->',
  });
  try {
    assert.throws(
      () => resolveIncludes('<!-- @include common/image.html#default -->', fixture),
      /짝이 없는 @endvariant: common\/image\.html/
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('중첩된 @variant는 실패한다', () => {
  const fixture = createFixture({
    'common/image.html': [
      '<!-- @variant outer -->',
      '<!-- @variant inner --><picture></picture><!-- @endvariant -->',
      '<!-- @endvariant -->',
    ].join('\n'),
  });
  try {
    assert.throws(
      () => resolveIncludes('<!-- @include common/image.html#outer -->', fixture),
      /@variant 가 중첩됐다: common\/image\.html#inner/
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('변형 블록 안의 중첩 include도 해소한다', () => {
  const fixture = createFixture({
    'ecommerce/card.html': [
      '<!-- @variant grid -->',
      '<article><!-- @include common/icon.html --></article>',
      '<!-- @endvariant -->',
      '<!-- @variant list --><article>목록</article><!-- @endvariant -->',
    ].join('\n'),
    'common/icon.html': '<svg aria-hidden="true"></svg>',
  });
  try {
    const result = resolveIncludes('<!-- @include ecommerce/card.html#grid -->', fixture);
    assert.match(result, /<article><svg aria-hidden="true"><\/svg><\/article>/);
    assert.doesNotMatch(result, /목록/);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('변형이 다르면 같은 파일을 다시 include해도 순환이 아니다', () => {
  const fixture = createFixture({
    'common/pair.html': [
      '<!-- @variant one --><b><!-- @include common/pair.html#two --></b><!-- @endvariant -->',
      '<!-- @variant two --><i>끝</i><!-- @endvariant -->',
    ].join('\n'),
  });
  try {
    const result = resolveIncludes('<!-- @include common/pair.html#one -->', fixture);
    assert.match(result, /<b><i>끝<\/i><\/b>/);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('같은 변형을 스스로 include하면 순환으로 거부한다', () => {
  const fixture = createFixture({
    'common/loop.html': '<!-- @variant one --><!-- @include common/loop.html#one --><!-- @endvariant -->',
  });
  try {
    assert.throws(
      () => resolveIncludes('<!-- @include common/loop.html#one -->', fixture),
      /순환 @include 감지: common\/loop\.html#one -> common\/loop\.html#one/
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
