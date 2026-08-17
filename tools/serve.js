#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { resolveIncludes } = require('./include');

const DEFAULT_ROOT = path.join(__dirname, '..', 'src');
const DEFAULT_PORT = 3000;
const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
});

function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function resolveFilePath(requestPath, root = DEFAULT_ROOT) {
  const documentRoot = path.resolve(root);
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath).replace(/\\/g, '/');
  } catch {
    return null;
  }

  const relativeRequest = decoded.replace(/^\/+/, '').replace(/\//g, path.sep);
  let target = path.resolve(documentRoot, relativeRequest);
  const relativeToRoot = path.relative(documentRoot, target);
  if (relativeToRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToRoot)) return null;

  if (decoded.endsWith('/')) {
    target = path.join(target, 'index.html');
  } else if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    target = path.join(target, 'index.html');
  }
  return target;
}

function readServedFile(filePath, root = DEFAULT_ROOT) {
  if (path.extname(filePath).toLowerCase() !== '.html') return fs.readFileSync(filePath);
  const html = fs.readFileSync(filePath, 'utf8');
  return Buffer.from(
    resolveIncludes(html, { componentsDir: path.join(root, 'assets', 'components') }),
    'utf8'
  );
}

function createRequestHandler(opts = {}) {
  const root = path.resolve(opts.root || DEFAULT_ROOT);
  return (request, response) => {
    let pathname;
    try {
      pathname = new URL(request.url, 'http://localhost').pathname;
    } catch {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Bad Request');
      return;
    }

    const filePath = resolveFilePath(pathname, root);
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not Found');
      return;
    }

    try {
      const body = readServedFile(filePath, root);
      response.writeHead(200, {
        'Content-Type': getMimeType(filePath),
        'Content-Length': body.length,
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(`Internal Server Error\n${error.message}`);
    }
  };
}

function createServer(opts = {}) {
  return http.createServer(createRequestHandler(opts));
}

function parseArgs(argv) {
  const options = {
    port: DEFAULT_PORT,
    portExplicit: false,
    root: DEFAULT_ROOT,
    smoke: false,
    timeout: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--smoke') {
      options.smoke = true;
    } else if (arg === '--port') {
      options.port = Number(argv[++i]);
      options.portExplicit = true;
    } else if (arg.startsWith('--port=')) {
      options.port = Number(arg.slice('--port='.length));
      options.portExplicit = true;
    } else if (arg === '--timeout') {
      options.timeout = Number(argv[++i]);
    } else if (arg.startsWith('--timeout=')) {
      options.timeout = Number(arg.slice('--timeout='.length));
    } else if (arg.startsWith('--root=')) {
      options.root = path.resolve(arg.slice('--root='.length));
    } else {
      throw new Error(`알 수 없는 옵션: ${arg}`);
    }
  }
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
    throw new Error(`유효하지 않은 포트: ${options.port}`);
  }
  if (options.timeout !== null && (!Number.isInteger(options.timeout) || options.timeout <= 0)) {
    throw new Error(`유효하지 않은 timeout: ${options.timeout}`);
  }
  return options;
}

function getListenPort(options) {
  return options.smoke && !options.portExplicit ? 0 : options.port;
}

function smokeRequest(server, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const request = http.get(
      { hostname: '127.0.0.1', port: address.port, path: '/', timeout: timeoutMs },
      (response) => {
        const statusCode = response.statusCode;
        response.resume();
        response.on('end', () => resolve(statusCode));
      }
    );
    request.on('timeout', () => request.destroy(new Error('smoke 요청 시간 초과')));
    request.on('error', reject);
  });
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const server = createServer({ root: options.root });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(getListenPort(options), '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!options.smoke) {
    console.log(`개발 서버: http://127.0.0.1:${address.port}`);
    // 리스닝 소켓이 이벤트 루프를 붙잡으므로 이 프로세스는 스스로 끝나지 않는다.
    // 사람이 쓰는 개발 서버는 그것이 맞지만, 자동화가 띄우고 잊으면 포트를 문 채
    // 남아 다음 기동이 EADDRINUSE 로 실패한다. --timeout 을 준 호출만 끝을 갖는다.
    if (options.timeout !== null) {
      console.log(`${options.timeout}초 후 자동 종료한다`);
      setTimeout(() => server.close(), options.timeout * 1000);
    }
    return;
  }

  try {
    const statusCode = await smokeRequest(server);
    console.log(`smoke 통과 (HTTP ${statusCode})`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`serve 실패: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  MIME_TYPES,
  createRequestHandler,
  createServer,
  getListenPort,
  getMimeType,
  parseArgs,
  readServedFile,
  resolveFilePath,
  smokeRequest,
};
