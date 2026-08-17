#!/usr/bin/env node
'use strict';

// 프로덕션 적응형 분기는 서버에서 처리하는 것이 원칙이며 이 스크립트는 폴백이다.
// 클라이언트 리다이렉트는 SEO와 초기 렌더에 불리하므로 참조 구현으로만 사용한다.

const fs = require('node:fs');
const path = require('node:path');

const BREAKPOINT = 1024;
const STORAGE_KEY = 'publishing-view';
const VIEWS = new Set(['pc', 'mo']);

function normalizeView(value) {
  return VIEWS.has(value) ? value : null;
}

function selectView({ explicitView, storedView, viewportWidth }) {
  const explicit = normalizeView(explicitView);
  if (explicit) return explicit;

  const stored = normalizeView(storedView);
  if (stored) return stored;

  return Number(viewportWidth) >= BREAKPOINT ? 'pc' : 'mo';
}

/**
 * 생성 HTML에 그대로 직렬화되는 브라우저 함수다. 외부 변수에 기대지 않아야
 * file:// 로 dist/index.html을 열어도 같은 코드가 실행된다.
 */
function runBrowserRedirect(browser) {
  const breakpoint = 1024;
  const storageKey = 'publishing-view';
  const validViews = ['pc', 'mo'];
  const currentUrl = new URL(browser.location.href);
  const explicit = validViews.includes(currentUrl.searchParams.get('view'))
    ? currentUrl.searchParams.get('view')
    : null;

  let storage = null;
  let stored = null;
  try {
    storage = browser.localStorage;
    stored = validViews.includes(storage.getItem(storageKey))
      ? storage.getItem(storageKey)
      : null;
    if (explicit) storage.setItem(storageKey, explicit);
  } catch {
    storage = null;
  }

  const documentWidth = browser.document && browser.document.documentElement
    ? browser.document.documentElement.clientWidth
    : 0;
  const viewportWidth = Number(browser.innerWidth) > 0
    ? Number(browser.innerWidth)
    : Number(documentWidth);
  const view = explicit || stored || (viewportWidth >= breakpoint ? 'pc' : 'mo');
  const currentVariant = currentUrl.pathname.match(/\/(pc|mo)(?:\/|$)/);

  // 이미 변형 페이지라면 폭 변화나 저장값으로 다시 보내지 않는다. PC/MO 양쪽에서
  // 서로를 재분기하면 모바일 브라우저의 주소창 변화만으로도 루프가 생길 수 있다.
  if (currentVariant) {
    return { redirected: false, reason: 'variant-path', view: currentVariant[1] };
  }

  const target = new URL(`${view}/index.html`, new URL('.', currentUrl));
  if (target.href === currentUrl.href) {
    return { redirected: false, reason: 'same-url', view };
  }

  browser.location.replace(target.href);
  return { redirected: true, view, storageAvailable: Boolean(storage) };
}

function renderRedirectEntry() {
  const script = `(${runBrowserRedirect.toString()})(window);`;
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>쇼핑몰 화면 선택</title>
</head>
<body>
  <main>
    <h1>쇼핑몰로 이동 중입니다</h1>
    <p role="status">화면 크기와 저장된 선택에 맞는 페이지를 여는 중입니다.</p>
    <noscript>
      <p>JavaScript를 사용할 수 없으면 <a href="pc/index.html">PC 버전</a> 또는 <a href="mo/index.html">모바일 버전</a>을 선택하세요.</p>
    </noscript>
  </main>
  <script>${script}</script>
</body>
</html>
`;
}

function generateRedirectEntry(root = path.join(__dirname, '..')) {
  const output = path.join(path.resolve(root), 'src', 'index.html');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, renderRedirectEntry(), 'utf8');
  return output;
}

if (require.main === module) {
  const output = generateRedirectEntry();
  console.log(`[ua-redirect] 생성: ${path.relative(path.join(__dirname, '..'), output)}`);
}

module.exports = {
  BREAKPOINT,
  STORAGE_KEY,
  generateRedirectEntry,
  normalizeView,
  renderRedirectEntry,
  runBrowserRedirect,
  selectView,
};
