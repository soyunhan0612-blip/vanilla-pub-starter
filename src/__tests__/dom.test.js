/**
 * util/dom.js — 순수 함수 테스트.
 *
 * 이 모듈은 DOM 을 다루지 않는다. 셀렉터 문자열 조립 / 클래스명 계산 /
 * 속성값 파싱만 검증한다. 실제 querySelector 호출은 common/ 의 몫이므로
 * 여기서는 jsdom 없이 node --test 만으로 전부 검증된다.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildClassName, parseDataAttr, buildDataSelector } from '../assets/js/util/dom.js';

// ---------- buildClassName ----------

test('buildClassName: modifier 가 없으면 base 만 반환한다', () => {
  assert.equal(buildClassName('btn'), 'btn');
  assert.equal(buildClassName('btn', null), 'btn');
  assert.equal(buildClassName('btn', []), 'btn');
  assert.equal(buildClassName('btn', {}), 'btn');
});

test('buildClassName: base 앞뒤 공백을 정리한다', () => {
  assert.equal(buildClassName('  btn  '), 'btn');
});

test('buildClassName: base 가 비면 빈 문자열을 반환한다', () => {
  assert.equal(buildClassName(''), '');
  assert.equal(buildClassName(null, ['primary']), '');
  assert.equal(buildClassName(undefined), '');
});

test('buildClassName: 문자열 modifier 를 BEM 형태로 붙인다', () => {
  assert.equal(buildClassName('btn', 'primary'), 'btn btn--primary');
});

test('buildClassName: 공백으로 구분된 문자열은 여러 modifier 로 나눈다', () => {
  assert.equal(buildClassName('btn', 'primary lg'), 'btn btn--primary btn--lg');
});

test('buildClassName: 배열의 falsy 항목은 건너뛴다', () => {
  assert.equal(
    buildClassName('btn', ['primary', null, undefined, false, '', 'lg']),
    'btn btn--primary btn--lg'
  );
});

test('buildClassName: 객체는 값이 truthy 인 키만 사용한다', () => {
  assert.equal(
    buildClassName('btn', { primary: true, disabled: false, lg: 1, sm: 0 }),
    'btn btn--primary btn--lg'
  );
});

test('buildClassName: 중복 modifier 는 한 번만 출력한다', () => {
  assert.equal(buildClassName('btn', ['primary', 'primary']), 'btn btn--primary');
});

// ---------- parseDataAttr ----------

test('parseDataAttr: 속성이 없으면(null·undefined) null 이다', () => {
  assert.equal(parseDataAttr(null), null);
  assert.equal(parseDataAttr(undefined), null);
});

test('parseDataAttr: 값 없는 플래그 속성(빈 문자열)은 true 다', () => {
  // <div data-open> 은 DOM 에서 '' 로 읽힌다 — 존재 자체가 참이라는 의미다
  assert.equal(parseDataAttr(''), true);
  assert.equal(parseDataAttr('   '), true);
});

test('parseDataAttr: boolean 문자열을 boolean 으로 바꾼다', () => {
  assert.equal(parseDataAttr('true'), true);
  assert.equal(parseDataAttr('false'), false);
  assert.equal(parseDataAttr(' true '), true);
});

test('parseDataAttr: "null" 문자열은 null 이다', () => {
  assert.equal(parseDataAttr('null'), null);
});

test('parseDataAttr: 왕복 변환이 성립하는 숫자만 number 로 바꾼다', () => {
  assert.equal(parseDataAttr('42'), 42);
  assert.equal(parseDataAttr('0'), 0);
  assert.equal(parseDataAttr('-3.5'), -3.5);
});

test('parseDataAttr: 앞자리 0 이 있는 값은 문자열로 유지한다', () => {
  // 휴대폰 번호·상품코드가 숫자로 변환되어 앞자리 0 을 잃으면 안 된다
  assert.equal(parseDataAttr('01012345678'), '01012345678');
  assert.equal(parseDataAttr('007'), '007');
  assert.equal(parseDataAttr('1e3'), '1e3');
});

test('parseDataAttr: JSON 객체·배열을 파싱한다', () => {
  assert.deepEqual(parseDataAttr('{"id":1,"name":"셔츠"}'), { id: 1, name: '셔츠' });
  assert.deepEqual(parseDataAttr('[1,2,3]'), [1, 2, 3]);
});

test('parseDataAttr: 깨진 JSON 은 원본 문자열로 돌려준다', () => {
  assert.equal(parseDataAttr('{id:1}'), '{id:1}');
});

test('parseDataAttr: 그 밖의 값은 공백을 정리한 문자열이다', () => {
  assert.equal(parseDataAttr(' product.name '), 'product.name');
});

// ---------- buildDataSelector ----------

test('buildDataSelector: 값이 없으면 존재 셀렉터를 만든다', () => {
  assert.equal(buildDataSelector('bind'), '[data-bind]');
  assert.equal(buildDataSelector('data-bind'), '[data-bind]');
});

test('buildDataSelector: data- 접두사를 자동으로 붙인다', () => {
  assert.equal(buildDataSelector('bind-src', 'product.image'), '[data-bind-src="product.image"]');
  assert.equal(buildDataSelector('data-bind-list', 'products'), '[data-bind-list="products"]');
});

test('buildDataSelector: 값의 따옴표와 역슬래시를 이스케이프한다', () => {
  assert.equal(buildDataSelector('bind', 'a"b'), '[data-bind="a\\"b"]');
  assert.equal(buildDataSelector('bind', 'a\\b'), '[data-bind="a\\\\b"]');
});

test('buildDataSelector: 속성명이 비면 TypeError 를 던진다', () => {
  assert.throws(() => buildDataSelector(''), TypeError);
  assert.throws(() => buildDataSelector('data-'), TypeError);
  assert.throws(() => buildDataSelector(null), TypeError);
});
