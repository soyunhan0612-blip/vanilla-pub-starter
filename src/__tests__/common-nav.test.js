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
    event.currentTarget ||= this;
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

function createGnbFixture(mode) {
  const root = new DelegatedRoot();
  const panels = [];
  const triggers = [];
  const links = [];
  const doc = {
    getElementById(id) {
      return panels.find((panel) => panel.id === id) || null;
    },
  };
  const gnb = {
    getAttribute(name) {
      return name === 'data-gnb-mode' ? mode || null : null;
    },
    contains(target) {
      return target === gnb || triggers.includes(target) || panels.includes(target) || links.includes(target);
    },
    querySelectorAll(selector) {
      assert.equal(selector, '[data-gnb-trigger]');
      return triggers;
    },
  };

  for (let panelIndex = 0; panelIndex < 2; panelIndex += 1) {
    const panelLinks = Array.from({ length: 2 }, () => {
      const link = {
        hidden: false,
        focusCount: 0,
        closest(selector) {
          if (selector === '[data-gnb-panel]') return panels[panelIndex];
          if (selector === '[data-gnb]') return gnb;
          return null;
        },
        focus() {
          link.focusCount += 1;
        },
      };
      links.push(link);
      return link;
    });
    const panel = {
      id: `gnb-panel-${panelIndex}`,
      hidden: true,
      querySelectorAll() {
        return panelLinks;
      },
      closest(selector) {
        return selector === '[data-gnb]' ? gnb : null;
      },
    };
    panels.push(panel);

    const trigger = {
      ...attributeNode({
        'aria-controls': panel.id,
        'aria-expanded': 'false',
      }),
      ownerDocument: doc,
      focusCount: 0,
      closest(selector) {
        if (selector === '[data-gnb-trigger]') return trigger;
        if (selector === '[data-gnb]') return gnb;
        return null;
      },
      focus() {
        trigger.focusCount += 1;
      },
    };
    triggers.push(trigger);
  }

  return { root, gnb, panels, triggers, links };
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

test('GNB는 이벤트를 한 번만 위임하고 aria-expanded를 기준으로 패널을 전환한다', async () => {
  const { initGnb } = await import('../assets/js/common/gnb.js');
  const { root, panels, triggers } = createGnbFixture();

  initGnb(root);
  initGnb(root);
  assert.equal(root.listeners.get('click').length, 1);
  assert.equal(root.listeners.get('keydown').length, 1);
  assert.equal(root.listeners.get('mouseover').length, 1);
  assert.equal(root.listeners.get('mouseout').length, 1);

  root.dispatch('click', clickEvent(triggers[0]));
  assert.deepEqual(triggers.map((trigger) => trigger.getAttribute('aria-expanded')), ['true', 'false']);
  assert.deepEqual(panels.map((panel) => panel.hidden), [false, true]);

  root.dispatch('click', clickEvent(triggers[1]));
  assert.deepEqual(triggers.map((trigger) => trigger.getAttribute('aria-expanded')), ['false', 'true']);
  assert.deepEqual(panels.map((panel) => panel.hidden), [true, false]);
});

test('GNB는 방향키로 열린 패널 항목을 순환하고 Esc로 닫은 뒤 트리거에 복귀한다', async () => {
  const { initGnb } = await import('../assets/js/common/gnb.js');
  const { root, panels, triggers, links } = createGnbFixture();
  initGnb(root);

  const open = keyEvent(triggers[0], 'ArrowDown');
  root.dispatch('keydown', open);
  assert.equal(open.defaultPrevented, true);
  assert.equal(triggers[0].getAttribute('aria-expanded'), 'true');
  assert.equal(panels[0].hidden, false);
  assert.equal(links[0].focusCount, 1);

  const next = keyEvent(links[0], 'ArrowDown');
  root.dispatch('keydown', next);
  assert.equal(next.defaultPrevented, true);
  assert.equal(links[1].focusCount, 1);

  const wrap = keyEvent(links[1], 'ArrowDown');
  root.dispatch('keydown', wrap);
  assert.equal(links[0].focusCount, 2);

  const close = keyEvent(links[0], 'Escape');
  root.dispatch('keydown', close);
  assert.equal(close.defaultPrevented, true);
  assert.equal(triggers[0].getAttribute('aria-expanded'), 'false');
  assert.equal(panels[0].hidden, true);
  assert.equal(triggers[0].focusCount, 1);
});

test('GNB는 포인터가 메뉴를 벗어날 때 짧은 지연 후 닫는다', async () => {
  const { initGnb } = await import('../assets/js/common/gnb.js');
  const { root, gnb, panels, triggers } = createGnbFixture();
  const originalSetTimeout = globalThis.setTimeout;
  let scheduled;
  globalThis.setTimeout = (callback, delay) => {
    scheduled = { callback, delay };
    return 1;
  };

  try {
    initGnb(root);
    root.dispatch('mouseover', { target: triggers[0], relatedTarget: null });
    assert.equal(triggers[0].getAttribute('aria-expanded'), 'true');
    root.dispatch('click', clickEvent(triggers[0]));
    assert.equal(triggers[0].getAttribute('aria-expanded'), 'true');

    root.dispatch('mouseout', { target: triggers[0], relatedTarget: null });
    assert.ok(scheduled.delay >= 100);
    assert.equal(panels[0].hidden, false);
    scheduled.callback();
    assert.equal(panels[0].hidden, true);

    root.dispatch('mouseover', { target: triggers[1], relatedTarget: gnb });
    assert.equal(triggers[1].getAttribute('aria-expanded'), 'true');
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('MO GNB 아코디언은 포인터 진입으로 열리지 않고 클릭으로만 전환한다', async () => {
  const { initGnb } = await import('../assets/js/common/gnb.js');
  const { root, panels, triggers } = createGnbFixture('accordion');
  initGnb(root);

  root.dispatch('mouseover', { target: triggers[0], relatedTarget: null });
  assert.equal(triggers[0].getAttribute('aria-expanded'), 'false');
  assert.equal(panels[0].hidden, true);

  root.dispatch('click', clickEvent(triggers[0]));
  assert.equal(triggers[0].getAttribute('aria-expanded'), 'true');
  assert.equal(panels[0].hidden, false);
});

test('모달 기반 드로어는 상태를 동기화하고 Esc 후 호출 버튼으로 포커스를 돌린다', async () => {
  const { initModals } = await import('../assets/js/common/modal.js');
  const doc = new DelegatedRoot();
  const modalAttributes = new Map([
    ['aria-hidden', 'true'],
    ['data-modal', 'gnb-mo-drawer'],
  ]);
  const modalClasses = new Set(['gnb-drawer']);
  const opener = {
    ...attributeNode({
      'aria-controls': 'gnb-mo-drawer',
      'aria-expanded': 'false',
      'data-modal-open': 'gnb-mo-drawer',
    }),
    hasAttribute(name) {
      return this.getAttribute(name) !== null;
    },
    closest(selector) {
      return selector === '[data-modal-open]' ? opener : null;
    },
    focusCount: 0,
    focus() {
      this.focusCount += 1;
      doc.activeElement = this;
    },
  };
  const closeButton = {
    getAttribute() {
      return null;
    },
    closest(selector) {
      if (selector === '[data-modal-close]') return closeButton;
      if (selector === '[data-modal]') return modal;
      return null;
    },
    focus() {
      doc.activeElement = this;
    },
  };
  const modal = {
    id: 'gnb-mo-drawer',
    dataset: { modal: 'gnb-mo-drawer' },
    hidden: true,
    inert: true,
    offsetWidth: 0,
    classList: {
      add(name) {
        modalClasses.add(name);
      },
      remove(name) {
        modalClasses.delete(name);
      },
      contains(name) {
        return modalClasses.has(name);
      },
    },
    matches(selector) {
      return selector === '[data-modal]';
    },
    contains(target) {
      return target === closeButton;
    },
    querySelectorAll() {
      return [closeButton];
    },
    getAttribute(name) {
      return modalAttributes.get(name) ?? null;
    },
    setAttribute(name, value) {
      modalAttributes.set(name, String(value));
    },
    removeAttribute(name) {
      modalAttributes.delete(name);
    },
  };

  doc.nodeType = 9;
  doc.activeElement = opener;
  doc.body = { style: { position: '', top: '', width: '' } };
  doc.documentElement = {
    classList: {
      add() {},
      remove() {},
    },
  };
  doc.defaultView = { scrollY: 120, scrollTo() {} };
  doc.getElementById = (id) => (id === modal.id ? modal : null);
  doc.querySelectorAll = () => [modal];

  initModals(doc);
  doc.dispatch('click', clickEvent(opener));

  assert.equal(modal.hidden, false);
  assert.equal(modal.inert, false);
  assert.equal(modalClasses.has('is-open'), true);
  assert.equal(opener.getAttribute('aria-expanded'), 'true');
  assert.equal(doc.activeElement, closeButton);
  assert.equal(doc.body.style.position, 'fixed');

  const escape = keyEvent(closeButton, 'Escape');
  escape.propagationStopped = false;
  escape.stopPropagation = function stopPropagation() {
    this.propagationStopped = true;
  };
  doc.dispatch('keydown', escape);

  assert.equal(escape.defaultPrevented, true);
  assert.equal(escape.propagationStopped, true);
  assert.equal(modal.hidden, true);
  assert.equal(modal.inert, true);
  assert.equal(opener.getAttribute('aria-expanded'), 'false');
  assert.equal(doc.activeElement, opener);
  assert.equal(doc.body.style.position, '');
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

test('PC 셸 fragment는 검색·메가메뉴·공용 푸터 접근성 계약을 제공한다', async () => {
  const componentUrl = new URL('../assets/components/layout/', import.meta.url);
  const [header, gnb, footer] = await Promise.all(
    ['header-pc.html', 'gnb-pc.html', 'footer.html'].map((file) =>
      readFile(new URL(file, componentUrl), 'utf8')
    )
  );

  assert.match(header, /<nav[^>]*aria-label="유틸리티"/);
  assert.match(header, /<form[^>]*role="search"/);
  assert.match(header, /<label[^>]*for="site-search-pc"/);
  assert.match(header, /<input[^>]*id="site-search-pc"[^>]*type="search"/s);
  assert.match(header, /<span class="sr-only">장바구니 3개<\/span>/);
  assert.match(header, /@include\s+layout\/gnb-pc\.html/);

  assert.match(gnb, /<nav[^>]*aria-label="주요 메뉴"[^>]*data-gnb/);
  assert.match(gnb, /<button[^>]*data-gnb-trigger[^>]*aria-expanded="false"[^>]*aria-controls=/s);
  assert.match(gnb, /data-gnb-panel/);

  assert.match(footer, /<footer\b/);
  assert.match(footer, /사업자등록번호/);
  assert.match(footer, /<strong>개인정보처리방침<\/strong>/);
  assert.match(footer, /<a[^>]*aria-label="인스타그램"/);
});

test('MO 셸은 공용 GNB·모달 계약과 안전 영역을 포함한 고정 내비게이션을 제공한다', async () => {
  const componentUrl = new URL('../assets/components/layout/', import.meta.url);
  const [header, gnbMo, gnbPc, bottomNav, template, moEntry, bottomNavScss, moScss] =
    await Promise.all([
      'header-mo.html',
      'gnb-mo.html',
      'gnb-pc.html',
      'bottom-nav.html',
    ].map((file) => readFile(new URL(file, componentUrl), 'utf8')).concat([
      readFile(new URL('../mo/_template.html', import.meta.url), 'utf8'),
      readFile(new URL('../assets/js/mo.js', import.meta.url), 'utf8'),
      readFile(new URL('../assets/scss/layout/_bottom-nav.scss', import.meta.url), 'utf8'),
      readFile(new URL('../assets/scss/mo.scss', import.meta.url), 'utf8'),
    ]));

  assert.match(header, /aria-label="메뉴 열기"/);
  assert.match(header, /aria-expanded="false"/);
  assert.match(header, /aria-controls="gnb-mo-drawer"/);
  assert.match(header, /data-modal-open="gnb-mo-drawer"/);
  assert.match(header, /스크롤 시 축소·고정은 적용하지 않는다/);
  assert.match(header, /<span class="sr-only">장바구니 3개<\/span>/);

  assert.match(gnbMo, /role="dialog"/);
  assert.match(gnbMo, /aria-modal="true"/);
  assert.match(gnbMo, /data-modal="gnb-mo-drawer"/);
  assert.match(gnbMo, /data-gnb[^>]*data-gnb-mode="accordion"/);
  assert.match(gnbMo, /data-gnb-trigger/);
  assert.match(gnbMo, /data-gnb-panel/);
  const categoryLinks = (source) =>
    [...source.matchAll(/href="(\/category\/[^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(categoryLinks(gnbMo), categoryLinks(gnbPc));

  assert.match(bottomNav, /<nav[^>]*aria-label="주요 메뉴"/);
  assert.equal((bottomNav.match(/class="bottom-nav__link"/g) || []).length, 5);
  assert.match(bottomNav, /aria-current="page"/);
  for (const label of ['홈', '카테고리', '검색', '찜', '마이']) {
    assert.match(bottomNav, new RegExp(`<span>${label}<\\/span>`));
  }
  assert.match(bottomNavScss, /min-width:\s*44px/);
  assert.match(bottomNavScss, /min-height:\s*44px/);
  assert.match(bottomNavScss, /var\(--safe-bottom\)/);

  assert.match(template, /href="\/assets\/css\/mo\.css"/);
  assert.match(template, /src="\/assets\/js\/mo\.js"/);
  assert.match(template, /@include\s+layout\/header-mo\.html/);
  assert.match(template, /@include\s+layout\/gnb-mo\.html/);
  assert.match(template, /@include\s+layout\/footer\.html/);
  assert.match(template, /@include\s+layout\/bottom-nav\.html/);
  assert.match(template, /<main[^>]*site-main--with-bottom-nav/);
  assert.match(moEntry, /initGnb\(document\)/);
  assert.match(moScss, /max-width:\s*var\(--layout-content-mo-max\)/);
});
