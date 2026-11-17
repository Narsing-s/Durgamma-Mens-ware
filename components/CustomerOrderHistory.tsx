'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowRight, PackageCheck, RefreshCw } from 'lucide-react';

type Order = {
  id: string;
  order_number: string;
  order_status: string;
  payment_status: string;
  total_inr: number;
  created_at: string;
  shipping_provider: string | null;
  tracking_number: string | null;
  expected_delivery_date: string | null;
  order_items: Array<{ id: string; product_name: string; size: string; colour: string; quantity: number; line_total_inr: number }>;
  return_requests: Array<{ id: string; status: string; request_type: string; created_at: string }>;
};

const money = (value: number) => '₹' + Number(value || 0).toLocaleString('en-IN');
const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function CustomerOrderHistory({ supabase }: { supabase: SupabaseClient | null }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); setError('Customer order history is not configured.'); return; }
    setLoading(true); setError('');
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sign in again to view your orders.');
      const response = await fetch('/api/account/orders', {
        cache: 'no-store',
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not load your orders.');
      setOrders(Array.isArray(result.orders) ? result.orders : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load your orders.');
    } finally { setLoading(false); }
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section aria-labelledby="customer-orders-heading" style={{ marginTop: 28, borderTop: '1px solid #eee8de', paddingTop: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p style={{ color: '#92784c', fontSize: 10, fontWeight: 800, letterSpacing: '.15em', margin: 0 }}>YOUR PURCHASES</p>
          <h3 id="customer-orders-heading" style={{ fontFamily: 'Georgia,serif', fontSize: 25, fontWeight: 400, margin: '6px 0 0' }}>Order history</h3>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh order history" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid #ded8cc', background: '#fff', borderRadius: 7, padding: '9px 11px', color: '#514b40', fontSize: 11, fontWeight: 700, cursor: loading ? 'wait' : 'pointer' }}>
          <RefreshCw size={14} /> REFRESH
        </button>
      </div>
      {loading ? <p role="status" style={{ color: '#777166', fontSize: 13, padding: '18px 0' }}>Loading your orders…</p> : error ? (
        <p role="alert" style={{ color: '#9c3830', background: '#fff0ed', borderRadius: 8, padding: 12, fontSize: 12, lineHeight: 1.6 }}>{error}</p>
      ) : orders.length === 0 ? (
        <div style={{ background: '#faf8f4', borderRadius: 9, padding: 18, marginTop: 16 }}>
          <PackageCheck size={22} color="#92784c" />
          <p style={{ color: '#514b40', fontWeight: 700, margin: '10px 0 5px' }}>No orders found yet</p>
          <p style={{ color: '#777166', fontSize: 12, lineHeight: 1.6, margin: '0 0 12px' }}>Orders placed with this verified email address will appear here.</p>
          <Link href="/" style={{ color: '#8d7040', fontSize: 12, fontWeight: 800, textDecoration: 'none' }}>EXPLORE THE COLLECTION <ArrowRight size={13} style={{ verticalAlign: 'middle' }} /></Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          {orders.map((order) => (
            <article key={order.id} style={{ border: '1px solid #e8e1d5', borderRadius: 9, padding: 14, background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <p style={{ margin: 0, color: '#171713', fontSize: 13, fontWeight: 800 }}>{order.order_number}</p>
                  <p style={{ margin: '5px 0 0', color: '#777166', fontSize: 11 }}>{new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
                <span style={{ alignSelf: 'flex-start', borderRadius: 20, padding: '6px 9px', background: order.order_status === 'delivered' ? '#edf5ed' : order.order_status === 'cancelled' ? '#fff0ed' : '#f4efe5', color: '#514b40', fontSize: 10, fontWeight: 800 }}>{titleCase(order.order_status)}</span>
              </div>
              <div style={{ borderTop: '1px solid #f0ece5', marginTop: 12, paddingTop: 10 }}>
                {order.order_items.map((item) => <p key={item.id} style={{ margin: '4px 0', color: '#514b40', fontSize: 12 }}>{item.product_name} · {item.size}{item.colour && item.colour !== 'Default' ? ' / ' + item.colour : ''} × {item.quantity} <strong style={{ float: 'right' }}>{money(item.line_total_inr)}</strong></p>)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, borderTop: '1px solid #f0ece5', marginTop: 10, paddingTop: 11 }}>
                <span style={{ color: '#777166', fontSize: 11 }}>Payment: {titleCase(order.payment_status)}</span>
                <strong style={{ fontSize: 14 }}>{money(order.total_inr)}</strong>
              </div>
              {order.return_requests.length > 0 && <p style={{ color: '#8d7040', fontSize: 11, margin: '10px 0 0' }}>Latest return/exchange: {titleCase(order.return_requests[0].status)}</p>}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                <span style={{ color: '#777166', fontSize: 11 }}>{order.tracking_number ? (order.shipping_provider || 'Courier') + ' · ' + order.tracking_number : 'Order updates are shown in secure tracking.'}</span>
                <Link href="/track" style={{ color: '#8d7040', fontSize: 11, fontWeight: 800, textDecoration: 'none' }}>TRACK ORDER <ArrowRight size={13} style={{ verticalAlign: 'middle' }} /></Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
