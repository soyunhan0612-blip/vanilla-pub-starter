export function nextFocusIndex(count, current, direction) {
  if (!Number.isInteger(count) || count <= 0) return -1;

  const step = direction === -1 ? -1 : 1;
  return (current + step + count) % count;
}

export function isFocusableSelector() {
  return [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"]):not([disabled])',
    '[contenteditable="true"]',
  ].join(', ');
}
