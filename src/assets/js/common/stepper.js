const boundRoots = new WeakSet();

function getRoot(root) {
  if (root?.addEventListener) return root;
  return typeof document === 'undefined' ? null : document;
}

function toFiniteNumber(value) {
  if (value === null || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getConfig(input) {
  const min = toFiniteNumber(input.getAttribute('min'));
  const declaredMax = toFiniteNumber(input.getAttribute('max'));
  const max = min !== null && declaredMax !== null && declaredMax < min ? min : declaredMax;
  const declaredStep = toFiniteNumber(input.getAttribute('step'));
  const step = declaredStep !== null && declaredStep > 0 ? declaredStep : 1;
  return { min, max, step };
}

function clamp(value, min, max) {
  let next = value;
  if (min !== null) next = Math.max(min, next);
  if (max !== null) next = Math.min(max, next);
  return next;
}

function getFallback(input, config) {
  const initial = toFiniteNumber(input.defaultValue);
  if (initial !== null) return clamp(initial, config.min, config.max);
  if (config.min !== null) return config.min;
  return clamp(0, config.min, config.max);
}

function getSafeValue(input, rawValue = input.value) {
  const config = getConfig(input);
  const parsed = toFiniteNumber(rawValue);
  const value = parsed === null ? getFallback(input, config) : clamp(parsed, config.min, config.max);
  return { ...config, value };
}

function updateButtons(stepper, input, state = getSafeValue(input)) {
  for (const button of stepper.querySelectorAll('[data-stepper-action]')) {
    const action = button.getAttribute('data-stepper-action');
    const atMin = state.min !== null && state.value <= state.min;
    const atMax = state.max !== null && state.value >= state.max;
    button.disabled = input.disabled || (action === 'decrease' ? atMin : atMax);
  }
}

function commitValue(stepper, input, value, emitChange = false) {
  const state = getSafeValue(input, value);
  input.value = String(state.value);
  updateButtons(stepper, input, state);

  if (emitChange) {
    const EventConstructor = input.ownerDocument?.defaultView?.Event || globalThis.Event;
    input.dispatchEvent(new EventConstructor('change', { bubbles: true }));
  }
}

function getStepperInput(target) {
  const stepper = target?.closest?.('[data-stepper]');
  const input = stepper?.querySelector('[data-stepper-input]');
  return stepper && input ? { stepper, input } : null;
}

function handleClick(event) {
  const button = event.target?.closest?.('[data-stepper-action]');
  if (!button || button.disabled) return;

  const context = getStepperInput(button);
  if (!context || context.input.disabled) return;

  event.preventDefault();
  const state = getSafeValue(context.input);
  const direction = button.getAttribute('data-stepper-action') === 'decrease' ? -1 : 1;
  const next = Number((state.value + direction * state.step).toPrecision(12));
  commitValue(context.stepper, context.input, next, true);
}

function handleInput(event) {
  if (!event.target?.matches?.('[data-stepper-input]')) return;
  const context = getStepperInput(event.target);
  if (context) updateButtons(context.stepper, context.input);
}

function handleChange(event) {
  if (!event.target?.matches?.('[data-stepper-input]')) return;
  const context = getStepperInput(event.target);
  if (!context) return;
  commitValue(context.stepper, context.input, context.input.value);
}

export function initSteppers(root) {
  const scope = getRoot(root);
  if (!scope || boundRoots.has(scope)) return;

  scope.addEventListener('click', handleClick);
  scope.addEventListener('input', handleInput);
  scope.addEventListener('change', handleChange);
  for (const stepper of scope.querySelectorAll?.('[data-stepper]') || []) {
    const input = stepper.querySelector('[data-stepper-input]');
    if (input) updateButtons(stepper, input);
  }
  boundRoots.add(scope);
}
