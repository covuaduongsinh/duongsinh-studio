import * as React from 'react';

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  // Read the width at the first render: starting from "not a phone" made a page built on this hook (the issue list)
  // draw its desktop layout, and ask the server for it, before switching on the first effect.
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(() =>
    typeof window === 'undefined'
      ? undefined
      : window.innerWidth < MOBILE_BREAKPOINT,
  );

  React.useEffect(() => {
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    // A window without `matchMedia` (a test environment, an embedded view) falls back to resize events.
    const mql =
      typeof window.matchMedia === 'function'
        ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
        : null;
    if (mql) mql.addEventListener('change', onChange);
    else window.addEventListener('resize', onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => {
      if (mql) mql.removeEventListener('change', onChange);
      else window.removeEventListener('resize', onChange);
    };
  }, []);

  return !!isMobile;
}
