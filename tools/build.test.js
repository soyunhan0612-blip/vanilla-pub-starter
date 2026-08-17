'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const { createDist, findSassCompiler } = require('./build');

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
