const MIN_DURATION = 5000;
const DEFAULT_DURATION = 5000;
const TRANSITION_DURATION = 200;
const VALID_TYPES = new Set(['default', 'success', 'error']);
const boundDocuments = new WeakSet();
const timers = new WeakMap();

function removeToast(toast) {
  const activeTimers = timers.get(toast);
  if (activeTimers?.dismiss) clearTimeout(activeTimers.dismiss);

  toast.classList.remove('is-visible');
  toast.classList.add('is-leaving');
  const remove = setTimeout(() => {
    toast.remove();
    timers.delete(toast);
  }, TRANSITION_DURATION);
  timers.set(toast, { ...activeTimers, remove });
}

function bindDelegatedDismiss(doc) {
  if (boundDocuments.has(doc)) return;

  doc.addEventListener('click', (event) => {
    const closer = event.target?.closest?.('[data-toast-close]');
    const toast = closer?.closest('.toast');
    if (toast) removeToast(toast);
  });
  boundDocuments.add(doc);
}

function getToastRegion(doc) {
  let region = doc.querySelector('[data-toast-region]');
  if (region) return region;

  region = doc.createElement('div');
  region.className = 'toast-region';
  region.dataset.toastRegion = '';
  region.setAttribute('aria-label', '알림');
  doc.body.append(region);
  return region;
}

export function showToast(message, options = {}) {
  if (typeof document === 'undefined') return null;

  const doc = document;
  const type = VALID_TYPES.has(options?.type) ? options.type : 'default';
  const requestedDuration = Number(options?.duration);
  const duration = Number.isFinite(requestedDuration)
    ? Math.max(MIN_DURATION, requestedDuration)
    : DEFAULT_DURATION;

  bindDelegatedDismiss(doc);

  const toast = doc.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  toast.setAttribute('aria-atomic', 'true');
  toast.dataset.toastDuration = String(duration);

  const text = doc.createElement('p');
  text.className = 'toast__message';
  text.textContent = String(message ?? '');

  const closeButton = doc.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'toast__close';
  closeButton.dataset.toastClose = '';
  closeButton.textContent = '닫기';

  toast.append(text, closeButton);
  getToastRegion(doc).append(toast);
  void toast.offsetWidth;
  toast.classList.add('is-visible');

  const dismiss = setTimeout(() => removeToast(toast), duration);
  timers.set(toast, { dismiss });
  return toast;
}
