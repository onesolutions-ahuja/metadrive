/* MetaDrive registered self-order kiosk. All menu, prices, colours and labels come from page metadata. */
export default function KioskOrderingExperience(props) {
  const p = props || {};
  const products = Array.isArray(p.products) ? p.products : [];
  const categories = Array.isArray(p.categories) ? p.categories : [];
  const [category, setCategory] = React.useState('all');
  const [query, setQuery] = React.useState('');
  const [orderType, setOrderType] = React.useState('eat-in');
  const [language, setLanguage] = React.useState(p.language || 'English');
  const [cart, setCart] = React.useState([]);
  const [detail, setDetail] = React.useState(null);
  const [quantity, setQuantity] = React.useState(1);
  const [extras, setExtras] = React.useState([]);
  const [screen, setScreen] = React.useState('menu');
  const menuRef = React.useRef(null);
  const currency = typeof p.currency === 'string' ? p.currency : '£';
  const money = (amount) => currency + Number(amount || 0).toFixed(2);
  const emit = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); };
  const labels = language === 'Français' ? {
    eatIn: 'Sur place', takeaway: 'À emporter', browse: 'Le menu', search: 'Rechercher...',
    viewBasket: 'Voir le panier', yourOrder: 'Votre commande', add: 'Ajouter', items: 'articles',
    back: 'Retour', payment: 'Paiement', confirm: 'Confirmer la démonstration'
  } : {
    eatIn: 'Eat in', takeaway: 'Takeaway', browse: 'Explore the menu', search: 'Search the menu...',
    viewBasket: 'View basket', yourOrder: 'Your order', add: 'Add to order', items: 'items',
    back: 'Back to menu', payment: 'Payment', confirm: 'Complete demo order'
  };
  const visible = products.filter((item) => (category === 'all' || item.categoryId === category)
    && (String(item.name || '') + ' ' + String(item.description || '')).toLowerCase().includes(query.trim().toLowerCase()));
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const total = cart.reduce((sum, line) => sum + (Number(line.product.price || 0)
    + line.extras.reduce((n, extra) => n + Number(extra.price || 0), 0)) * line.quantity, 0);
  const reset = () => { setCart([]); setCategory('all'); setQuery(''); setScreen('menu'); setDetail(null); setOrderType('eat-in'); };
  const showMenu = () => { setScreen('menu'); };
  const selectCategory = (id) => { setCategory(id); setScreen('menu'); emit('category', id); };
  const openProduct = (product) => { setDetail(product); setExtras([]); setQuantity(1); emit('product', product.id); };
  const addProduct = () => {
    if (!detail) return;
    const selected = (Array.isArray(detail.extras) ? detail.extras : []).filter((opt) => extras.includes(String(opt.id)));
    const key = String(detail.id) + '::' + selected.map((opt) => opt.id).sort().join(',');
    setCart((current) => {
      const existing = current.find((line) => line.key === key);
      return existing ? current.map((line) => line.key === key ? { ...line, quantity: line.quantity + quantity } : line)
        : [...current, { key, product: detail, extras: selected, quantity }];
    });
    emit('add', { productId: detail.id, quantity, extras: selected.map((opt) => opt.id) });
    setDetail(null);
  };
  const setLineQuantity = (key, next) => {
    setCart((current) => next <= 0 ? current.filter((line) => line.key !== key)
      : current.map((line) => line.key === key ? { ...line, quantity: next } : line));
    emit('quantity', { key, quantity: Math.max(0, next) });
  };
  const completeOrder = () => {
    const payload = {
      orderType,
      currency,
      total: Math.round(total * 100) / 100,
      items: cart.map((line) => ({
        productId: line.product.id, quantity: line.quantity,
        unitPrice: Number(line.product.price || 0),
        extras: line.extras.map((opt) => ({ id: opt.id, price: Number(opt.price || 0) }))
      }))
    };
    emit('checkout', payload);
    if (p.checkoutFlowApiName && typeof p.onLaunchFlow === 'function') {
      p.onLaunchFlow(p.checkoutFlowApiName, { OrderType: payload.orderType, Currency: payload.currency, Total: payload.total, Items: payload.items });
      return;
    }
    setScreen('done');
  };
  const cardImage = (item, cls) => <div className={'une-food-image ' + (cls || '')}>
    <span aria-hidden="true">{item.emoji || '🍽️'}</span>
    {item.image && <img src={item.image} alt="" loading="lazy"
      onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
  </div>;
  return <div className="une-kiosk-demo" style={{ '--une-kiosk-accent': p.accentColor || '#ffca26', '--une-kiosk-ink': p.inkColor || '#202124' }}>
    <header className="une-kiosk-head">
      <div className="une-kiosk-brand"><span className="une-kiosk-brand-symbol" aria-hidden="true">✦</span><span><strong>{p.brandName || 'Your Restaurant'}</strong><small>{p.tagline || 'Freshly made, just for you'}</small></span></div>
      <div className="une-kiosk-mode" role="group" aria-label="Order type">
        <button className={orderType === 'eat-in' ? 'is-active' : ''} onClick={() => { setOrderType('eat-in'); emit('order-type', 'eat-in'); }}>🍽 {labels.eatIn}</button>
        <button className={orderType === 'takeaway' ? 'is-active' : ''} onClick={() => { setOrderType('takeaway'); emit('order-type', 'takeaway'); }}>🛍 {labels.takeaway}</button>
      </div>
      <select aria-label="Language" className="une-kiosk-language" value={language} onChange={(event) => setLanguage(event.target.value)}>
        <option value="English">🌐 English</option><option value="Français">🌐 Français</option>
      </select>
    </header>
    {screen === 'menu' ? <>
      <main className="une-kiosk-main">
        <section className="une-kiosk-hero">
          <div className="une-hero-copy"><span className="une-kiosk-eyebrow">MADE FRESH TO ORDER</span>
            <h1>{p.heroTitle || 'Big flavour. Great food.'}</h1>
            <p>{p.heroSubtitle || 'Your favourites, just the way you like them.'}</p>
            <button className="une-pill-action" onClick={() => menuRef.current && menuRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{labels.browse} ↗</button>
          </div>
          <div className="une-hero-image"><span aria-hidden="true">🍔</span>{p.heroImage && <img src={p.heroImage} alt="Freshly made meal" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}</div>
        </section>
        <nav className="une-kiosk-categories" aria-label="Menu categories">
          <button onClick={() => selectCategory('all')} className={category === 'all' ? 'selected' : ''}><span>🍽️</span>All</button>
          {categories.map((item) => <button key={item.id} onClick={() => selectCategory(item.id)} className={category === item.id ? 'selected' : ''}>
            <span>{item.icon || '🍽️'}</span>{item.name}
          </button>)}
        </nav>
        <section ref={menuRef} className="une-kiosk-menu">
          <div className="une-menu-intro"><div><small>FRESHLY PREPARED</small><h2>{category === 'all' ? (p.menuTitle || 'What are you craving?') : (categories.find((x) => x.id === category)?.name || 'Our menu')}</h2></div>
            <label className="une-menu-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={labels.search} aria-label="Search products" /></label>
          </div>
          <div className="une-kiosk-products">
            {visible.map((item) => <article className="une-product-card" key={item.id}>
              <button className="une-product-photo" onClick={() => openProduct(item)} aria-label={'Customise ' + item.name}>{cardImage(item)}{item.badge && <span className="une-product-badge">{item.badge}</span>}</button>
              <div className="une-product-info"><h3>{item.name}</h3><p>{item.description || 'Made fresh for you'}</p><strong>{money(item.price)}</strong><button onClick={() => openProduct(item)} className="une-product-add">Add +</button></div>
            </article>)}
          </div>
          {!visible.length && <div className="une-kiosk-empty">No menu items found. Try another category or search.</div>}
        </section>
      </main>
      <footer className="une-kiosk-basketbar"><div className="une-basket-count"><span className="une-bag-icon">🛍</span><strong>{itemCount} {labels.items}</strong><small>{itemCount ? 'Ready when you are' : 'Add something delicious'}</small></div>
        <button onClick={() => setScreen('basket')} className="une-kiosk-primary" disabled={!itemCount}>{labels.viewBasket} <strong>{money(total)}</strong><span aria-hidden="true">→</span></button>
      </footer>
    </> : screen === 'basket' || screen === 'payment' ? <div className="une-kiosk-checkout">
      <button className="une-kiosk-back" onClick={screen === 'payment' ? () => setScreen('basket') : showMenu}>← {screen === 'payment' ? 'Back to basket' : labels.back}</button>
      <div className="une-kiosk-checkout-card"><span className="une-kiosk-eyebrow">{screen === 'payment' ? 'STEP 2 OF 2' : 'STEP 1 OF 2'}</span><h2>{screen === 'payment' ? labels.payment : labels.yourOrder}</h2>
        {screen === 'basket' ? <>{cart.length ? cart.map((line) => <div className="une-cart-line" key={line.key}>
          {cardImage(line.product, 'une-cart-photo')}<div className="une-cart-copy"><strong>{line.product.name}</strong>{line.extras.map((extra) => <small key={extra.id}>{extra.name} +{money(extra.price)}</small>)}<span>{money(Number(line.product.price || 0) + line.extras.reduce((n, e) => n + Number(e.price || 0), 0))} each</span></div>
          <div className="une-qty"><button onClick={() => setLineQuantity(line.key, line.quantity - 1)} aria-label={'Remove one ' + line.product.name}>−</button><strong>{line.quantity}</strong><button onClick={() => setLineQuantity(line.key, line.quantity + 1)} aria-label={'Add one ' + line.product.name}>+</button></div>
        </div>) : <p>Your basket is empty.</p>}
          <div className="une-total-row"><span>Subtotal</span><strong>{money(total)}</strong></div>
          <button className="une-kiosk-primary une-checkout-button" onClick={() => setScreen('payment')} disabled={!itemCount}>Continue to payment →</button>
        </> : <>
          <div className="une-payment-demo"><span>💳</span><h3>Card payment</h3><p>Demo checkout. No real card payment or order will be created.</p></div>
          <div className="une-total-row"><span>Total ({itemCount} {labels.items})</span><strong>{money(total)}</strong></div>
          <button className="une-kiosk-primary une-checkout-button" onClick={completeOrder}>{p.checkoutFlowApiName ? 'Start checkout flow →' : labels.confirm} →</button>
        </>}
      </div>
    </div> : <div className="une-kiosk-done"><span>✓</span><h2>Demo order complete</h2><p>This was only a preview. No payment was taken and no real order was created.</p><strong>{money(total)}</strong><button onClick={reset} className="une-kiosk-primary">Start a new order →</button></div>}
    {detail && <div className="une-detail-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}>
      <section className="une-detail-card" role="dialog" aria-modal="true" aria-label={'Customise ' + detail.name}>
        <button className="une-detail-close" onClick={() => setDetail(null)} aria-label="Close product details">×</button>
        {cardImage(detail, 'une-detail-photo')}<div className="une-detail-body"><h2>{detail.name}</h2><p>{detail.description}</p><h3>{money(detail.price)}</h3>
          {Array.isArray(detail.extras) && detail.extras.length > 0 && <fieldset><legend>Make it yours</legend>{detail.extras.map((opt) => <label className="une-extra-option" key={opt.id}><input type="checkbox" checked={extras.includes(String(opt.id))}
            onChange={(event) => setExtras((current) => event.target.checked ? [...current, String(opt.id)] : current.filter((id) => id !== String(opt.id)))} />{opt.name}<span>+{money(opt.price)}</span></label>)}</fieldset>}
          <div className="une-detail-controls"><div className="une-qty"><button onClick={() => setQuantity((x) => Math.max(1, x - 1))}>−</button><strong>{quantity}</strong><button onClick={() => setQuantity((x) => x + 1)}>+</button></div>
            <button className="une-kiosk-primary" onClick={addProduct}>{labels.add} · {money(quantity * (Number(detail.price || 0) + (detail.extras || []).filter((opt) => extras.includes(String(opt.id))).reduce((n, opt) => n + Number(opt.price || 0), 0)))}</button>
          </div>
        </div>
      </section>
    </div>}
  </div>;
}
