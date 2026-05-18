/**
 * Vitest setup: install jest-dom matchers and stub browser APIs the
 * components touch but jsdom doesn't implement (matchMedia, IntersectionObserver).
 */
import "@testing-library/jest-dom/vitest";

if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
}

if (!window.IntersectionObserver) {
  // @ts-expect-error jsdom doesn't ship IntersectionObserver
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  };
}
