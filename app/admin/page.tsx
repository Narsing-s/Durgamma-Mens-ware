'use client';

import { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient, getSupabaseBrowserConfigIssue } from '@/lib/supabase-browser';
import Link from 'next/link';
import StoreAnalytics from '@/components/StoreAnalytics';

type StoreData = { products: any[]; orders: any[]; returns: any[]; lowStock: any[]; reviews: any[]; inventoryHistory: any[]; inventoryHistoryWarning?: string | null };

export default function AdminPage() {
  const [adjustments, setAdjustments] = useState<Record<string, string>>({});
  const [deliveryCodes, setDeliveryCodes] = useState<Record<string, string>>({});
  const [emailSending, setEmailSending] = useState<Record<string, boolean>>({});
  const [deliveryBusy, setDeliveryBusy] = useState<Record<string, 'resend' | 'verify' | null>>({});
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState('');
  const [data, setData] = useState<StoreData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportingOrders, setExportingOrders] = useState(false);
  const [activeTab, setActiveTab] = useState<'orders' | 'returns' | 'product-feedback' | 'inventory' | 'reports'>('orders');
  const [message, setMessage] = useState('');
  const supabase = getSupabaseBrowserClient();
  const supabaseConfigIssue = getSupabaseBrowserConfigIssue();

  async function load(accessToken = token) {
    if (!accessToken) {
      setMessage('Your sign-in session is missing. Please sign out and sign in again.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/store', {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + accessToken },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error || `Could not load store operations (HTTP ${response.status}).`);
        return;
      }
      if (!result || !Array.isArray(result.products) || !Array.isArray(result.orders) || !Array.isArray(result.returns) || !Array.isArray(result.lowStock) || !Array.isArray(result.reviews) || !Array.isArray(result.inventoryHistory)) {
        setMessage('The store service returned incomplete data. Please retry or check the deployment logs.');
        return;
      }
      setData(result);
    } catch (error) {
      console.error('Store dashboard load failed:', error);
      setMessage('Unable to reach the store service. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const allowedTabs = ['orders', 'returns', 'product-feedback', 'inventory', 'reports'];
    const syncTabFromHash = () => {
      const requestedTab = window.location.hash.replace(/^#/, '');
      if (allowedTabs.includes(requestedTab)) setActiveTab(requestedTab as typeof activeTab);
    };
    syncTabFromHash();
    window.addEventListener('hashchange', syncTabFromHash);
    return () => window.removeEventListener('hashchange', syncTabFromHash);
  }, []);

  function selectTab(tab: typeof activeTab) {
    setActiveTab(tab);
    window.history.replaceState(null, '', '#' + tab);
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
    if (!supabase) { setMessage(supabaseConfigIssue || 'Supabase authentication is not configured.'); return; }
    const { data: sessionData, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setMessage(error.message); return; }
    if (sessionData.session) {
      setUser(sessionData.session.user);
      setToken(sessionData.session.access_token);
      await load(sessionData.session.access_token);
    }
  }

  async function updateOrder(id: string, status: string) {
    let shipment: Record<string, string> = {};
    if (status === 'shipped') {
      const current = data?.orders.find(item => item.id === id);
      const shippingProvider = (prompt('Courier / delivery partner name:', current?.shipping_provider || '') || '').trim();
      if (!shippingProvider) { setMessage('Courier or delivery partner name is required before shipping.'); return; }
      const trackingNumber = (prompt('Courier AWB / tracking number:', current?.tracking_number || '') || '').trim();
      if (!trackingNumber) { setMessage('Courier tracking number is required before shipping.'); return; }
      const trackingUrl = (prompt('Courier tracking URL (optional):', current?.tracking_url || '') || '').trim();
      if (trackingUrl && !/^https?:\/\//i.test(trackingUrl)) { setMessage('Tracking URL must start with https:// or http://.'); return; }
      const expectedDeliveryDate = (prompt('Expected delivery date (YYYY-MM-DD, optional):', current?.expected_delivery_date || '') || '').trim();
      if (expectedDeliveryDate && !/^\d{4}-\d{2}-\d{2}$/.test(expectedDeliveryDate)) { setMessage('Expected delivery date must use YYYY-MM-DD.'); return; }
      shipment = { shippingProvider, trackingNumber, trackingUrl, expectedDeliveryDate };
    }
    const response = await fetch('/api/admin/orders/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ status, ...shipment }),
    });
    const result = await response.json();
    setMessage(response.ok ? (result.message || result.emailWarning || (result.emailSent === false ? 'Order status saved, but notification email was not sent.' : 'Order updated successfully.')) : result.error || 'Update failed.');
    if (response.ok) load();
  }

  async function resendConfirmation(id: string) {
    setEmailSending(current => ({ ...current, [id]: true }));
    setMessage('');
    try {
      const response = await fetch('/api/admin/orders/' + id + '/confirmation', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });
      const result = await response.json().catch(() => ({}));
      setMessage(response.ok ? (result.message || 'Confirmation email sent.') : result.error || 'Confirmation email could not be sent.');
    } catch {
      setMessage('Unable to reach the email service. Please retry.');
    } finally {
      setEmailSending(current => ({ ...current, [id]: false }));
    }
  }

  async function exportOrders() {
    if (!token || exportingOrders) return;
    setExportingOrders(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/orders/export', {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', Authorization: 'Bearer ' + token },
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setMessage(result.error || 'Order export failed. Please retry.');
        return;
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || 'durgamma-orders.xlsx';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage('Excel workbook exported successfully with a separate worksheet for each order date.');
    } catch (error) {
      console.error('Order export failed:', error);
      setMessage('Unable to export orders. Check your connection and try again.');
    } finally {
      setExportingOrders(false);
    }
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

  async function updateReturn(id: string, status: string, orderTotal?: number, correctMistakenExchange = false) {
    const note = prompt('Optional note for the customer') || '';
    let refundReference: string | undefined;
    let refundMethod: string | undefined;
    let refundAmount: number | undefined;
    if (status === 'refunded') {
      refundReference = prompt('Enter the actual UPI/bank transfer reference (required):') || '';
      if (refundReference.trim().length < 4) { setMessage('Refund not recorded. Complete the actual transfer and enter its reference.'); return; }
      refundMethod = prompt('Refund method: upi, bank_transfer, cash, or original_payment_method', 'upi') || '';
      refundAmount = Number(prompt('Actual refund amount in INR:', String(orderTotal || '')) || 0);
      if (!['upi','bank_transfer','cash','original_payment_method'].includes(refundMethod) || !Number.isInteger(refundAmount) || refundAmount < 1 || (orderTotal && refundAmount > orderTotal)) { setMessage('Enter a valid refund method and amount.'); return; }
    }
    const response = await fetch('/api/admin/returns/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ status, note, refundReference, refundMethod, refundAmount, correctMistakenExchange }),
    });
    const result = await response.json();
    setMessage(response.ok ? (result.emailWarning || (result.emailSent === false ? 'Return updated, but customer email was not sent.' : 'Return request updated.')) : result.error || 'Return update failed.');
    if (response.ok) load();
  }


  async function deliveryAction(id: string, action: 'resend' | 'verify', orderNumber?: string) {
    if (deliveryBusy[id]) return;
    const otp = (deliveryCodes[id] || '').trim();
    if (action === 'verify' && !/^\d{6}$/.test(otp)) {
      setMessage('Enter the exact 6-digit OTP received by the customer before verifying delivery.');
      return;
    }
    setDeliveryBusy(current => ({ ...current, [id]: action }));
    setMessage(action === 'resend' ? 'Requesting a new delivery OTP email…' : 'Verifying the customer OTP…');
    try {
      // Use the customer-facing order number for delivery actions. The API also accepts UUIDs,
      // but this keeps the admin action tied to the exact order displayed in this row.
      const routeOrderId = encodeURIComponent(orderNumber || id);
      const response = await fetch('/api/admin/orders/' + routeOrderId + '/delivery', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(action === 'resend' ? { action } : { action, otp }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) {
        const detail = result.error || result.warning || `Delivery action failed (HTTP ${response.status}).`;
        const lookupDetails = result.diagnostics ? ' [Lookup diagnostics: ' + JSON.stringify(result.diagnostics) + ']' : '';
        setMessage(detail + (result.emailReason ? ' [Email: ' + result.emailReason + ']' : '') + lookupDetails);
        return;
      }
      if (action === 'resend') {
        setMessage(result.emailSent
          ? 'Email provider accepted the new OTP email for ' + (data?.orders.find(order => order.id === id)?.email || 'the customer') + '. Ask the customer to check Inbox, Spam and Promotions.'
          : result.warning || 'The OTP email was not sent. Check the email provider configuration.');
      } else {
        setMessage(result.emailSent === false
          ? 'Delivery was verified and marked delivered, but the delivered confirmation email was not sent: ' + (result.warning || 'check email settings.')
          : 'Delivery verified successfully. Order marked Delivered.');
        setDeliveryCodes(current => ({ ...current, [id]: '' }));
        await load();
      }
    } catch (error) {
      console.error('Delivery action failed:', error);
      setMessage('Could not reach the delivery service. Check your connection and deployment, then retry. The order has not been assumed delivered.');
    } finally {
      setDeliveryBusy(current => ({ ...current, [id]: null }));
    }
  }

  async function moderateReview(id: string, status: 'approved' | 'rejected') {
    const response = await fetch('/api/admin/reviews/' + id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ status }),
    });
    const result = await response.json().catch(() => ({}));
    setMessage(response.ok ? 'Product feedback ' + status + '.' : result.error || 'Could not update feedback.');
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
        {(message || supabaseConfigIssue) && <p className="admin-message" role="alert">{message || supabaseConfigIssue} {supabaseConfigIssue && 'Add the missing variables to your hosting environment and redeploy.'}</p>}
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
      <nav className="admin-top-nav" aria-label="Store administration tabs" role="tablist">
        <button type="button" role="tab" aria-selected={activeTab === 'orders'} className={activeTab === 'orders' ? 'admin-tab-button active' : 'admin-tab-button'} onClick={() => selectTab('orders')}>Orders</button>
        <button type="button" role="tab" aria-selected={activeTab === 'returns'} className={activeTab === 'returns' ? 'admin-tab-button active admin-top-nav-returns' : 'admin-tab-button'} onClick={() => selectTab('returns')}>Returns &amp; exchanges <span>{data?.returns.filter(item => item.status === 'requested').length || 0} new</span></button>
        <button type="button" role="tab" aria-selected={activeTab === 'product-feedback'} className={activeTab === 'product-feedback' ? 'admin-tab-button active' : 'admin-tab-button'} onClick={() => selectTab('product-feedback')}>Product feedback</button>
        <button type="button" role="tab" aria-selected={activeTab === 'inventory'} className={activeTab === 'inventory' ? 'admin-tab-button active' : 'admin-tab-button'} onClick={() => selectTab('inventory')}>Inventory</button>
        <button type="button" role="tab" aria-selected={activeTab === 'reports'} className={activeTab === 'reports' ? 'admin-tab-button active' : 'admin-tab-button'} onClick={() => selectTab('reports')}>Reports</button>
        <Link href="/admin/products">Products</Link>
      </nav>
      <div className="admin-header-actions"><button onClick={() => load()}>Refresh</button><button onClick={signOut}>Sign out</button></div>
    </header>
    {message && <p className="admin-message" role="status">{message}</p>}
    {loading && <p role="status">Loading store operations…</p>}
    {!data && !loading && message && <section className="admin-section"><button onClick={() => load()}>Try again</button></section>}
    {!data && !loading && !message && <p>Store operations are ready to load. <button onClick={() => load()}>Load dashboard</button></p>}
    {data && <>
      {activeTab === 'reports' && <section className="admin-section" id="reports" role="tabpanel" aria-label="Reports">
        <h2>Reports &amp; store overview</h2>
        <div className="admin-stats">
          <div><span>Orders</span><b>{data.orders.length}</b></div>
          <div><span>Order value</span><b>₹{orderValue.toLocaleString('en-IN')}</b></div>
          <div><span>Low stock</span><b>{data.lowStock.length}</b></div>
          <div><span>Open returns</span><b>{data.returns.filter(item => item.status === 'requested').length}</b></div>
        </div>
        <StoreAnalytics token={token} />
      </section>}


      {activeTab === 'orders' && <section className="admin-section" id="orders" role="tabpanel" aria-label="orders">
        <div className="admin-section-heading"><h2>Orders</h2><button type="button" onClick={exportOrders} disabled={exportingOrders}>{exportingOrders ? 'EXPORTING…' : 'EXPORT ALL ORDERS (EXCEL)'}</button></div>
        <div className="admin-table admin-orders-table">
          <div className="admin-orders-columns" aria-hidden="true"><span>ORDER / CUSTOMER</span><span>AMOUNT</span><span>STATUS</span><span>ACTION</span></div>
          {data.orders.map(order => {
            const nextStatuses = order.order_status === 'pending' ? ['confirmed', 'cancelled']
              : order.order_status === 'confirmed' ? ['packed', 'cancelled']
              : order.order_status === 'packed' ? ['shipped', 'cancelled']
              : [];
            return <article className="admin-order-card" key={order.id}>
              <div className="admin-order-row">
                <div className="admin-order-customer"><b>{order.order_number}</b><small>{order.customer_name} · {order.email}</small></div>
                <div className="admin-order-amount">₹{Number(order.total_inr).toLocaleString('en-IN')}</div>
                <div className="admin-order-status"><select aria-label={'Status for ' + order.order_number} value={order.order_status} disabled={!nextStatuses.length} onChange={event => updateOrder(order.id, event.target.value)}>
                  <option value={order.order_status}>{order.order_status[0].toUpperCase() + order.order_status.slice(1)}</option>
                  {nextStatuses.map(status => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
                </select></div>
                <div className="admin-order-actions">{order.order_status === 'pending'
                  ? <button disabled={!!emailSending[order.id]} onClick={() => resendConfirmation(order.id)}>{emailSending[order.id] ? 'SENDING…' : 'RESEND CONFIRMATION'}</button>
                  : <span className="admin-order-no-action">—</span>}</div>
              </div>
              {order.order_status === 'shipped' && <div className="admin-delivery-verify">
                <small>{order.shipping_provider || 'Courier not recorded'} · {order.tracking_number || 'No AWB'}{order.expected_delivery_date ? ' · ETA ' + order.expected_delivery_date : ''}</small>
                <button onClick={() => updateOrder(order.id, 'shipped')}>Update tracking</button>
                <input aria-label={'Delivery OTP for ' + order.order_number} inputMode="numeric" maxLength={6} placeholder="6-digit customer OTP" value={deliveryCodes[order.id] || ''} onChange={event => { setMessage(''); setDeliveryCodes(current => ({ ...current, [order.id]: event.target.value.replace(/\D/g, '').slice(0, 6) })); }}/>
                <button disabled={!!deliveryBusy[order.id] || (deliveryCodes[order.id] || '').length !== 6} onClick={() => deliveryAction(order.id, 'verify', order.order_number)}>{deliveryBusy[order.id] === 'verify' ? 'VERIFYING…' : 'Verify & deliver'}</button>
                <button disabled={!!deliveryBusy[order.id]} onClick={() => deliveryAction(order.id, 'resend', order.order_number)}>{deliveryBusy[order.id] === 'resend' ? 'SENDING OTP…' : 'Resend OTP'}</button>
              </div>}
            </article>;
          })}
          {!data.orders.length && <p>No orders have been placed yet.</p>}
        </div>
      </section>}

      {activeTab === 'returns' && <section className="admin-section" id="returns" role="tabpanel" aria-label="returns">
        <h2>Returns &amp; exchanges</h2>
        <p>Customer requests must be made within 7 days of delivery. Items must be unused, unwashed, unaltered and undamaged, with original tags and packaging. Approve only after eligibility review; mark received after inspection. For a refund, complete the actual transfer first, then record its reference, method and amount. This dashboard records the refund; it does not transfer money automatically.</p>
        <div className="admin-table">
          {data.returns.length ? data.returns.map((item: any) => <div className="admin-row" key={item.id}>
            <span>
              <b>{item.orders?.order_number || 'Order'} · {(item.request_type || 'return').toUpperCase()}</b>
              <small>{item.order_items?.product_name ? item.order_items.product_name + ' · Size ' + item.order_items.size + ' · Qty ' + item.order_items.quantity + ' · ' : ''}{item.reason} · {item.orders?.customer_name || 'Customer'} · {new Date(item.created_at).toLocaleDateString('en-IN')}</small>
            </span>
            <span>
              <b>{item.status.toUpperCase()}</b>
              {item.status === 'requested' && <>
                <button onClick={() => updateReturn(item.id, 'approved')}>Approve</button>
                <button onClick={() => updateReturn(item.id, 'rejected')}>Reject</button>
              </>}
              {item.status === 'approved' && <button onClick={() => updateReturn(item.id, 'received')}>Mark received</button>}
              {item.status === 'received' && (item.request_type === 'return'
                ? <button onClick={() => updateReturn(item.id, 'refunded', Number(item.order_items?.line_total_inr || item.orders?.total_inr || 0))}>Record manual refund</button>
                : <button onClick={() => updateReturn(item.id, 'exchanged')}>Record exchange completed</button>)}
              {item.status === 'exchanged' && item.request_type === 'return' &&
                <button onClick={() => updateReturn(item.id, 'received', undefined, true)}>Correct mistaken status → RECEIVED</button>}
            </span>
          </div>) : <p>No return or exchange requests yet.</p>}
        </div>
      </section>}

      {activeTab === 'product-feedback' && <section className="admin-section" id="product-feedback" role="tabpanel" aria-label="product-feedback">
        <h2>Product feedback &amp; reviews</h2>
        <p>Only reviews linked to delivered purchases are accepted. Approve genuine feedback to publish it on the product; reject inappropriate or unrelated submissions.</p>
        <div className="admin-table">
          {data.reviews.length ? data.reviews.map((review: any) => <div className="admin-row" key={review.id}>
            <span><b>{review.products?.name || 'Product'} · {'★'.repeat(review.rating)}{'☆'.repeat(5-review.rating)}</b><small>{review.title} · {review.body} · {review.customer_name} · {review.orders?.order_number || 'Verified order'} · {new Date(review.created_at).toLocaleDateString('en-IN')}</small></span>
            <span><b>{review.status.toUpperCase()}</b>{review.status === 'pending' && <><button onClick={() => moderateReview(review.id,'approved')}>Approve &amp; publish</button><button onClick={() => moderateReview(review.id,'rejected')}>Reject</button></>}</span>
          </div>) : <p>No product feedback submitted yet.</p>}
        </div>
      </section>}

      {activeTab === 'inventory' && <section className="admin-section" id="inventory" role="tabpanel" aria-label="inventory">
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
        <h3>Recent stock adjustments</h3>
        <p>Owner-only audit history showing who changed stock, when it changed and the recorded reason.</p>
        {data.inventoryHistoryWarning && <p className="admin-message" role="status">{data.inventoryHistoryWarning}</p>}
        <div className="admin-table">
          {data.inventoryHistory.length ? data.inventoryHistory.map((entry: any) => <div className="admin-row" key={entry.id}>
            <span><b>{entry.product_variants?.products?.name || 'Product'} · {entry.product_variants?.sku || 'SKU unavailable'}</b><small>{entry.product_variants?.size || 'Size'} · {entry.product_variants?.colour || 'Colour'} · {entry.reason}</small></span>
            <span><b>{entry.previous_stock} → {entry.new_stock}</b><small>{entry.adjusted_by} · {new Date(entry.created_at).toLocaleString('en-IN')}</small></span>
          </div>) : <p>No stock adjustments have been recorded yet.</p>}
        </div>
      </section>}

    </>}
  </main>;
}
