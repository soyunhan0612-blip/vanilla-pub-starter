const boundRoots = new WeakSet();
const closeTimers = new WeakMap();
const hoverOpenedTriggers = new WeakSet();
const CLOSE_DELAY = 200;
const PANEL_FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getRoot(root) {
  if (root?.addEventListener) return root;
  return typeof document === 'undefined' ? null : document;
}

function getPanel(trigger) {
  const panelId = trigger.getAttribute('aria-controls');
  return panelId ? trigger.ownerDocument?.getElementById(panelId) : null;
}

function getTriggers(gnb) {
  return [...gnb.querySelectorAll('[data-gnb-trigger]')];
}

function setExpanded(trigger, expanded) {
  trigger.setAttribute('aria-expanded', String(expanded));
  if (!expanded) hoverOpenedTriggers.delete(trigger);
  const panel = getPanel(trigger);
  if (panel) panel.hidden = !expanded;
}

function closeAll(gnb, except = null) {
  for (const trigger of getTriggers(gnb)) {
    if (trigger !== except) setExpanded(trigger, false);
  }
}

function openMenu(trigger, gnb) {
  closeAll(gnb, trigger);
  setExpanded(trigger, true);
}

function focusElement(element) {
  if (!element?.focus) return;
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
}

function getPanelItems(panel) {
  if (!panel) return [];
  return [...panel.querySelectorAll(PANEL_FOCUSABLE)].filter((item) => !item.hidden);
}

function getPanelTrigger(panel, gnb) {
  return getTriggers(gnb).find(
    (trigger) => trigger.getAttribute('aria-controls') === panel.id
  );
}

function clearCloseTimer(gnb) {
  const timer = closeTimers.get(gnb);
  if (timer === undefined) return;
  clearTimeout(timer);
  closeTimers.delete(gnb);
}

function handleClick(event) {
  const trigger = event.target?.closest?.('[data-gnb-trigger]');
  const gnb = trigger?.closest('[data-gnb]');
  if (!gnb) return;

  event.preventDefault();
  const willExpand = trigger.getAttribute('aria-expanded') !== 'true';
  if (willExpand) {
    openMenu(trigger, gnb);
  } else if (hoverOpenedTriggers.has(trigger)) {
    // hover 직후의 첫 클릭은 사용자가 선택한 열림 상태를 확정한다.
    hoverOpenedTriggers.delete(trigger);
  } else {
    setExpanded(trigger, false);
  }
}

function handleKeydown(event) {
  const trigger = event.target?.closest?.('[data-gnb-trigger]');
  const triggerGnb = trigger?.closest('[data-gnb]');

  // button의 Enter·Space는 브라우저가 click으로 변환하므로 별도 키 처리를 중복하지 않는다.
  if (triggerGnb) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openMenu(trigger, triggerGnb);
      focusElement(getPanelItems(getPanel(trigger))[0]);
    } else if (event.key === 'Escape' && trigger.getAttribute('aria-expanded') === 'true') {
      event.preventDefault();
      setExpanded(trigger, false);
      focusElement(trigger);
    }
    return;
  }

  const panel = event.target?.closest?.('[data-gnb-panel]');
  const gnb = panel?.closest('[data-gnb]');
  if (!gnb) return;

  const ownerTrigger = getPanelTrigger(panel, gnb);
  if (event.key === 'Escape') {
    event.preventDefault();
    if (ownerTrigger) {
      setExpanded(ownerTrigger, false);
      focusElement(ownerTrigger);
    }
    return;
  }

  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const items = getPanelItems(panel);
  const currentIndex = items.findIndex(
    (item) => item === event.target || item.contains?.(event.target)
  );
  if (!items.length || currentIndex === -1) return;

  event.preventDefault();
  const direction = event.key === 'ArrowDown' ? 1 : -1;
  const nextIndex = (currentIndex + direction + items.length) % items.length;
  focusElement(items[nextIndex]);
}

function handleMouseover(event) {
  const gnb = event.target?.closest?.('[data-gnb]');
  if (!gnb) return;
  clearCloseTimer(gnb);

  const trigger = event.target.closest('[data-gnb-trigger]');
  if (trigger && trigger.getAttribute('aria-expanded') !== 'true') {
    openMenu(trigger, gnb);
    hoverOpenedTriggers.add(trigger);
  }
}

function handleMouseout(event) {
  const gnb = event.target?.closest?.('[data-gnb]');
  if (!gnb || gnb.contains(event.relatedTarget)) return;

  clearCloseTimer(gnb);
  closeTimers.set(
    gnb,
    setTimeout(() => {
      closeAll(gnb);
      closeTimers.delete(gnb);
    }, CLOSE_DELAY)
  );
}

export function initGnb(root) {
  const scope = getRoot(root);
  if (!scope || boundRoots.has(scope)) return;

  scope.addEventListener('click', handleClick);
  scope.addEventListener('keydown', handleKeydown);
  scope.addEventListener('mouseover', handleMouseover);
  scope.addEventListener('mouseout', handleMouseout);
  boundRoots.add(scope);
}
