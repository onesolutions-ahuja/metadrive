import {
  useOneInputs,
  css,
  fire,
  list,
  normalizeChoice,
} from "../shared/OneInputs.jsx";

export default function OneSlider(props) {
  const p = { ...props, kind: props.kind || "Slider" };
  const {
    kind,
    root,
    local,
    setLocal,
    filter,
    setFilter,
    current,
    set,
    label,
    wrap,
    options,
  } = useOneInputs(p);
  return wrap(
    <div className="one-row">
      <input
        style={{ flex: 1, accentColor: "var(--one-accent)" }}
        type="range"
        min={p.min ?? 0}
        max={p.max ?? 100}
        step={p.step ?? 1}
        value={Number(current) || 0}
        id={p.inputId}
        aria-describedby={p.helpId}
        disabled={p.disabled === true}
        onChange={(e) => set(Number(e.target.value))}
      />
      <output>{String(current ?? 0)}</output>
    </div>,
  );
}
