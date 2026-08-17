const boundRoots = new WeakSet();

function getRoot(root) {
  if (root?.addEventListener) return root;
  return typeof document === 'undefined' ? null : document;
}

function getTabs(tablist) {
  return [...tablist.querySelectorAll('[role="tab"]')].filter(
    (tab) => tab.closest('[role="tablist"]') === tablist
  );
}

function getPanel(tab) {
  const panelId = tab.getAttribute('aria-controls');
  return panelId ? tab.ownerDocument?.getElementById(panelId) : null;
}

function focusTab(tab) {
  try {
    tab.focus({ preventScroll: true });
  } catch {
    tab.focus();
  }
  tab.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

function activateTab(tab, shouldFocus) {
  const tablist = tab.closest('[role="tablist"]');
  if (!tablist) return;

  const tabs = getTabs(tablist);
  if (!tabs.includes(tab)) return;

  for (const candidate of tabs) {
    const selected = candidate === tab;
    candidate.setAttribute('aria-selected', String(selected));
    candidate.setAttribute('tabindex', selected ? '0' : '-1');
    const panel = getPanel(candidate);
    if (panel) panel.hidden = !selected;
  }

  if (shouldFocus) focusTab(tab);
}

function handleClick(event) {
  const tab = event.target?.closest?.('[role="tab"]');
  if (!tab || !tab.closest('[role="tablist"]')) return;

  event.preventDefault();
  activateTab(tab, false);
}

function handleKeydown(event) {
  const tab = event.target?.closest?.('[role="tab"]');
  const tablist = tab?.closest('[role="tablist"]');
  if (!tablist) return;

  const tabs = getTabs(tablist);
  const currentIndex = tabs.indexOf(tab);
  if (currentIndex === -1) return;

  let nextIndex;
  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
  else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  else if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = tabs.length - 1;
  else return;

  event.preventDefault();
  activateTab(tabs[nextIndex], true);
}

export function initTabs(root) {
  const scope = getRoot(root);
  if (!scope || boundRoots.has(scope)) return;

  scope.addEventListener('click', handleClick);
  scope.addEventListener('keydown', handleKeydown);
  boundRoots.add(scope);
}
