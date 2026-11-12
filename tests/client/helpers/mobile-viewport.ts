// A phone-width window for client tests. `useIsMobile` reads `window.innerWidth` (breakpoint 768) on mount and some
// components read `matchMedia`; call `stubMobileViewport()` at the top of a test file so both stay consistent.
import { afterEach, beforeEach, vi } from 'vitest';

export const MOBILE_WIDTH = 390;

export function stubMobileViewport(width = MOBILE_WIDTH): void {
  beforeEach(() => {
    vi.stubGlobal('innerWidth', width);
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width') && width < 768,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
}
