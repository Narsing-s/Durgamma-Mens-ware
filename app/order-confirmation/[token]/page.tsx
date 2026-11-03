'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, XCircle, LoaderCircle, ShieldCheck } from 'lucide-react';

export default function OrderConfirmationPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{status:'confirmed'|'cancelled';orderNumber:string}|null>(null);
  const [error, setError] = useState('');

  async function decide(action: 'confirm'|'cancel') {
    if (busy || result) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/orders/confirmation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update your order.');
      setResult({ status: data.status, orderNumber: data.orderNumber });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your order.');
    } finally { setBusy(false); }
  }

  return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,background:'#f7f5f0',color:'#24211d'}}>
    <section style={{width:'100%',maxWidth:520,background:'#fff',padding:32,border:'1px solid #e7e0d4',textAlign:'center'}}>
      <p style={{letterSpacing:3,color:'#987b4e',fontSize:12}}>DURGAMMA MENSWEAR</p>
      {result ? <>
        {result.status==='confirmed'?<CheckCircle2 size={42} color="#32835b"/>:<XCircle size={42} color="#a34c45"/>}
        <h1>{result.status==='confirmed'?'Order confirmed':'Order cancelled'}</h1>
        <p>Order <strong>{result.orderNumber}</strong> is now {result.status}.</p>
        <p>{result.status==='confirmed'?'The store can now prepare your order.':'The order will not be prepared and the reserved stock has been released.'}</p>
        <a href="/" style={{display:'inline-block',marginTop:16,color:'#987b4e'}}>RETURN TO STORE</a>
      </> : <>
        <ShieldCheck size={40} color="#987b4e"/>
        <h1>Review your order</h1>
        <p>Choose one option below. This secure link can only be used once and expires after 24 hours.</p>
        {error&&<p role="alert" style={{color:'#a34c45'}}>{error}</p>}
        <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap',marginTop:24}}>
          <button disabled={busy} onClick={()=>decide('confirm')} style={{padding:'13px 20px',background:'#987b4e',color:'#fff',border:0,cursor:'pointer'}}>{busy?<LoaderCircle size={16}/>: 'CONFIRM ORDER'}</button>
          <button disabled={busy} onClick={()=>decide('cancel')} style={{padding:'13px 20px',background:'#fff',color:'#8b3e38',border:'1px solid #c9aaa5',cursor:'pointer'}}>CANCEL ORDER</button>
        </div>
      </>}
    </section>
  </main>;
}
