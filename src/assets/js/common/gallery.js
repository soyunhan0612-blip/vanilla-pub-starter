const boundRoots = new WeakSet();

function getRoot(root) {
  if (root?.addEventListener) return root;
  return typeof document === 'undefined' ? null : document;
}

function setAttributeFromData(element, attribute, button, dataAttribute) {
  const value = button.getAttribute(dataAttribute);
  if (element && value) element.setAttribute(attribute, value);
}

function selectThumbnail(gallery, button) {
  const main = gallery?.querySelector?.('[data-gallery-main]');
  if (!main?.querySelector?.('img')) return false;

  for (const picture of [main, gallery.querySelector('[data-gallery-viewer]')]) {
    if (!picture) continue;
    setAttributeFromData(picture.querySelector('img'), 'src', button, 'data-gallery-src');
    setAttributeFromData(picture.querySelector('img'), 'srcset', button, 'data-gallery-srcset');
    setAttributeFromData(picture.querySelector('img'), 'alt', button, 'data-gallery-alt');
    setAttributeFromData(
      picture.querySelector('source[type="image/webp"]'),
      'srcset',
      button,
      'data-gallery-webp-srcset'
    );
  }

  for (const thumbnail of gallery.querySelectorAll('[data-gallery-thumbnail]')) {
    thumbnail.setAttribute('aria-pressed', String(thumbnail === button));
  }
  return true;
}

function handleClick(event) {
  const button = event.target?.closest?.('[data-gallery-thumbnail]');
  const gallery = button?.closest?.('[data-gallery]');
  if (!button || !gallery || !selectThumbnail(gallery, button)) return;

  event.preventDefault();
}

export function initGalleries(root) {
  const scope = getRoot(root);
  if (!scope || boundRoots.has(scope)) return;

  scope.addEventListener('click', handleClick);
  for (const gallery of scope.querySelectorAll?.('[data-gallery]') || []) {
    const selected = [...gallery.querySelectorAll('[data-gallery-thumbnail]')].find(
      (thumbnail) => thumbnail.getAttribute('aria-pressed') === 'true'
    );
    if (selected) selectThumbnail(gallery, selected);
  }
  boundRoots.add(scope);
}
