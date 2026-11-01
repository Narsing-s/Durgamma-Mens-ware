'use client';

import { useEffect, useState } from 'react';
import { createClient, User } from '@supabase/supabase-js';
import Link from 'next/link';

type StoreData = { products: any[]; orders: any[]; returns: any[]; lowStock: any[] };

export default function AdminPage() {
  const [adjustments, setAdjustments] = useState<Record<string, string>>({});
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState('');
  const [data, setData] = useState<StoreData | null>(null);
  const [message, setMessage] = useState('');
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    : null;

  async function load(accessToken = token) {
    if (!accessToken) return;
    const response = await fetch('/api/admin/store', { headers: { Authorization: 'Bearer ' + accessToken } });
    const result = await response.json();
    if (!response.ok) { setMessage(result.error || 'Could not load dashboard.'); return; }
    setData(result);
    setMessage('');
  }

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: sessionData }) => {
      if (sessionData.session) {
        setUser(sessionData.session.user);
        setToken(sessionData.session.access_token);
        load(sessionData.session.access_token);
      }
    });
  }, []);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) { setMessage('Supabase authentication is not configured.'); return; }
    const { data: sessionData, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setMessage(error.message); return; }
    if (sessionData.session) {
      setUser(sessionData.session.user);
      setToken(sessionData.session.access_token);
      await load(sessionData.session.access_token);
    }
  }

  async function updateOrder(id: string, status: string) {
    const response = await fetch('/api/admin/orders/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ status }),
    });
    const result = await response.json();
    setMessage(response.ok ? 'Order updated successfully.' : result.error || 'Update failed.');
    if (response.ok) load();
  }

  async function adjustStock(id: string) {
    const stock = Number(adjustments[id]);
    if (!Number.isInteger(stock) || stock < 0) { setMessage('Enter a valid stock quantity.'); return; }
    const reason = prompt('Reason for this stock adjustment (for example: new stock received)') || '';
    if (reason.trim().length < 3) { setMessage('A stock adjustment reason is required.'); return; }
    const response = await fetch('/api/admin/inventory/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ stock, reason }),
    });
    const result = await response.json();
    setMessage(response.ok ? 'Stock adjusted and recorded.' : result.error || 'Stock update failed.');
    if (response.ok) {
      setAdjustments(current => ({ ...current, [id]: '' }));
      load();
    }
  }

  async function updateReturn(id: string, status: string) {
    const note = prompt('Optional note for the customer') || '';
    const response = await fetch('/api/admin/returns/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ status, note }),
    });
    const result = await response.json();
    setMessage(response.ok ? 'Return request updated.' : result.error || 'Return update failed.');
    if (response.ok) load();
  }

  async function signOut() {
    await supabase?.auth.signOut();
    setUser(null);
    setToken('');
    setData(null);
  }

  if (!user) {
    return <main className="admin-shell">
      <Link href="/" className="admin-back">← Back to store</Link>
      <section className="admin-login">
        <p className="eyebrow">DURGAMMA MENSWEAR</p>
        <h1>Store administration</h1>
        <p>Sign in with an authorized owner account to manage real store operations.</p>
        <form onSubmit={signIn}>
          <input aria-label="Email" type="email" placeholder="Owner email" value={email} onChange={event => setEmail(event.target.value)} required/>
          <input aria-label="Password" type="password" placeholder="Password" value={password} onChange={event => setPassword(event.target.value)} required/>
          <button className="gold-btn">SIGN IN</button>
        </form>
        {message && <p className="admin-message">{message}</p>}
      </section>
    </main>;
  }

  const orderValue = (data?.orders || []).filter(order => order.order_status !== 'cancelled')
    .reduce((total, order) => total + Number(order.total_inr || 0), 0);
  const completedOrders = (data?.orders || []).filter(order => order.order_status === 'delivered').length;
  const pendingOrders = (data?.orders || []).filter(order => ['pending','confirmed','packed'].includes(order.order_status)).length;
  const cancelledOrders = (data?.orders || []).filter(order => order.order_status === 'cancelled').length;

  return <main className="admin-shell">
    <header className="admin-header">
      <div>
        <Link href="/" className="admin-back">← Storefront</Link>
        <h1>Store control centre</h1>
        <small>{user.email}</small>
      </div>
      <div><button onClick={() => load()}>Refresh</button><button onClick={signOut}>Sign out</button></div>
    </header>
    {message && <p className="admin-message" role="status">{message}</p>}
    {!data ? <p>Loading store operations…</p> : <>
      <section className="admin-stats">
        <div><span>Orders</span><b>{data.orders.length}</b></div>
        <div><span>Order value</span><b>₹{orderValue.toLocaleString('en-IN')}</b></div>
        <div><span>Low stock</span><b>{data.lowStock.length}</b></div>
        <div><span>Open returns</span><b>{data.returns.filter(item => item.status === 'requested').length}</b></div>
      </section>

      <section className="admin-section">
        <h2>Store management</h2>
        <div className="admin-quick-links">
          <Link href="/admin/products">Products &amp; photos <span>Add products, upload/replace photos, edit selling price and MRP, sizes and stock →</span></Link>
          <Link href="/admin/delivery">Delivery settings <span>Serviceable PIN codes, shipping charges and delivery ranges →</span></Link>
          <a href="#orders">Orders &amp; fulfilment <span>Confirm, pack, ship, deliver or cancel orders →</span></a>
          <a href="#inventory">Inventory <span>Review low stock and record stock adjustments →</span></a>
          <a href="#returns">Returns &amp; exchanges <span>Approve, reject and record return outcomes →</span></a>
          <a href="#reports">Store reports <span>Review sales totals and order status summary →</span></a>
        </div>
      </section>
      <section className="admin-section" id="reports">
        <h2>Store reports</h2>
        <div className="admin-stats">
          <div><span>Delivered orders (loaded)</span><b>{completedOrders}</b></div>
          <div><span>Active orders (loaded)</span><b>{pendingOrders}</b></div>
          <div><span>Cancelled orders (loaded)</span><b>{cancelledOrders}</b></div>
          <div><span>Products in catalogue</span><b>{data.products.length}</b></div>
        </div>
        <small>Revenue shown above is the sum of non-cancelled orders in the latest 100 records returned by the dashboard, not an all-time accounting ledger.</small>
      </section>

      <section className="admin-section" id="orders">
        <h2>Orders</h2>
        <div className="admin-table">
          {data.orders.map(order => {
            const nextStatuses = order.order_status === 'pending' ? ['confirmed', 'cancelled']
              : order.order_status === 'confirmed' ? ['packed', 'cancelled']
              : order.order_status === 'packed' ? ['shipped', 'cancelled']
              : order.order_status === 'shipped' ? ['delivered'] : [];
            return <div className="admin-row" key={order.id}>
              <span><b>{order.order_number}</b><small>{order.customer_name}</small></span>
              <span>₹{Number(order.total_inr).toLocaleString('en-IN')}</span>
              <select value={order.order_status} disabled={!nextStatuses.length} onChange={event => updateOrder(order.id, event.target.value)}>
                <option value={order.order_status}>{order.order_status[0].toUpperCase() + order.order_status.slice(1)}</option>
                {nextStatuses.map(status => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
              </select>
            </div>;
          })}
          {!data.orders.length && <p>No orders have been placed yet.</p>}
        </div>
      </section>

      <section className="admin-section" id="returns">
        <h2>Returns &amp; exchanges</h2>
        <div className="admin-table">
          {data.returns.length ? data.returns.map((item: any) => <div className="admin-row" key={item.id}>
            <span>
              <b>{item.orders?.order_number || 'Order'} · {(item.request_type || 'return').toUpperCase()}</b>
              <small>{item.reason} · {item.orders?.customer_name || 'Customer'} · {new Date(item.created_at).toLocaleDateString('en-IN')}</small>
            </span>
            <span>
              <b>{item.status.toUpperCase()}</b>
              {item.status === 'requested' && <>
                <button onClick={() => updateReturn(item.id, 'approved')}>Approve</button>
                <button onClick={() => updateReturn(item.id, 'rejected')}>Reject</button>
              </>}
              {item.status === 'approved' && <button onClick={() => updateReturn(item.id, 'received')}>Mark received</button>}
              {item.status === 'received' && <>
                <button onClick={() => updateReturn(item.id, 'refunded')}>Record manual refund</button>
                <button onClick={() => updateReturn(item.id, 'exchanged')}>Record exchange completed</button>
              </>}
            </span>
          </div>) : <p>No return or exchange requests yet.</p>}
        </div>
      </section>

      <section className="admin-section" id="inventory">
        <h2>Low-stock inventory</h2>
        <div className="admin-table">
          {data.lowStock.length ? data.lowStock.map((variant: any) => <div className="admin-row" key={variant.id}>
            <span><b>{variant.products?.name || 'Product'}</b><small>{variant.sku} · {variant.size} · {variant.colour}</small></span>
            <span>
              <input aria-label={'Stock for ' + variant.sku} type="number" min="0" placeholder={String(variant.stock)} value={adjustments[variant.id] || ''} onChange={event => setAdjustments(current => ({ ...current, [variant.id]: event.target.value }))}/>
              <button onClick={() => adjustStock(variant.id)}>Update stock</button>
            </span>
          </div>) : <p>All tracked variants are above the low-stock threshold.</p>}
        </div>
      </section>

      <section className="admin-section" id="products">
        <h2>Products</h2>
        <div className="admin-table">
          {data.products.map(product => <div className="admin-row" key={product.id}>
            <span><b>{product.name}</b><small>{product.category} · {product.product_variants?.length || 0} variants</small></span>
            <span>₹{Number(product.price_inr).toLocaleString('en-IN')} · {product.is_active ? 'Live' : 'Draft'}</span>
          </div>)}
        </div>
      </section>
    </>}
  </main>;
}
