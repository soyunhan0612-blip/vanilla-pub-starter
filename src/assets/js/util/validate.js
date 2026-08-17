const VALID_RESULT = Object.freeze({ valid: true, message: '' });

function invalid(message) {
  return { valid: false, message };
}

function isEmpty(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

export function validateRequired(value) {
  return isEmpty(value) ? invalid('필수 입력 항목입니다.') : VALID_RESULT;
}

export function validateEmail(value) {
  if (isEmpty(value)) return invalid('이메일 주소를 입력해 주세요.');

  const email = String(value).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? VALID_RESULT
    : invalid('이메일 주소를 name@example.com 형식으로 입력해 주세요.');
}

export function validatePhone(value) {
  if (isEmpty(value)) return invalid('휴대폰 번호를 입력해 주세요.');

  const phone = String(value).trim().replace(/[\s-]/g, '');
  return /^010\d{8}$/.test(phone)
    ? VALID_RESULT
    : invalid('휴대폰 번호를 010-1234-5678 형식으로 입력해 주세요.');
}

// 비밀번호 규칙: 영문과 숫자를 각각 하나 이상 포함한 8~20자이며 특수문자는 사용할 수 있다.
export function validatePassword(value) {
  if (isEmpty(value)) return invalid('비밀번호를 입력해 주세요.');

  const password = String(value);
  const meetsRule = password.length >= 8 && password.length <= 20 && /[A-Za-z]/.test(password) && /\d/.test(password);
  return meetsRule
    ? VALID_RESULT
    : invalid('비밀번호를 영문과 숫자를 포함한 8~20자로 입력해 주세요.');
}

export function formatPhone(value) {
  const digits = String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 11);

  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
