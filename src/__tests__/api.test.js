import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request, buildQuery, ApiError } from '../assets/js/util/api.js';

test('buildQuery는 URL 인코딩된 쿼리스트링을 조립한다', () => {
  assert.equal(
    buildQuery({ keyword: '여름 셔츠', page: 2, available: false }),
    '?keyword=%EC%97%AC%EB%A6%84+%EC%85%94%EC%B8%A0&page=2&available=false'
  );
});

test('buildQuery는 null 계열을 생략하고 배열 값을 반복한다', () => {
  assert.equal(
    buildQuery({ category: ['상의', '아우터'], cursor: null, optional: undefined, keyword: '' }),
    '?category=%EC%83%81%EC%9D%98&category=%EC%95%84%EC%9A%B0%ED%84%B0&keyword='
  );
  assert.equal(buildQuery({}), '');
  assert.equal(buildQuery(), '');
});

test('ApiError는 status와 code를 보존한다', () => {
  const error = new ApiError('요청 실패', { status: 404, code: 'NOT_FOUND' });

  assert.equal(error.name, 'ApiError');
  assert.equal(error.message, '요청 실패');
  assert.equal(error.status, 404);
  assert.equal(error.code, 'NOT_FOUND');
  assert.ok(error instanceof Error);
});

test('request는 성공 응답의 JSON을 반환한다', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ id: 1 }),
  });

  assert.deepEqual(await request('/products/1', { timeout: 0 }), { id: 1 });
});

test('request는 HTTP·JSON 파싱·네트워크 오류를 ApiError로 정규화한다', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => ({
    ok: false,
    status: 404,
    json: async () => ({ message: '상품을 찾을 수 없습니다.', code: 'PRODUCT_NOT_FOUND' }),
  });
  await assert.rejects(
    request('/products/0', { timeout: 0 }),
    (error) =>
      error instanceof ApiError && error.status === 404 && error.code === 'PRODUCT_NOT_FOUND'
  );

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError('invalid JSON');
    },
  });
  await assert.rejects(
    request('/invalid-json', { timeout: 0 }),
    (error) => error instanceof ApiError && error.code === 'INVALID_JSON'
  );

  globalThis.fetch = async () => {
    throw new TypeError('network failed');
  };
  await assert.rejects(
    request('/offline', { timeout: 0 }),
    (error) => error instanceof ApiError && error.code === 'NETWORK_ERROR'
  );
});

test('request는 타임아웃을 ApiError로 정규화한다', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (_url, { signal }) =>
    new Promise((resolve, reject) => {
      signal.addEventListener(
        'abort',
        () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        },
        { once: true }
      );
    });

  await assert.rejects(
    request('/slow', { timeout: 5 }),
    (error) => error instanceof ApiError && error.code === 'TIMEOUT'
  );
});
