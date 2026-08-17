'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  BREAKPOINT,
  generateRedirectEntry,
  renderRedirectEntry,
  runBrowserRedirect,
  selectView,
} = require('./ua-redirect');

function createBrowser({ href = 'https://shop.test/', width = 1024, storedView = null } = {}) {
  const values = new Map(storedView ? [['publishing-view', storedView]] : []);
  const replacements = [];
  return {
    browser: {
      innerWidth: width,
      location: {
        href,
        replace(target) {
          replacements.push(target);
        },
      },
      localStorage: {
        getItem(key) {
          return values.get(key) || null;
        },
        setItem(key, value) {
          values.set(key, value);
        },
      },
    },
    replacements,
    values,
  };
}

test('뷰포트 1024px을 PC/MO 경계로 사용하고 UA 문자열은 요구하지 않는다', () => {
  assert.equal(BREAKPOINT, 1024);
  assert.equal(selectView({ viewportWidth: 1023 }), 'mo');
  assert.equal(selectView({ viewportWidth: 1024 }), 'pc');
});

test('명시 선택은 저장 선택과 뷰포트보다 우선하고 저장 선택은 이후 방문에 유지된다', () => {
  assert.equal(
    selectView({ explicitView: 'mo', storedView: 'pc', viewportWidth: 1440 }),
    'mo'
  );
  assert.equal(selectView({ storedView: 'mo', viewportWidth: 1440 }), 'mo');
});

test('루트의 명시 선택을 저장하고 대응 HTML로 replace 한다', () => {
  const { browser, replacements, values } = createBrowser({
    href: 'https://shop.test/?view=mo',
    width: 1440,
  });

  const result = runBrowserRedirect(browser);

  assert.equal(values.get('publishing-view'), 'mo');
  assert.deepEqual(replacements, ['https://shop.test/mo/index.html']);
  assert.equal(result.redirected, true);
  assert.equal(result.view, 'mo');
});

test('저장소를 사용할 수 없어도 뷰포트로 분기한다', () => {
  const { browser, replacements } = createBrowser({ width: 360 });
  Object.defineProperty(browser, 'localStorage', {
    get() {
      throw new Error('storage disabled');
    },
  });

  assert.doesNotThrow(() => runBrowserRedirect(browser));
  assert.deepEqual(replacements, ['https://shop.test/mo/index.html']);
});

test('이미 PC/MO 경로에 있으면 자동 재분기하지 않아 리다이렉트 루프를 막는다', () => {
  const { browser, replacements } = createBrowser({
    href: 'https://shop.test/pc/product-detail.html',
    width: 360,
    storedView: 'mo',
  });

  const result = runBrowserRedirect(browser);

  assert.deepEqual(replacements, []);
  assert.equal(result.redirected, false);
  assert.equal(result.reason, 'variant-path');
});

test('생성 HTML은 file 경로에서도 동작하는 상대 목적지와 수동 폴백을 제공한다', () => {
  const html = renderRedirectEntry();
  assert.match(html, /<html lang="ko">/);
  assert.match(html, /pc\/index\.html/);
  assert.match(html, /mo\/index\.html/);
  assert.match(html, /runBrowserRedirect/);
  assert.doesNotMatch(html, /userAgent|navigator/);
});

test('루트 진입 HTML을 src/index.html에 생성한다', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ua-redirect-'));
  try {
    const output = generateRedirectEntry(root);
    assert.equal(output, path.join(root, 'src', 'index.html'));
    assert.equal(fs.readFileSync(output, 'utf8'), renderRedirectEntry());
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
