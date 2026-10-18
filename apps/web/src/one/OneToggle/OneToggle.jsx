import {
  useOneInputs,
  css,
  fire,
  list,
  normalizeChoice,
} from "../shared/OneInputs.jsx";

export default function OneToggle(props) {
  const p = { ...props, kind: props.kind || "Toggle" };
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
  return (
    <div {...root}>
      <label className="one-row">
        <input
          role="switch"
          type="checkbox"
          checked={Boolean(current)}
          disabled={p.disabled === true}
          onChange={(e) => set(e.target.checked)}
        />
        {label}
      </label>
    </div>
  );
}
