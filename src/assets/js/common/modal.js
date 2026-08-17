import { isFocusableSelector, nextFocusIndex } from '../util/focus-trap.js';

const modalStack = [];
const boundDocuments = new WeakSet();
const scrollStates = new WeakMap();
let activeDocument = null;

function resolveDocument(root) {
  if (root?.nodeType === 9) return root;
  if (root?.ownerDocument) return root.ownerDocument;
  return typeof document === 'undefined' ? null : document;
}

function findModal(id, doc) {
  const normalizedId = String(id || '').replace(/^#/, '');
  if (!normalizedId) return null;

  const byId = doc.getElementById(normalizedId);
  if (byId?.matches('[data-modal]')) return byId;

  return [...doc.querySelectorAll('[data-modal]')].find(
    (modal) => modal.getAttribute('data-modal') === normalizedId
  );
}

function getTopFrame(doc) {
  for (let index = modalStack.length - 1; index >= 0; index -= 1) {
    if (modalStack[index].doc === doc) return modalStack[index];
  }
  return null;
}

function getFocusableElements(modal) {
  return [...modal.querySelectorAll(isFocusableSelector())].filter(
    (element) =>
      !element.closest('[hidden]') &&
      !element.closest('[inert]') &&
      element.getAttribute('aria-hidden') !== 'true'
  );
}

function focusElement(element) {
  if (!element || typeof element.focus !== 'function') return;
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
}

function focusFirst(modal) {
  focusElement(getFocusableElements(modal)[0] || modal);
}

function lockBackgroundScroll(doc) {
  if (scrollStates.has(doc)) return;

  const view = doc.defaultView;
  const body = doc.body;
  const scrollY = view?.scrollY || 0;
  scrollStates.set(doc, {
    scrollY,
    position: body.style.position,
    top: body.style.top,
    width: body.style.width,
  });

  doc.documentElement.classList.add('is-modal-open');
  body.style.position = 'fixed';
  body.style.top = `-${scrollY}px`;
  body.style.width = '100%';
}

function unlockBackgroundScroll(doc) {
  const state = scrollStates.get(doc);
  if (!state) return;

  const body = doc.body;
  body.style.position = state.position;
  body.style.top = state.top;
  body.style.width = state.width;
  doc.documentElement.classList.remove('is-modal-open');
  scrollStates.delete(doc);
  doc.defaultView?.scrollTo(0, state.scrollY);
}

function hideFrame(frame) {
  frame.modal.classList.remove('is-open');
  frame.modal.setAttribute('aria-hidden', 'true');
  frame.modal.inert = true;
  frame.modal.hidden = true;
  if (frame.trigger?.hasAttribute?.('aria-expanded')) {
    frame.trigger.setAttribute('aria-expanded', 'false');
  }
}

function handleDocumentClick(event) {
  const target = event.target;
  if (!target?.closest) return;

  const opener = target.closest('[data-modal-open]');
  if (opener) {
    event.preventDefault();
    openModal(opener.getAttribute('data-modal-open'));
    return;
  }

  const closer = target.closest('[data-modal-close]');
  if (closer) {
    event.preventDefault();
    const owner = closer.closest('[data-modal]');
    closeModal(closer.getAttribute('data-modal-close') || owner?.id || owner?.dataset.modal);
    return;
  }

  if (target.matches('[data-modal]')) {
    closeModal(target.id || target.dataset.modal);
  }
}

function handleDocumentKeydown(event) {
  const doc = event.currentTarget;
  const frame = getTopFrame(doc);
  if (!frame) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeModal(frame.modal.id || frame.modal.dataset.modal);
    return;
  }

  if (event.key !== 'Tab') return;

  const focusable = getFocusableElements(frame.modal);
  event.preventDefault();
  if (!focusable.length) {
    focusElement(frame.modal);
    return;
  }

  const direction = event.shiftKey ? -1 : 1;
  const current = focusable.indexOf(doc.activeElement);
  const start = current === -1 ? (direction === -1 ? 0 : -1) : current;
  const next = nextFocusIndex(focusable.length, start, direction);
  focusElement(focusable[next]);
}

function handleDocumentFocus(event) {
  const frame = getTopFrame(event.currentTarget);
  if (frame && !frame.modal.contains(event.target)) focusFirst(frame.modal);
}

export function initModals(root) {
  const doc = resolveDocument(root);
  if (!doc) return;

  activeDocument = doc;
  if (boundDocuments.has(doc)) return;

  doc.addEventListener('click', handleDocumentClick);
  doc.addEventListener('keydown', handleDocumentKeydown, true);
  doc.addEventListener('focusin', handleDocumentFocus, true);
  boundDocuments.add(doc);
}

export function openModal(id) {
  const doc = activeDocument || resolveDocument();
  if (!doc) return null;

  const modal = findModal(id, doc);
  if (!modal) return null;
  if (modalStack.some((frame) => frame.modal === modal)) return modal;

  const previous = getTopFrame(doc);
  if (previous) {
    previous.modal.setAttribute('aria-hidden', 'true');
    previous.modal.inert = true;
  }
  else lockBackgroundScroll(doc);

  const trigger = doc.activeElement;
  modal.hidden = false;
  modal.inert = false;
  modal.removeAttribute('aria-hidden');
  void modal.offsetWidth;
  modal.classList.add('is-open');
  const frame = { doc, modal, trigger };
  modalStack.push(frame);
  if (trigger?.hasAttribute?.('aria-expanded')) {
    trigger.setAttribute('aria-expanded', 'true');
  }
  focusFirst(modal);
  return modal;
}

export function closeModal(id) {
  const doc = activeDocument || resolveDocument();
  if (!doc) return null;

  const modal = id ? findModal(id, doc) : getTopFrame(doc)?.modal;
  const index = modalStack.findIndex((frame) => frame.modal === modal);
  if (index === -1) return null;

  const [targetFrame] = modalStack.slice(index, index + 1);
  const closedFrames = modalStack.splice(index);
  for (const frame of closedFrames.reverse()) hideFrame(frame);

  const previous = getTopFrame(doc);
  if (previous) {
    previous.modal.inert = false;
    previous.modal.removeAttribute('aria-hidden');
    if (targetFrame.trigger && previous.modal.contains(targetFrame.trigger)) {
      focusElement(targetFrame.trigger);
    } else {
      focusFirst(previous.modal);
    }
  } else {
    unlockBackgroundScroll(doc);
    if (targetFrame.trigger?.isConnected !== false) focusElement(targetFrame.trigger);
  }

  return modal;
}
