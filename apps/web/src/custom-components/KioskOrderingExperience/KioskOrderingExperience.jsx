/* Touch-first restaurant ordering UI. All product, cart, price and checkout values
 * come from metadata-driven Object and Flow bindings. No local business writes. */
export default function KioskOrderingExperience(props) {
  const p = props || {};
  const products = Array.isArray(p.products) ? p.products : [];
  const categories = Array.isArray(p.categories) ? p.categories : [];
  const cart = Array.isArray(p.cartLines) ? p.cartLines : [];
  const [category, setCategory] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [orderType, setOrderType] = React.useState('eat-in');
  const [language, setLanguage] = React.useState(p.language || 'English');
  const [selected, setSelected] = React.useState(null);
  const [quantity, setQuantity] = React.useState(1);
  const [step, setStep] = React.useState('menu');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const money = (n) => (p.currency || '£') + Number(n || 0).toFixed(2);
  const itemCount = cart.reduce((sum, x) => sum + Number(x.quantity || 0), 0);
  // Display subtotal is illustrative; server-side checkout Flow determines the payable amount.
  const subtotal = cart.reduce((sum, x) => sum + Number(x.unitPrice || 0) * Number(x.quantity || 0), 0);
  const actions = p.actionFlows && typeof p.actionFlows === 'object' ? p.actionFlows : {};
  const checkoutReady = Boolean(actions.checkout && actions.checkout.flowApiName
    && Array.isArray(p.flows) && p.flows.some((x) => x.apiName === actions.checkout.flowApiName && x.status === 'Active'));
  const french = language === 'Français';
  const words = french
    ? { menu: 'Menu', all: 'Tout', search: 'Rechercher', order: 'Votre commande', empty: 'Votre panier est vide', add: 'Ajouter', eat: 'Sur place', take: 'À emporter', review: 'Voir mon panier', continue: 'Continuer', back: 'Retour', pay: 'Paiement' }
    : { menu: 'Menu', all: 'All items', search: 'Search food', order: 'Your order', empty: 'Your basket is empty', add: 'Add to order', eat: 'Eat in', take: 'Takeaway', review: 'Review order', continue: 'Continue', back: 'Back', pay: 'Payment' };
  const visible = products.filter(x => (category === 'all' || String(x.categoryId) === String(category))
    && (String(x.name || '') + ' ' + String(x.description || '')).toLowerCase().includes(search.trim().toLowerCase()));
  const trigger = async (event, value) => {
    if (typeof p.onAction !== 'function') { setError('Configure the action in Page Builder.'); return null; }
    setBusy(true); setError('');
    try { return await p.onAction({ event, value }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed'); return null; }
    finally { setBusy(false); }
  };
  const choose = (item) => { setSelected(item); setQuantity(1); };
  const add = async () => {
    if (!selected) return;
    const result = await trigger('add', { productId: selected.id, quantity });
    if (result) setSelected(null);
  };
  const adjust = (item, n) => trigger(n <= 0 ? 'remove' : 'quantity', { lineId: item.id, quantity: n });
  const checkout = async () => {
    const response = await trigger('checkout', { orderType });
    if (response && response.completed === true) setStep('done');
  };
  const restart = async () => {
    const response = await trigger('reset', {});
    if (response) { setStep('menu'); setSelected(null); setCategory('all'); setSearch(''); }
  };
  const photo = (item, className) => <div className={'kfc-food-photo ' + (className || '')}>
    {item.image ? <img src={item.image} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none'; }} /> : <span aria-hidden="true">{item.emoji || '🍽️'}</span>}
  </div>;
  const basketLines = <>{cart.length ? cart.map(line => <div className="kfc-basket-line" key={line.id}>
    {photo(line, 'kfc-small-photo')}
    <div className="kfc-line-info"><strong>{line.name}</strong><small>{money(line.unitPrice)} each</small>
      <div className="kfc-quantity"><button type="button" disabled={busy} onClick={() => adjust(line, Number(line.quantity) - 1)} aria-label={'Remove one ' + line.name}>−</button><span>{line.quantity}</span><button type="button" disabled={busy} onClick={() => adjust(line, Number(line.quantity) + 1)} aria-label={'Add one ' + line.name}>+</button></div>
    </div><strong>{money(Number(line.unitPrice) * Number(line.quantity))}</strong>
  </div>) : <div className="kfc-empty-basket"><span aria-hidden="true">🛍️</span><strong>{words.empty}</strong><p>Choose something delicious to get started.</p></div>}</>;
  return <div className="kfc-kiosk" style={{ '--kfc-accent': p.accentColor || '#d71e28', '--kfc-ink': p.inkColor || '#191919' }}>
    <header className="kfc-topbar">
      <div className="kfc-brand"><span className="kfc-brand-symbol" aria-hidden="true">✦</span><span><strong>{p.brandName || 'Your Restaurant'}</strong><small>{p.tagline || 'Fresh food, made for you'}</small></span></div>
      <div className="kfc-order-mode" role="group" aria-label="Order type">
        <button type="button" className={orderType === 'eat-in' ? 'active' : ''} aria-pressed={orderType === 'eat-in'} onClick={() => setOrderType('eat-in')}>🍽️ {words.eat}</button>
        <button type="button" className={orderType === 'takeaway' ? 'active' : ''} aria-pressed={orderType === 'takeaway'} onClick={() => setOrderType('takeaway')}>🛍️ {words.take}</button>
      </div>
      <select value={language} onChange={e => setLanguage(e.target.value)} aria-label="Language" className="kfc-language"><option value="English">English</option><option value="Français">Français</option></select>
    </header>
    {(error || p.actionError) && <div className="kfc-error" role="alert">{error || p.actionError}</div>}
    {p.loading && <div className="kfc-notice" role="status">Loading your menu…</div>}
    {step === 'menu' ? <div className="kfc-body">
      <aside className="kfc-category-rail" aria-label="Food categories">
        <div className="kfc-rail-title">{words.menu}</div>
        <button type="button" className={category === 'all' ? 'active' : ''} aria-pressed={category === 'all'} onClick={() => setCategory('all')}><span className="kfc-category-icon">🍴</span><span>{words.all}</span></button>
        {categories.map(x => <button type="button" key={x.id} className={String(category) === String(x.id) ? 'active' : ''} aria-pressed={String(category) === String(x.id)} onClick={() => setCategory(x.id)}><span className="kfc-category-icon">{x.icon || '🍽️'}</span><span>{x.name}</span></button>)}
      </aside>
      <main className="kfc-menu-area">
        <div className="kfc-menu-heading"><div><span className="kfc-kicker">FRESHLY PREPARED</span><h1>{category === 'all' ? (p.menuTitle || 'What are you craving?') : (categories.find(x => String(x.id) === String(category))?.name || words.menu)}</h1><p>{p.heroSubtitle || 'Pick your favourites. Make it yours.'}</p></div><label className="kfc-search">⌕ <input value={search} onChange={e => setSearch(e.target.value)} placeholder={words.search} aria-label={words.search} /></label></div>
        <div className="kfc-product-grid">{visible.map(item => <button type="button" className="kfc-product" key={item.id} onClick={() => choose(item)} disabled={busy}>
          {photo(item)}
          <span className="kfc-product-details"><strong>{item.name}</strong><small>{item.description || ''}</small><span className="kfc-product-bottom"><b>{money(item.price)}</b><span className="kfc-plus" aria-hidden="true">+</span></span></span>
        </button>)}</div>
        {!p.loading && !visible.length && <div className="kfc-no-products" role="status">No available products. Check the Product object and filters in Page Builder.</div>}
      </main>
      <aside className="kfc-basket-panel" aria-label={words.order}>
        <div className="kfc-basket-heading"><span>🛍️</span><div><h2>{words.order}</h2><small>{itemCount} {itemCount === 1 ? 'item' : 'items'}</small></div></div>
        <div className="kfc-basket-scroll">{basketLines}</div>
        <div className="kfc-basket-footer"><div className="kfc-subtotal"><span>Subtotal</span><strong>{money(subtotal)}</strong></div><small>Final total calculated at checkout</small>
          <button className="kfc-primary" type="button" disabled={!itemCount || busy} onClick={() => setStep('basket')}>{words.review} <span aria-hidden="true">→</span></button>
        </div>
      </aside>
    </div> : step === 'basket' || step === 'payment' ? <div className="kfc-checkout">
      <button type="button" className="kfc-text-back" disabled={busy} onClick={() => setStep(step === 'payment' ? 'basket' : 'menu')}>← {words.back}</button>
      <section className="kfc-checkout-card"><span className="kfc-kicker">{step === 'basket' ? 'STEP 1 OF 2' : 'STEP 2 OF 2'}</span><h1>{step === 'basket' ? words.order : words.pay}</h1>
        {step === 'basket' ? <>{basketLines}<div className="kfc-subtotal"><span>Displayed subtotal</span><strong>{money(subtotal)}</strong></div><button type="button" className="kfc-primary" disabled={!itemCount || busy} onClick={() => setStep('payment')}>{words.continue} →</button></>
          : <><div className="kfc-payment-info"><span>💳</span><h2>Card payment</h2><p>Payment is handled only by the checkout Flow and configured terminal, not by this screen.</p></div><div className="kfc-subtotal"><span>Displayed subtotal</span><strong>{money(subtotal)}</strong></div><button type="button" className="kfc-primary" disabled={!itemCount || !checkoutReady || busy} onClick={checkout}>{busy ? 'Processing…' : 'Start payment Flow →'}</button>{!checkoutReady && <p className="kfc-notice">Payment is unavailable until an active checkout Flow and payment device are configured.</p>}</>}
      </section>
    </div> : <div className="kfc-complete"><span>✓</span><h1>Order complete</h1><p>Your receipt and collection number come from the configured checkout Flow.</p><button type="button" className="kfc-primary" onClick={restart} disabled={busy}>Start a new order →</button></div>}
    {step === 'menu' && <div className="kfc-mobile-cart"><strong>🛍️ {itemCount} items · {money(subtotal)}</strong><button type="button" disabled={!itemCount || busy} onClick={() => setStep('basket')}>{words.review} →</button></div>}
    {selected && <div className="kfc-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setSelected(null); }}>
      <section className="kfc-dialog" role="dialog" aria-modal="true" aria-label={'Choose ' + selected.name}>
        <button type="button" className="kfc-dialog-close" onClick={() => setSelected(null)} disabled={busy} aria-label="Close product details">×</button>
        {photo(selected, 'kfc-detail-photo')}<div className="kfc-dialog-copy"><h2>{selected.name}</h2><p>{selected.description || ''}</p><strong>{money(selected.price)}</strong></div>
        <div className="kfc-dialog-actions"><div className="kfc-quantity"><button type="button" disabled={busy} onClick={() => setQuantity(n => Math.max(1, n - 1))}>−</button><span>{quantity}</span><button type="button" disabled={busy} onClick={() => setQuantity(n => n + 1)}>+</button></div>
          <button type="button" className="kfc-primary" onClick={add} disabled={busy || !actions.add}>{busy ? 'Adding…' : words.add + ' · ' + money(Number(selected.price || 0) * quantity)}</button>
        </div>
      </section>
    </div>}
  </div>;
}
