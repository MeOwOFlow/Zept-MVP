import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

// Ripple 与 pointer 事件 polyfill 兜底
if (!Element.prototype.animate) {
  Element.prototype.animate = function () {
    return {
      finished: Promise.resolve(),
      cancel() {},
      finish() {},
      onfinish: null,
      oncancel: null,
    } as unknown as Animation;
  };
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
