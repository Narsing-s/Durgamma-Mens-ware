'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, Package, Truck, ShieldCheck, LoaderCircle, Search } from 'lucide-react';

type Order = {
  orderNumber: string;
  status: 'pending' | 'confirmed' | 'packed' | 'shipped' | 'delivered' | 'cancelled';
  paymentStatus: string;
  total: number;
  createdAt: string;
  updatedAt: string;
  items: { product_name: string; size: string; quantity: number; line_total_inr: number }[];
};

const steps = [
  { key: 'confirmed', label: 'Confirmed', note: 'Your order has been accepted.', icon: CheckCircle2 },
  { key: 'packed', label: 'Packed', note: 'Your items are being prepared.', icon: Package },
  { key: 'shipped', label: 'Shipped', note: 'Your order is on its way.', icon: Truck },
  { key: 'delivered', label: 'Delivered', note: 'Your order has arrived.', icon: ShieldCheck },
];
const money = (amount: number) => '₹' + amount.toLocaleString('en-IN');
const date = (value: string) => new Date(value).toLocaleString('en-IN', {
  day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
});

export default function TrackOrder() {
  const [token, setToken] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supplied = new URLSearchParams(window.location.search).get('token');
    if (supplied) {
      setToken(supplied);
      void lookup(supplied);
    }
  }, []);

  async function lookup(value = token) {
    const clean = value.trim();
    setError('');
    setOrder(null);
    if (!clean) {
      setError('Open the secure tracking link from your order confirmation.');
      return;
    }
    let suppliedToken = clean;
    try {
      if (clean.startsWith('http://') || clean.startsWith('https://')) {
        suppliedToken = new URL(clean).searchParams.get('token') || '';
      }
    } catch {
      suppliedToken = '';
    }
    setBusy(true);
    try {
      const response = await fetch('/api/orders/track?token=' + encodeURIComponent(suppliedToken), { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not find your order.');
      setOrder(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not find your order.');
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void lookup();
  }

  const currentIndex = order ? steps.findIndex(step => step.key === order.status) : -1;
  const cancelled = order?.status === 'cancelled';

  return <main className="track-page">
    <a href="/" className="track-back"><ArrowLeft size={15}/> BACK TO DURGAMMA</a>
    <section className="track-card">
      <p className="eyebrow">DURGAMMA MENSWEAR · ORDER CARE</p>
      <h1>Track your <em>order.</em></h1>
      <p className="track-intro">Use the private tracking link sent after checkout. Your personal details are never shown on this page.</p>
      <form className="track-form" onSubmit={submit}>
        <label htmlFor="tracking-token">SECURE TRACKING LINK OR TOKEN</label>
        <div><input id="tracking-token" value={token} onChange={event => setToken(event.target.value)} placeholder="Paste your order tracking link" autoComplete="off" spellCheck={false}/><button disabled={busy}>{busy ? <LoaderCircle size={16}/> : <Search size={16}/>} TRACK ORDER</button></div>
      </form>
      {error && <p className="track-error" role="alert">{error}</p>}
      {busy && <p className="track-loading"><LoaderCircle size={16}/> Checking your order securely…</p>}
      {order && <section className="track-result" aria-live="polite">
        <div className="track-result-head"><div><span>ORDER NUMBER</span><h2>{order.orderNumber}</h2></div><span className={'track-status '+(cancelled?'cancelled':'')}>{order.status.replace('_',' ').toUpperCase()}</span></div>
        <p className="track-placed">Placed {date(order.createdAt)}</p>
        {cancelled ? <div className="track-cancelled"><Clock3 size={20}/><div><b>Order cancelled</b><p>This order is no longer being processed. Contact the store if you need help.</p></div></div> : <div className="track-timeline">
          {steps.map((step,index) => {
            const Icon = step.icon;
            const active = currentIndex >= index;
            return <div className={'track-step '+(active?'complete':'')} key={step.key}>
              <span className="track-step-icon"><Icon size={17}/></span>
              <div><b>{step.label}</b><small>{step.note}</small></div>
              {active && <CheckCircle2 className="track-step-check" size={15}/>}
            </div>;
          })}
        </div>}
        <div className="track-items"><h3>ORDER SUMMARY</h3>{order.items.map((item,index)=><div className="track-item" key={index}><span>{item.product_name}<small>Size {item.size} · Qty {item.quantity}</small></span><b>{money(item.line_total_inr)}</b></div>)}<div className="track-total"><span>Order total</span><b>{money(order.total)}</b></div><p className="track-payment">Payment status: {order.paymentStatus.replace('_',' ').toUpperCase()}</p></div>
        <p className="track-updated">Last updated {date(order.updatedAt)}</p>
      </section>}
    </section>
    <footer className="track-footer">DURGAMMA MENSWEAR · DEFINED BY STYLE</footer>
  </main>;
}
