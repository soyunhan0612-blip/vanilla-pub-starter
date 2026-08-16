/**
 * util/validate.js — 폼 검증 규칙. 이커머스에서 실제로 쓰는 것만 둔다.
 *
 * 모든 검증 함수는 { valid: boolean, message: string } 를 돌려준다.
 * 통과하면 message 는 ''. 실패하면 **무엇을 고쳐야 하는지** 담는다.
 * "올바르지 않습니다" 류의 메시지는 사용자가 다음 행동을 알 수 없으므로 쓰지 않는다.
 *
 * DOM 을 만지지 않으므로 입력값 읽기·에러 표시는 assets/js/common/ 의 몫이다.
 *
 * 의존성 0 — 이 모듈은 아무것도 import 하지 않는다.
 */

const ok = () => ({ valid: true, message: '' });
const fail = (message) => ({ valid: false, message });

/** 입력값을 문자열로 정규화한다. null·undefined 는 빈 문자열. */
const toText = (value) => (value === null || value === undefined ? '' : String(value));

/** 숫자만 남긴다. 하이픈·공백·괄호를 섞어 입력해도 같은 결과가 되게 한다. */
const onlyDigits = (value) => toText(value).replace(/\D/g, '');

/**
 * 필수 입력.
 * 공백만 있는 값은 비어 있는 것으로 본다. 0 과 false 는 값으로 인정한다.
 */
export function validateRequired(value) {
  if (toText(value).trim() === '') {
    return fail('필수 입력 항목입니다. 값을 입력해 주세요.');
  }
  return ok();
}

/**
 * 이메일.
 * 형식: 로컬부@도메인.최상위도메인 — 공백 불가, @ 는 하나, 점 뒤에 라벨이 있어야 한다.
 * 길이 상한 254자는 RFC 5321 의 경로 상한을 따른다.
 */
export function validateEmail(value) {
  const text = toText(value).trim();

  if (text === '') return fail('이메일 주소를 입력해 주세요.');
  if (/\s/.test(text)) return fail('이메일 주소에는 공백을 넣을 수 없습니다. 공백을 지워 주세요.');
  if (text.length > 254) return fail('이메일 주소가 너무 깁니다. 254자 이하로 입력해 주세요.');
  if (!text.includes('@')) {
    return fail('이메일 주소에 @ 를 포함해 주세요. 예: shop@example.com');
  }
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(text)) {
    return fail('이메일 주소를 shop@example.com 형식으로 입력해 주세요.');
  }

  return ok();
}

/**
 * 한국 휴대폰 번호.
 * 010 은 11자리, 01(1·6·7·8·9) 은 10~11자리를 허용한다(구번호 이관 대비).
 * 하이픈·공백은 있어도 없어도 된다.
 */
export function validatePhone(value) {
  const text = toText(value).trim();
  if (text === '') return fail('휴대폰 번호를 입력해 주세요.');

  const digits = onlyDigits(text);
  if (digits === '') return fail('휴대폰 번호를 숫자로 입력해 주세요. 예: 010-1234-5678');

  if (!/^01[016-9]/.test(digits)) {
    return fail('휴대폰 번호는 010, 011, 016~019 로 시작해야 합니다.');
  }

  if (digits.startsWith('010')) {
    if (digits.length !== 11) {
      return fail(
        `010 으로 시작하는 번호는 숫자 11자리입니다. 현재 ${digits.length}자리를 입력했습니다.`
      );
    }
    return ok();
  }

  if (digits.length < 10 || digits.length > 11) {
    return fail(`휴대폰 번호는 숫자 10~11자리입니다. 현재 ${digits.length}자리를 입력했습니다.`);
  }

  return ok();
}

/**
 * 비밀번호.
 *
 * 규칙:
 *   1. 8자 이상 64자 이하
 *   2. 공백 불가 (앞뒤 공백이 잘려 로그인이 안 되는 사고를 막는다)
 *   3. 영문 · 숫자 · 특수문자 중 2가지 이상 조합
 *
 * 값을 trim 하지 않는다 — 공백도 사용자가 입력한 문자이므로 검증 대상이다.
 */
export function validatePassword(value) {
  const text = toText(value);

  if (text === '') return fail('비밀번호를 입력해 주세요.');
  if (text.length < 8) {
    return fail(`비밀번호는 8자 이상이어야 합니다. 현재 ${text.length}자입니다.`);
  }
  if (text.length > 64) {
    return fail(`비밀번호는 64자 이하여야 합니다. 현재 ${text.length}자입니다.`);
  }
  if (/\s/.test(text)) {
    return fail('비밀번호에는 공백을 넣을 수 없습니다. 공백을 지워 주세요.');
  }

  const kinds = [/[A-Za-z]/, /\d/, /[^A-Za-z\d\s]/].filter((re) => re.test(text)).length;
  if (kinds < 2) {
    return fail('비밀번호는 영문 · 숫자 · 특수문자 중 2가지 이상을 섞어 주세요.');
  }

  return ok();
}

/**
 * 휴대폰 번호를 010-1234-5678 형태로 정규화한다.
 *
 * 입력 도중에도 쓸 수 있도록 부분 입력을 진행형으로 끊는다.
 *   '010'        → '010'
 *   '0101234'    → '010-1234'
 *   '01012345'   → '010-1234-5'
 *   '0111234567' → '011-123-4567'   (10자리는 3-3-4)
 * 숫자가 아닌 문자는 버리고, 11자리를 넘는 입력은 잘라낸다.
 *
 * 검증이 아니라 표시용 변환이므로 문자열을 그대로 돌려준다.
 *
 * @param {string} value
 * @returns {string}
 */
export function formatPhone(value) {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
