/**
 * util/focus-trap.js — 모달·드로어 포커스 가둠의 "계산" 레이어.
 *
 * 요소를 만지지 않는다. 포커스 가능한 요소가 몇 개인지, 지금 몇 번째인지,
 * 어느 방향으로 움직이는지만 받아 다음 인덱스를 돌려준다.
 * 실제 focus() 호출과 키 이벤트 바인딩은 assets/js/common/ 의 몫이다.
 *
 * 접근성 근거:
 *  - 모달이 열려 있는 동안 Tab 은 모달 안을 순환해야 한다 (WCAG 2.4.3 포커스 순서).
 *  - 대신 Esc 로 반드시 빠져나갈 수 있어야 한다 (WCAG 2.1.2 키보드 트랩).
 *    Esc 처리는 키 이벤트 레이어인 common/ 책임이다.
 *
 * 의존성 0 — 이 모듈은 아무것도 import 하지 않는다.
 */

/**
 * 포커스 가능한 요소 셀렉터.
 * disabled 요소, type="hidden", tabindex="-1" 은 탭 순서에서 빠지므로 제외한다.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'audio[controls]',
  'video[controls]',
  'summary',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * 포커스 가능한 요소를 고르는 셀렉터 문자열.
 * common/ 이 `root.querySelectorAll(isFocusableSelector())` 형태로 쓴다.
 *
 * @returns {string}
 */
export function isFocusableSelector() {
  return FOCUSABLE_SELECTOR;
}

/**
 * Tab / Shift+Tab 이 눌렸을 때 이동할 인덱스를 계산한다.
 *
 * 마지막에서 정방향은 첫 요소로, 첫 요소에서 역방향은 마지막으로 순환한다.
 * 이 순환이 모달 밖으로 포커스가 새는 것을 막는 유일한 장치다.
 *
 * @param {number} count      트랩 안의 포커스 가능한 요소 개수
 * @param {number} current    현재 인덱스. 트랩 밖이면 -1(또는 범위 밖 값)
 * @param {number} [direction=1] 1 = Tab, -1 = Shift+Tab. 부호만 본다
 * @returns {number} 다음 인덱스. 포커스 대상이 없으면 -1
 */
export function nextFocusIndex(count, current, direction = 1) {
  const total = Number.isInteger(count) ? count : Math.floor(Number(count));
  if (!Number.isInteger(total) || total <= 0) return -1;

  const forward = !(Number(direction) < 0);
  const inRange = Number.isInteger(current) && current >= 0 && current < total;

  // 트랩 밖에서 들어오는 경우: 정방향이면 첫 요소, 역방향이면 마지막 요소
  if (!inRange) return forward ? 0 : total - 1;

  return forward ? (current + 1) % total : (current - 1 + total) % total;
}
