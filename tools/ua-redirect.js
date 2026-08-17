#!/usr/bin/env node
'use strict';

// 프로덕션 적응형 분기는 서버에서 처리하는 것이 원칙이며 이 스크립트는 폴백이다.
// 클라이언트 리다이렉트는 SEO와 초기 렌더에 불리하므로 참조 구현으로만 사용한다.

const fs = require('node:fs');
const path = require('node:path');

/**
 * 분기 규칙의 **정본**. 이 객체 하나가 브라우저로 직렬화되어 들어가므로,
 * 임계값이나 저장 키를 바꾸려면 여기만 고치면 된다.
 *
 * 값을 함수 안에 리터럴로 다시 적지 마라. 예전에는 runBrowserRedirect 가
 * breakpoint·storageKey·validViews 를 자기 안에서 또 선언했고, 테스트는 정작
 * 배포되지 않는 selectView 쪽만 검증했다 — 임계값을 바꿔도 실제 페이지는 그대로인 채
 * 테스트가 전부 통과하는 상태였다. renderRedirectEntry 의 주입 테스트가 이 재발을 막는다.
 */
const CONFIG = Object.freeze({
  breakpoint: 1024,
  storageKey: 'publishing-view',
  validViews: Object.freeze(['pc', 'mo']),
});

// 문서(ARCHITECTURE.md · CONVENTIONS.md)가 개별 값으로 참조하는 이름.
const BREAKPOINT = CONFIG.breakpoint;
const STORAGE_KEY = CONFIG.storageKey;

// ---------- 아래 3개 함수는 생성 HTML에 그대로 직렬화된다 ----------
//
// 그래서 **모듈 스코프의 어떤 것도 참조하면 안 된다.** 필요한 값은 전부 config 인자로
// 받는다. 외부 참조가 하나라도 섞이면 file:// 로 dist/index.html 을 열었을 때
// ReferenceError 로 죽고, Node 안에서 도는 테스트는 그것을 알아채지 못한다.

function normalizeView(value, config) {
  return config.validViews.includes(value) ? value : null;
}

function selectView({ explicitView, storedView, viewportWidth }, config) {
  const explicit = normalizeView(explicitView, config);
  if (explicit) return explicit;

  const stored = normalizeView(storedView, config);
  if (stored) return stored;

  return Number(viewportWidth) >= config.breakpoint ? 'pc' : 'mo';
}

function runBrowserRedirect(browser, config) {
  const currentUrl = new URL(browser.location.href);
  const explicit = normalizeView(currentUrl.searchParams.get('view'), config);

  let storage = null;
  let stored = null;
  try {
    storage = browser.localStorage;
    stored = normalizeView(storage.getItem(config.storageKey), config);
    if (explicit) storage.setItem(config.storageKey, explicit);
  } catch {
    storage = null;
  }

  const documentWidth = browser.document && browser.document.documentElement
    ? browser.document.documentElement.clientWidth
    : 0;
  const viewportWidth = Number(browser.innerWidth) > 0
    ? Number(browser.innerWidth)
    : Number(documentWidth);
  const view = selectView(
    { explicitView: explicit, storedView: stored, viewportWidth },
    config
  );

  const variantPattern = new RegExp(`/(${config.validViews.join('|')})(?:/|$)`);
  const currentVariant = currentUrl.pathname.match(variantPattern);

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

// ---------- 직렬화 ----------

/**
 * Function.prototype.toString() 은 소스 파일의 **원문**을 그대로 돌려준다.
 * Windows 체크아웃(core.autocrlf=true)에서는 그 원문이 CRLF 인데, 아래 템플릿
 * 리터럴의 줄바꿈은 명세상 LF 로 정규화된다. 정규화하지 않으면 한 파일에서 나온 두
 * 조각의 줄바꿈이 갈려 생성 결과가 플랫폼마다 달라지고, 커밋본과 바이트가 맞는지를
 * 테스트로 단언할 수 없게 된다.
 */
const serialize = (fn) => fn.toString().replace(/\r\n/g, '\n');

function renderRedirectEntry() {
  const config = JSON.stringify(CONFIG);
  const source = [normalizeView, selectView, runBrowserRedirect].map(serialize).join('\n\n');
  const script = `(function () {
${source}

runBrowserRedirect(window, ${config});
})();`;

  return `<!doctype html>
<!-- 자동 생성 — 직접 편집 금지. 원본: tools/ua-redirect.js (node tools/build.js 가 덮어쓴다) -->
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>쇼핑몰 화면 선택</title>
</head>
<body>
  <main>
    <h1>쇼핑몰로 이동 중입니다</h1>
    <p>화면 크기와 저장된 선택에 맞는 페이지를 여는 중입니다.</p>
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
  CONFIG,
  STORAGE_KEY,
  generateRedirectEntry,
  normalizeView,
  renderRedirectEntry,
  runBrowserRedirect,
  selectView,
};
