#!/usr/bin/env node
'use strict';
/**
 * tools/serve.js — 의존성 0 정적 개발 서버.
 *
 * vite 가 없어도 뼈대가 열려야 한다(ADR-002). Node 내장 http/fs/path 만 쓴다.
 * .html 요청은 include.js 로 실시간 해소하므로 빌드 없이 바로 확인할 수 있다.
 *
 * Usage:
 *   node tools/serve.js [--port 3000]
 *   node tools/serve.js --smoke     서버 기동 → 자기 자신에게 1회 요청 → 종료 코드로 보고
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { resolveIncludes } = require('./include.js');

const ROOT = path.resolve(__dirname, '..');
const DOC_ROOT = path.join(ROOT, 'src');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function parseArgs(argv) {
  const i = argv.indexOf('--port');
  const port = i !== -1 ? Number(argv[i + 1]) : Number(process.env.PORT) || 3000;
  return { port: Number.isFinite(port) && port > 0 ? port : 3000, smoke: argv.includes('--smoke') };
}

/** URL → 실제 파일 경로. 문서 루트를 벗어나는 경로는 null. */
function resolvePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  if (decoded.endsWith('/')) decoded += 'index.html';
  const full = path.resolve(DOC_ROOT, `.${path.posix.normalize(decoded)}`);
  const inside = path.relative(DOC_ROOT, full);
  if (inside.startsWith('..') || path.isAbsolute(inside)) return null;
  // 디렉토리 요청은 index.html 폴백
  if (fs.existsSync(full) && fs.statSync(full).isDirectory()) return path.join(full, 'index.html');
  return full;
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function handle(req, res) {
  const file = resolvePath(req.url || '/');
  if (!file) return send(res, 403, '403 Forbidden');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return send(res, 404, `404 Not Found\n${path.relative(DOC_ROOT, file).replace(/\\/g, '/')}`);
  }

  const ext = path.extname(file).toLowerCase();
  if (ext === '.html') {
    try {
      const html = resolveIncludes(fs.readFileSync(file, 'utf8'), { from: file });
      return send(res, 200, html, MIME['.html']);
    } catch (e) {
      // 조립 실패를 브라우저에 그대로 보여준다. 조용히 깨진 페이지를 내놓지 않는다.
      return send(res, 500, `500 include 해소 실패\n\n${e.message}`);
    }
  }
  send(res, 200, fs.readFileSync(file), MIME[ext] || 'application/octet-stream');
}

function createServer() {
  return http.createServer((req, res) => {
    try {
      handle(req, res);
    } catch (e) {
      send(res, 500, `500 Internal Server Error\n\n${e.stack || e.message}`);
    }
  });
}

/**
 * --smoke: 성공 기준은 "서버가 기동해서 HTTP 응답을 반환했는가" 이다.
 * 페이지가 아직 없는 단계에서는 404 가 정상이므로 상태 코드로 판정하지 않는다.
 * 연결 거부·크래시·타임아웃만 실패다.
 */
function smoke(port) {
  const server = createServer();
  const fail = (msg) => {
    console.error(`  smoke 실패: ${msg}`);
    server.close(() => process.exit(1));
    setTimeout(() => process.exit(1), 1000).unref();
  };

  server.on('error', (e) => {
    console.error(`  smoke 실패: 서버를 띄우지 못했다 — ${e.message}`);
    process.exit(1);
  });

  server.listen(port, '127.0.0.1', () => {
    const actual = server.address().port;
    const req = http.get({ host: '127.0.0.1', port: actual, path: '/', timeout: 5000 }, (res) => {
      res.resume();
      res.on('end', () => {
        console.log(`  smoke 통과: http://127.0.0.1:${actual}/ → HTTP ${res.statusCode}`);
        server.close(() => process.exit(0));
      });
    });
    req.on('timeout', () => {
      req.destroy();
      fail('응답 타임아웃 (5s)');
    });
    req.on('error', (e) => fail(e.message));
  });
}

function main() {
  const { port, smoke: isSmoke } = parseArgs(process.argv.slice(2));
  if (isSmoke) return smoke(port);

  const server = createServer();
  server.on('error', (e) => {
    console.error(
      e.code === 'EADDRINUSE'
        ? `  포트 ${port} 가 이미 사용 중이다. node tools/serve.js --port <다른 포트>`
        : `  서버 오류: ${e.message}`
    );
    process.exit(1);
  });
  server.listen(port, () => {
    console.log(`  개발 서버: http://localhost:${port}/`);
    console.log(`  문서 루트: ${path.relative(ROOT, DOC_ROOT)}/  (Ctrl+C 로 종료)`);
  });
}

main();
