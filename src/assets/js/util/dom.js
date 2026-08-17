export function buildClassName(base, modifiers = []) {
  const baseClass = typeof base === 'string' ? base.trim() : '';
  if (!baseClass) return '';

  const modifierClasses = modifiers
    .filter((modifier) => typeof modifier === 'string' && modifier.trim())
    .map((modifier) => `${baseClass}--${modifier.trim()}`);

  return [baseClass, ...modifierClasses].join(' ');
}

export function parseDataAttr(value) {
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
