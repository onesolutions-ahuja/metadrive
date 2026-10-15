export default function RecordCatalogCart(props) {
  const p = props || {};
  const [cart, setCart] = React.useState([]);
  const [search, setSearch] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [displaySession, setDisplaySession] = React.useState('');
  const [paymentStatus, setPaymentStatus] = React.useState('');
  const [vatRate, setVatRate] = React.useState(Number(p.vatRate ?? 20));
  const [settingsReady, setSettingsReady] = React.useState(typeof p.loadCompanySettings !== 'function');
  const stateChannel = p.stateChannel;
  const sessionReady = !stateChannel || (stateChannel.ready && stateChannel.exists);
  const locked = busy || paymentStatus === 'pending' || paymentStatus === 'complete';
  const checkoutRequest = React.useRef('');
  let operations = [];
  try { operations = JSON.parse(String(p.operationEvents || '[]')); } catch { /* Invalid metadata is shown by the builder. */ }
  if (!Array.isArray(operations)) operations = [];
  operations = operations.filter(item => item && typeof item.event === 'string' && typeof item.label === 'string');
  const products = Array.isArray(p.records) ? p.records : [];
  const money = value => (Number(value || 0) / 100).toLocaleString(undefined, {
    style: 'currency', currency: p.currencyCode || 'GBP'
  });
  const productName = record => String(record[p.nameFieldApiName || 'Name'] || '');
  const productPrice = record => Math.round(Number(record[p.priceFieldApiName || 'DefaultPrice']) * 100);
  const channelName = id => 'metadrive:paired-display:' + id;
  const totals = cart.reduce((result, item) => {
    const line = item.unitPriceMinor * item.quantity;
    result.gross += line;
    if (item.vatApplicable) result.vat += Math.round(line * vatRate / (100 + vatRate));
    return result;
  }, { gross: 0, vat: 0 });
  const hasAgeRestricted = cart.some(item => item.ageRestricted);

  const publish = (nextCart, status = 'basket', changeDueMinor = 0) => {
    const snapshot = {
        status,
        items: nextCart.map(item => ({
          name: item.name,
          quantity: item.quantity,
          lineTotalMinor: item.unitPriceMinor * item.quantity
        })),
        totalMinor: nextCart.reduce((sum, item) => sum + item.unitPriceMinor * item.quantity, 0),
        changeDueMinor
      };
    if (stateChannel) {
      stateChannel.publish({cart: nextCart, paymentStatus: status, display: snapshot});
      return;
    }
    if (!displaySession || typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(channelName(displaySession));
    channel.postMessage({type:'snapshot', payload:snapshot});
    channel.close();
  };
  React.useEffect(() => { if (stateChannel) {setCart([]);setPaymentStatus('');} }, [stateChannel?.key]);
  React.useEffect(() => {
    const value = stateChannel?.value;
    if (!value || !Array.isArray(value.cart)) return;
    const restored = value.cart.filter(item => item && typeof item.productId === 'string'
      && typeof item.name === 'string' && Number.isSafeInteger(item.quantity) && item.quantity > 0
      && Number.isSafeInteger(item.unitPriceMinor) && item.unitPriceMinor >= 0);
    setCart(restored);
    const status = value.paymentStatus === 'payment-pending' ? 'pending'
      : value.paymentStatus === 'complete' ? 'complete' : '';
    setPaymentStatus(status);
  }, [stateChannel?.value]);
  const saleValue = items => {
    const grossMinor = items.reduce((sum, item) => sum + item.unitPriceMinor * item.quantity, 0);
    const vatMinor = items.reduce((sum, item) => sum + (item.vatApplicable
      ? Math.round(item.unitPriceMinor * item.quantity * vatRate / (100 + vatRate)) : 0), 0);
    return {
      lines: items.map(item => ({
        Name: item.name,
        ProductId: item.productId,
        Quantity: item.quantity,
        UnitPrice: item.unitPriceMinor / 100,
        VATApplicable: item.vatApplicable,
        VATRate: item.vatApplicable ? vatRate : 0,
        VATAmount: item.vatApplicable
          ? Math.round(item.unitPriceMinor * item.quantity * vatRate / (100 + vatRate)) / 100
          : 0,
        LineTotal: item.unitPriceMinor * item.quantity / 100
      })),
      total: grossMinor / 100,
      vatTotal: vatMinor / 100,
      standardVatRate: vatRate,
      hasAgeRestricted: items.some(item => item.ageRestricted)
    };
  };
  const checkoutValue = items => {
    checkoutRequest.current = crypto.randomUUID();
    return {...saleValue(items),sessionKey:stateChannel?.key || p.sessionId,requestId:checkoutRequest.current};
  };
  const updateCart = next => {
    setCart(next);
    setPaymentStatus('');
    publish(next);
  };
  React.useEffect(() => {
    if (stateChannel || !displaySession || typeof BroadcastChannel === 'undefined') return undefined;
    const channel = new BroadcastChannel(channelName(displaySession));
    channel.onmessage = event => {
      if (event.data?.type === 'ready') publish(cart);
    };
    publish(cart);
    return () => channel.close();
  }, [displaySession, cart]);
  React.useEffect(() => {
    if (typeof p.loadCompanySettings !== 'function') return undefined;
    let active = true;
    Promise.resolve(p.loadCompanySettings()).then(settings => {
      const configuredRate = Number(settings?.standardVatRate);
      if (!Number.isFinite(configuredRate) || configuredRate < 0 || configuredRate > 100) {
        throw Error('Company VAT rate must be between 0 and 100 percent.');
      }
      if (active) {
        setVatRate(configuredRate);
        setSettingsReady(true);
      }
    }).catch(cause => {
      if (active) {
        setSettingsReady(false);
        setError('Unable to load company VAT settings: ' +
          (cause instanceof Error ? cause.message : 'request failed'));
      }
    });
    return () => { active = false; };
  }, []);
  React.useEffect(() => {
    const configuredFlow = p.actionFlows?.checkout?.flowApiName;
    if (typeof configuredFlow !== 'string' || !configuredFlow) return undefined;
    const onFlowCompleted = event => {
      const detail = event.detail;
      if (!detail || detail.flowApiName !== configuredFlow) return;
      const outputs = detail.outputs && typeof detail.outputs === 'object' ? detail.outputs : {};
      const expectsRequest = p.actionFlows?.checkout?.inputs?.CheckoutRequestKey;
      if (expectsRequest && outputs.CheckoutRequestKey !== checkoutRequest.current) return;
      const status = outputs.CheckoutStatus;
      if (status === 'InvalidSale' || status === 'InvalidPayment') {
        setBusy(false);
        setPaymentStatus('failed');
        setError('The sale could not be validated. Check the basket and try again.');
        publish(cart, 'payment-failed');
      } else if (status === 'AgeRejected') {
        const eligible = cart.filter(item => !item.ageRestricted);
        updateCart(eligible);
        if (!eligible.length) {
          setPaymentStatus('age-rejected');
          publish([], 'age-rejected');
          return;
        }
        setBusy(true);
        if (typeof p.onAction !== 'function') {
          setError('Configure the checkout Flow binding in Page Builder.');
          setBusy(false);
          return;
        }
        Promise.resolve(p.onAction({ event: 'checkout', value: checkoutValue(eligible) }))
          .then(result => {
            if (result === false || result?.error) throw Error(String(result?.error || 'Checkout was not started.'));
            setPaymentStatus('pending');
            publish(eligible, 'payment-pending');
          })
          .catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to continue checkout.'))
          .finally(() => setBusy(false));
      } else if (status === 'Accepted') {
        setPaymentStatus('complete');
        publish(cart, 'complete', Math.round(Number(outputs.ChangeDue || 0) * 100));
      } else if (status === 'Declined' || status === 'InsufficientCash') {
        setPaymentStatus(status === 'Declined' ? 'declined' : 'insufficient-cash');
        publish(cart, status === 'Declined' ? 'declined' : 'insufficient-cash');
      }
    };
    const onFlowFailed = event => {
      const detail = event.detail;
      if (!detail || detail.flowApiName !== configuredFlow) return;
      setBusy(false);
      setPaymentStatus('failed');
      setError('Checkout failed: ' + (detail.message || 'Unable to complete payment.'));
      publish(cart, 'payment-failed');
    };
    const onFlowCancelled = event => {
      if (event.detail?.flowApiName !== configuredFlow) return;
      setBusy(false);
      setPaymentStatus('cancelled');
      setError('Checkout was cancelled. The basket is unchanged.');
      publish(cart, 'payment-cancelled');
    };
    window.addEventListener('metadrive:flow-completed', onFlowCompleted);
    window.addEventListener('metadrive:flow-failed', onFlowFailed);
    window.addEventListener('metadrive:flow-cancelled', onFlowCancelled);
    return () => {
      window.removeEventListener('metadrive:flow-completed', onFlowCompleted);
      window.removeEventListener('metadrive:flow-failed', onFlowFailed);
      window.removeEventListener('metadrive:flow-cancelled', onFlowCancelled);
    };
  }, [cart, displaySession, vatRate, p.actionFlows, p.onAction]);
  const add = product => {
    if (locked || !sessionReady) return;
    const id = String(product.Id || '');
    const name = productName(product);
    const price = productPrice(product);
    if (!id || !name || !Number.isSafeInteger(price) || price < 0) {
      setError('This product is missing a valid record ID, name or selling price.');
      return;
    }
    const vatField = p.vatApplicableFieldApiName || 'VATApplicable';
    const ageField = p.ageRestrictedFieldApiName || 'AgeRestricted';
    const current = cart.find(item => item.productId === id);
    const next = current
      ? cart.map(item => item.productId === id ? { ...item, quantity: item.quantity + 1 } : item)
      : [...cart, {
        productId: id,
        name,
        quantity: 1,
        unitPriceMinor: price,
        vatApplicable: product[vatField] !== false,
        ageRestricted: product[ageField] === true
      }];
    setError('');
    updateCart(next);
  };
  const changeQuantity = (id, amount) => {
    if (locked || !sessionReady) return;
    const next = cart
      .map(item => item.productId === id ? { ...item, quantity: item.quantity + amount } : item)
      .filter(item => item.quantity > 0);
    updateCart(next);
  };
  const openCustomerDisplay = () => {
    const urlValue = String(p.customerDisplayUrl || '');
    if (!urlValue) {
      setError('Configure the customer display page URL in component properties.');
      return;
    }
    try {
      const url = new URL(urlValue, window.location.href);
      if (url.origin !== window.location.origin) throw Error('The customer display must use this MetaDrive origin.');
      const session = stateChannel?.key || crypto.randomUUID();
      url.searchParams.set('displaySession', session);
      const opened = window.open(url.href, '_blank');
      if (!opened) throw Error('Allow pop-ups to open the customer display.');
      opened.opener = null;
      setDisplaySession(session);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to open the customer display.');
    }
  };
  const checkout = async () => {
    if (!cart.length || locked || !sessionReady || stateChannel?.error) return;
    if (typeof p.onAction !== 'function') {
      setError('Configure the checkout Flow binding in Page Builder.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await p.onAction({ event: 'checkout', value: checkoutValue(cart) });
      if (result === false || result?.error) throw Error(String(result?.error || 'Checkout was not started.'));
      setPaymentStatus('pending');
      publish(cart, 'payment-pending');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to start checkout.');
    } finally {
      setBusy(false);
    }
  };
  const filtered = products.filter(product =>
    [productName(product), product[p.barcodeFieldApiName || 'Barcode'], product[p.skuFieldApiName || 'SKU']]
      .some(value => String(value || '').toLowerCase().includes(search.trim().toLowerCase())));
  const addScannedProduct = event => {
    if (event.key !== 'Enter') return;
    const value = search.trim().toLowerCase();
    if (!value) return;
    const match = products.find(product =>
      [productName(product), product[p.barcodeFieldApiName || 'Barcode'], product[p.skuFieldApiName || 'SKU']]
        .some(candidate => String(candidate || '').trim().toLowerCase() === value));
    if (!match) return;
    event.preventDefault();
    add(match);
    setSearch('');
  };

  return <section className="md-record-cart" style={{ '--cart-accent': p.accentColor || '#1677d2' }}>
    <header className="md-record-cart-header">
      <div><small>{p.eyebrow || 'SALES'}</small><h1>{p.title || 'Till'}</h1></div>
      <button type="button" onClick={openCustomerDisplay}>{p.displayButtonLabel || 'Open customer display'}</button>
    </header>
    {operations.length > 0 && <nav className="md-record-cart-operations" aria-label={p.operationsLabel || 'Operations'}>
      {operations.map(operation => <button type="button" key={operation.event}
        disabled={busy || paymentStatus === 'pending' || (operation.requiresSession === true && !sessionReady) || (operation.requiresNoSession === true && stateChannel?.exists)
          || (operation.requiresCart === true && !cart.length) || (operation.requiresEmptyBasket === true && cart.length > 0)}
        onClick={() => {
          if (typeof p.onAction !== 'function') return;
          setError('');
          Promise.resolve(p.onAction({event:operation.event,value:{
            ...saleValue(cart),sessionKey:stateChannel?.key || p.sessionId
          }})).catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to start operation'));
        }}>{operation.label}</button>)}
    </nav>}
    {stateChannel && !stateChannel.ready && <p role="status">Reconnecting to session…</p>}
    {stateChannel && stateChannel.ready && !stateChannel.exists && <p role="status">{p.sessionRequiredText || 'Start a session to begin.'}</p>}
    {stateChannel?.error && <p className="md-record-cart-error" role="alert">{stateChannel.error}</p>}
    <div className="md-record-cart-layout">
      <section className="md-record-cart-products" aria-label={p.productsLabel || 'Products'}>
        <label className="md-record-cart-search">
          <span aria-hidden="true">⌕</span>
          <input aria-label="Search products" value={search}
            onChange={event => setSearch(event.target.value)}
            onKeyDown={addScannedProduct}
            placeholder={p.searchPlaceholder || 'Search or scan a product'} />
        </label>
        {p.loading && <p className="md-record-cart-message">Loading products…</p>}
        {!p.loading && !filtered.length && <p className="md-record-cart-message">{p.emptyProductsText || 'No products found.'}</p>}
        <div className="md-record-cart-grid">
          {filtered.map(product => <button type="button" className="md-record-cart-product"
            key={product.Id} disabled={locked || !sessionReady} onClick={() => add(product)}>
            {product[p.imageFieldApiName || 'ImageURL']
              ? <img src={String(product[p.imageFieldApiName || 'ImageURL'])} alt="" loading="lazy" />
              : <span className="md-record-cart-placeholder" aria-hidden="true">{productName(product).slice(0, 1)}</span>}
            <strong>{productName(product)}</strong>
            <span>{money(productPrice(product))}</span>
          </button>)}
        </div>
      </section>
      <aside className="md-record-cart-basket" aria-label={p.basketLabel || 'Current sale'}>
        <h2>{p.basketTitle || 'Current sale'}</h2>
        <div className="md-record-cart-lines" aria-live="polite">
          {!cart.length && <p className="md-record-cart-message">{p.emptyBasketText || 'Scan or select products to start.'}</p>}
          {cart.map(item => <div className="md-record-cart-line" key={item.productId}>
            <div><strong>{item.name}</strong><small>{money(item.unitPriceMinor)} each</small></div>
            <div className="md-record-cart-quantity">
              <button type="button" aria-label={'Remove one ' + item.name} disabled={locked || !sessionReady} onClick={() => changeQuantity(item.productId, -1)}>−</button>
              <span>{item.quantity}</span>
              <button type="button" aria-label={'Add one ' + item.name} disabled={locked || !sessionReady} onClick={() => changeQuantity(item.productId, 1)}>+</button>
            </div>
            <strong>{money(item.unitPriceMinor * item.quantity)}</strong>
          </div>)}
        </div>
        <div className="md-record-cart-total"><span>{p.totalLabel || 'Total'}</span><strong>{money(totals.gross)}</strong></div>
        {p.showVatTotal === true && <div className="md-record-cart-vat"><span>{p.vatLabel || 'VAT included'}</span><span>{money(totals.vat)}</span></div>}
        {paymentStatus === 'pending' && <p className="md-record-cart-message" role="status">
          {p.paymentPendingText || 'Complete the payment step in the Flow screen.'}
        </p>}
        {paymentStatus === 'complete' && <p className="md-record-cart-message" role="status">
          {p.paymentCompleteText || 'Payment accepted. Clear the sale when ready.'}
        </p>}
        {paymentStatus === 'age-rejected' && <p className="md-record-cart-message" role="status">
          {p.ageCheckFailedText || 'Restricted products were removed. No eligible items remain.'}
        </p>}
        {paymentStatus === 'insufficient-cash' && <p className="md-record-cart-message" role="status">
          {p.insufficientCashText || 'Tendered cash was less than the sale total.'}
        </p>}
        {hasAgeRestricted && <button type="button" className="md-record-cart-clear"
          disabled={locked || !sessionReady} onClick={() => updateCart(cart.filter(item => !item.ageRestricted))}>
          {p.removeRestrictedLabel || 'Remove age-restricted items'}
        </button>}
        {error && <p className="md-record-cart-error" role="alert">{error}</p>}
        <button type="button" className="md-record-cart-checkout" disabled={!cart.length || locked || !sessionReady || !settingsReady || Boolean(stateChannel?.error)}
          onClick={() => void checkout()}>{busy ? 'Starting checkout…' : p.checkoutLabel || 'Payment'}</button>
        <button type="button" className="md-record-cart-clear" disabled={!cart.length || busy || paymentStatus === 'pending' || !sessionReady}
          onClick={() => updateCart([])}>{p.clearLabel || 'Clear sale'}</button>
      </aside>
    </div>
  </section>;
}
