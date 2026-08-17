import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextFocusIndex, isFocusableSelector } from '../assets/js/util/focus-trap.js';

test('nextFocusIndex는 Tab 방향으로 이동하고 마지막에서 처음으로 순환한다', () => {
  assert.equal(nextFocusIndex(3, 0, 1), 1);
  assert.equal(nextFocusIndex(3, 2, 1), 0);
});

test('nextFocusIndex는 Shift+Tab 방향으로 이동하고 처음에서 마지막으로 순환한다', () => {
  assert.equal(nextFocusIndex(3, 2, -1), 1);
  assert.equal(nextFocusIndex(3, 0, -1), 2);
});

test('nextFocusIndex는 빈 목록과 단일 요소 경계를 처리한다', () => {
  assert.equal(nextFocusIndex(0, 0, 1), -1);
  assert.equal(nextFocusIndex(1, 0, 1), 0);
  assert.equal(nextFocusIndex(1, 0, -1), 0);
});

test('isFocusableSelector는 기본 포커스 가능 요소와 비활성 제외 조건을 제공한다', () => {
  const selector = isFocusableSelector();

  assert.match(selector, /a\[href\]/);
  assert.match(selector, /button:not\(\[disabled\]\)/);
  assert.match(selector, /input:not\(\[disabled\]\)/);
  assert.match(selector, /select:not\(\[disabled\]\)/);
  assert.match(selector, /textarea:not\(\[disabled\]\)/);
  assert.match(selector, /\[tabindex\]:not\(\[tabindex="-1"\]\)/);
});
