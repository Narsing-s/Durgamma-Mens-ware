'use client';

import { useEffect, useMemo, useState } from 'react';

type Analytics = {
  periodDays: number;
  summary: {
    orders: number;
    realized_sales_inr: number;
    delivered_orders: number;
    active_orders: number;
    pipeline_value_inr: number;
    average_order_value_inr: number;
  };
  dailySales: { day: string; orders: number; sales_inr: number }[];
  topProducts: { name: string; units: number; ordered_value_inr: number }[];
};

const money = (value: number) => '₹' + Number(value || 0).toLocaleString('en-IN');

export default function StoreAnalytics({ token }: { token: string }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetch('/api/admin/analytics?days=' + days, {
      cache: 'no-store',
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
    })
      .then(async response => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Analytics could not be loaded.');
        return result as Analytics;
      })
      .then(result => { if (active) setData(result); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Analytics could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days, token]);

  const maxSales = useMemo(() => Math.max(1, ...(data?.dailySales || []).map(item => item.sales_inr)), [data]);
  const recentDays = (data?.dailySales || []).slice(-14);

  return (
    <section className="admin-section" aria-labelledby="advanced-analytics-title">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}}>
        <div><h2 id="advanced-analytics-title">Sales intelligence</h2><p>Server-calculated figures across all orders in the selected period. Sales means delivered orders only.</p></div>
        <label>Period{' '}
          <select aria-label="Analytics period" value={days} onChange={event => setDays(Number(event.target.value))}>
            <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
          </select>
        </label>
      </div>
      {loading && <p role="status">Loading sales analytics…</p>}
      {error && <p className="admin-message" role="alert">{error}</p>}
      {data && !loading && <>
        <div className="admin-stats">
          <div><span>Delivered sales</span><b>{money(data.summary.realized_sales_inr)}</b></div>
          <div><span>Orders in period</span><b>{data.summary.orders}</b></div>
          <div><span>Average order value</span><b>{money(data.summary.average_order_value_inr)}</b></div>
          <div><span>Active pipeline</span><b>{money(data.summary.pipeline_value_inr)}</b></div>
        </div>
        <h3>Daily delivered sales · last {Math.min(14, recentDays.length)} active days</h3>
        {recentDays.length ? <div role="img" aria-label="Bar chart of delivered sales by day" style={{display:"grid",gridTemplateColumns:"repeat(14,minmax(0,1fr))",gap:8,alignItems:"end",minHeight:150,overflowX:"auto"}}>
          {recentDays.map(item => <div key={item.day} title={item.day + ': ' + money(item.sales_inr)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,minWidth:0,height:150}}>
            <div style={{height:125,width:"100%",display:"flex",alignItems:"end",background:"var(--admin-panel,#f1eee8)",borderRadius:6,overflow:"hidden"}}><span style={{display:"block",width:"100%",height:Math.max(3,item.sales_inr/maxSales*100)+"%",background:"var(--admin-accent,#b89454)",borderRadius:"6px 6px 0 0"}} /></div>
            <small>{item.day.slice(5)}</small>
          </div>)}
        </div> : <p>No orders recorded in this period yet.</p>}
        <h3>Best-selling products</h3>
        {data.topProducts.length ? <div className="admin-table">
          {data.topProducts.map((product, index) => <div className="admin-row" key={product.name}>
            <span><b>{index + 1}. {product.name}</b><small>{product.units} units ordered</small></span>
            <b>{money(product.ordered_value_inr)}</b>
          </div>)}
        </div> : <p>No product sales recorded in this period yet.</p>}
        <small>Sales exclude cancelled orders and count only delivered orders. Pipeline is pending, confirmed, packed and shipped order value. Figures are operational summaries, not tax or accounting statements.</small>
      </>}
    </section>
  );
}
