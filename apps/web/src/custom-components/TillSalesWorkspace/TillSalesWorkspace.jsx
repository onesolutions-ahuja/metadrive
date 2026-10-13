/* Registered presentation component. Objects, records and action Flows are provided by metadata runtime. */
export default function TillSalesWorkspace(props) {
  const raw = props || {};
  const clampBasket = value => Math.min(65, Math.max(30, Number(value ?? 45) || 45));
  const p = {
    ...raw,
    catalogFirst: raw.basketSide === 'right' || (raw.basketSide !== 'left' && raw.catalogFirst === true),
    basketWidthPercent: clampBasket(raw.basketWidthPercent),
    onLayoutChange: typeof raw.onLayoutChange === 'function'
      ? value => raw.onLayoutChange({ ...value, basketWidthPercent: clampBasket(value.basketWidthPercent) })
      : undefined
  };
  const products = Array.isArray(p.products) ? p.products : [];
  const customers = Array.isArray(p.customers) ? p.customers : [];
  const lines = Array.isArray(p.cartLines) ? p.cartLines : [];
  const categories = Array.isArray(p.categories) ? p.categories : [];
  const [barcode,setBarcode] = React.useState('');
  const [query,setQuery] = React.useState('');
  const [category,setCategory] = React.useState('');
  const [customerQuery,setCustomerQuery] = React.useState('');
  const [customerOpen,setCustomerOpen] = React.useState(false);
  const [customerId,setCustomerId] = React.useState('');
  const [busy,setBusy] = React.useState(false);
  const [error,setError] = React.useState('');
  const [completed,setCompleted] = React.useState(false);
  const scanner = React.useRef(null);
  const currency = typeof p.currency === 'string' ? p.currency : '£';
  // Client-specific layout settings are persisted on the page, never the shared component.
  const basketWidth = Math.max(25, Math.min(70, Number(p.basketWidthPercent ?? 45) || 45));
  const catalogFirst = p.catalogFirst === true;
  const splitStyle = {
    '--md-till-basket-width': basketWidth + '%',
    '--md-till-split-position': (catalogFirst ? 100 - basketWidth : basketWidth) + '%'
  };
  // Direct split resizing is available only inside the Page Builder design
  // host. Live Till pages do not receive a layout-editing callback.
  const splitGesture = React.useRef(null);
  const beginSplit = (event) => {
    if (typeof p.onLayoutChange !== 'function') return;
    const region = event.currentTarget.parentElement;
    const bounds = region.getBoundingClientRect();
    if (!bounds.width || bounds.width < 250) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    splitGesture.current = { pointerId: event.pointerId, bounds, region, percent: basketWidth };
  };
  const dragSplit = (event) => {
    const gesture = splitGesture.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const fromLeft = (event.clientX - gesture.bounds.left) / gesture.bounds.width * 100;
    const next = Math.max(25, Math.min(70, Math.round(catalogFirst ? 100 - fromLeft : fromLeft)));
    gesture.percent = next;
    gesture.region.style.setProperty('--md-till-basket-width', next + '%');
    gesture.region.style.setProperty('--md-till-split-position', (catalogFirst ? 100 - next : next) + '%');
  };
  const finishSplit = (event, cancelled = false) => {
    const gesture = splitGesture.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    splitGesture.current = null;
    if (cancelled) {
      gesture.region.style.setProperty('--md-till-basket-width', basketWidth + '%');
      gesture.region.style.setProperty('--md-till-split-position', (catalogFirst ? 100 - basketWidth : basketWidth) + '%');
    } else if (gesture.percent !== basketWidth) {
      p.onLayoutChange({ basketWidthPercent: gesture.percent });
    }
  };
  const money = (x) => currency + Number(x || 0).toFixed(2);
  const configured = (event) => Boolean(p.actionFlows && p.actionFlows[event] && p.actionFlows[event].flowApiName);
  const enabled = (event) => !busy && !p.disabled && !p.preview && configured(event);
  const emit = async (event,value) => {
    if (!enabled(event) || typeof p.onAction !== 'function') {
      setError('Configure an active ' + event + ' Flow in Page Builder.'); return null;
    }
    setBusy(true); setError(''); setCompleted(false);
    try { return await p.onAction({event,value}); }
    catch (e) {setError(e instanceof Error ? e.message : 'Flow action failed'); return null;}
    finally {setBusy(false);}
  };
  const add = (product) => emit('add',{productId:product.id,quantity:1});
  const scan = async (event) => {
    event.preventDefault();
    const found = products.filter((product) => String(product.barcode || '') === barcode.trim());
    if (found.length !== 1) {setError(found.length ? 'Ambiguous barcode.' : 'Barcode not found.'); return;}
    if (await add(found[0])) setBarcode('');
    scanner.current?.focus();
  };
  const visible = products.filter((x) => (!category || x.categoryId === category)
    && [x.name,x.description,x.barcode].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const selected = customers.find((x) => x.id === (p.selectedCustomerId || customerId));
  const matchedCustomers = customers.filter((x) =>
    [x.name,x.phone,x.email].join(' ').toLowerCase().includes(customerQuery.trim().toLowerCase())).slice(0,25);
  const count = lines.reduce((a,x) => a + Number(x.quantity || 0),0);
  // Estimate for display only. The selected checkout Flow determines authoritative amount.
  const estimated = lines.reduce((a,x) => a + Number(x.quantity || 0)*Number(x.unitPrice || 0),0);
  const checkout = async (method) => {
    const result = await emit('checkout',{paymentMethod:method,customerId:selected?.id || null});
    if (result?.completed === true) {setCompleted(true);setCustomerId('');setBarcode('');setQuery('');scanner.current?.focus();}
  };
  return <section className="md-till" style={{'--md-till-accent':p.accentColor || '#126be5', '--md-till-product-columns':Math.min(5, Math.max(1, Math.round(Number(p.catalogColumns) || 3)))}} aria-label={p.label || 'Cashier till'}>
    <header className="md-till-top"><div className="md-till-brand"><span aria-hidden="true">▦</span><div><strong>{p.title || 'Sales Till'}</strong><small>{[p.storeLabel,p.terminalLabel,p.cashierLabel].filter(Boolean).join(' · ')}</small></div></div><small>{p.statusLabel || 'Ready'}</small></header>
    {(error || p.actionError) && <div role="alert" className="md-till-error">{error || p.actionError}</div>}
    {completed && <div role="status" className="md-till-success">Sale completed by the selected Flow.</div>}
    {p.loading && <div role="status" className="md-till-info">Loading object records…</div>}
    <div className={`md-till-body${catalogFirst ? " md-till-catalog-first" : ""}`} style={splitStyle}>
      {typeof p.onLayoutChange === 'function' && <button type="button"
        className="md-till-split-handle" role="separator"
        aria-label="Resize Till basket and product sections"
        aria-orientation="vertical" aria-valuemin={25} aria-valuemax={70} aria-valuenow={basketWidth}
        onPointerDown={beginSplit} onPointerMove={dragSplit}
        onPointerUp={event => finishSplit(event)} onPointerCancel={event => finishSplit(event, true)}
        onKeyDown={event => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault(); event.stopPropagation();
          const delta = event.key === 'ArrowRight' ? 1 : -1;
          const next = Math.max(25, Math.min(70, basketWidth + (catalogFirst ? -delta : delta)));
          if (next !== basketWidth) p.onLayoutChange({ basketWidthPercent: next });
        }} />}
      <section className="md-till-cart" aria-label="Sale basket">
        <div className="md-till-row"><div><small className="md-till-kicker">CURRENT SALE</small><h2>Basket <em>{count}</em></h2></div><button className="md-till-link" disabled={!enabled('reset') || !lines.length} onClick={() => emit('reset',{})}>Clear</button></div>
        <button className="md-till-customer" onClick={() => setCustomerOpen(!customerOpen)} aria-expanded={customerOpen}>♙ <span><strong>{selected?.name || p.walkInLabel || 'Walk-in customer'}</strong><small>{selected ? [selected.phone,selected.email].filter(Boolean).join(' · ') : 'Search and assign customer'}</small></span>⌄</button>
        {customerOpen && <div className="md-till-customers">
          <input aria-label="Search customers" value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder="Search name, phone or email…" />
          {!p.customerObjectApiName && <p>Choose a customer object in Page Builder.</p>}
          {matchedCustomers.map((x) => <button key={x.id} disabled={!enabled('customer')} onClick={async () => {if (await emit('customer',{customerId:x.id})) {setCustomerId(x.id);setCustomerOpen(false);}}}><strong>{x.name}</strong><small>{[x.phone,x.email].filter(Boolean).join(' · ')}</small></button>)}
        </div>}
        <div className="md-till-headings"><span>Item</span><span>Qty</span><span>Amount</span></div>
        <div className="md-till-lines">
          {!lines.length && <div className="md-till-empty"><strong>Ready to scan</strong><p>Scan a barcode or tap a product.</p></div>}
          {lines.map((line) => <div className="md-till-line" key={line.id}>
            <div><strong>{line.name}</strong><small>{money(line.unitPrice)} each</small></div>
            <div className="md-till-qty"><button disabled={!(enabled('quantity') || enabled('remove'))} aria-label={'Decrease '+line.name} onClick={() => Number(line.quantity) <= 1 ? emit('remove',{lineId:line.id}) : emit('quantity',{lineId:line.id,quantity:Number(line.quantity)-1})}>−</button><span>{line.quantity}</span><button disabled={!enabled('quantity')} aria-label={'Increase '+line.name} onClick={() => emit('quantity',{lineId:line.id,quantity:Number(line.quantity)+1})}>+</button></div>
            <strong>{money(Number(line.quantity)*Number(line.unitPrice))}</strong>
          </div>)}
        </div>
        <footer className="md-till-bottom"><div className="md-till-total"><span>Estimated subtotal</span><strong>{money(estimated)}</strong></div><small>Final price, tax and payment are validated by Checkout Flow.</small>
          <div className="md-till-utilities">{['hold','resume','discount'].map((name) => <button key={name} disabled={!enabled(name)} onClick={() => emit(name,{})}>{name.charAt(0).toUpperCase()+name.slice(1)}</button>)}</div>
          <div className="md-till-pay"><button disabled={!enabled('checkout') || !lines.length} onClick={() => checkout('cash')}>Cash</button><button className="md-till-pay-primary" disabled={!enabled('checkout') || !lines.length} onClick={() => checkout('card')}>Card / Pay <strong>{money(estimated)}</strong></button></div>
          {!configured('checkout') && <small className="md-till-warning">Checkout disabled until a verified payment Flow is assigned.</small>}
        </footer>
      </section>
      <section className="md-till-catalog" aria-label="Products">
        <form className="md-till-scan" onSubmit={scan}><span aria-hidden="true">▥</span><input ref={scanner} inputMode="none" aria-label="Barcode scanner" autoComplete="off" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder={p.barcodePlaceholder || 'Scan barcode / Enter'} /><button disabled={!enabled('add') || !barcode.trim()} type="submit">Add</button></form>
        <input className="md-till-search" aria-label="Search products" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search product, SKU or barcode…" />
        <nav className="md-till-categories" aria-label="Product categories"><button className={!category ? 'active':''} onClick={() => setCategory('')}>All</button>{categories.map((x) => <button key={x.id} className={category===x.id?'active':''} onClick={() => setCategory(x.id)}>{x.name}</button>)}</nav>
        <div className="md-till-products">{visible.map((x) => <button className="md-till-product" key={x.id} disabled={!enabled('add')} onClick={() => add(x)}>
          <span className="md-till-photo">{x.image ? <img src={x.image} loading="lazy" alt="" /> : <span aria-hidden="true">▣</span>}</span>
          <span className="md-till-product-text"><strong>{x.name}</strong><small>{x.barcode || x.description || ''}</small><b>{money(x.price)}</b></span></button>)}
          {!visible.length && <p className="md-till-empty-products">{p.loading ? 'Loading…' : 'No products match the object filters.'}</p>}
        </div>
      </section>
    </div>
  </section>;
}
