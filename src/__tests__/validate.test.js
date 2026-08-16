/**
 * util/validate.js — 폼 검증 규칙 테스트.
 *
 * 모든 검증 함수는 { valid, message } 형태를 돌려준다. 통과 시 message 는 ''.
 * 메시지는 "무엇을 고쳐야 하는지"를 담아야 하므로 실패 케이스마다 내용을 확인한다.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateRequired,
  validateEmail,
  validatePhone,
  validatePassword,
  formatPhone,
} from '../assets/js/util/validate.js';

/** 반환 형태가 규약을 지키는지 확인하는 공용 단언. */
function assertShape(result) {
  assert.equal(typeof result, 'object');
  assert.equal(typeof result.valid, 'boolean');
  assert.equal(typeof result.message, 'string');
  if (result.valid) assert.equal(result.message, '');
  else assert.ok(result.message.length > 0, '실패 시 메시지가 비어 있으면 안 된다');
}

// ---------- validateRequired ----------

test('validateRequired: 값이 있으면 통과한다', () => {
  for (const value of ['a', ' 홍길동 ', 0, false]) {
    const r = validateRequired(value);
    assertShape(r);
    assert.equal(r.valid, true, `${String(value)} 는 통과해야 한다`);
  }
});

test('validateRequired: 비어 있거나 공백뿐이면 실패한다', () => {
  for (const value of ['', '   ', null, undefined]) {
    const r = validateRequired(value);
    assertShape(r);
    assert.equal(r.valid, false);
    assert.match(r.message, /입력/);
  }
});

// ---------- validateEmail ----------

test('validateEmail: 정상 이메일을 통과시킨다', () => {
  for (const value of ['shop@example.com', 'a.b-c_d@mail.co.kr', ' user@example.com ']) {
    const r = validateEmail(value);
    assertShape(r);
    assert.equal(r.valid, true, `${value} 는 통과해야 한다`);
  }
});

test('validateEmail: 비어 있으면 입력을 요구한다', () => {
  const r = validateEmail('');
  assertShape(r);
  assert.equal(r.valid, false);
  assert.match(r.message, /이메일 주소를 입력/);
});

test('validateEmail: @ 가 없으면 @ 를 넣으라고 안내한다', () => {
  const r = validateEmail('shop.example.com');
  assertShape(r);
  assert.equal(r.valid, false);
  assert.match(r.message, /@/);
});

test('validateEmail: 중간 공백은 사유를 지목한다', () => {
  const r = validateEmail('sh op@example.com');
  assertShape(r);
  assert.equal(r.valid, false);
  assert.match(r.message, /공백/);
});

test('validateEmail: 도메인이 불완전하면 예시 형식을 제시한다', () => {
  for (const value of ['shop@example', 'shop@.com', '@example.com', 'shop@@example.com']) {
    const r = validateEmail(value);
    assertShape(r);
    assert.equal(r.valid, false, `${value} 는 실패해야 한다`);
  }
  assert.match(validateEmail('shop@example').message, /@example\.com/);
});

test('validateEmail: 메시지에 "올바르지 않습니다" 를 쓰지 않는다', () => {
  for (const value of ['', 'shop', 'shop@example', 'sh op@ex.com']) {
    assert.doesNotMatch(validateEmail(value).message, /올바르지 않습니다/);
  }
});

// ---------- validatePhone ----------

test('validatePhone: 하이픈 유무와 무관하게 정상 번호를 통과시킨다', () => {
  for (const value of ['010-1234-5678', '01012345678', '010 1234 5678', '011-123-4567']) {
    const r = validatePhone(value);
    assertShape(r);
    assert.equal(r.valid, true, `${value} 는 통과해야 한다`);
  }
});

test('validatePhone: 비어 있으면 입력을 요구한다', () => {
  const r = validatePhone('');
  assertShape(r);
  assert.equal(r.valid, false);
  assert.match(r.message, /입력/);
});

test('validatePhone: 휴대폰 접두사가 아니면 시작 번호를 안내한다', () => {
  const r = validatePhone('02-123-4567');
  assertShape(r);
  assert.equal(r.valid, false);
  assert.match(r.message, /010/);
});

test('validatePhone: 자릿수가 모자라면 현재 자릿수를 알려준다', () => {
  const r = validatePhone('010-1234');
  assertShape(r);
  assert.equal(r.valid, false);
  assert.match(r.message, /7자리/);
});

test('validatePhone: 010 번호는 11자리여야 한다', () => {
  const r = validatePhone('010-123-4567');
  assertShape(r);
  assert.equal(r.valid, false);
  assert.match(r.message, /11자리/);
});

test('validatePhone: 자릿수가 넘치면 실패한다', () => {
  const r = validatePhone('010-1234-56789');
  assertShape(r);
  assert.equal(r.valid, false);
});

test('validatePhone: 숫자가 하나도 없으면 숫자 입력을 안내한다', () => {
  const r = validatePhone('없음');
  assertShape(r);
  assert.equal(r.valid, false);
  assert.match(r.message, /숫자/);
});

// ---------- validatePassword ----------

test('validatePassword: 두 종류 이상을 섞은 8자 이상을 통과시킨다', () => {
  for (const value of ['abcd1234', 'shop!pass', '12345678!', 'Aa1!Aa1!']) {
    const r = validatePassword(value);
    assertShape(r);
    assert.equal(r.valid, true, `${value} 는 통과해야 한다`);
  }
});

test('validatePassword: 비어 있으면 입력을 요구한다', () => {
  const r = validatePassword('');
  assertShape(r);
  assert.equal(r.valid, false);
  assert.match(r.message, /입력/);
});

test('validatePassword: 8자 미만이면 현재 길이를 알려준다', () => {
  const r = validatePassword('ab12');
  assertShape(r);
  assert.equal(r.valid, false);
  assert.match(r.message, /8자/);
  assert.match(r.message, /4자/);
});

test('validatePassword: 64자를 넘으면 실패한다', () => {
  const r = validatePassword(`${'a'.repeat(64)}1`);
  assertShape(r);
  assert.equal(r.valid, false);
  assert.match(r.message, /64자/);
});

test('validatePassword: 한 종류만 쓰면 조합을 요구한다', () => {
  for (const value of ['abcdefgh', '12345678', '!!!!!!!!']) {
    const r = validatePassword(value);
    assertShape(r);
    assert.equal(r.valid, false, `${value} 는 실패해야 한다`);
    assert.match(r.message, /2가지/);
  }
});

test('validatePassword: 공백이 들어가면 실패한다', () => {
  const r = validatePassword('abcd 1234');
  assertShape(r);
  assert.equal(r.valid, false);
  assert.match(r.message, /공백/);
});

// ---------- formatPhone ----------

test('formatPhone: 11자리를 010-1234-5678 로 정규화한다', () => {
  assert.equal(formatPhone('01012345678'), '010-1234-5678');
  assert.equal(formatPhone('010-1234-5678'), '010-1234-5678');
  assert.equal(formatPhone(' 010 1234 5678 '), '010-1234-5678');
});

test('formatPhone: 10자리는 3-3-4 로 끊는다', () => {
  assert.equal(formatPhone('0111234567'), '011-123-4567');
});

test('formatPhone: 입력 중인 부분 번호도 진행형으로 끊는다', () => {
  assert.equal(formatPhone('010'), '010');
  assert.equal(formatPhone('0101'), '010-1');
  assert.equal(formatPhone('0101234'), '010-1234');
  assert.equal(formatPhone('01012345'), '010-1234-5');
});

test('formatPhone: 숫자가 아닌 문자는 버린다', () => {
  assert.equal(formatPhone('010abc1234def5678'), '010-1234-5678');
});

test('formatPhone: 11자리를 넘는 입력은 잘라낸다', () => {
  assert.equal(formatPhone('010123456789999'), '010-1234-5678');
});

test('formatPhone: 값이 없으면 빈 문자열이다', () => {
  assert.equal(formatPhone(''), '');
  assert.equal(formatPhone(null), '');
  assert.equal(formatPhone(undefined), '');
  assert.equal(formatPhone('없음'), '');
});
