/**
 * 개발사 데이터 연동 마커 규약
 * - data-bind="product.name": 요소의 텍스트가 들어갈 지점
 * - data-bind-src="product.image": src 속성값이 들어갈 지점
 * - data-bind-href="product.url": href 속성값이 들어갈 지점
 * - data-bind-list="products": 목록 항목마다 반복할 템플릿 루트
 *
 * 이 파일은 규약만 정의하며 실제 데이터 바인딩은 구현하지 않는다.
 */

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'UNKNOWN_ERROR', cause } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

export function buildQuery(params = {}) {
  const query = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(params ?? {})) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      if (value === null || value === undefined) continue;
      query.append(key, String(value));
    }
  }

  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

async function readJson(response) {
  if (response.status === 204 || response.status === 205) return null;

  try {
    return await response.json();
  } catch (cause) {
    throw new ApiError('서버 응답을 JSON 형식으로 해석할 수 없습니다.', {
      status: response.status,
      code: 'INVALID_JSON',
      cause,
    });
  }
}

export async function request(url, options = {}) {
  const { timeout = 10000, signal, ...fetchOptions } = options;
  const controller = new AbortController();
  let didTimeout = false;

  const abortFromCaller = () => controller.abort(signal.reason);
  if (signal) {
    if (signal.aborted) abortFromCaller();
    else signal.addEventListener('abort', abortFromCaller, { once: true });
  }

  const timeoutId =
    Number.isFinite(timeout) && timeout > 0
      ? setTimeout(() => {
          didTimeout = true;
          controller.abort();
        }, timeout)
      : null;

  try {
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal });

    if (!response.ok) {
      let payload;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      const message =
        payload && typeof payload.message === 'string'
          ? payload.message
          : `요청을 처리하지 못했습니다. (HTTP ${response.status})`;
      const code =
        payload && typeof payload.code === 'string' ? payload.code : `HTTP_${response.status}`;
      throw new ApiError(message, { status: response.status, code });
    }

    return await readJson(response);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (didTimeout) {
      throw new ApiError('요청 시간이 초과되었습니다. 다시 시도해 주세요.', {
        code: 'TIMEOUT',
        cause: error,
      });
    }
    if (error && error.name === 'AbortError') {
      throw new ApiError('요청이 취소되었습니다.', { code: 'ABORTED', cause: error });
    }
    throw new ApiError('네트워크 연결을 확인한 뒤 다시 시도해 주세요.', {
      code: 'NETWORK_ERROR',
      cause: error,
    });
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', abortFromCaller);
  }
}
