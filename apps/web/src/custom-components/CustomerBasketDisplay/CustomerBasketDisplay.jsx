export default function CustomerBasketDisplay(props) {
  const p = props || {};
  const [snapshot, setSnapshot] = React.useState({ status: 'waiting', items: [], totalMinor: 0, changeDueMinor: 0 });
  const session = new URLSearchParams(window.location.search).get('displaySession') || '';
  const money = value => (Number(value || 0) / 100).toLocaleString(undefined, {
    style: 'currency', currency: p.currencyCode || 'GBP'
  });

  React.useEffect(() => {
    if (!session || typeof BroadcastChannel === 'undefined') return undefined;
    const channel = new BroadcastChannel('metadrive:paired-display:' + session);
    channel.onmessage = event => {
      if (event.data?.type !== 'snapshot' || !event.data.payload || !Array.isArray(event.data.payload.items)) return;
      const items = event.data.payload.items.filter(item =>
        item && typeof item.name === 'string' && Number.isSafeInteger(item.quantity)
        && Number.isSafeInteger(item.lineTotalMinor) && item.quantity > 0 && item.lineTotalMinor >= 0
      ).map(item => ({
        name: item.name.slice(0, 160),
        quantity: item.quantity,
        lineTotalMinor: item.lineTotalMinor
      }));
      const totalMinor = Number(event.data.payload.totalMinor);
      const changeDueMinor = Number(event.data.payload.changeDueMinor || 0);
      setSnapshot({
        status: typeof event.data.payload.status === 'string' ? event.data.payload.status : 'basket',
        items,
        totalMinor: Number.isSafeInteger(totalMinor) && totalMinor >= 0 ? totalMinor : 0,
        changeDueMinor: Number.isSafeInteger(changeDueMinor) && changeDueMinor >= 0 ? changeDueMinor : 0
      });
    };
    channel.postMessage({ type: 'ready' });
    return () => channel.close();
  }, [session]);

  const statusText = snapshot.status === 'payment-pending' ? p.paymentPendingText || 'Payment in progress'
    : snapshot.status === 'complete' ? p.thankYouText || 'Thank you'
      : snapshot.status === 'declined' ? p.paymentDeclinedText || 'Payment declined'
        : snapshot.status === 'insufficient-cash' ? p.insufficientCashText || 'Please speak to the cashier'
          : snapshot.status === 'age-rejected' ? p.ageCheckFailedText || 'Please speak to the cashier'
          : snapshot.status === 'payment-cancelled' ? p.paymentCancelledText || 'Payment cancelled'
            : snapshot.status === 'payment-failed' ? p.paymentFailedText || 'Please speak to the cashier'
        : p.waitingText || 'Your basket will appear here';

  return <main className="md-customer-display" aria-label={p.title || 'Customer display'}>
    <header><span>{p.storeName || 'Welcome'}</span><strong>{p.title || 'Your order'}</strong></header>
    <section className="md-customer-display-items" aria-live="polite">
      {snapshot.items.map((item, index) => <div className="md-customer-display-item" key={index}>
        <span>{item.quantity} × {item.name}</span><strong>{money(item.lineTotalMinor)}</strong>
      </div>)}
      {!snapshot.items.length && <p>{statusText}</p>}
    </section>
    <footer>
      <div className="md-customer-display-total"><span>{p.totalLabel || 'Total'}</span><strong>{money(snapshot.totalMinor)}</strong></div>
      {snapshot.status === 'complete' && snapshot.changeDueMinor > 0 && <div className="md-customer-display-total">
        <span>{p.changeDueLabel || 'Change due'}</span><strong>{money(snapshot.changeDueMinor)}</strong>
      </div>}
      <p role="status">{statusText}</p>
    </footer>
  </main>;
}
