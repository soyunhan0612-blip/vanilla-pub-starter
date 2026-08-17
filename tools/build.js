#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  collectVariants,
  resolveIncludes,
  selectVariant,
  stripComponentComments,
  stripVariantMarkers,
} = require('./include');
const { generateRedirectEntry } = require('./ua-redirect');

const DEFAULT_ROOT = path.join(__dirname, '..');
const VARIANTS = ['pc', 'mo'];
const CATEGORIES = ['common', 'ecommerce', 'layout'];
const LAYOUT_LABELS = Object.freeze({
  index: '메인',
  category: '카테고리',
  'product-list': '상품 목록',
  'product-detail': '상품 상세',
  cart: '장바구니',
  order: '주문·결제',
  mypage: '마이페이지',
});

function walkFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function toPosix(filePath) {
  return filePath.replace(/\\/g, '/');
}

function parseCommentTags(comment) {
  const tags = new Map();
  const matches = [...comment.matchAll(/@([a-z][\w-]*)\b/gi)];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const end = index + 1 < matches.length ? matches[index + 1].index : comment.length;
    const value = comment
      .slice(match.index + match[0].length, end)
      .replace(/-->/g, '')
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*\*?\s*/, '').trim())
      .filter(Boolean)
      .join(' ')
      .trim();
    const name = match[1].toLowerCase();
    if (!tags.has(name)) tags.set(name, []);
    tags.get(name).push(value);
  }

  return tags;
}

function parseOptions(values = []) {
  return values
    .flatMap((value) => value.split('|'))
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const match = value.match(/^(\S+?)(?:\s+[—–]\s+([\s\S]+))?$/);
      return {
        name: match ? match[1] : value,
        description: match && match[2] ? match[2].trim() : '',
      };
    });
}

function formatOptions(options) {
  return options
    .map(({ name, description }) => (description ? `${name} — ${description}` : name))
    .join(' | ');
}

/**
 * include.js 와 같은 HTML 주석 경계를 사용해 한 fragment의 문서 메타데이터를 읽는다.
 * 태그 값은 다음 태그가 시작될 때까지 이어지므로 줄바꿈된 설명도 한 값으로 합쳐진다.
 */
function parseComponentSource(source, relativePath = '') {
  const comments = String(source).match(/<!--(?:(?!-->)[\s\S])*?-->/g) || [];
  const comment = comments.find((candidate) => /@component\b/.test(candidate));
  if (!comment) return null;

  const tags = parseCommentTags(comment);
  const name = (tags.get('component') || [''])[0].trim();
  const categoryValue = (tags.get('category') || [''])[0].trim();
  const category = categoryValue.split(/\s+/)[0];
  const variants = parseOptions(tags.get('variant'));
  const sizes = parseOptions(tags.get('size'));

  return {
    name,
    category,
    variants,
    sizes,
    a11y: (tags.get('a11y') || []).filter(Boolean).join(' '),
    snippet: (tags.get('snippet') || [''])[0].trim(),
    relativePath: toPosix(relativePath),
    source: String(source),
    markup: stripVariantMarkers(stripComponentComments(String(source))).trim(),
  };
}

function buildWarning(message) {
  console.warn(`[build] 경고: ${message}`);
}

function parseComponents(root = DEFAULT_ROOT, warn = buildWarning) {
  const componentsDir = path.join(root, 'src', 'assets', 'components');
  const components = [];
  const files = walkFiles(componentsDir)
    .filter((file) => path.extname(file).toLowerCase() === '.html')
    .sort((a, b) => toPosix(a).localeCompare(toPosix(b), 'ko'));

  for (const file of files) {
    const relativePath = toPosix(path.relative(componentsDir, file));
    const component = parseComponentSource(fs.readFileSync(file, 'utf8'), relativePath);
    if (!component || !component.name) {
      warn(`${relativePath}: @component 태그가 없어 가이드 생성을 건너뜁니다.`);
      continue;
    }
    if (!component.category) {
      warn(`${relativePath}: 필수 @category 태그가 없어 가이드 생성을 건너뜁니다.`);
      continue;
    }
    if (!CATEGORIES.includes(component.category)) {
      warn(
        `${relativePath}: @category는 ${CATEGORIES.join(', ')} 중 하나여야 하므로 건너뜁니다.`
      );
      continue;
    }
    components.push(component);
  }

  return components;
}

function hexToRgb(hex) {
  let value = hex.replace('#', '');
  if (value.length === 3) value = value.split('').map((part) => part + part).join('');
  if (value.length !== 6) return null;
  const number = Number.parseInt(value, 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

function luminance([red, green, blue]) {
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrastRatio(first, second) {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  const high = Math.max(firstLuminance, secondLuminance);
  const low = Math.min(firstLuminance, secondLuminance);
  return (high + 0.05) / (low + 0.05);
}

function parseTokens(root = DEFAULT_ROOT) {
  const tokensDir = path.join(root, 'src', 'assets', 'scss', 'tokens');
  const tokens = [];
  const contrastDeclarations = [];
  const files = walkFiles(tokensDir)
    .filter((file) => path.extname(file).toLowerCase() === '.scss')
    .sort((a, b) => toPosix(a).localeCompare(toPosix(b), 'ko'));

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const relativePath = toPosix(path.relative(root, file));
    const group = path.basename(file, '.scss').replace(/^_/, '');
    for (const match of source.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gm)) {
      const value = match[2].replace(/\s+/g, ' ').trim();
      tokens.push({
        name: match[1],
        value,
        group,
        source: relativePath,
        isColor: /^#[0-9a-f]{3,8}$/i.test(value),
        contrasts: [],
      });
    }
    for (const match of source.matchAll(
      /@contrast\s+(--[\w-]+)\s+on\s+(--[\w-]+)(?:\s+([\d.]+))?/g
    )) {
      contrastDeclarations.push({
        foreground: match[1],
        background: match[2],
        minimum: match[3] ? Number(match[3]) : 4.5,
      });
    }
  }

  const values = new Map(tokens.map((token) => [token.name, token.value]));
  const contrasts = contrastDeclarations.map((declaration) => {
    const foreground = hexToRgb(values.get(declaration.foreground) || '');
    const background = hexToRgb(values.get(declaration.background) || '');
    return {
      ...declaration,
      ratio: foreground && background ? contrastRatio(foreground, background) : null,
    };
  });

  for (const token of tokens) {
    token.contrasts = contrasts.filter(({ foreground }) => foreground === token.name);
  }

  return { tokens, contrasts };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderComponentPreview(component, componentsDir) {
  const markup = resolveIncludes(component.source, { componentsDir }).trim();
  const previewMarkup = markup.replace(/(["'\s(,])\/assets\//g, '$1assets/');
  const isMobile = /(?:^|\/)(?:[^/]*-mo|bottom-nav)\.html$/.test(component.relativePath);
  const stylesheet = isMobile ? 'mo.css' : 'pc.css';
  const sourceDocument = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="assets/css/${stylesheet}"></head><body>${previewMarkup}</body></html>`;
  return { markup, sourceDocument };
}

function renderMeta(label, value) {
  if (!value) return '';
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function renderComponentCard(component, componentsDir) {
  const { markup, sourceDocument } = renderComponentPreview(component, componentsDir);
  const identifier = `component-${component.relativePath.replace(/[^a-z0-9]+/gi, '-')}`;
  const meta = [
    renderMeta('Variant', formatOptions(component.variants)),
    renderMeta('Size', formatOptions(component.sizes)),
    renderMeta('접근성', component.a11y),
  ].join('');

  return `<article class="component-card" id="${escapeHtml(identifier)}">
  <header class="component-card__header">
    <div><h3>${escapeHtml(component.name)}</h3><code>${escapeHtml(component.relativePath)}</code></div>
    ${component.snippet ? `<span class="snippet-label">${escapeHtml(component.snippet)}</span>` : ''}
  </header>
  ${meta ? `<dl class="component-meta">${meta}</dl>` : ''}
  <iframe class="component-preview" title="${escapeHtml(component.name)} 미리보기" loading="lazy" srcdoc="${escapeHtml(sourceDocument)}"></iframe>
  <div class="source-block">
    <div class="source-block__header"><strong>마크업</strong><button type="button" class="copy-button">복사</button></div>
    <pre tabindex="0"><code>${escapeHtml(markup)}</code></pre>
  </div>
</article>`;
}

function collectLayoutPages(root) {
  const srcDir = path.join(root, 'src');
  const pages = [];
  for (const variant of VARIANTS) {
    const variantDir = path.join(srcDir, variant);
    const files = walkFiles(variantDir)
      .filter(
        (file) =>
          path.extname(file).toLowerCase() === '.html' && !path.basename(file).startsWith('_')
      )
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'ko'));
    for (const file of files) {
      const key = path.basename(file, '.html');
      pages.push({
        variant,
        name: LAYOUT_LABELS[key] || key,
        source: `${variant}/${toPosix(path.relative(variantDir, file))}`,
      });
    }
  }
  return pages;
}

function renderTokenRows(tokens) {
  if (!tokens.length) {
    return '<tr><td colspan="5">정의된 CSS 변수 토큰이 없습니다.</td></tr>';
  }
  return tokens
    .map((token) => {
      const swatch = token.isColor
        ? `<span class="color-swatch" style="background-color:${escapeHtml(token.value)}" aria-hidden="true"></span>`
        : '';
      const contrasts = token.contrasts.length
        ? token.contrasts
            .map(
              ({ background, ratio, minimum }) =>
                `${escapeHtml(background)} ${ratio === null ? '계산 불가' : `${ratio.toFixed(2)}:1`} (기준 ${minimum}:1)`
            )
            .join('<br>')
        : '—';
      return `<tr><td>${escapeHtml(token.group)}</td><td><code>${escapeHtml(token.name)}</code></td><td><span class="token-value">${swatch}<code>${escapeHtml(token.value)}</code></span></td><td>${contrasts}</td><td><code>${escapeHtml(token.source)}</code></td></tr>`;
    })
    .join('\n');
}

function renderLayoutCards(pages) {
  return pages
    .map(
      (page) => `<article class="layout-card">
  <h3>${escapeHtml(page.variant.toUpperCase())} · ${escapeHtml(page.name)}</h3>
  <div class="layout-preview__viewport">
    <iframe class="layout-preview__frame" src="${escapeHtml(page.source)}" title="${escapeHtml(page.variant.toUpperCase())} ${escapeHtml(page.name)} 레이아웃" width="360" loading="lazy"></iframe>
  </div>
</article>`
    )
    .join('\n');
}

function guideStyles() {
  return `
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; color: #202020; background: #f4f4f2; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f4f2; }
    button { font: inherit; }
    a { color: #0645ad; }
    code, pre { font-family: Consolas, "SFMono-Regular", monospace; }
    .guide-header { padding: 32px max(24px, calc((100% - 1440px) / 2)); color: #fff; background: #171717; }
    .guide-header h1 { margin: 0 0 8px; font-size: 30px; }
    .guide-header p { max-width: 760px; margin: 0; color: #dedede; line-height: 1.6; }
    .guide-nav { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-top: 20px; }
    .guide-nav a { color: #fff; }
    main { width: min(1440px, calc(100% - 32px)); margin: 0 auto; padding: 24px 0 64px; }
    .guide-section { margin-top: 40px; }
    .guide-section > h2 { margin: 0 0 8px; font-size: 24px; }
    .section-note { margin: 0 0 20px; color: #595959; }
    .category-section { margin-top: 28px; }
    .category-section > h2 { padding-bottom: 10px; border-bottom: 2px solid #171717; text-transform: uppercase; }
    .component-list { display: grid; gap: 24px; }
    .component-card, .layout-card, .token-panel, .axe-panel { border: 1px solid #d4d4d4; background: #fff; }
    .component-card__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 20px; border-bottom: 1px solid #e5e5e5; }
    .component-card__header h3, .layout-card h3 { margin: 0 0 6px; }
    .component-card__header code { color: #666; }
    .snippet-label { padding: 4px 8px; border: 1px solid #bdbdbd; background: #f5f5f5; font-family: monospace; }
    .component-meta { display: grid; gap: 8px; margin: 0; padding: 16px 20px; border-bottom: 1px solid #e5e5e5; }
    .component-meta div { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 12px; }
    .component-meta dt { font-weight: 700; }
    .component-meta dd { margin: 0; line-height: 1.5; }
    .component-preview { display: block; width: 100%; min-height: 420px; border: 0; border-bottom: 1px solid #e5e5e5; background: #fff; }
    .source-block__header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; color: #fff; background: #292929; }
    .copy-button { min-width: 72px; min-height: 36px; border: 1px solid #777; color: #fff; background: #292929; cursor: pointer; }
    pre { max-height: 360px; margin: 0; padding: 16px; overflow: auto; color: #ededed; background: #1d1d1d; font-size: 13px; line-height: 1.55; white-space: pre; }
    .viewport-controls { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
    .viewport-button { min-width: 76px; min-height: 40px; border: 1px solid #737373; color: #202020; background: #fff; cursor: pointer; }
    .viewport-button[aria-pressed="true"] { color: #fff; background: #171717; }
    .layout-list { display: grid; gap: 24px; }
    .layout-card { padding: 20px; overflow: auto; }
    .layout-preview__viewport { min-width: max-content; padding: 12px; background: #ececea; }
    .layout-preview__frame { display: block; height: 720px; border: 1px solid #999; background: #fff; transition: width 200ms ease-out; }
    .token-panel { overflow: auto; }
    table { width: 100%; border-collapse: collapse; background: #fff; }
    caption { padding: 16px; text-align: left; font-weight: 700; }
    th, td { padding: 12px 14px; border: 1px solid #dedede; text-align: left; vertical-align: top; }
    th { background: #efefed; }
    .token-value { display: inline-flex; align-items: center; gap: 8px; }
    .color-swatch { width: 24px; height: 24px; border: 1px solid #737373; }
    .axe-panel { padding: 20px; }
    .axe-summary { font-size: 18px; font-weight: 700; }
    .axe-violation { margin-top: 16px; padding-top: 16px; border-top: 1px solid #d4d4d4; }
    .axe-violation h3 { margin: 0 0 8px; }
    .axe-violation ul { margin-bottom: 0; }
    @media (max-width: 640px) {
      main { width: min(100% - 20px, 1440px); }
      .guide-header { padding: 24px 16px; }
      .component-card__header, .component-meta div { display: block; }
      .component-meta dt { margin-bottom: 4px; }
      th, td { padding: 9px; }
    }
    @media (prefers-reduced-motion: reduce) { .layout-preview__frame { transition: none; } }
  `;
}

function guideScript() {
  return `
  (function () {
    var viewportButtons = document.querySelectorAll('[data-viewport-width]');
    var layoutFrames = document.querySelectorAll('.layout-preview__frame');
    var viewportStatus = document.getElementById('viewport-status');
    viewportButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        var width = button.getAttribute('data-viewport-width');
        viewportButtons.forEach(function (candidate) {
          candidate.setAttribute('aria-pressed', String(candidate === button));
        });
        layoutFrames.forEach(function (frame) { frame.style.width = width + 'px'; });
        viewportStatus.textContent = '레이아웃 미리보기 너비 ' + width + 'px';
      });
    });

    function fallbackCopy(text) {
      var textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }

    document.querySelectorAll('.copy-button').forEach(function (button) {
      button.addEventListener('click', function () {
        var code = button.closest('.source-block').querySelector('code').textContent;
        var operation = navigator.clipboard && navigator.clipboard.writeText
          ? navigator.clipboard.writeText(code)
          : Promise.resolve().then(function () { fallbackCopy(code); });
        operation.then(function () {
          button.textContent = '복사됨';
          window.setTimeout(function () { button.textContent = '복사'; }, 1500);
        }).catch(function () {
          fallbackCopy(code);
          button.textContent = '복사됨';
        });
      });
    });

    function addText(parent, tag, text, className) {
      var element = document.createElement(tag);
      if (className) element.className = className;
      element.textContent = text;
      parent.appendChild(element);
      return element;
    }

    window.addEventListener('load', function () {
      var output = document.getElementById('axe-results');
      if (!window.axe) {
        output.textContent = 'axe를 불러오지 못했습니다.';
        return;
      }
      window.axe.run(document).then(function (results) {
        output.textContent = '';
        addText(output, 'p', '위반 ' + results.violations.length + '건', 'axe-summary');
        if (!results.violations.length) addText(output, 'p', '자동 검사에서 위반을 찾지 못했습니다.');
        results.violations.forEach(function (violation) {
          var section = document.createElement('section');
          section.className = 'axe-violation';
          addText(section, 'h3', violation.id + ' · ' + violation.help);
          addText(section, 'p', '영향도: ' + (violation.impact || '미정') + ' / 대상 ' + violation.nodes.length + '개');
          var link = document.createElement('a');
          link.href = violation.helpUrl;
          link.textContent = '해결 방법';
          link.target = '_blank';
          link.rel = 'noreferrer';
          section.appendChild(link);
          var list = document.createElement('ul');
          violation.nodes.forEach(function (node) { addText(list, 'li', node.target.join(' ')); });
          section.appendChild(list);
          output.appendChild(section);
        });
      }).catch(function (error) {
        output.textContent = 'axe 실행 실패: ' + error.message;
      });
    });
  }());
  `;
}

function generateGuide(root = DEFAULT_ROOT, components = parseComponents(root), tokenData = parseTokens(root)) {
  const srcDir = path.join(root, 'src');
  const componentsDir = path.join(srcDir, 'assets', 'components');
  const axePath = path.join(root, 'tools', 'vendor', 'axe.min.js');
  let axeSource = '';
  if (fs.existsSync(axePath)) {
    axeSource = fs.readFileSync(axePath, 'utf8');
  } else {
    buildWarning('tools/vendor/axe.min.js가 없어 가이드의 자동 접근성 검사를 실행할 수 없습니다.');
  }

  const categorySections = CATEGORIES.map((category) => {
    const cards = components
      .filter((component) => component.category === category)
      .map((component) => renderComponentCard(component, componentsDir))
      .join('\n');
    return `<section class="category-section" id="category-${category}"><h2>${category}</h2><div class="component-list">${cards || '<p>등록된 컴포넌트가 없습니다.</p>'}</div></section>`;
  }).join('\n');
  const layoutPages = collectLayoutPages(root);
  const output = path.join(srcDir, 'guide.html');
  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>퍼블리싱 컴포넌트 가이드</title>
  <style>${guideStyles()}</style>
</head>
<body>
  <header class="guide-header">
    <h1>퍼블리싱 컴포넌트 가이드</h1>
    <p>fragment의 @component 메타데이터에서 자동 생성됩니다. 컴포넌트를 추가한 뒤 node tools/build.js를 실행하면 카탈로그와 스니펫이 함께 갱신됩니다.</p>
    <nav class="guide-nav" aria-label="가이드 섹션"><a href="#catalog">컴포넌트</a><a href="#layouts">레이아웃</a><a href="#tokens">디자인 토큰</a><a href="#accessibility">접근성 검사</a></nav>
  </header>
  <main>
    <section class="guide-section" id="catalog">
      <h2>컴포넌트 카탈로그</h2>
      <p class="section-note">미리보기는 프로젝트 CSS를 격리된 iframe 안에서 사용하며, 마크업은 이 파일에 인라인되어 서버 없이도 표시됩니다.</p>
      ${categorySections}
    </section>
    <section class="guide-section" id="layouts">
      <h2>레이아웃 케이스</h2>
      <p class="section-note">PC/MO 페이지 ${layoutPages.length}장을 같은 너비 기준으로 비교합니다.</p>
      <div class="viewport-controls" role="group" aria-label="레이아웃 미리보기 너비">
        ${[360, 768, 1024, 1280].map((width, index) => `<button type="button" class="viewport-button" data-viewport-width="${width}" aria-pressed="${index === 0}">${width}px</button>`).join('')}
      </div>
      <p id="viewport-status" class="section-note" aria-live="polite">레이아웃 미리보기 너비 360px</p>
      <div class="layout-list">${renderLayoutCards(layoutPages)}</div>
    </section>
    <section class="guide-section" id="tokens">
      <h2>디자인 토큰</h2>
      <p class="section-note">시안 수령 후 아래 소스 파일의 CSS 변수 값만 교체합니다.</p>
      <div class="token-panel" tabindex="0"><table><caption>CSS Custom Properties ${tokenData.tokens.length}개</caption><thead><tr><th scope="col">그룹</th><th scope="col">토큰</th><th scope="col">값</th><th scope="col">@contrast</th><th scope="col">수정 파일</th></tr></thead><tbody>${renderTokenRows(tokenData.tokens)}</tbody></table></div>
    </section>
    <section class="guide-section" id="accessibility">
      <h2>접근성 자동 검사</h2>
      <p class="section-note">동봉된 axe로 페이지 로드 후 자동 검사합니다. 키보드·스크린리더·200% 확대는 수동으로 별도 확인해야 합니다.</p>
      <div class="axe-panel" id="axe-results" aria-live="polite">검사 중…</div>
    </section>
  </main>
  <script data-source="tools/vendor/axe.min.js">${axeSource}</script>
  <script>${guideScript()}</script>
</body>
</html>
`;
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, html.replace(/[ \t]+$/gm, ''), 'utf8');
  return output;
}

function extractSnippetElement(markup, trigger) {
  const openTag = /<([a-z][\w:-]*)\b([^>]*)>/gi;
  let match;
  while ((match = openTag.exec(markup)) !== null) {
    const classMatch = match[2].match(/\bclass\s*=\s*(["'])(.*?)\1/i);
    if (!classMatch || !classMatch[2].split(/\s+/).includes(trigger)) continue;
    const tag = match[1];
    if (/^(?:area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i.test(tag)) {
      return match[0];
    }
    const closeTag = new RegExp(`</${tag}\\s*>`, 'gi');
    closeTag.lastIndex = openTag.lastIndex;
    const close = closeTag.exec(markup);
    if (close) return markup.slice(match.index, close.index + close[0].length);
  }
  return markup;
}

function escapeChoice(value) {
  return value.replace(/([\\,|])/g, '\\$1');
}

function applySnippetChoice(markup, options, tabIndex, fallbackBase) {
  if (!options.length) return markup;
  const names = options.map(({ name }) => name);
  const placeholder = '${' + tabIndex + '|' + names.map(escapeChoice).join(',') + '|}';
  let replaced = false;
  let output = markup.replace(/\bclass\s*=\s*(["'])(.*?)\1/i, (attribute, quote, value) => {
    const classes = value.split(/\s+/).filter(Boolean);
    const optionIndex = classes.findIndex((className) =>
      names.some((name) => className.endsWith(`--${name}`))
    );
    if (optionIndex !== -1) {
      const selected = names.find((name) => classes[optionIndex].endsWith(`--${name}`));
      classes[optionIndex] = classes[optionIndex].slice(0, -selected.length) + placeholder;
    } else {
      const base = classes.find((className) => !className.includes('--')) || fallbackBase;
      classes.push(`${base}--${placeholder}`);
    }
    replaced = true;
    return `class=${quote}${classes.join(' ')}${quote}`;
  });
  if (!replaced) {
    output = output.replace(/<([a-z][\w:-]*)\b/i, `<$1 class="${fallbackBase}--${placeholder}"`);
  }
  return output;
}

function escapeSnippetDefault(value) {
  return value.replace(/\\/g, '\\\\').replace(/\$/g, '\\$').replace(/}/g, '\\}');
}

function addTextTabStop(markup, tabIndex) {
  const text = />((?:[^<]|<(?!\/?[a-z]))*\S(?:[^<]|<(?!\/?[a-z]))*)</i;
  return markup.replace(text, (match, value) => {
    const leading = value.match(/^\s*/)[0];
    const trailing = value.match(/\s*$/)[0];
    const content = value.slice(leading.length, value.length - trailing.length);
    return `>${leading}\${${tabIndex}:${escapeSnippetDefault(content)}}${trailing}<`;
  });
}

function buildSnippetMarkup(component, componentsDir) {
  const regions = collectVariants(component.source, component.relativePath);
  const selected = regions.size
    ? selectVariant(component.source, component.variants[0].name, component.relativePath)
    : component.source;
  let markup = resolveIncludes(selected, { componentsDir }).trim();
  markup = extractSnippetElement(markup, component.snippet);
  let tabIndex = 1;
  markup = applySnippetChoice(markup, component.variants, tabIndex, component.snippet);
  if (component.variants.length) tabIndex += 1;
  markup = applySnippetChoice(markup, component.sizes, tabIndex, component.snippet);
  if (component.sizes.length) tabIndex += 1;
  markup = addTextTabStop(markup, tabIndex);
  return markup;
}

function generateSnippets(root = DEFAULT_ROOT, components = parseComponents(root)) {
  const snippets = {};
  const componentsDir = path.join(root, 'src', 'assets', 'components');
  for (const component of components.filter(({ snippet }) => snippet)) {
    const markup = buildSnippetMarkup(component, componentsDir);
    const variants = component.variants.map(({ name }) => name);
    snippets[component.name] = {
      scope: 'html',
      prefix: component.snippet,
      body: markup.split(/\r?\n/),
      description: variants.length
        ? `${component.name} — ${variants.join(' | ')}`
        : component.name,
    };
  }

  const output = path.join(root, '.vscode', 'publishing.code-snippets');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(snippets, null, 2)}\n`, 'utf8');
  return output;
}

function findSassCompiler(root = DEFAULT_ROOT, platform = process.platform) {
  const npmBin = path.join(root, 'node_modules', '.bin');
  const npmCandidates =
    platform === 'win32'
      ? [path.join(npmBin, 'sass.cmd'), path.join(npmBin, 'sass')]
      : [path.join(npmBin, 'sass')];
  const npmSass = npmCandidates.find((candidate) => fs.existsSync(candidate));
  if (npmSass) return { command: npmSass, source: 'node_modules' };

  const vendored = path.join(
    root,
    'tools',
    'vendor',
    'sass',
    platform === 'win32' ? 'sass.bat' : 'sass'
  );
  if (fs.existsSync(vendored)) return { command: vendored, source: 'vendor' };
  return null;
}

function runSassCompiler(compiler, input, output, platform = process.platform) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const args = ['--no-source-map', '--style=expanded', input, output];
  const result = spawnSync(compiler.command, args, {
    encoding: 'utf8',
    shell: platform === 'win32' && /\.(?:bat|cmd)$/i.test(compiler.command),
  });
  if (result.status !== 0) {
    const detail = `${result.stdout || ''}${result.stderr || ''}`.trim();
    throw new Error(`SCSS 컴파일 실패 (${path.basename(input)})${detail ? `\n${detail}` : ''}`);
  }
}

function compileScss(root = DEFAULT_ROOT, platform = process.platform) {
  const scssDir = path.join(root, 'src', 'assets', 'scss');
  const cssDir = path.join(root, 'src', 'assets', 'css');
  const entries = VARIANTS.map((variant) => ({
    variant,
    input: path.join(scssDir, `${variant}.scss`),
    output: path.join(cssDir, `${variant}.css`),
  }));
  const existingEntries = entries.filter(({ input }) => fs.existsSync(input));

  if (!existingEntries.length) {
    console.warn('[build] 경고: SCSS 엔트리(pc.scss, mo.scss)가 없어 컴파일을 건너뜁니다.');
    return { compiler: null, compiled: [] };
  }

  const compiler = findSassCompiler(root, platform);
  if (!compiler) {
    console.warn('[build] 경고: Sass 컴파일러가 없어 커밋된 CSS를 사용합니다.');
    return { compiler: null, compiled: [] };
  }

  const compiled = [];
  for (const entry of entries) {
    if (!fs.existsSync(entry.input)) {
      console.warn(`[build] 경고: ${entry.variant}.scss가 없어 해당 엔트리를 건너뜁니다.`);
      continue;
    }
    runSassCompiler(compiler, entry.input, entry.output, platform);
    compiled.push(entry.output);
    console.log(`[build] SCSS: ${entry.variant}.scss -> ${entry.variant}.css (${compiler.source})`);
  }
  return { compiler, compiled };
}

function copyTree(source, destination) {
  if (!fs.existsSync(source)) return [];
  const copied = [];
  for (const file of walkFiles(source)) {
    if (path.basename(file) === '.gitkeep') continue;
    const target = path.join(destination, path.relative(source, file));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file, target);
    copied.push(target);
  }
  return copied;
}

function createDist(root = DEFAULT_ROOT) {
  const src = path.join(root, 'src');
  const dist = path.join(root, 'dist');
  const componentsDir = path.join(src, 'assets', 'components');

  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });

  const htmlFiles = [];
  const rootEntry = path.join(src, 'index.html');
  if (fs.existsSync(rootEntry)) {
    const target = path.join(dist, 'index.html');
    fs.copyFileSync(rootEntry, target);
    htmlFiles.push(target);
  }
  for (const variant of VARIANTS) {
    const sourceDir = path.join(src, variant);
    for (const file of walkFiles(sourceDir).filter((candidate) => path.extname(candidate) === '.html')) {
      const target = path.join(dist, variant, path.relative(sourceDir, file));
      const resolved = resolveIncludes(fs.readFileSync(file, 'utf8'), { componentsDir });
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, resolved, 'utf8');
      htmlFiles.push(target);
    }
  }

  const assetFiles = [];
  for (const assetType of ['css', 'js', 'img']) {
    assetFiles.push(
      ...copyTree(path.join(src, 'assets', assetType), path.join(dist, 'assets', assetType))
    );
  }

  return { dist, htmlFiles, assetFiles };
}

function build(root = DEFAULT_ROOT, platform = process.platform) {
  const absoluteRoot = path.resolve(root);
  const scss = compileScss(absoluteRoot, platform);
  const redirectEntry = generateRedirectEntry(absoluteRoot);
  const output = createDist(absoluteRoot);
  const components = parseComponents(absoluteRoot);
  const tokens = parseTokens(absoluteRoot);
  const guideFile = generateGuide(absoluteRoot, components, tokens);
  const snippetsFile = generateSnippets(absoluteRoot, components);
  console.log(`[build] dist 생성 완료 (HTML ${output.htmlFiles.length}개, 자산 ${output.assetFiles.length}개)`);
  console.log(`[build] guide: ${path.relative(absoluteRoot, guideFile)}`);
  console.log(`[build] snippets: ${path.relative(absoluteRoot, snippetsFile)}`);
  return { ...output, scss, components, tokens, guideFile, redirectEntry, snippetsFile };
}

function parseRootArg(argv) {
  const rootArg = argv.find((arg) => arg.startsWith('--root='));
  const unknown = argv.find((arg) => !arg.startsWith('--root='));
  if (unknown) throw new Error(`알 수 없는 옵션: ${unknown}`);
  return path.resolve(rootArg ? rootArg.slice('--root='.length) : DEFAULT_ROOT);
}

if (require.main === module) {
  try {
    build(parseRootArg(process.argv.slice(2)));
  } catch (error) {
    console.error(`[build] 실패: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildSnippetMarkup,
  build,
  collectLayoutPages,
  compileScss,
  copyTree,
  createDist,
  findSassCompiler,
  generateGuide,
  generateSnippets,
  parseComponentSource,
  parseComponents,
  parseRootArg,
  parseTokens,
  runSassCompiler,
  walkFiles,
};
