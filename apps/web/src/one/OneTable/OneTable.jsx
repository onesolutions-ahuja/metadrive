import {
  css,
  records,
  view,
  title,
  fire,
  columns,
} from "../shared/OneData.jsx";

function Table({ p, rows }) {
  const [sort, setSort] = React.useState(""),
    [dir, setDir] = React.useState(1),
    [page, setPage] = React.useState(1),
    [local, setLocal] = React.useState("");
  const cols = columns(p, rows),
    size = Math.max(1, Math.min(200, Number(p.pageSize) || 25));
  // Row actions are metadata-defined; the row payload comes from shared Object data.
  const actions = Array.isArray(p.rowActions)
    ? p.rowActions.filter(a => a && typeof a === "object"
        && /^[A-Za-z][A-Za-z0-9_]*$/.test(a.event)
        && typeof a.label === "string" && a.label.length <= 32)
    : [];
  const positioned = key => actions.filter(a => a.field === key);
  const trailing = actions.filter(a => !a.field || !cols.some(c => c.key === a.field));
  const actionButton = (action, row) => (
    <button type="button" className="one-btn one-btn--ghost"
      key={action.event}
      aria-label={(action.title || action.label) + " " + title(row)}
      title={action.title || action.label}
      disabled={p.disabled === true || p.previewOnly === true || p.preview === true
        || !(row.Id ?? row.id)}
      onClick={event => {
        event.stopPropagation();
        fire(p, action.event, row);
      }}>{action.label}</button>
  );
  const serverPaging = p.serverPaging === true;
  const sorted = !serverPaging && sort
    ? [...rows].sort(
        (a, b) =>
          view(a[sort]).localeCompare(view(b[sort]), undefined, {
            numeric: true,
          }) * dir,
      )
    : rows;
  const total = serverPaging ? Math.max(rows.length, Number(p.totalRecords) || rows.length) : sorted.length;
  const max = Math.max(1, Math.ceil(total / size)),
    multi = p.multiselect === true,
    selectable = p.selectionMode === true;
  const currentPage = serverPaging ? Math.max(1, Math.min(max, Number(p.currentPage) || 1)) : Math.min(page, max);
  const displayed = serverPaging ? sorted : sorted.slice((currentPage - 1) * size, currentPage * size);
  const changePage = next => { if (serverPaging) p.onPageChange?.(next); else setPage(next); };
  const toggleAll = event => {
    const ids = displayed.map(row => String(row.Id ?? row.id ?? "")).filter(Boolean);
    const value = event.target.checked ? [...new Set([...selected, ...ids])] : selected.filter(id => !ids.includes(id));
    p.onChange?.(value); fire(p, "selectionChange", value);
  };
  const selected = selectable
    ? Array.isArray(p.value)
      ? p.value.map(String)
      : p.value
        ? [String(p.value)]
        : []
    : [String(local)];
  const choose = (row) => {
    const id = String(row.Id ?? row.id ?? "");
    if (!id) return;
    if (selectable) {
      const value = multi
        ? selected.includes(id)
          ? selected.filter((x) => x !== id)
          : [...selected, id]
        : selected.includes(id)
          ? ""
          : id;
      p.onChange?.(value);
      fire(p, "selectionChange", value);
    } else {
      setLocal(id);
      fire(p, "rowSelect", row);
    }
  };
  return (
    <div className="one-surface">
      <div className="one-table-wrapper">
        <table className="one-table">
          <thead>
            <tr>
              {selectable && <th scope="col">{multi ? <input type="checkbox" aria-label="Select all visible rows" checked={displayed.length > 0 && displayed.every(row => selected.includes(String(row.Id ?? row.id ?? "")))} onChange={toggleAll} /> : "Select"}</th>}
              {trailing.length > 0 && <th scope="col">Actions</th>}
              {cols.map((c) => (
                <th key={c.key} scope="col" aria-sort={sort === c.key ? (dir === 1 ? "ascending" : "descending") : "none"}>
                  <button
                    type="button"
                    className="one-btn one-btn--ghost"
                    onClick={() => {
                      const nextDir = sort === c.key ? -dir : 1;
                      setDir(nextDir);
                      setSort(c.key);
                      if (serverPaging) p.onSortChange?.({field: c.key, direction: nextDir === 1 ? "asc" : "desc"});
                      else setPage(1);
                    }}
                  >
                    {c.label} {sort === c.key ? (dir === 1 ? "↑" : "↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.map((row, i) => {
                const id = String(row.Id ?? row.id ?? "");
                return (
                  <tr
                    key={id || i}
                    data-selected={selected.includes(id)}
                    onClick={!selectable ? () => choose(row) : undefined}
                  >
                    {selectable && (
                      <td>
                        <input
                          type={multi ? "checkbox" : "radio"}
                          name={multi ? undefined : p.inputId}
                          aria-label={"Select " + title(row)}
                          aria-required={p.required === true}
                          required={p.required === true && !multi}
                          checked={selected.includes(id)}
                          disabled={!id}
                          onChange={() => choose(row)}
                        />
                      </td>
                    )}
                    {trailing.length > 0 && <td><div className="one-row">
                      {trailing.map(action => actionButton(action, row))}
                    </div></td>}
                    {cols.map((c) => (
                      <td key={c.key}>
                        {positioned(c.key).length
                          ? <div className="one-row">
                              {positioned(c.key).filter(a => a.label === "−" || a.label === "-")
                                .map(action => actionButton(action,row))}
                              <span>{view(row[c.key])}</span>
                              {positioned(c.key).filter(a => a.label !== "−" && a.label !== "-")
                                .map(action => actionButton(action,row))}
                            </div>
                          : view(row[c.key])}
                      </td>
                    ))}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <div className="one-empty" role="status"><strong>No records yet</strong><p>Records will appear here when available.</p></div>}
      {total > size && (
        <div
          className="one-row"
          style={{ justifyContent: "flex-end", paddingTop: 10 }}
        >
          <button
            type="button"
            className="one-btn"
            disabled={currentPage <= 1}
            onClick={() => changePage(currentPage - 1)}
          >
            Previous
          </button>
          <span>
            Page {currentPage} of {max}
          </span>
          <button
            type="button"
            className="one-btn"
            disabled={currentPage >= max}
            onClick={() => changePage(currentPage + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default function OneTable(p) {
  const root = css(p),
    rows = records(p);
  return (
    <div {...root}>
      <Table p={p} rows={rows} />
    </div>
  );
}
