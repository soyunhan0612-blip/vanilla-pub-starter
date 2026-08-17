import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRequired,
  validateEmail,
  validatePhone,
  validatePassword,
  formatPhone,
} from '../assets/js/util/validate.js';

const VALID = { valid: true, message: '' };

test('validateRequired는 빈 값과 공백만 있는 값을 거부한다', () => {
  assert.deepEqual(validateRequired('상품'), VALID);
  assert.deepEqual(validateRequired(0), VALID);
  assert.deepEqual(validateRequired('   '), {
    valid: false,
    message: '필수 입력 항목입니다.',
  });
  assert.deepEqual(validateRequired(null), {
    valid: false,
    message: '필수 입력 항목입니다.',
  });
});

test('validateEmail은 수정 방법을 포함한 메시지를 반환한다', () => {
  assert.deepEqual(validateEmail('buyer@example.com'), VALID);
  assert.deepEqual(validateEmail('buyer@localhost'), {
    valid: false,
    message: '이메일 주소를 name@example.com 형식으로 입력해 주세요.',
  });
  assert.deepEqual(validateEmail(''), {
    valid: false,
    message: '이메일 주소를 입력해 주세요.',
  });
});

test('validatePhone은 010 한국 휴대폰 번호의 하이픈 유무를 허용한다', () => {
  assert.deepEqual(validatePhone('01012345678'), VALID);
  assert.deepEqual(validatePhone('010-1234-5678'), VALID);
  assert.deepEqual(validatePhone('02-1234-5678'), {
    valid: false,
    message: '휴대폰 번호를 010-1234-5678 형식으로 입력해 주세요.',
  });
  assert.deepEqual(validatePhone(''), {
    valid: false,
    message: '휴대폰 번호를 입력해 주세요.',
  });
});

test('validatePassword는 영문과 숫자를 포함한 8~20자 규칙을 검사한다', () => {
  assert.deepEqual(validatePassword('shop1234'), VALID);
  for (const value of ['12345678', 'password', 'shop12', 'shop123456789012345678']) {
    assert.deepEqual(validatePassword(value), {
      valid: false,
      message: '비밀번호를 영문과 숫자를 포함한 8~20자로 입력해 주세요.',
    });
  }
  assert.deepEqual(validatePassword(''), {
    valid: false,
    message: '비밀번호를 입력해 주세요.',
  });
});

test('formatPhone은 입력 중인 숫자를 010-1234-5678 형태로 정규화한다', () => {
  assert.equal(formatPhone('01012345678'), '010-1234-5678');
  assert.equal(formatPhone('010-1234-5678'), '010-1234-5678');
  assert.equal(formatPhone('0101234'), '010-1234');
  assert.equal(formatPhone('010123456789'), '010-1234-5678');
  assert.equal(formatPhone(null), '');
});
