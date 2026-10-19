import {
  css,
  records,
  view,
  title,
  fire,
  columns,
} from "../shared/OneData.jsx";

function ItemGrid({ p, rows }) {
  const [sharedFilters, setSharedFilters] = React.useState({});
  React.useEffect(() => {
    if (!p.pageSessionKey || typeof window === "undefined") return undefined;
    const receive = (event) => {
      const data = event.detail;
      if (data?.pageSessionKey !== p.pageSessionKey) return;
      if (data.filterKey === (p.filterKey || "category"))
        setSharedFilters((previous) => ({
          ...previous,
          category: {
            value: String(data.value ?? ""),
            label: String(data.label ?? data.value ?? ""),
            recordId: String(data.recordId ?? ""),
          },
        }));
      if (data.filterKey === (p.searchKey || "catalogue"))
        setSharedFilters((previous) => ({
          ...previous,
          search: String(data.value ?? ""),
        }));
    };
    window.addEventListener("metadrive:page-filter-selected", receive);
    return () =>
      window.removeEventListener("metadrive:page-filter-selected", receive);
  }, [p.pageSessionKey, p.filterKey, p.searchKey]);
  const count = Math.max(1, Math.min(12, Number(p.desktopColumns) || 3));
  const tabletCount = Math.max(1, Math.min(12, Number(p.tabletColumns) || 2));
  const phoneCount = Math.max(1, Math.min(12, Number(p.mobileColumns) || 1));
  const categoryField = String(p.categoryFieldApiName || "").trim();
  const selectedCategory = String(
    sharedFilters.category?.value ?? p.selectedCategory ?? "",
  ).trim();
  const categoryValues = [
    selectedCategory,
    sharedFilters.category?.label ?? p.selectedCategoryLabel,
    sharedFilters.category?.recordId ?? p.selectedCategoryRecordId,
  ]
    .filter((v) => v !== undefined && v !== null && String(v).trim())
    .map((v) => String(v).trim().toLowerCase());
  const categorySelected = categoryValues.length > 0;
  const categoryFieldExists =
    Boolean(categoryField) &&
    rows.some((row) =>
      Object.prototype.hasOwnProperty.call(row, categoryField),
    );
  const matchesCategory = (row) => {
    if (!categorySelected) return true;
    if (!categoryFieldExists) return false;
    const raw = row?.[categoryField],
      values =
        raw && typeof raw === "object"
          ? [raw.Id, raw.id, raw.Name, raw.name, raw.value, raw.label]
          : [raw];
    return values.some(
      (value) =>
        value !== undefined &&
        value !== null &&
        categoryValues.includes(String(value).trim().toLowerCase()),
    );
  };
  const searchQuery = String(sharedFilters.search ?? p.searchQuery ?? "")
    .trim()
    .toLocaleLowerCase();
  const searchFields = String(p.searchFieldApiNames || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const titleField = String(p.titleFieldApiName || ""),
    imageField = String(p.imageFieldApiName || ""),
    priceField = String(p.priceFieldApiName || "");
  const visibleRows = rows.filter(
    (row) =>
      matchesCategory(row) &&
      (!searchQuery ||
        searchFields.some((field) =>
          String(row?.[field] ?? "")
            .toLocaleLowerCase()
            .includes(searchQuery),
        )),
  );
  let formatter;
  try {
    if (p.showPrice !== false) {
      if (!p.currencyCode) throw Error();
      formatter = new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: p.currencyCode,
      });
    }
  } catch {
    return <div role="alert">Configure a valid display currency.</div>;
  }
  if (p.showTitle !== false && !titleField)
    return <div role="alert">Select an item title field.</div>;
  if (p.showPrice !== false && !priceField)
    return <div role="alert">Select an item price field.</div>;
  const currency = (value) =>
    Number.isFinite(Number(value))
      ? formatter?.format(Number(value))
      : view(value);
  return (
    <section>
      <h3 className="one-heading" style={{ marginBottom: 12 }}>
        {p.title || "Items"}
      </h3>
      <div
        className="one-grid md-product-grid"
        style={{
          "--one-grid-desktop": count,
          "--one-grid-tablet": tabletCount,
          "--one-grid-mobile": phoneCount,
        }}
      >
        {visibleRows.map((r, i) => {
          const image = r?.[imageField],
            validImage =
              typeof image === "string" && /^https:\/\//i.test(image);
          const name = view(r?.[titleField] ?? ""),
            price = r?.[priceField];
          // Existing till pages preserve their default add-to-basket behaviour.
          // Other app pages can select a record and launch metadata actions first.
          const selectionMode = p.itemSelectMode === "action"
            ? "action" : p.itemSelectMode === "filter" ? "filter" : "cart";
          return (
            <button
              className="one-item one-item--interactive md-product-card"
              key={r.Id ?? r.id ?? i}
              type="button"
              aria-label={(selectionMode === "cart" ? "Add " : "Select ") + name}
              onClick={() => {
                if (selectionMode === "cart" &&
                  p.cartTargetKey &&
                  p.pageSessionKey &&
                  typeof window !== "undefined"
                )
                  window.dispatchEvent(
                    new CustomEvent("metadrive:page-cart-add", {
                      detail: {
                        pageSessionKey: p.pageSessionKey,
                        cartTargetKey: p.cartTargetKey,
                        record: r,
                      },
                    }),
                  );
                if (selectionMode === "filter" && p.pageSessionKey &&
                    typeof window !== "undefined") {
                  const key = String(p.itemSelectionFilterKey || "selectedItem");
                  if (/^[A-Za-z][A-Za-z0-9_]*$/.test(key))
                    window.dispatchEvent(new CustomEvent("metadrive:page-filter-selected", {
                      detail: {
                        pageSessionKey: p.pageSessionKey, filterKey: key,
                        value: String(r.Id ?? r.id ?? ""),
                        recordId: String(r.Id ?? r.id ?? ""),
                        label: name, sourceObjectApiName: p.objectApiName || ""
                      }
                    }));
                }
                if (p.actionFlows?.itemSelect) fire(p, "itemSelect", r);
              }}
            >
              {p.showImage !== false && validImage && (
                <img
                  loading="lazy"
                  src={image}
                  alt={name}
                  className="md-product-image"
                />
              )}
              {p.showTitle !== false && (
                <strong className="md-product-name">{name}</strong>
              )}
              {p.showPrice !== false && price != null && (
                <span className="md-product-price">{currency(price)}</span>
              )}
              {p.showAddIcon === true && (
                <span className="md-card-add-icon" aria-hidden="true">
                  ＋
                </span>
              )}
            </button>
          );
        })}
      </div>
      {categorySelected && !categoryFieldExists && (
        <div className="one-empty" role="status">
          Select a category field on this grid to filter the records.
        </div>
      )}
      {!visibleRows.length && categoryFieldExists && (
        <div className="one-empty">{p.emptyText || "No matching items"}</div>
      )}
      {!visibleRows.length && !categorySelected && (
        <div className="one-empty">{p.emptyText || "No matching items"}</div>
      )}
    </section>
  );
}

export default function OneItemGrid(p) {
  const root = css(p),
    rows = records(p);
  return (
    <div {...root}>
      <ItemGrid p={p} rows={rows} />
    </div>
  );
}
