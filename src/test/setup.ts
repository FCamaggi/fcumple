import '@testing-library/jest-dom/vitest';

// jsdom no implementa matchMedia. El default acá es "no matchea" (o sea,
// viewport de escritorio) para que las suites que no le importa el
// breakpoint (la mayoría) no tengan que mockearlo una por una; los tests de
// useIsMobile/AdminPage que sí lo necesitan lo reemplazan con
// vi.stubGlobal('matchMedia', ...).
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    // Framer Motion's useReducedMotion still calls the legacy pair too.
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
