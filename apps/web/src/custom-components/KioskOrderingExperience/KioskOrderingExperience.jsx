/* A presentation-only ordering surface: records and Flow actions are supplied by Page Builder metadata.
   There is intentionally no local business cart, checkout, price source or device SDK here. */
export default function KioskOrderingExperience(props) {
  const p = props || {};
  const products = Array.isArray(p.products) ? p.products : [];
  const cart = Array.isArray(p.cartLines) ? p.cartLines : [];
  const categories = Array.isArray(p.categories) ? p.categories : [];
  const [category, setCategory] = React.useState('all');
  const [query, setQuery] = React.useState('');
  const [orderType, setOrderType] = React.useState('eat-in');
  const [language, setLanguage] = React.useState(p.language || 'English');
  const [detail, setDetail] = React.useState(null);
  const [quantity, setQuantity] = React.useState(1);
  const [screen, setScreen] = React.useState('menu');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const menuRef = React.useRef(null);
  const currency = typeof p.currency === 'string' ? p.currency : '£';
  const money = (amount) => currency + Number(amount || 0).toFixed(2);
  const labels = language === 'Français'
    ? { eatIn: 'Sur place', takeaway: 'À emporter', browse: 'Le menu', viewBasket: 'Voir le panier', yourOrder: 'Votre commande', add: 'Ajouter', back: 'Retour', payment: 'Paiement' }
    : { eatIn: 'Eat in', takeaway: 'Takeaway', browse: 'Explore the menu', viewBasket: 'View basket', yourOrder: 'Your order', add: 'Add to order', back: 'Back to menu', payment: 'Payment' };
  const emit = async (event, value) => {
    if (typeof p.onAction !== 'function') throw new Error('This kiosk has no Flow action handler. Configure it in Page Builder.');
    setBusy(true);
    setError('');
    try { return await p.onAction({ event, value }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The action could not be completed'); return null; }
    finally { setBusy(false); }
  };
  const visible = products.filter((item) => (category === 'all' || item.categoryId === category)
    && (String(item.name || '') + ' ' + String(item.description || '')).toLowerCase().includes(query.trim().toLowerCase()));
  const itemCount = cart.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  // Presentation totals only. Payment amounts are recalculated by the selected checkout Flow.
  const total = cart.reduce((sum, line) => sum + Number(line.unitPrice || 0) * Number(line.quantity || 0), 0);
  const cardImage = (item, cls) => <div className={'une-food-image ' + (cls || '')}>
    <span aria-hidden="true">{item.emoji || '🍽️'}</span>
    {item.image && <img src={item.image} alt="" loading="lazy"
      onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
  </div>;
  const addProduct = async () => {
    if (!detail) return;
    const response = await emit('add', { productId: detail.id, quantity });
    if (response) setDetail(null);
  };
  const updateLine = async (line, next) => {
    await emit(next <= 0 ? 'remove' : 'quantity', { lineId: line.id, quantity: next });
  };
  const checkout = async () => {
    const response = await emit('checkout', { orderType });
    if (response && response.completed === true) setScreen('done');
  };
  const actions = p.actionFlows && typeof p.actionFlows === 'object' ? p.actionFlows : {};
  const paymentReady = Boolean(actions.checkout?.flowApiName && Array.isArray(p.flows)
    && p.flows.some(flow => flow.apiName === actions.checkout.flowApiName && flow.status === 'Active'));
  return <div className="une-kiosk-demo" style={{ '--une-kiosk-accent': p.accentColor || '#ffca26', '--une-kiosk-ink': p.inkColor || '#202124', fontFamily: p.fontFamily || 'inherit' }}>
    <header className="une-kiosk-head">
      <div className="une-kiosk-brand"><span className="une-kiosk-brand-symbol" aria-hidden="true">✦</span><span><strong>{p.brandName || 'Your Restaurant'}</strong><small>{p.tagline || 'Freshly made, just for you'}</small></span></div>
      <div className="une-kiosk-mode" role="group" aria-label="Order type">
        <button className={orderType === 'eat-in' ? 'is-active' : ''} onClick={() => setOrderType('eat-in')}>🍽 {labels.eatIn}</button>
        <button className={orderType === 'takeaway' ? 'is-active' : ''} onClick={() => setOrderType('takeaway')}>🛍 {labels.takeaway}</button>
      </div>
      <select aria-label="Language" className="une-kiosk-language" value={language} onChange={(event) => setLanguage(event.target.value)}>
        <option value="English">🌐 English</option><option value="Français">🌐 Français</option>
      </select>
    </header>
    {error && <div className="records-message" role="alert">{error}</div>}
    {p.actionError && <div className="records-message" role="alert">{p.actionError}</div>}
    {p.loading && <div className="records-loading" role="status">Loading menu and basket…</div>}
    {screen === 'menu' ? <>
      <main className="une-kiosk-main">
        <section className="une-kiosk-hero">
          <div className="une-hero-copy"><span className="une-kiosk-eyebrow">{p.heroEyebrow ?? 'MADE FRESH TO ORDER'}</span><h1>{p.heroTitle || 'Big flavour. Great food.'}</h1><p>{p.heroSubtitle || 'Choose your favourites, customise and enjoy.'}</p>
            <button className="une-pill-action" onClick={() => menuRef.current && menuRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{labels.browse} ↗</button>
          </div>
          <div className="une-hero-image"><span aria-hidden="true">🍔</span>{p.heroImage && <img src={p.heroImage} alt="Meal" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}</div>
        </section>
        <nav className="une-kiosk-categories" aria-label="Menu categories">
          <button onClick={() => setCategory('all')} className={category === 'all' ? 'selected' : ''}><span>🍽️</span>{p.allCategoryLabel ?? 'All'}</button>
          {categories.map((item) => <button key={item.id} onClick={() => setCategory(item.id)} className={category === item.id ? 'selected' : ''}><span>{item.icon || '🍽️'}</span>{item.name}</button>)}
        </nav>
        <section ref={menuRef} className="une-kiosk-menu">
          <div className="une-menu-intro"><div><small>{p.menuEyebrow ?? 'FRESHLY PREPARED'}</small><h2>{category === 'all' ? (p.menuTitle || 'What are you craving?') : (categories.find((x) => x.id === category)?.name || 'Menu')}</h2></div>
            <label className="une-menu-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={p.searchPlaceholder ?? 'Search the menu...'} aria-label="Search products" /></label>
          </div>
          <div className="une-kiosk-products">
            {visible.map((item) => <article className="une-product-card" key={item.id}>
              <button className="une-product-photo" disabled={busy} onClick={() => { setDetail(item); setQuantity(1); }} aria-label={'Select ' + item.name}>{cardImage(item)}{item.badge && <span className="une-product-badge">{item.badge}</span>}</button>
              <div className="une-product-info"><h3>{item.name}</h3><p>{item.description || ''}</p><strong>{money(item.price)}</strong><button onClick={() => { setDetail(item); setQuantity(1); }} disabled={busy} className="une-product-add">{p.addButtonLabel ?? 'Add +'} </button></div>
            </article>)}
          </div>
          {!p.loading && !visible.length && <div className="une-kiosk-empty">No available products. Check the Product object and page filters.</div>}
        </section>
      </main>
      <footer className="une-kiosk-basketbar"><div className="une-basket-count"><span className="une-bag-icon">🛍</span><strong>{itemCount} items</strong><small>{itemCount ? (p.readyBasketLabel ?? 'Ready when you are') : (p.emptyBasketLabel ?? 'Start your order')}</small></div>
        <button onClick={() => setScreen('basket')} className="une-kiosk-primary" disabled={!itemCount || busy}>{labels.viewBasket} <strong>{money(total)}</strong><span aria-hidden="true">→</span></button>
      </footer>
    </> : screen === 'basket' || screen === 'payment' ? <div className="une-kiosk-checkout">
      <button className="une-kiosk-back" disabled={busy} onClick={() => setScreen(screen === 'payment' ? 'basket' : 'menu')}>← {screen === 'payment' ? 'Back to basket' : labels.back}</button>
      <div className="une-kiosk-checkout-card"><span className="une-kiosk-eyebrow">{screen === 'payment' ? 'STEP 2 OF 2' : 'STEP 1 OF 2'}</span><h2>{screen === 'payment' ? labels.payment : labels.yourOrder}</h2>
        {screen === 'basket' ? <>{cart.length ? cart.map((line) => <div className="une-cart-line" key={line.id}>
          {cardImage(line, 'une-cart-photo')}<div className="une-cart-copy"><strong>{line.name}</strong><span>{money(line.unitPrice)} each</span></div>
          <div className="une-qty"><button disabled={busy} onClick={() => updateLine(line, Number(line.quantity) - 1)} aria-label={'Remove one ' + line.name}>−</button><strong>{line.quantity}</strong><button disabled={busy} onClick={() => updateLine(line, Number(line.quantity) + 1)} aria-label={'Add one ' + line.name}>+</button></div>
        </div>) : <p>Your basket is empty.</p>}
          <div className="une-total-row"><span>{p.subtotalLabel ?? 'Subtotal (display only)'}</span><strong>{money(total)}</strong></div>
          <button className="une-kiosk-primary une-checkout-button" onClick={() => setScreen('payment')} disabled={!itemCount || busy}>{p.continuePaymentLabel ?? 'Continue to payment →'}</button>
        </> : <>
          <div className="une-payment-demo"><span>💳</span><h3>{p.paymentTitle ?? 'Card payment'}</h3><p>{p.paymentDescription ?? 'Payment is managed by the selected checkout Flow.'}</p></div>
          <div className="une-total-row"><span>Displayed subtotal</span><strong>{money(total)}</strong></div>
          <button className="une-kiosk-primary une-checkout-button" disabled={!itemCount || busy || !paymentReady} onClick={checkout}>{busy ? 'Processing…' : 'Start payment Flow →'}</button>
          {!paymentReady && <p role="status">Payment is unavailable until an active checkout Flow and payment device are configured.</p>}
        </>}
      </div>
    </div> : <div className="une-kiosk-done"><span>✓</span><h2>{p.completeTitle ?? 'Order complete'}</h2><p>{p.completeDescription ?? 'Your receipt and collection number will be provided by the configured checkout Flow.'}</p><button onClick={async () => { const result = await emit('reset', {}); if (result) { setScreen('menu'); setDetail(null); } }} className="une-kiosk-primary">{p.newOrderLabel ?? 'Start a new order →'}</button></div>}
    {detail && <div className="une-detail-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}>
      <section className="une-detail-card" role="dialog" aria-modal="true" aria-label={'Add ' + detail.name}>
        <button className="une-detail-close" onClick={() => setDetail(null)} aria-label="Close product details">×</button>
        {cardImage(detail, 'une-detail-photo')}<div className="une-detail-body"><h2>{detail.name}</h2><p>{detail.description}</p><h3>{money(detail.price)}</h3>
          <div className="une-detail-controls"><div className="une-qty"><button disabled={busy} onClick={() => setQuantity((x) => Math.max(1, x - 1))}>−</button><strong>{quantity}</strong><button disabled={busy} onClick={() => setQuantity((x) => x + 1)}>+</button></div>
            <button className="une-kiosk-primary" disabled={busy || !actions.add} onClick={addProduct}>{busy ? 'Adding…' : labels.add + ' · ' + money(quantity * Number(detail.price || 0))}</button>
          </div>
        </div>
      </section>
    </div>}
  </div>;
}
