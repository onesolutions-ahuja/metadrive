import OneTenantImage from "../shared/OneTenantImage.jsx";
import {
  useOneInputs,
  css,
  fire,
  list,
  normalizeChoice,
} from "../shared/OneInputs.jsx";

const validField = (name) => !name || /^[A-Za-z][A-Za-z0-9_]*$/.test(name);
const validColour = (value) => typeof value === "string" && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value);

export default function OneRepeater(props) {
  const p = { ...props, kind: props.kind || "Repeater" };
  const {
    kind, root, local, setLocal, filter, setFilter, current,
    set, label, wrap, options,
  } = useOneInputs(p);
  const rows = Array.isArray(current) ? current : [];
  const recordRows = Array.isArray(p.records) ? p.records : [];
  const [selected, setSelected] = React.useState("");
  React.useEffect(() => {
    if (!p.pageSessionKey || !p.selectionFilterKey || typeof window === "undefined") return undefined;
    const receive = (event) => {
      if (event.detail?.pageSessionKey === p.pageSessionKey
        && event.detail?.filterKey === p.selectionFilterKey)
        setSelected(String(event.detail.value ?? ""));
    };
    window.addEventListener("metadrive:page-filter-selected", receive);
    return () => window.removeEventListener("metadrive:page-filter-selected", receive);
  }, [p.pageSessionKey, p.selectionFilterKey]);
  const select = (id, title, record) => {
    setSelected(id);
    if (p.pageSessionKey && p.selectionFilterKey && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("metadrive:page-filter-selected", {
        detail: {pageSessionKey: p.pageSessionKey, filterKey: p.selectionFilterKey,
          value: id, recordId: id, label: title, sourceObjectApiName: p.objectApiName || ""}
      }));
      if (/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(p.selectionFilterKey))
        window.dispatchEvent(new CustomEvent("metadrive:page-local-state", {
          detail: {pageSessionKey: p.pageSessionKey, key: p.selectionFilterKey, value: id}
        }));
    }
    if (record && p.actionFlows?.itemSelect) fire(p, "itemSelect", record);
  };
  if (p.recordTitleFieldApiName) {
    const titleField = String(p.recordTitleFieldApiName);
    const valueField = String(p.recordValueFieldApiName || "Id");
    const subtitleField = String(p.recordSubtitleFieldApiName || "");
    const imageField = String(p.recordImageFieldApiName || "");
    const sortField = String(p.recordSortFieldApiName || "");
    const activeField = String(p.recordActiveFieldApiName || "");
    if (![titleField, valueField, subtitleField, imageField, sortField, activeField].every(validField))
      return <div {...root} role="alert">Select valid record fields for this repeater.</div>;
    const visible = recordRows.filter((r) =>
      !activeField || r?.[activeField] === true || r?.[activeField] === "true");
    if (sortField) visible.sort((a,b) => {
      const left = a?.[sortField], right = b?.[sortField];
      const na = Number(left), nb = Number(right);
      if (left != null && right != null && Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(left ?? "").localeCompare(String(right ?? ""));
    });
    const itemHeight = Math.max(40, Math.min(280, Number(p.recordItemMinHeight) || 76));
    const selectedBg = validColour(p.selectedItemBackgroundColor) ? p.selectedItemBackgroundColor : (p.accentColor || "#E4002B");
    const selectedFg = validColour(p.selectedItemTextColor) ? p.selectedItemTextColor : "#FFFFFF";
    const layout = ["tile", "pill", "list"].includes(p.recordLayout) ? p.recordLayout : "list";
    const horizontal = p.recordOrientation === "horizontal";
    return (
      <div {...root} className={String(root.className || "") + " one-stack"}
        style={{...root.style, flexDirection: horizontal ? "row" : "column",
          alignItems: horizontal ? "center" : "stretch",
          ...(horizontal ? {flexWrap: p.recordWrap === false ? "nowrap" : "wrap"} : {}),
          gap: Number(p.gap) >= 0 ? Number(p.gap) : 10}}>
        {label && <strong>{label}</strong>}
        {p.showAllItem === true && <button className="one-item one-item--interactive"
          type="button" aria-pressed={!selected} onClick={() => select("", p.allItemLabel || "All", null)}
          style={{borderRadius: layout === "pill" ? 999 : 12,
            flex: horizontal ? "0 0 auto" : undefined,
            backgroundColor: !selected ? selectedBg : undefined,
            color: !selected ? selectedFg : undefined}}>
          {p.allItemLabel || "All"}
        </button>}
        {visible.map((record,index) => {
          const id = String(record?.[valueField] ?? "");
          const name = String(record?.[titleField] ?? "");
          const subtitle = subtitleField ? String(record?.[subtitleField] ?? "") : "";
          const image = imageField ? record?.[imageField] : "";
          if (!id || !name) return null;
          const isSelected = id === selected;
          return (
            <button className="one-item one-item--interactive" type="button"
              aria-pressed={isSelected} key={id || index}
              onClick={() => select(id, name, record)}
              style={{display: "flex", flexDirection: layout === "tile" ? "column" : "row",
                alignItems: "center", gap: 10, minHeight: itemHeight,
                flex: horizontal ? "0 0 auto" : undefined,
                borderRadius: layout === "pill" ? 999 : 12,
                backgroundColor: isSelected ? selectedBg : undefined,
                color: isSelected ? selectedFg : undefined}}>
              {imageField && p.showImage !== false && typeof image === "string" && image &&
                <OneTenantImage src={image} loadAsset={p.loadAsset} alt=""
                  style={{width: layout === "tile" ? "100%" : Math.min(88, itemHeight - 12),
                    height: layout === "tile" ? Math.min(125, itemHeight) : Math.min(88, itemHeight - 12),
                    objectFit: p.imageFit || "contain", borderRadius: 8}} />}
              <span style={{minWidth: 0, textAlign: layout === "tile" ? "center" : "left"}}>
                <strong style={{display: "block"}}>{name}</strong>
                {subtitle && <small style={{display: "block", opacity: 0.8}}>{subtitle}</small>}
              </span>
            </button>
          );
        })}
        {!visible.length && <span className="one-muted">{p.emptyText || "No records"}</span>}
      </div>
    );
  }
  return (
    <div {...root}>
      <div className="one-row" style={{justifyContent: "space-between"}}>
        <strong>{label}</strong>
        <button className="one-btn" type="button" onClick={() => set([...rows, ""])}>+ Add</button>
      </div>
      <div className="one-stack" style={{flexDirection: "column", marginTop: 8}}>
        {rows.map((item,i) => (
          <div className="one-row" key={i}>
            <input className="one-control" style={{flex: 1}}
              value={typeof item === "string" ? item : JSON.stringify(item)}
              onChange={(e) => set(rows.map((r,j) => j === i ? e.target.value : r))}/>
            <button className="one-btn" aria-label={"Remove row " + (i + 1)}
              onClick={() => set(rows.filter((_,j) => j !== i))}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
