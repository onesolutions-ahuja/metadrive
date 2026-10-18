import {
  useOneActions,
  css,
  arr,
  label,
  value,
  fire,
} from "../shared/OneActions.jsx";

export default function OneButton(props) {
  const p = { ...props, kind: props.kind || "Button" };
  const {
    kind,
    root,
    query,
    setQuery,
    selected,
    setSelected,
    open,
    setOpen,
    localPage,
    setPage,
    options,
  } = useOneActions(p);
  return (
    <div {...root}>
      <button
        type="button"
        className={"one-btn one-btn--" + (p.variant || "primary")}
        disabled={p.disabled === true || p.loading === true}
        onClick={() => fire(p, "click", p.value ?? true)}
      >
        {p.loading ? "Working…" : p.label || "Continue"}
      </button>
    </div>
  );
}
