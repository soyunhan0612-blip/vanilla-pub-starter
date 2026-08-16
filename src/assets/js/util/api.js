/**
 * util/api.js — 개발사 연동을 위한 fetch 래퍼와 data-bind 규약.
 *
 * DOM 에 접근하지 않으므로 util/ 에 둔다. 응답을 화면에 꽂는 일은 common/ 몫이다.
 *
 * ---------------------------------------------------------------------------
 * data-bind 규약 — 퍼블리싱 산출물과 실제 데이터의 접점
 * ---------------------------------------------------------------------------
 * 퍼블리싱 산출물은 데이터를 갖지 않는다. 대신 **데이터가 들어갈 자리에만 마커를
 * 남긴다.** 개발사는 마크업에서 아래 속성만 찾으면 연동 지점을 전부 식별할 수 있다.
 * 바인딩 구현 자체는 개발사의 서버 템플릿(또는 프레임워크) 몫이며,
 * 이 보일러플레이트는 규약과 마커까지만 제공한다.
 *
 *   data-bind="product.name"       텍스트가 들어갈 지점. 요소의 텍스트를 값으로 대체한다.
 *                                  <strong data-bind="product.price">39,000</strong>
 *
 *   data-bind-src="product.image"  src 속성이 들어갈 지점 (img · source · iframe)
 *                                  <img data-bind-src="product.image" src="" alt="">
 *
 *   data-bind-href="product.url"   href 속성이 들어갈 지점 (a · link)
 *                                  <a data-bind-href="product.url" href="#">상세보기</a>
 *
 *   data-bind-list="products"      반복될 템플릿의 루트. 이 요소 **하나**가 1건의 표본이고,
 *                                  개발사는 목록 길이만큼 이 요소를 복제한다.
 *                                  안쪽 data-bind 경로는 각 항목 기준의 상대 경로다.
 *                                  <li data-bind-list="products">
 *                                    <span data-bind="name">상품명</span>
 *                                  </li>
 *
 * 공통 규칙:
 *   - 경로는 점 표기법(`product.price.sale`)을 쓴다. 배열 인덱스는 쓰지 않는다
 *     (반복은 data-bind-list 가 담당한다).
 *   - 마커가 붙은 요소의 기존 내용/속성값은 **디자인 확인용 더미**다. 실제 값으로 덮인다.
 *   - 마커는 표시 지점만 나타낸다. 포맷팅(통화·날짜) 규칙은 개발사와 별도로 합의한다.
 *   - 셀렉터가 필요하면 util/dom.js 의 buildDataSelector('bind', 'product.name') 를 쓴다.
 * ---------------------------------------------------------------------------
 *
 * 의존성 0 — 이 모듈은 아무것도 import 하지 않는다. 런타임은 fetch · AbortController
 * 만 요구하며 둘 다 대상 브라우저와 Node 18+ 의 표준 전역이다.
 */

/** 기본 타임아웃(ms). 응답이 없는 화면을 무한정 붙잡아 두지 않기 위한 상한. */
const DEFAULT_TIMEOUT = 10000;

/** 오류 메시지에 응답 본문을 붙일 때의 길이 상한. */
const BODY_PREVIEW = 200;

/**
 * 이 모듈이 던지는 유일한 오류 타입.
 *
 * 호출부가 분기 하나로 처리할 수 있도록 네트워크·HTTP·파싱·타임아웃 실패를
 * 전부 이 타입으로 정규화한다.
 *
 * code: 'network' | 'http' | 'parse' | 'timeout' | 'abort' | 'unsupported'
 * status: HTTP 상태 코드. HTTP 응답이 없었으면 0.
 */
export class ApiError extends Error {
  constructor(message, { status = 0, code = 'network', cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * 쿼리스트링을 조립한다. 앞에 '?' 를 붙이지 않는다.
 *
 *   buildQuery({ page: 2, tag: ['new', 'best'] })  → 'page=2&tag=new&tag=best'
 *
 * 규칙:
 *   - null · undefined 값은 생략한다. 빈 문자열('')은 의미가 있으므로 남긴다.
 *   - 배열은 같은 키를 반복한다 (`tag=new&tag=best`).
 *   - 키와 값 모두 encodeURIComponent 로 인코딩한다.
 *
 * @param {Object<string, *>} [params]
 * @returns {string}
 */
export function buildQuery(params) {
  if (!params || typeof params !== 'object') return '';

  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item === null || item === undefined) continue;
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(item)}`);
    }
  }

  return parts.join('&');
}

/** URL 에 쿼리스트링을 이어붙인다. 이미 ? 가 있으면 & 로 잇는다. */
function withQuery(url, params) {
  const qs = buildQuery(params);
  if (!qs) return url;
  if (url.endsWith('?') || url.endsWith('&')) return `${url}${qs}`;
  return `${url}${url.includes('?') ? '&' : '?'}${qs}`;
}

/** JSON 으로 직렬화할 본문인지 판단한다. FormData·Blob 같은 것은 그대로 넘긴다. */
function isJsonBody(body) {
  if (body === null || typeof body !== 'object') return false;
  if (Array.isArray(body)) return true;
  const proto = Object.getPrototypeOf(body);
  return proto === Object.prototype || proto === null;
}

const preview = (text) =>
  text.length > BODY_PREVIEW ? `${text.slice(0, BODY_PREVIEW)}…` : text;

/**
 * fetch 래퍼. 타임아웃 · 에러 정규화 · JSON 파싱을 담당한다.
 *
 * 성공하면 파싱된 JSON 을 돌려준다. 본문이 비어 있으면(204 등) null.
 * 실패는 전부 ApiError 다 — 호출부는 try/catch 하나면 된다.
 *
 * @param {string} url
 * @param {Object} [options]
 * @param {string} [options.method='GET']
 * @param {Object} [options.headers]
 * @param {*} [options.body] 평범한 객체·배열이면 JSON 으로 직렬화한다
 * @param {Object} [options.query] buildQuery 로 URL 에 붙는다
 * @param {number} [options.timeout=10000] 0 이하면 타임아웃을 걸지 않는다
 * @param {AbortSignal} [options.signal] 호출부가 직접 중단할 때
 * @returns {Promise<*>}
 * @throws {ApiError}
 */
export async function request(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body,
    query,
    timeout = DEFAULT_TIMEOUT,
    signal: externalSignal,
  } = options;

  if (typeof fetch !== 'function') {
    throw new ApiError(
      'fetch 를 쓸 수 없는 환경입니다. 대상 브라우저(iOS Safari · Android Chrome 최신 2버전) 또는 Node 18+ 가 필요합니다.',
      { code: 'unsupported' }
    );
  }

  const target = withQuery(url, query);
  const controller = new AbortController();
  let timedOut = false;
  let aborted = false;

  const onExternalAbort = () => {
    aborted = true;
    controller.abort(externalSignal.reason);
  };
  if (externalSignal) {
    if (externalSignal.aborted) onExternalAbort();
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const timer =
    timeout > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeout)
      : null;

  const init = {
    method,
    headers: { Accept: 'application/json', ...headers },
    signal: controller.signal,
  };
  if (body !== undefined) {
    if (isJsonBody(body)) {
      init.body = JSON.stringify(body);
      init.headers['Content-Type'] = 'application/json; charset=utf-8';
    } else {
      init.body = body;
    }
  }

  let response;
  try {
    response = await fetch(target, init);
  } catch (cause) {
    if (timedOut) {
      throw new ApiError(`요청이 ${timeout}ms 안에 끝나지 않았습니다: ${method} ${target}`, {
        code: 'timeout',
        cause,
      });
    }
    if (aborted || (cause && cause.name === 'AbortError')) {
      throw new ApiError(`요청이 중단되었습니다: ${method} ${target}`, { code: 'abort', cause });
    }
    throw new ApiError(`네트워크 요청에 실패했습니다: ${method} ${target}`, {
      code: 'network',
      cause,
    });
  } finally {
    if (timer) clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
  }

  let text;
  try {
    text = await response.text();
  } catch (cause) {
    throw new ApiError(`응답 본문을 읽지 못했습니다: ${method} ${target}`, {
      status: response.status,
      code: 'network',
      cause,
    });
  }

  if (!response.ok) {
    const detail = text ? ` — ${preview(text)}` : '';
    throw new ApiError(
      `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}: ${method} ${target}${detail}`,
      { status: response.status, code: 'http' }
    );
  }

  if (text.trim() === '') return null;

  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new ApiError(`JSON 응답을 파싱하지 못했습니다: ${method} ${target} — ${preview(text)}`, {
      status: response.status,
      code: 'parse',
      cause,
    });
  }
}
