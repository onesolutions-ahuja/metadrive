import type * as React from 'react';
import { useDismissOnOutside as sharedDismissOnOutside } from '../../../one/shared/accessibilityHooks.jsx';

export function useDismissOnOutside<T extends HTMLElement>(
  container: React.RefObject<T>, expanded: boolean, dismiss: () => void
) {
  sharedDismissOnOutside(container, expanded, dismiss);
}
