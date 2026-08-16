/**
 * util/focus-trap.js — 포커스 가둠 "계산" 테스트.
 *
 * 실제 focus() 호출은 common/ 의 몫이고 여기서는 인덱스 계산만 검증한다.
 * 순환 경계(마지막 → 첫, 첫 → 마지막)가 이 모듈의 존재 이유이므로
 * 경계 조건을 전부 덮는다.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { nextFocusIndex, isFocusableSelector } from '../assets/js/util/focus-trap.js';

// ---------- nextFocusIndex — 일반 이동 ----------

test('nextFocusIndex: Tab 은 다음 인덱스로 이동한다', () => {
  assert.equal(nextFocusIndex(3, 0, 1), 1);
  assert.equal(nextFocusIndex(3, 1, 1), 2);
});

test('nextFocusIndex: Shift+Tab 은 이전 인덱스로 이동한다', () => {
  assert.equal(nextFocusIndex(3, 2, -1), 1);
  assert.equal(nextFocusIndex(3, 1, -1), 0);
});

test('nextFocusIndex: direction 을 생략하면 정방향이다', () => {
  assert.equal(nextFocusIndex(3, 0), 1);
});

// ---------- nextFocusIndex — 순환 경계 (이 모듈의 핵심) ----------

test('nextFocusIndex: 마지막에서 Tab 을 누르면 첫 요소로 순환한다', () => {
  assert.equal(nextFocusIndex(3, 2, 1), 0);
});

test('nextFocusIndex: 첫 요소에서 Shift+Tab 을 누르면 마지막으로 순환한다', () => {
  assert.equal(nextFocusIndex(3, 0, -1), 2);
});

test('nextFocusIndex: 요소가 하나면 어느 방향이든 자기 자신이다', () => {
  assert.equal(nextFocusIndex(1, 0, 1), 0);
  assert.equal(nextFocusIndex(1, 0, -1), 0);
});

// ---------- nextFocusIndex — 비정상 입력 ----------

test('nextFocusIndex: 포커스 가능한 요소가 없으면 -1 이다', () => {
  assert.equal(nextFocusIndex(0, 0, 1), -1);
  assert.equal(nextFocusIndex(-2, 0, 1), -1);
  assert.equal(nextFocusIndex(NaN, 0, 1), -1);
  assert.equal(nextFocusIndex(undefined, 0, 1), -1);
});

test('nextFocusIndex: 트랩 밖에 포커스가 있으면(current -1) 방향에 따라 양 끝으로 들어온다', () => {
  assert.equal(nextFocusIndex(3, -1, 1), 0);
  assert.equal(nextFocusIndex(3, -1, -1), 2);
});

test('nextFocusIndex: 범위를 벗어난 current 도 양 끝으로 보정한다', () => {
  assert.equal(nextFocusIndex(3, 99, 1), 0);
  assert.equal(nextFocusIndex(3, 99, -1), 2);
  assert.equal(nextFocusIndex(3, NaN, 1), 0);
  assert.equal(nextFocusIndex(3, 1.5, -1), 2);
});

test('nextFocusIndex: direction 은 부호만 본다', () => {
  assert.equal(nextFocusIndex(3, 0, 5), 1);
  assert.equal(nextFocusIndex(3, 0, -5), 2);
  assert.equal(nextFocusIndex(3, 0, 0), 1);
});

// ---------- isFocusableSelector ----------

test('isFocusableSelector: 비어 있지 않은 셀렉터 문자열을 돌려준다', () => {
  const selector = isFocusableSelector();
  assert.equal(typeof selector, 'string');
  assert.ok(selector.length > 0);
});

test('isFocusableSelector: 호출할 때마다 같은 값이다', () => {
  assert.equal(isFocusableSelector(), isFocusableSelector());
});

test('isFocusableSelector: 표준 포커스 대상들을 포함한다', () => {
  const selector = isFocusableSelector();
  for (const part of ['a[href]', 'button', 'input', 'select', 'textarea', '[tabindex]']) {
    assert.ok(selector.includes(part), `${part} 가 셀렉터에 없다`);
  }
});

test('isFocusableSelector: disabled 요소와 tabindex="-1" 을 제외한다', () => {
  const selector = isFocusableSelector();
  assert.ok(selector.includes('button:not([disabled])'));
  assert.ok(selector.includes('[tabindex]:not([tabindex="-1"])'));
});

test('isFocusableSelector: type="hidden" 입력을 제외한다', () => {
  assert.ok(isFocusableSelector().includes(':not([type="hidden"])'));
});
