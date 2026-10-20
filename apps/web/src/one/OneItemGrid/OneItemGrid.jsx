import OneTenantImage from "../shared/OneTenantImage.jsx";
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
  const activeField = String(p.recordActiveFieldApiName || "").trim();
  const sortField = String(p.recordSortFieldApiName || "").trim();
  const featuredField = String(p.featuredFieldApiName || "").trim();
  const descriptionField = String(p.descriptionFieldApiName || "").trim();
  const badgeField = String(p.badgeFieldApiName || "").trim();
  const safeField = (field) => !field || /^[A-Za-z][A-Za-z0-9_]*$/.test(field);
  if (![activeField, sortField, featuredField, descriptionField, badgeField].every(safeField))
    return <div role="alert">Choose valid display and sorting fields.</div>;
  const visibleRows = rows.filter(
    (row) =>
      (!activeField || row?.[activeField] === true || row?.[activeField] === "true") &&
      matchesCategory(row) &&
      (!searchQuery ||
        searchFields.some((field) =>
          String(row?.[field] ?? "")
            .toLocaleLowerCase()
            .includes(searchQuery),
        )),
  );
  if (sortField) visibleRows.sort((a,b) => {
    const av=a?.[sortField], bv=b?.[sortField];
    const na=Number(av), nb=Number(bv);
    if (av!=null && bv!=null && Number.isFinite(na) && Number.isFinite(nb)) return na-nb;
    return String(av??"").localeCompare(String(bv??""));
  });
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
      {p.showHeading !== false && <h3 className="one-heading" style={{ marginBottom: 12 }}>
        {p.title || "Items"}
      </h3>}
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
              typeof image === "string" && (/^https:\/\//i.test(image) || /^asset:[0-9a-f-]{36}$/i.test(image));
          const name = view(r?.[titleField] ?? ""),
            price = r?.[priceField];
          const badge = badgeField ? String(r?.[badgeField] ?? "") : "";
          const description = descriptionField ? String(r?.[descriptionField] ?? "") : "";
          const isFeatured = featuredField && (r?.[featuredField] === true || r?.[featuredField] === "true");
          const span = isFeatured ? Math.max(1, Math.min(count, Number(p.featuredColumnSpan) || 2)) : 1;
          return (
            <button
              className="one-item one-item--interactive md-product-card"
              style={{gridColumn: span > 1 ? "span " + span : undefined}}
              key={r.Id ?? r.id ?? i}
              type="button"
              aria-label={(p.selectionBehavior === "select" ? "Select " : "Add ") + name}
              onClick={() => {
                const behavior=p.selectionBehavior || "add";
                if (behavior==="add" && p.cartTargetKey && p.pageSessionKey
                  && typeof window !== "undefined")
                  window.dispatchEvent(
                    new CustomEvent("metadrive:page-cart-add", {
                      detail: {
                        pageSessionKey: p.pageSessionKey,
                        cartTargetKey: p.cartTargetKey,
                        record: r,
                      },
                    }),
                  );
                if (behavior==="select" && p.pageSessionKey
                  && typeof window !== "undefined")
                  window.dispatchEvent(
                    new CustomEvent("metadrive:page-filter-selected", {
                      detail: {
                        pageSessionKey:p.pageSessionKey,
                        filterKey:p.selectionFilterKey||"selectedRecord",
                        value:String(r.Id??r.id??""),
                        recordId:String(r.Id??r.id??""),
                        label:name,
                        sourceObjectApiName:p.objectApiName||"",
                      },
                    }),
                  );
                if (behavior==="select" && p.pageSessionKey &&
                  /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(p.selectionFilterKey||"selectedRecord")
                  && typeof window!=="undefined")
                  window.dispatchEvent(new CustomEvent("metadrive:page-local-state",{
                    detail:{pageSessionKey:p.pageSessionKey,
                      key:p.selectionFilterKey||"selectedRecord",value:String(r.Id??r.id??"")}
                  }));
                if (p.actionFlows?.itemSelect) fire(p, "itemSelect", r);
              }}
            >
              {p.showImage !== false && validImage && (
                <OneTenantImage
                  loading="lazy"
                  src={image}
                  loadAsset={p.loadAsset}
                  alt={name}
                  className="md-product-image"
                />
              )}
              {badge && <span className="md-product-badge" style={{display:"inline-block",
                padding:"3px 8px",borderRadius:999,background:p.accentColor||"#E4002B",
                color:"#fff",fontSize:"0.75em",fontWeight:700}}>{badge.slice(0,60)}</span>}
              {p.showTitle !== false && (
                <strong className="md-product-name">{name}</strong>
              )}
              {p.showDescription === true && description &&
                <small className="one-muted md-product-description">{description.slice(0,220)}</small>}
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
