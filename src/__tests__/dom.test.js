import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClassName, parseDataAttr } from '../assets/js/util/dom.js';

test('buildClassName은 기본 클래스와 활성 modifier만 조합한다', () => {
  assert.equal(buildClassName('button', ['large', '', null, 'active']), 'button button--large button--active');
  assert.equal(buildClassName('button'), 'button');
});

test('parseDataAttr은 data 속성 문자열을 실사용 타입으로 변환한다', () => {
  assert.equal(parseDataAttr('true'), true);
  assert.equal(parseDataAttr('false'), false);
  assert.equal(parseDataAttr('null'), null);
  assert.equal(parseDataAttr('42'), 42);
  assert.deepEqual(parseDataAttr('{"page":2}'), { page: 2 });
  assert.equal(parseDataAttr('상품명'), '상품명');
});
