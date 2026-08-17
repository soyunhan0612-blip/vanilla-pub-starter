#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveIncludes } = require('./include');

const DEFAULT_ROOT = path.join(__dirname, '..');
const VARIANTS = ['pc', 'mo'];

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
  const output = createDist(absoluteRoot);
  console.log(`[build] dist 생성 완료 (HTML ${output.htmlFiles.length}개, 자산 ${output.assetFiles.length}개)`);
  return { ...output, scss };
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
  build,
  compileScss,
  copyTree,
  createDist,
  findSassCompiler,
  parseRootArg,
  runSassCompiler,
  walkFiles,
};
