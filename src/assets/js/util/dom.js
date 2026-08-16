/**
 * util/dom.js — DOM 을 "다루지 않는" DOM 보조 함수들.
 *
 * 이름과 달리 이 파일은 DOM 트리에 접근하지 않는다. 셀렉터 문자열 조립,
 * 클래스명 계산, 속성값 파싱처럼 입력 → 출력이 확정된 순수 로직만 둔다.
 * 실제 조회(querySelector)와 조작은 assets/js/common/ 의 몫이다.
 *
 * 이 분리가 jsdom 없이 `node --test` 로 검증하는 조건이자,
 * 폐쇄망에서 테스트를 살려두는 조건이다. (CLAUDE.md / ARCHITECTURE.md 레이어 규칙)
 *
 * 의존성 0 — 이 모듈은 아무것도 import 하지 않는다.
 */

/**
 * modifiers 를 문자열 목록으로 정규화한다.
 * 문자열('a b') · 배열(['a', null]) · 객체({ a: true, b: false }) 를 모두 받는다.
 */
function toModifierList(modifiers) {
  if (!modifiers) return [];

  let raw;
  if (Array.isArray(modifiers)) {
    raw = modifiers;
  } else if (typeof modifiers === 'object') {
    raw = Object.entries(modifiers)
      .filter(([, on]) => Boolean(on))
      .map(([key]) => key);
  } else {
    raw = [modifiers];
  }

  return raw
    .filter(Boolean)
    .flatMap((mod) => String(mod).trim().split(/\s+/))
    .filter(Boolean);
}

/**
 * BEM modifier 클래스명을 조립한다.
 *
 *   buildClassName('btn', ['primary', 'lg'])          → 'btn btn--primary btn--lg'
 *   buildClassName('btn', { primary: true, sm: false }) → 'btn btn--primary'
 *
 * @param {string} base       블록/엘리먼트 클래스명
 * @param {string|string[]|Object<string, boolean>} [modifiers]
 * @returns {string} 공백으로 이어붙인 클래스 문자열. base 가 비면 ''.
 */
export function buildClassName(base, modifiers) {
  const root = String(base ?? '').trim();
  if (!root) return '';

  const names = [];
  for (const mod of toModifierList(modifiers)) {
    const name = `${root}--${mod}`;
    if (!names.includes(name)) names.push(name);
  }

  return [root, ...names].join(' ');
}

/**
 * data-* 속성 문자열을 JS 값으로 해석한다.
 *
 * 규칙 (개발사가 마크업만 보고 예측할 수 있도록 단순하게 유지한다):
 *   null·undefined  → null   (속성이 아예 없는 경우)
 *   ''              → true   (<div data-open> 처럼 값 없는 플래그)
 *   'true'/'false'  → boolean
 *   'null'          → null
 *   숫자 문자열     → number. 단 String(Number(v)) === v 인 경우만.
 *                     '01012345678'·'007' 은 앞자리 0 을 잃으면 안 되므로 문자열로 남는다.
 *   '{...}'/'[...]' → JSON.parse. 실패하면 원본 문자열.
 *   그 외           → 앞뒤 공백을 정리한 문자열
 *
 * @param {string|null|undefined} value
 * @returns {*}
 */
export function parseDataAttr(value) {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();
  if (text === '') return true;
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null') return null;

  if (String(Number(text)) === text) return Number(text);

  if (/^[[{]/.test(text)) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return text;
}

/**
 * data-* 속성 셀렉터 문자열을 만든다. common/ 이 querySelectorAll 에 그대로 넘긴다.
 *
 *   buildDataSelector('bind')                    → '[data-bind]'
 *   buildDataSelector('bind', 'product.name')    → '[data-bind="product.name"]'
 *   buildDataSelector('data-bind-list', 'items') → '[data-bind-list="items"]'
 *
 * @param {string} name  data- 접두사는 있어도 없어도 된다
 * @param {string} [value] 생략하면 속성 존재 셀렉터
 * @returns {string}
 * @throws {TypeError} 속성명이 data-* 형태가 아닐 때
 */
export function buildDataSelector(name, value) {
  const raw = String(name ?? '').trim();
  const attr = raw.startsWith('data-') ? raw : `data-${raw}`;

  if (!/^data-[a-z][\w-]*$/i.test(attr)) {
    throw new TypeError(`data-* 속성명이 아니다: "${name}"`);
  }

  if (value === null || value === undefined) return `[${attr}]`;

  const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `[${attr}="${escaped}"]`;
}
