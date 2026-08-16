/**
 * util/api.js — 쿼리 조립과 에러 정규화 테스트.
 *
 * buildQuery 는 순수 함수라 그대로 검증한다.
 * request 는 네트워크에 의존하지만, "모든 실패를 ApiError 하나로 정규화한다"가
 * 이 모듈의 계약이므로 전역 fetch 를 스텁으로 갈아끼워 그 계약만 확인한다.
 * (네트워크·jsdom 없이 node --test 만으로 돌아간다)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildQuery, request, ApiError } from '../assets/js/util/api.js';

/** globalThis.fetch 를 스텁으로 바꾸고 끝나면 원복한다. */
async function withFetch(stub, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

/** Response 최소 형태. request 는 ok·status·statusText·text() 만 쓴다. */
const res = ({ ok = true, status = 200, statusText = 'OK', body = '' } = {}) => ({
  ok,
  status,
  statusText,
  text: async () => body,
});

// ---------- buildQuery ----------

test('buildQuery: 값이 없으면 빈 문자열이다', () => {
  assert.equal(buildQuery(), '');
  assert.equal(buildQuery(null), '');
  assert.equal(buildQuery({}), '');
});

test('buildQuery: key=value 를 & 로 잇는다', () => {
  assert.equal(buildQuery({ page: 2, size: 20 }), 'page=2&size=20');
});

test('buildQuery: 앞에 ? 를 붙이지 않는다', () => {
  assert.ok(!buildQuery({ page: 1 }).startsWith('?'));
});

test('buildQuery: null·undefined 값은 생략한다', () => {
  assert.equal(buildQuery({ page: 1, sort: null, q: undefined }), 'page=1');
});

test('buildQuery: 빈 문자열은 의미가 있으므로 남긴다', () => {
  assert.equal(buildQuery({ q: '' }), 'q=');
});

test('buildQuery: boolean 을 문자열로 넣는다', () => {
  assert.equal(buildQuery({ soldout: false, sale: true }), 'soldout=false&sale=true');
});

test('buildQuery: 배열은 같은 키를 반복한다', () => {
  assert.equal(buildQuery({ tag: ['new', 'best'] }), 'tag=new&tag=best');
});

test('buildQuery: 빈 배열과 배열 안의 null 은 생략한다', () => {
  assert.equal(buildQuery({ tag: [], page: 1 }), 'page=1');
  assert.equal(buildQuery({ tag: ['new', null, 'best'] }), 'tag=new&tag=best');
});

test('buildQuery: 키와 값을 모두 인코딩한다', () => {
  assert.equal(buildQuery({ q: 'a b&c=d' }), 'q=a%20b%26c%3Dd');
  assert.equal(buildQuery({ 'a b': 1 }), 'a%20b=1');
  assert.equal(buildQuery({ q: '반팔' }), `q=${encodeURIComponent('반팔')}`);
});

// ---------- ApiError ----------

test('ApiError: Error 를 상속하고 name 이 ApiError 다', () => {
  const e = new ApiError('실패');
  assert.ok(e instanceof Error);
  assert.ok(e instanceof ApiError);
  assert.equal(e.name, 'ApiError');
  assert.equal(e.message, '실패');
});

test('ApiError: status 와 code 를 갖는다', () => {
  const e = new ApiError('없음', { status: 404, code: 'http' });
  assert.equal(e.status, 404);
  assert.equal(e.code, 'http');
});

test('ApiError: status·code 기본값이 있다', () => {
  const e = new ApiError('실패');
  assert.equal(e.status, 0);
  assert.equal(typeof e.code, 'string');
  assert.ok(e.code.length > 0);
});

// ---------- request — 정상 경로 ----------

test('request: JSON 본문을 파싱해 돌려준다', async () => {
  await withFetch(
    async () => res({ body: '{"id":1,"name":"셔츠"}' }),
    async () => {
      assert.deepEqual(await request('/api/products/1'), { id: 1, name: '셔츠' });
    }
  );
});

test('request: 본문이 없으면 null 이다 (204 No Content)', async () => {
  await withFetch(
    async () => res({ status: 204, statusText: 'No Content', body: '' }),
    async () => {
      assert.equal(await request('/api/cart/1'), null);
    }
  );
});

test('request: query 를 URL 에 붙인다', async () => {
  let called = '';
  await withFetch(
    async (url) => {
      called = url;
      return res({ body: '[]' });
    },
    async () => {
      await request('/api/products', { query: { page: 2, size: 20 } });
    }
  );
  assert.equal(called, '/api/products?page=2&size=20');
});

test('request: 이미 ? 가 있는 URL 에는 & 로 잇는다', async () => {
  let called = '';
  await withFetch(
    async (url) => {
      called = url;
      return res({ body: '[]' });
    },
    async () => {
      await request('/api/products?cat=1', { query: { page: 2 } });
    }
  );
  assert.equal(called, '/api/products?cat=1&page=2');
});

test('request: 객체 body 를 JSON 으로 직렬화한다', async () => {
  let init = null;
  await withFetch(
    async (url, options) => {
      init = options;
      return res({ body: '{}' });
    },
    async () => {
      await request('/api/cart', { method: 'POST', body: { id: 1, qty: 2 } });
    }
  );
  assert.equal(init.method, 'POST');
  assert.equal(init.body, '{"id":1,"qty":2}');
  assert.match(init.headers['Content-Type'], /application\/json/);
});

// ---------- request — 에러 정규화 (이 모듈의 계약) ----------

test('request: HTTP 오류를 ApiError 로 정규화한다', async () => {
  await withFetch(
    async () => res({ ok: false, status: 500, statusText: 'Server Error', body: 'boom' }),
    async () => {
      await assert.rejects(request('/api/products'), (e) => {
        assert.ok(e instanceof ApiError);
        assert.equal(e.code, 'http');
        assert.equal(e.status, 500);
        return true;
      });
    }
  );
});

test('request: 네트워크 오류를 ApiError 로 정규화한다', async () => {
  await withFetch(
    async () => {
      throw new TypeError('Failed to fetch');
    },
    async () => {
      await assert.rejects(request('/api/products'), (e) => {
        assert.ok(e instanceof ApiError);
        assert.equal(e.code, 'network');
        return true;
      });
    }
  );
});

test('request: JSON 파싱 오류를 ApiError 로 정규화한다', async () => {
  await withFetch(
    async () => res({ body: '<!doctype html>' }),
    async () => {
      await assert.rejects(request('/api/products'), (e) => {
        assert.ok(e instanceof ApiError);
        assert.equal(e.code, 'parse');
        return true;
      });
    }
  );
});

test('request: 타임아웃을 ApiError 로 정규화한다', async () => {
  await withFetch(
    (url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason));
      }),
    async () => {
      await assert.rejects(request('/api/slow', { timeout: 20 }), (e) => {
        assert.ok(e instanceof ApiError);
        assert.equal(e.code, 'timeout');
        return true;
      });
    }
  );
});

test('request: 호출부가 넘긴 signal 로도 중단할 수 있다', async () => {
  const controller = new AbortController();
  await withFetch(
    (url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason));
      }),
    async () => {
      setTimeout(() => controller.abort(), 10);
      await assert.rejects(request('/api/slow', { signal: controller.signal }), (e) => {
        assert.ok(e instanceof ApiError);
        assert.equal(e.code, 'abort');
        return true;
      });
    }
  );
});

test('request: fetch 자체가 없으면 ApiError 로 알린다', async () => {
  await withFetch(undefined, async () => {
    await assert.rejects(request('/api/products'), (e) => {
      assert.ok(e instanceof ApiError);
      assert.equal(e.code, 'unsupported');
      return true;
    });
  });
});

test('request: 모든 실패가 ApiError 하나로 처리된다', async () => {
  const failures = [
    async () => {
      throw new Error('network down');
    },
    async () => res({ ok: false, status: 404, body: '' }),
    async () => res({ body: 'not json' }),
  ];
  for (const stub of failures) {
    await withFetch(stub, async () => {
      await assert.rejects(request('/api/x'), ApiError);
    });
  }
});
