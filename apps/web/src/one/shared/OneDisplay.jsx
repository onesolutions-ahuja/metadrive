import {componentAppearance} from './componentAppearance.js';
export function css(p) { return componentAppearance(p, 'display'); }
export const text = (v) =>
  v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
export function useOneDisplay(p) {
  const kind = p.kind || "Text",
    root = css(p);
  const textContent = p.text ?? p.value ?? p.label ?? "";
  return { kind, root, textContent };
}
