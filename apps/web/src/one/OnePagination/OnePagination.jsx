import {
  useOneActions,
  css,
  arr,
  label,
  value,
  fire,
} from "../shared/OneActions.jsx";

export default function OnePagination(props) {
  const p = { ...props, kind: props.kind || "Pagination" };
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
  const size = Math.max(1, Number(p.pageSize) || 25),
    total = Math.max(0, Number(p.total ?? p.totalCount ?? 0)),
    max = Math.max(1, Math.ceil(total / size)),
    page = Math.min(max, Math.max(1, Number(p.page ?? localPage) || 1)),
    change = (next) => {
      setPage(next);
      fire(p, "pageChange", { page: next, pageSize: size });
    };
  return (
    <nav {...root} aria-label="Pagination">
      <div className="one-row">
        <button
          className="one-btn"
          disabled={page <= 1}
          onClick={() => change(1)}
          aria-label="First page"
        >
          «
        </button>
        <button
          className="one-btn"
          disabled={page <= 1}
          onClick={() => change(page - 1)}
          aria-label="Previous page"
        >
          ‹
        </button>
        <span>
          Page {page} of {max}
        </span>
        <button
          className="one-btn"
          disabled={page >= max}
          onClick={() => change(page + 1)}
          aria-label="Next page"
        >
          ›
        </button>
        <button
          className="one-btn"
          disabled={page >= max}
          onClick={() => change(max)}
          aria-label="Last page"
        >
          »
        </button>
      </div>
    </nav>
  );
}
