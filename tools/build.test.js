'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const {
  createDist,
  findSassCompiler,
  generateGuide,
  generateSnippets,
  parseComponentSource,
  parseComponents,
  parseTokens,
} = require('./build');

const BUILD = path.join(__dirname, 'build.js');

function createRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'build-'));
}

function write(root, relativePath, content = '') {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function npmSassPath(root, platform) {
  return path.join(root, 'node_modules', '.bin', platform === 'win32' ? 'sass.cmd' : 'sass');
}

function vendorSassPath(root, platform) {
  return path.join(root, 'tools', 'vendor', 'sass', platform === 'win32' ? 'sass.bat' : 'sass');
}

test('node_modules Sass를 동봉 바이너리보다 먼저 선택한다', () => {
  for (const platform of ['win32', 'linux']) {
    const root = createRoot();
    try {
      const npmSass = write(root, path.relative(root, npmSassPath(root, platform)));
      write(root, path.relative(root, vendorSassPath(root, platform)));
      assert.deepEqual(findSassCompiler(root, platform), {
        command: npmSass,
        source: 'node_modules',
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('node_modules Sass가 없으면 동봉 바이너리를 선택한다', () => {
  for (const platform of ['win32', 'linux']) {
    const root = createRoot();
    try {
      const vendored = write(root, path.relative(root, vendorSassPath(root, platform)));
      assert.deepEqual(findSassCompiler(root, platform), { command: vendored, source: 'vendor' });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('컴파일러가 없으면 null을 반환한다', () => {
  const root = createRoot();
  try {
    assert.equal(findSassCompiler(root, process.platform), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('SCSS 엔트리가 없어도 실제 빌드 프로세스가 빈 dist와 종료 코드 0을 만든다', () => {
  const root = createRoot();
  try {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    const result = spawnSync(process.execPath, [BUILD, `--root=${root}`], {
      encoding: 'utf8',
      timeout: 10000,
    });
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    assert.equal(result.status, 0, output);
    assert.match(output, /SCSS 엔트리.*건너뜁니다/);
    assert.deepEqual(fs.readdirSync(path.join(root, 'dist')), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('SCSS 엔트리는 있지만 컴파일러가 없으면 경고 후 CSS 안전망을 복사한다', () => {
  const root = createRoot();
  try {
    write(root, 'src/assets/scss/pc.scss', ':root {}\n');
    write(root, 'src/assets/css/pc.css', '/* committed */\n');
    const result = spawnSync(process.execPath, [BUILD, `--root=${root}`], {
      encoding: 'utf8',
      timeout: 10000,
    });
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    assert.equal(result.status, 0, output);
    assert.match(output, /Sass 컴파일러가 없어/);
    assert.equal(
      fs.readFileSync(path.join(root, 'dist', 'assets', 'css', 'pc.css'), 'utf8'),
      '/* committed */\n'
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('dist HTML의 include를 평면 마크업으로 해소하고 css/js/img를 복사한다', () => {
  const root = createRoot();
  try {
    write(root, 'src/pc/main.html', '<main><!-- @include common/button.html --></main>');
    write(root, 'src/assets/components/common/button.html', '<!-- @component 버튼 --><button>구매</button>');
    write(root, 'src/assets/css/pc.css', 'body {}\n');
    write(root, 'src/assets/js/common/app.js', 'export {};\n');
    write(root, 'src/assets/img/product.jpg', 'image');
    const output = createDist(root);
    assert.equal(
      fs.readFileSync(path.join(root, 'dist', 'pc', 'main.html'), 'utf8'),
      '<main><button>구매</button></main>'
    );
    assert.equal(output.assetFiles.length, 3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('@component 주석의 반복 태그와 여러 줄 값을 중간 자료구조로 파싱한다', () => {
  const parsed = parseComponentSource(
    `<!-- @component 아코디언
         @category common
         @variant multiple — 여러 항목
                  동시 열림
         @variant single — 한 항목만 열림
         @a11y button 상태와 본문 상태를
               함께 동기화
         @snippet accordion
    -->
    <section class="accordion">아코디언</section>`,
    'common/accordion.html'
  );

  assert.equal(parsed.name, '아코디언');
  assert.equal(parsed.category, 'common');
  assert.deepEqual(parsed.variants, [
    { name: 'multiple', description: '여러 항목 동시 열림' },
    { name: 'single', description: '한 항목만 열림' },
  ]);
  assert.equal(parsed.a11y, 'button 상태와 본문 상태를 함께 동기화');
  assert.equal(parsed.snippet, 'accordion');
  assert.match(parsed.markup, /class="accordion"/);
});

test('@component 또는 필수 category가 없는 fragment는 경고 후 건너뛴다', () => {
  const root = createRoot();
  const warnings = [];
  try {
    write(root, 'src/assets/components/common/undocumented.html', '<button>문서 없음</button>');
    write(
      root,
      'src/assets/components/common/uncategorized.html',
      '<!-- @component 분류 없음 --><button>분류 없음</button>'
    );
    assert.deepEqual(parseComponents(root, (message) => warnings.push(message)), []);
    assert.equal(warnings.length, 2);
    assert.ok(warnings.some((message) => /@component/.test(message)));
    assert.ok(warnings.some((message) => /@category/.test(message)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('토큰과 @contrast 쌍을 파싱해 계산된 대비값을 연결한다', () => {
  const root = createRoot();
  try {
    write(
      root,
      'src/assets/scss/tokens/_color.scss',
      `:root {
        /* @contrast --color-text on --color-bg */
        --color-bg: #ffffff;
        --color-text: #171717;
      }\n`
    );
    write(
      root,
      'src/assets/scss/tokens/_typography.scss',
      `:root {
        --font-family-base: system-ui,
          sans-serif;
      }\n`
    );

    const result = parseTokens(root);
    assert.equal(result.tokens.length, 3);
    assert.equal(result.tokens.find(({ name }) => name === '--font-family-base').value, 'system-ui, sans-serif');
    assert.equal(result.contrasts.length, 1);
    assert.equal(result.contrasts[0].ratio.toFixed(2), '17.93');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('guide.html은 컴포넌트·14개 레이아웃·토큰·vendored axe를 정적으로 포함한다', () => {
  const root = createRoot();
  try {
    write(
      root,
      'src/assets/components/common/button.html',
      `<!-- @component 버튼
           @category common
           @variant primary | secondary
           @size sm | md
           @a11y 키보드로 실행 가능
           @snippet btn
      -->
      <button type="button" class="btn btn--primary btn--sm">버튼</button>`
    );
    write(
      root,
      'src/assets/scss/tokens/_color.scss',
      `:root {
        /* @contrast --color-text on --color-bg */
        --color-bg: #fff;
        --color-text: #171717;
      }\n`
    );
    write(root, 'tools/vendor/axe.min.js', 'window.axe={run:()=>Promise.resolve({violations:[]})};\n');
    for (const variant of ['pc', 'mo']) {
      for (let index = 1; index <= 7; index += 1) {
        write(root, `src/${variant}/page-${index}.html`, '<!doctype html><title>페이지</title>');
      }
      write(root, `src/${variant}/_template.html`, '<!doctype html><title>템플릿</title>');
    }

    const components = parseComponents(root);
    const output = generateGuide(root, components, parseTokens(root));
    const html = fs.readFileSync(output, 'utf8');
    assert.match(html, /<iframe[^>]+srcdoc=/);
    assert.doesNotMatch(html, /fetch\s*\(/);
    assert.equal((html.match(/class="layout-preview__frame"/g) || []).length, 14);
    assert.equal((html.match(/class="layout-preview__frame"[^>]+loading="lazy"/g) || []).length, 14);
    assert.match(html, /data-viewport-width="360"/);
    assert.match(html, /--color-text/);
    assert.match(html, /17\.93:1/);
    assert.match(html, /data-source="tools\/vendor\/axe\.min\.js"/);
    assert.match(html, /window\.axe=\{run:/);
    assert.match(html, /axe\.run\(document\)/);
    assert.match(html, /<pre tabindex="0"><code>/);
    assert.match(html, /class="token-panel" tabindex="0"/);
    assert.doesNotMatch(html, /[ \t]+$/m);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('snippet은 메타데이터 선택지와 텍스트 탭 정지점을 유효한 JSON으로 만든다', () => {
  const root = createRoot();
  try {
    write(
      root,
      'src/assets/components/common/button.html',
      `<!-- @component 버튼
           @category common
           @variant primary | secondary | outline | text
           @size sm | md | lg
           @snippet btn
      -->
      <button type="button" class="btn btn--primary btn--sm">버튼</button>`
    );

    const output = generateSnippets(root, parseComponents(root));
    const snippets = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.deepEqual(snippets['버튼'], {
      scope: 'html',
      prefix: 'btn',
      body: [
        '<button type="button" class="btn btn--${1|primary,secondary,outline,text|} btn--${2|sm,md,lg|}">${3:버튼}</button>',
      ],
      description: '버튼 — primary | secondary | outline | text',
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
