import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class DelegatedRoot {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }
}

function attributeNode(initial = {}) {
  const attributes = new Map(Object.entries(initial));
  return {
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
  };
}

function createTabFixture() {
  const root = new DelegatedRoot();
  const panels = Object.fromEntries(
    ['panel-1', 'panel-2', 'panel-3'].map((id, index) => [id, { hidden: index !== 0 }])
  );
  const doc = { getElementById: (id) => panels[id] || null };
  const tablist = {
    querySelectorAll(selector) {
      assert.equal(selector, '[role="tab"]');
      return tabs;
    },
  };
  const tabs = ['panel-1', 'panel-2', 'panel-3'].map((panelId, index) => {
    const tab = {
      ...attributeNode({
        'aria-controls': panelId,
        'aria-selected': index === 0 ? 'true' : 'false',
        tabindex: index === 0 ? '0' : '-1',
      }),
      ownerDocument: doc,
      focusCount: 0,
      closest(selector) {
        if (selector === '[role="tab"]') return tab;
        if (selector === '[role="tablist"]') return tablist;
        return null;
      },
      focus() {
        tab.focusCount += 1;
      },
    };
    return tab;
  });

  return { root, panels, tabs };
}

function createAccordionFixture(mode, expandedStates) {
  const root = new DelegatedRoot();
  const panels = Object.fromEntries(
    expandedStates.map((expanded, index) => [`accordion-panel-${index}`, { hidden: !expanded }])
  );
  const doc = { getElementById: (id) => panels[id] || null };
  const accordion = {
    getAttribute(name) {
      return name === 'data-accordion-mode' ? mode : null;
    },
    querySelectorAll(selector) {
      assert.equal(selector, '[data-accordion-trigger]');
      return triggers;
    },
  };
  const triggers = expandedStates.map((expanded, index) => {
    const trigger = {
      ...attributeNode({
        'aria-controls': `accordion-panel-${index}`,
        'aria-expanded': String(expanded),
      }),
      ownerDocument: doc,
      closest(selector) {
        if (selector === '[data-accordion-trigger]') return trigger;
        if (selector === '[data-accordion]') return accordion;
        return null;
      },
    };
    return trigger;
  });

  return { root, panels, triggers };
}

function clickEvent(target) {
  return {
    target,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

function keyEvent(target, key) {
  return {
    target,
    key,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

test('탭은 루트에 한 번만 위임하고 클릭 시 선택·패널 상태를 동기화한다', async () => {
  const { initTabs } = await import('../assets/js/common/tab.js');
  const { root, panels, tabs } = createTabFixture();

  initTabs(root);
  initTabs(root);
  assert.equal(root.listeners.get('click').length, 1);
  assert.equal(root.listeners.get('keydown').length, 1);

  const event = clickEvent(tabs[1]);
  root.dispatch('click', event);

  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(tabs.map((tab) => tab.getAttribute('aria-selected')), ['false', 'true', 'false']);
  assert.deepEqual(tabs.map((tab) => tab.getAttribute('tabindex')), ['-1', '0', '-1']);
  assert.deepEqual(Object.values(panels).map((panel) => panel.hidden), [true, false, true]);
});

test('탭은 방향키를 순환하고 Home/End를 처리하며 Tab 키를 가로채지 않는다', async () => {
  const { initTabs } = await import('../assets/js/common/tab.js');
  const { root, tabs } = createTabFixture();
  initTabs(root);

  const left = keyEvent(tabs[0], 'ArrowLeft');
  root.dispatch('keydown', left);
  assert.equal(left.defaultPrevented, true);
  assert.equal(tabs[2].getAttribute('aria-selected'), 'true');
  assert.equal(tabs[2].focusCount, 1);

  const home = keyEvent(tabs[2], 'Home');
  root.dispatch('keydown', home);
  assert.equal(tabs[0].getAttribute('aria-selected'), 'true');

  const end = keyEvent(tabs[0], 'End');
  root.dispatch('keydown', end);
  assert.equal(tabs[2].getAttribute('aria-selected'), 'true');

  const tab = keyEvent(tabs[2], 'Tab');
  root.dispatch('keydown', tab);
  assert.equal(tab.defaultPrevented, false);
  assert.equal(tabs[2].getAttribute('aria-selected'), 'true');
});

test('복수 열림 아코디언은 다른 항목 상태를 유지한다', async () => {
  const { initAccordions } = await import('../assets/js/common/accordion.js');
  const { root, panels, triggers } = createAccordionFixture('multiple', [true, false]);
  initAccordions(root);
  initAccordions(root);
  assert.equal(root.listeners.get('click').length, 1);

  root.dispatch('click', clickEvent(triggers[1]));
  assert.deepEqual(triggers.map((trigger) => trigger.getAttribute('aria-expanded')), ['true', 'true']);
  assert.deepEqual(Object.values(panels).map((panel) => panel.hidden), [false, false]);
});

test('단일 열림 아코디언은 새 항목을 열 때 기존 항목을 닫는다', async () => {
  const { initAccordions } = await import('../assets/js/common/accordion.js');
  const { root, panels, triggers } = createAccordionFixture('single', [true, false]);
  initAccordions(root);

  root.dispatch('click', clickEvent(triggers[1]));
  assert.deepEqual(triggers.map((trigger) => trigger.getAttribute('aria-expanded')), ['false', 'true']);
  assert.deepEqual(Object.values(panels).map((panel) => panel.hidden), [true, false]);
});

test('내비게이션 fragment는 필수 ARIA 계약과 변형을 문서화한다', async () => {
  const componentUrl = new URL('../assets/components/common/', import.meta.url);
  const [tab, accordion, pagination, breadcrumb] = await Promise.all(
    ['tab.html', 'accordion.html', 'pagination.html', 'breadcrumb.html'].map((file) =>
      readFile(new URL(file, componentUrl), 'utf8')
    )
  );

  assert.match(tab, /role="tablist"/);
  assert.match(tab, /role="tab"[^>]*aria-selected="true"[^>]*aria-controls=/s);
  const tabButtons = [...tab.matchAll(/<button[\s\S]*?role="tab"[\s\S]*?>/g)].map(
    (match) => match[0]
  );
  assert.equal(tabButtons.filter((button) => /tabindex="0"/.test(button)).length, 1);
  assert.equal(
    tabButtons.filter((button) => /tabindex="-1"/.test(button)).length,
    tabButtons.length - 1
  );
  assert.match(tab, /role="tabpanel"[^>]*aria-labelledby=/s);

  assert.doesNotMatch(accordion, /<(?:details|summary)\b/);
  assert.match(accordion, /@variant\s+multiple/);
  assert.match(accordion, /@variant\s+single/);
  assert.match(accordion, /<button[^>]*aria-expanded="(?:true|false)"[^>]*aria-controls=/s);

  assert.match(pagination, /<nav[^>]*aria-label="페이지 탐색"/);
  assert.match(pagination, /aria-current="page"/);
  assert.match(pagination, /…/);
  assert.match(pagination, /@variant\s+more/);

  assert.match(breadcrumb, /<nav[^>]*aria-label="현재 위치"/);
  assert.match(breadcrumb, /<ol[\s>]/);
  assert.match(breadcrumb, /aria-current="page"/);
});
