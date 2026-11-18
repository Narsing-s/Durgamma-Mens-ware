'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowRight, PackageCheck, RefreshCw, ShoppingBag, Truck, RotateCcw, WalletCards } from 'lucide-react';

type Order = {
  id: string;
  order_number: string;
  order_status: string;
  payment_status: string;
  total_inr: number;
  created_at: string;
  shipping_provider: string | null;
  tracking_number: string | null;
  tracking_url?: string | null;
  expected_delivery_date: string | null;
  order_items: Array<{ id: string; product_name: string; size: string; colour: string; quantity: number; line_total_inr: number }>;
  return_requests: Array<{ id: string; status: string; request_type: string; created_at: string }>;
};

type Filter = 'all' | 'active' | 'delivered' | 'returns';
const money = (value: number) => '₹' + Number(value || 0).toLocaleString('en-IN');
const titleCase = (value: string) => (value || 'unknown').replace(/_/g, ' ').replace(/\\b\\w/g, (letter) => letter.toUpperCase());
const activeStatus = (status: string) => !['delivered', 'cancelled', 'refunded'].includes(status.toLowerCase());

const panel: React.CSSProperties = { border: '1px solid #e9e2d7', borderRadius: 13, background: '#fff', padding: 16 };
const muted: React.CSSProperties = { color: '#81796d', fontSize: 12 };

export default function CustomerOrderHistory({ supabase }: { supabase: SupabaseClient | null }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); setError('Customer order history is not configured.'); return; }
    setLoading(true); setError('');
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sign in again to view your orders.');
      const response = await fetch('/api/account/orders', { cache: 'no-store', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not load your orders.');
      setOrders(Array.isArray(result.orders) ? result.orders : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load your orders.');
    } finally { setLoading(false); }
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  const stats = useMemo(() => ({
    total: orders.length,
    active: orders.filter((order) => activeStatus(order.order_status)).length,
    delivered: orders.filter((order) => order.order_status.toLowerCase() === 'delivered').length,
    returns: orders.reduce((count, order) => count + order.return_requests.length, 0),
  }), [orders]);

  const visibleOrders = useMemo(() => orders.filter((order) => {
    if (filter === 'active') return activeStatus(order.order_status);
    if (filter === 'delivered') return order.order_status.toLowerCase() === 'delivered';
    if (filter === 'returns') return order.return_requests.length > 0;
    return true;
  }), [orders, filter]);

  const filters: Array<{ id: Filter; label: string }> = [
    { id: 'all', label: 'All orders' }, { id: 'active', label: 'In progress' },
    { id: 'delivered', label: 'Delivered' }, { id: 'returns', label: 'Returns & exchanges' },
  ];

  return (
    <section aria-labelledby="customer-orders-heading" style={{ marginTop: 28, borderTop: '1px solid #eee8de', paddingTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <p style={{ color: '#92784c', fontSize: 10, fontWeight: 800, letterSpacing: '.16em', margin: 0 }}>YOUR PURCHASES</p>
          <h3 id="customer-orders-heading" style={{ fontFamily: 'Georgia,serif', fontSize: 29, fontWeight: 400, margin: '5px 0 0' }}>Your order dashboard</h3>
          <p style={{ ...muted, margin: '5px 0 0' }}>A clear view of your purchases and delivery progress.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh order history" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid #ded8cc', background: '#fff', borderRadius: 8, padding: '10px 12px', color: '#514b40', fontSize: 11, fontWeight: 800, cursor: loading ? 'wait' : 'pointer' }}>
          <RefreshCw size={14} /> {loading ? 'UPDATING' : 'REFRESH'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10, marginBottom: 18 }}>
        {[
          { label: 'Total orders', value: stats.total, icon: ShoppingBag },
          { label: 'In progress', value: stats.active, icon: Truck },
          { label: 'Delivered', value: stats.delivered, icon: PackageCheck },
          { label: 'Returns / exchanges', value: stats.returns, icon: RotateCcw },
        ].map((item) => {
          const Icon = item.icon;
          return <div key={item.label} style={{ ...panel, padding: '14px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 5, color: '#92784c' }}><Icon size={17}/><span style={{ fontSize: 10, color: '#928a7d', textAlign: 'right' }}>{item.label}</span></div>
            <strong style={{ display: 'block', fontSize: 25, fontWeight: 600, marginTop: 9, color: '#24211c' }}>{loading ? '—' : item.value}</strong>
          </div>;
        })}
      </div>

      <div role="tablist" aria-label="Filter orders" style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 9, marginBottom: 8 }}>
        {filters.map((item) => <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} onClick={() => setFilter(item.id)} style={{ flex: '0 0 auto', border: filter === item.id ? '1px solid #9b7d4b' : '1px solid #e5ded2', borderRadius: 30, background: filter === item.id ? '#29251e' : '#fff', color: filter === item.id ? '#fff' : '#625b50', padding: '9px 13px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{item.label}</button>)}
      </div>

      {loading ? <p role="status" style={{ ...muted, padding: '22px 0' }}>Loading your latest orders…</p> : error ? (
        <div role="alert" style={{ color: '#9c3830', background: '#fff0ed', borderRadius: 9, padding: 14, fontSize: 12, lineHeight: 1.6 }}>{error}<button type="button" onClick={() => void load()} style={{ display: 'block', marginTop: 9, border: 0, background: 'none', color: '#8d392f', fontWeight: 800, padding: 0 }}>TRY AGAIN</button></div>
      ) : visibleOrders.length === 0 ? (
        <div style={{ background: '#faf8f4', border: '1px dashed #ded5c7', borderRadius: 12, padding: 24, textAlign: 'center', marginTop: 8 }}>
          <PackageCheck size={27} color="#92784c" />
          <p style={{ color: '#514b40', fontWeight: 700, margin: '10px 0 5px' }}>{orders.length === 0 ? 'Your first order is waiting' : 'Nothing in this section yet'}</p>
          <p style={{ color: '#777166', fontSize: 12, lineHeight: 1.6, margin: '0 auto 14px', maxWidth: 310 }}>{orders.length === 0 ? 'Orders placed with this verified email address will appear here.' : 'Try another filter to see your order activity.'}</p>
          {orders.length === 0 && <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#8d7040', fontSize: 11, fontWeight: 800, textDecoration: 'none' }}>EXPLORE THE COLLECTION <ArrowRight size={14}/></Link>}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 13, marginTop: 8 }}>
          {visibleOrders.map((order) => (
            <article key={order.id} style={{ border: '1px solid #e8e1d5', borderRadius: 12, padding: 16, background: '#fff', boxShadow: '0 5px 18px rgba(36,31,22,.035)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div><p style={{ margin: 0, color: '#24211c', fontSize: 13, fontWeight: 800 }}>ORDER {order.order_number}</p><p style={{ margin: '5px 0 0', ...muted }}>{new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>
                <span style={{ borderRadius: 30, padding: '7px 11px', background: order.order_status === 'delivered' ? '#edf5ed' : order.order_status === 'cancelled' ? '#fff0ed' : '#f4efe5', color: '#514b40', fontSize: 10, fontWeight: 800 }}>{titleCase(order.order_status)}</span>
              </div>
              <div style={{ borderTop: '1px solid #f0ece5', marginTop: 13, paddingTop: 11 }}>
                {order.order_items.map((item) => <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', color: '#514b40', fontSize: 12 }}><span style={{ minWidth: 0 }}>{item.product_name}<span style={{ display: 'block', color: '#8a8276', fontSize: 11, marginTop: 3 }}>{item.size}{item.colour && item.colour !== 'Default' ? ' · ' + item.colour : ''} · Qty {item.quantity}</span></span><strong style={{ flex: '0 0 auto' }}>{money(item.line_total_inr)}</strong></div>)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderTop: '1px solid #f0ece5', marginTop: 9, paddingTop: 12 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#777166', fontSize: 11 }}><WalletCards size={14}/> Payment: {titleCase(order.payment_status)}</span>
                <strong style={{ fontSize: 16, color: '#24211c' }}>Total {money(order.total_inr)}</strong>
              </div>
              {order.expected_delivery_date && <p style={{ ...muted, margin: '9px 0 0' }}>Expected delivery: {new Date(order.expected_delivery_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
              {order.return_requests.length > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#faf7f0', borderRadius: 8, padding: '9px 10px', marginTop: 11, color: '#795f37', fontSize: 11 }}><RotateCcw size={14}/>{titleCase(order.return_requests[0].request_type)} request · {titleCase(order.return_requests[0].status)}</div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 13 }}>
                <span style={{ color: '#777166', fontSize: 11 }}>{order.tracking_number ? (order.shipping_provider || 'Courier') + ' · ' + order.tracking_number : 'View tracking for the latest delivery updates'}</span>
                <Link href="/track" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#8d7040', fontSize: 11, fontWeight: 800, textDecoration: 'none' }}>TRACK ORDER <ArrowRight size={13}/></Link>
              </div>
              {order.tracking_url && <a href={order.tracking_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 9, color: '#8d7040', fontSize: 11, fontWeight: 700 }}>OPEN COURIER TRACKING ↗</a>}
            </article>
          ))}
        </div>
      )}
      <style>{'@media(max-width:560px){.customer-dashboard-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}'}</style>
    </section>
  );
}
