'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  BREAKPOINT,
  CONFIG,
  STORAGE_KEY,
  generateRedirectEntry,
  renderRedirectEntry,
  runBrowserRedirect,
  selectView,
} = require('./ua-redirect');

function createBrowser({ href = 'https://shop.test/', width = 1024, storedView = null } = {}) {
  const values = new Map(storedView ? [[STORAGE_KEY, storedView]] : []);
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
  assert.equal(selectView({ viewportWidth: 1023 }, CONFIG), 'mo');
  assert.equal(selectView({ viewportWidth: 1024 }, CONFIG), 'pc');
});

test('명시 선택은 저장 선택과 뷰포트보다 우선하고 저장 선택은 이후 방문에 유지된다', () => {
  assert.equal(
    selectView({ explicitView: 'mo', storedView: 'pc', viewportWidth: 1440 }, CONFIG),
    'mo'
  );
  assert.equal(selectView({ storedView: 'mo', viewportWidth: 1440 }, CONFIG), 'mo');
});

test('루트의 명시 선택을 저장하고 대응 HTML로 replace 한다', () => {
  const { browser, replacements, values } = createBrowser({
    href: 'https://shop.test/?view=mo',
    width: 1440,
  });

  const result = runBrowserRedirect(browser, CONFIG);

  assert.equal(values.get(STORAGE_KEY), 'mo');
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

  assert.doesNotThrow(() => runBrowserRedirect(browser, CONFIG));
  assert.deepEqual(replacements, ['https://shop.test/mo/index.html']);
});

test('이미 PC/MO 경로에 있으면 자동 재분기하지 않아 리다이렉트 루프를 막는다', () => {
  const { browser, replacements } = createBrowser({
    href: 'https://shop.test/pc/product-detail.html',
    width: 360,
    storedView: 'mo',
  });

  const result = runBrowserRedirect(browser, CONFIG);

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

test('file 루트에서도 드라이브 루트가 아닌 이관 폴더 안의 PC 페이지로 이동한다', () => {
  const { browser, replacements } = createBrowser({
    href: 'file:///C:/handover/index.html?view=pc',
    width: 360,
  });

  runBrowserRedirect(browser, CONFIG);

  assert.deepEqual(replacements, ['file:///C:/handover/pc/index.html']);
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

// --- 아래 3개는 로직이 아니라 **연결**을 검증한다 ---------------------------------
// 판정이 맞아도 그것이 브라우저까지 실려 나가지 않으면 아무 소용이 없다.
// 이 저장소는 같은 형태의 조용한 무력화를 반복해서 겪었다 (ADR-011).

test('생성 HTML은 정본 CONFIG를 그대로 주입한다', () => {
  const html = renderRedirectEntry();

  assert.match(html, new RegExp(`"breakpoint":\\s*${BREAKPOINT}\\b`));
  assert.match(html, new RegExp(`"storageKey":\\s*"${STORAGE_KEY}"`));
  assert.match(html, /runBrowserRedirect\(window, \{/);

  // 상수를 함수 안에 리터럴로 되돌려 적는 회귀를 막는다.
  assert.doesNotMatch(html, /const\s+breakpoint\s*=/);
  assert.doesNotMatch(html, /const\s+storageKey\s*=/);
  assert.doesNotMatch(html, /const\s+validViews\s*=/);
});

test('직렬화된 함수는 모듈 스코프를 참조하지 않아 브라우저에서 그대로 실행된다', () => {
  const html = renderRedirectEntry();
  const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'));

  // 모듈 스코프 이름(CONFIG/BREAKPOINT/STORAGE_KEY)이 새 나가면 file:// 에서
  // ReferenceError 로 죽는다. Node 안에서 도는 다른 테스트는 이것을 못 잡는다.
  assert.doesNotMatch(script, /\bCONFIG\b|\bBREAKPOINT\b|\bSTORAGE_KEY\b/);

  // 실제로 격리된 스코프에서 돌려 본다.
  const { browser, replacements } = createBrowser({ href: 'https://shop.test/', width: 360 });
  new Function('window', script)(browser);
  assert.deepEqual(replacements, ['https://shop.test/mo/index.html']);
});

test('생성 결과는 플랫폼과 무관하게 LF 로만 끝난다', () => {
  // toString() 은 소스 원문의 CRLF 를 그대로 옮기는데 템플릿 리터럴은 LF 로
  // 정규화된다. 섞이면 커밋본과 바이트가 맞는지 단언할 수 없다.
  assert.doesNotMatch(renderRedirectEntry(), /\r/);
});
