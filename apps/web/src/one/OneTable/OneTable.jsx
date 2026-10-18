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
  const sorted = sort
    ? [...rows].sort(
        (a, b) =>
          view(a[sort]).localeCompare(view(b[sort]), undefined, {
            numeric: true,
          }) * dir,
      )
    : rows;
  const max = Math.max(1, Math.ceil(sorted.length / size)),
    multi = p.multiselect === true,
    selectable = p.selectionMode === true;
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
              {selectable && <th scope="col">Select</th>}
              {cols.map((c) => (
                <th key={c.key} scope="col">
                  <button
                    type="button"
                    className="one-btn one-btn--ghost"
                    style={{ padding: 2, minHeight: 0 }}
                    onClick={() => {
                      setDir(sort === c.key ? -dir : 1);
                      setSort(c.key);
                    }}
                  >
                    {c.label} {sort === c.key ? (dir === 1 ? "↑" : "↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted
              .slice(
                (Math.min(page, max) - 1) * size,
                Math.min(page, max) * size,
              )
              .map((row, i) => {
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
                    {cols.map((c) => (
                      <td key={c.key}>{view(row[c.key])}</td>
                    ))}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <div className="one-empty">No records</div>}
      {rows.length > size && (
        <div
          className="one-row"
          style={{ justifyContent: "flex-end", paddingTop: 10 }}
        >
          <button
            type="button"
            className="one-btn"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>
            {Math.min(page, max)} / {max}
          </span>
          <button
            type="button"
            className="one-btn"
            disabled={page >= max}
            onClick={() => setPage(page + 1)}
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
