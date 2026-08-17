import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class DelegatedRoot {
  constructor(steppers = []) {
    this.listeners = new Map();
    this.steppers = steppers;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  querySelectorAll(selector) {
    assert.equal(selector, '[data-stepper]');
    return this.steppers;
  }

  dispatch(type, event) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }
}

function createStepperFixture({ value = '1', defaultValue = '1', min = '1', max = '3' } = {}) {
  const attributes = new Map([
    ['min', min],
    ['max', max],
    ['step', '1'],
  ]);
  const emittedEvents = [];
  const input = {
    value,
    defaultValue,
    disabled: false,
    ownerDocument: { defaultView: { Event } },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    matches(selector) {
      return selector === '[data-stepper-input]';
    },
    closest(selector) {
      return selector === '[data-stepper]' ? stepper : null;
    },
    dispatchEvent(event) {
      emittedEvents.push(event);
      return true;
    },
  };
  const buttons = ['decrease', 'increase'].map((action) => {
    const button = {
      disabled: false,
      getAttribute(name) {
        return name === 'data-stepper-action' ? action : null;
      },
      closest(selector) {
        if (selector === '[data-stepper-action]') return button;
        if (selector === '[data-stepper]') return stepper;
        return null;
      },
    };
    return button;
  });
  const stepper = {
    querySelector(selector) {
      return selector === '[data-stepper-input]' ? input : null;
    },
    querySelectorAll(selector) {
      assert.equal(selector, '[data-stepper-action]');
      return buttons;
    },
  };
  const root = new DelegatedRoot([stepper]);

  return { root, stepper, input, buttons, emittedEvents };
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

test('stepper는 한 번만 위임하고 증감 시 경계·disabled·change 이벤트를 동기화한다', async () => {
  const { initSteppers } = await import('../assets/js/common/stepper.js');
  const { root, input, buttons, emittedEvents } = createStepperFixture();

  initSteppers(root);
  initSteppers(root);
  assert.equal(root.listeners.get('click').length, 1);
  assert.equal(root.listeners.get('input').length, 1);
  assert.equal(root.listeners.get('change').length, 1);
  assert.equal(buttons[0].disabled, true);
  assert.equal(buttons[1].disabled, false);

  root.dispatch('click', clickEvent(buttons[1]));
  assert.equal(input.value, '2');
  assert.equal(buttons[0].disabled, false);
  assert.equal(emittedEvents.length, 1);
  assert.equal(emittedEvents[0].type, 'change');
  assert.equal(emittedEvents[0].bubbles, true);

  root.dispatch('click', clickEvent(buttons[1]));
  assert.equal(input.value, '3');
  assert.equal(buttons[1].disabled, true);
});

test('stepper는 직접 입력한 비숫자와 범위 밖 값을 안전한 값으로 보정한다', async () => {
  const { initSteppers } = await import('../assets/js/common/stepper.js');
  const { root, input, buttons } = createStepperFixture({ defaultValue: '2' });
  initSteppers(root);

  input.value = 'not-a-number';
  root.dispatch('change', { target: input });
  assert.equal(input.value, '2');

  input.value = '100';
  root.dispatch('change', { target: input });
  assert.equal(input.value, '3');
  assert.equal(buttons[1].disabled, true);

  input.value = '-10';
  root.dispatch('change', { target: input });
  assert.equal(input.value, '1');
  assert.equal(buttons[0].disabled, true);
});

test('상품 컴포넌트 fragment가 include·가격 의미·접근성 계약을 문서화한다', async () => {
  const componentUrl = new URL('../assets/components/ecommerce/', import.meta.url);
  const [card, price, stepper] = await Promise.all(
    ['product-card.html', 'price.html', 'stepper.html'].map((file) =>
      readFile(new URL(file, componentUrl), 'utf8')
    )
  );

  assert.match(card, /@variant\s+grid\s+\|\s+list/);
  assert.match(card, /@include\s+common\/image\.html/);
  assert.match(card, /@include\s+ecommerce\/price\.html/);
  assert.doesNotMatch(card, /<img\b/i);
  assert.match(card, /class="product-card__image-link"[^>]*tabindex="-1"/);
  assert.match(card, /class="product-card__name-link"/);
  assert.match(card, /aria-pressed="(?:true|false)"/);
  assert.match(card, />신상품</);
  assert.match(card, />세일</);
  assert.match(card, />품절</);
  assert.match(card, /품절된 상품입니다/);
  assert.match(card, /data-review-placeholder/);
  for (const anchor of card.matchAll(/<a\b[\s\S]*?<\/a>/gi)) {
    assert.doesNotMatch(anchor[0], /<button\b/i);
  }

  assert.match(price, /<del\b/);
  assert.match(price, /<ins\b/);
  assert.match(price, /정가[\s\S]*할인가/);
  assert.match(price, /천 단위/);
  assert.match(price, /@variant\s+default\s+\|\s+discount\s+\|\s+range/);

  assert.match(stepper, /<button[^>]*data-stepper-action="decrease"/s);
  assert.match(stepper, /<label[^>]*>[\s\S]*<input[^>]*type="number"/s);
  assert.match(stepper, /<button[^>]*data-stepper-action="increase"/s);
  assert.match(stepper, /min="1"/);
  assert.match(stepper, /max="99"/);
});
