/** Where an issue's page is scrolled, and the comments it draws: DOM lookups the page's pieces share. */
import { useEffect, useRef, useState, type RefObject } from 'react';

/** The comment kinds a person did not write: the Lead Agent's and other agents' (the system's lines are not comments). */
const PERSON = new Set(['user', 'system']);

/** The newest comment an agent wrote, as drawn on the Activity tab. */
export function lastAgentComment(): HTMLElement | null {
  const found = [
    ...document.querySelectorAll<HTMLElement>('[data-comment-id]'),
  ].filter((element) => {
    const kind = element.dataset.authorKind;
    return kind !== undefined && !PERSON.has(kind);
  });
  return found.at(-1) ?? null;
}

/** How far the page scrolls before the header shows: about the height of the title block. */
const SHOW_AFTER = 160;

export function useScrolledPast(rootRef: RefObject<HTMLElement | null>): {
  readonly scrolled: boolean;
  readonly toTop: () => void;
} {
  const [scrolled, setScrolled] = useState(false);
  const scrollerRef = useRef<Element | null>(null);
  useEffect(() => {
    const onScroll = (event: Event): void => {
      const element = rootRef.current;
      const target = event.target;
      if (!element) return;
      const holder =
        target instanceof Element
          ? target
          : target === document
            ? document.scrollingElement
            : null;
      if (!holder || !holder.contains(element)) return;
      scrollerRef.current = holder;
      setScrolled(holder.scrollTop > SHOW_AFTER);
    };
    // `scroll` does not bubble: listen on the capture phase to hear the page's own scroll container.
    document.addEventListener('scroll', onScroll, true);
    return () => document.removeEventListener('scroll', onScroll, true);
  }, [rootRef]);
  const toTop = (): void => {
    const holder = scrollerRef.current;
    if (holder) holder.scrollTo({ top: 0, behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return { scrolled, toTop };
}
