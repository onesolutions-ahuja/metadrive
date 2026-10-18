import type * as React from 'react';
import {useEffect} from 'react';

export function useDismissOnOutside<T extends HTMLElement>(
  container: React.RefObject<T>, expanded: boolean, dismiss: () => void
) {
  useEffect(() => {
    if (!expanded) return;
    const onOutside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) dismiss();
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('keydown', onEscape);
    };
  }, [container, expanded, dismiss]);
}
