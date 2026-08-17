const boundRoots = new WeakSet();

function getRoot(root) {
  if (root?.addEventListener) return root;
  return typeof document === 'undefined' ? null : document;
}

function getPanel(trigger) {
  const panelId = trigger.getAttribute('aria-controls');
  return panelId ? trigger.ownerDocument?.getElementById(panelId) : null;
}

function setExpanded(trigger, expanded) {
  trigger.setAttribute('aria-expanded', String(expanded));
  const panel = getPanel(trigger);
  if (panel) panel.hidden = !expanded;
}

function handleClick(event) {
  const trigger = event.target?.closest?.('[data-accordion-trigger]');
  const accordion = trigger?.closest('[data-accordion]');
  if (!accordion) return;

  event.preventDefault();
  const willExpand = trigger.getAttribute('aria-expanded') !== 'true';

  if (willExpand && accordion.getAttribute('data-accordion-mode') === 'single') {
    for (const candidate of accordion.querySelectorAll('[data-accordion-trigger]')) {
      if (candidate !== trigger) setExpanded(candidate, false);
    }
  }

  setExpanded(trigger, willExpand);
}

export function initAccordions(root) {
  const scope = getRoot(root);
  if (!scope || boundRoots.has(scope)) return;

  scope.addEventListener('click', handleClick);
  boundRoots.add(scope);
}
