import {
  useOneActions,
  css,
  arr,
  label,
  value,
  fire,
} from "../shared/OneActions.jsx";

export default function OneSearch(props) {
  const p = { ...props, kind: props.kind || "Search" };
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
      <label className="one-label">
        {p.label || "Search"}
        <input
          className="one-control"
          type="search"
          placeholder={p.placeholder || "Search"}
          value={p.value !== undefined ? String(p.value) : query}
          onChange={(e) => {
            const value = e.target.value;
            setQuery(value);
            if (
              p.searchKey &&
              p.pageSessionKey &&
              typeof window !== "undefined"
            )
              window.dispatchEvent(
                new CustomEvent("metadrive:page-filter-selected", {
                  detail: {
                    pageSessionKey: p.pageSessionKey,
                    filterKey: p.searchKey,
                    value,
                  },
                }),
              );
            if (p.actionFlows?.change) fire(p, "change", value);
            else if (typeof p.onChange === "function") p.onChange(value);
          }}
        />
      </label>
      {p.showSuggestions === true && query && (
        <div className="one-surface">
          {options
            .filter((x) => label(x).toLowerCase().includes(query.toLowerCase()))
            .slice(0, 10)
            .map((o, i) => (
              <button
                key={i}
                type="button"
                className="one-btn one-btn--ghost"
                onClick={() => fire(p, "select", value(o))}
              >
                {label(o)}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
