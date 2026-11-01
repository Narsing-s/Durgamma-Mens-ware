'use client';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, X, ShieldCheck, LoaderCircle } from 'lucide-react';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, callback: (response: any) => void) => void };
  }
}

type CartLine={product:{id:string;name:string;price:number;image:string};size:string;colour?:string;quantity:number;variantId?:string};
type Variant={id:string;size:string;stock:number;colour:string};
type CatalogProduct={id:string;name:string;price_inr:number;product_variants:Variant[]};
type Props={items:CartLine[];onClose:()=>void;onSuccess:()=>void};
type PaymentMethod='cod'|'online';
const money=(n:number)=>'₹'+n.toLocaleString('en-IN');
const clean=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

async function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return true;
  const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout]');
  if (existing) {
    await new Promise<void>((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Payment window could not be loaded.')), { once: true });
    });
    return Boolean(window.Razorpay);
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.razorpayCheckout = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Payment window could not be loaded. Check your connection and retry.'));
    document.body.appendChild(script);
  });
  return Boolean(window.Razorpay);
}

export default function Checkout({items,onClose,onSuccess}:Props){
 const [catalog,setCatalog]=useState<CatalogProduct[]>([]);
 const [catalogState,setCatalogState]=useState<'loading'|'ready'|'error'>('loading');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState(''),[trackingUrl,setTrackingUrl]=useState('');
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[phone,setPhone]=useState('');
 const [line1,setLine1]=useState(''),[city,setCity]=useState(''),[state,setState]=useState(''),[pincode,setPincode]=useState('');
 const [paymentMethod,setPaymentMethod]=useState<PaymentMethod>('cod');
 const [delivery,setDelivery]=useState<{serviceable:boolean;shipping?:number;minDays?:number|null;maxDays?:number|null}|null>(null),[checkingPin,setCheckingPin]=useState(false);

 useEffect(()=>{
  let active=true;
  fetch('/api/catalog',{cache:'no-store'}).then(async r=>{
   if(!r.ok)throw new Error('The live product catalogue is unavailable.');
   return r.json();
  }).then(d=>{
   if(!active)return;
   if(!d.configured)throw new Error('Store database is not configured yet.');
   setCatalog(d.products||[]);setCatalogState('ready');
  }).catch(e=>{
   if(active){setError(e.message||'Could not load products.');setCatalogState('error');}
  });
  return()=>{active=false};
 },[]);

 const mapped=useMemo(()=>items.map(item=>{
  const product=catalog.find(p=>item.variantId?p.product_variants.some(v=>v.id===item.variantId):clean(p.name)===clean(item.product.name));
  const variant=(product?.product_variants||[]).find(v=>(item.variantId?v.id===item.variantId:v.size.toUpperCase()===item.size.toUpperCase())&&v.size.toUpperCase()===item.size.toUpperCase()&&v.stock>=item.quantity);
  return {item,product,variant};
 }),[items,catalog]);
 const missing=mapped.filter(x=>!x.product||!x.variant);
 const subtotal=mapped.reduce((sum,x)=>sum+(x.product?.price_inr||0)*x.item.quantity,0);
 const shipping=delivery?.shipping??(subtotal>=1999?0:99);
 const checkoutBody=()=>({
   customerName:name,email,phone,
   shippingAddress:{line1,city,state,pincode,country:'India'},
   items:mapped.map(x=>({variantId:x.variant!.id,quantity:x.item.quantity}))
 });

 async function checkDelivery(){
  if(!/^[1-9][0-9]{5}$/.test(pincode)){setError('Enter a valid 6-digit PIN code first.');return;}
  setCheckingPin(true);setDelivery(null);
  try{const r=await fetch('/api/delivery/check?pincode='+encodeURIComponent(pincode),{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Delivery check is unavailable.');setDelivery(d);setError(d.serviceable?'':'Delivery is not available for this PIN code.');}
  catch(e){setError(e instanceof Error?e.message:'Delivery check failed.');}
  finally{setCheckingPin(false);}
 }

 async function submit(e:FormEvent){
  e.preventDefault();setError('');setSuccess('');
  let pendingRazorpayOrderId: string | null = null;
  if(catalogState!=='ready'){setError('The live catalogue is not ready. Please try again shortly.');return;}
  if(missing.length){setError('Some items or selected sizes are not available in the live store inventory. Please refresh your bag and try again.');return;}
  if(!delivery?.serviceable){setError('Check delivery availability for your PIN code before placing the order.');return;}
  setBusy(true);
  try{
   const body=checkoutBody();
   if(paymentMethod==='cod'){
    const response=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,paymentMethod:'cod'})});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Could not place your COD order.');
    if(!Number.isInteger(data.subtotal)||!Number.isInteger(data.shipping)||!Number.isInteger(data.total)||data.subtotal+data.shipping!==data.total)throw new Error('The server returned an invalid order total. Please contact support before retrying.');
    const adjusted=data.subtotal!==subtotal||data.shipping!==shipping;
    setTrackingUrl(typeof data.trackingToken==='string'?'/track?token='+encodeURIComponent(data.trackingToken):'');
    setSuccess('Order '+data.orderNumber+' placed. Subtotal '+money(data.subtotal)+' + shipping '+money(data.shipping)+'. Pay '+money(data.total)+' on delivery.'+(adjusted?' The live catalogue price changed; the server-confirmed amount is shown.':''));
    return;
   }

   const response=await fetch('/api/payments/razorpay/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||'Online payment is not configured. Choose Cash on Delivery or contact the store.');
   pendingRazorpayOrderId = data.razorpayOrderId;
   if(!Number.isInteger(data.total)||!Number.isInteger(data.amount)||data.amount!==data.total*100||data.currency!=='INR')throw new Error('The payment amount could not be verified. Please contact the store before retrying.');
   const loaded=await loadRazorpay();
   if(!loaded||!window.Razorpay)throw new Error('Razorpay checkout is unavailable. Please retry or choose Cash on Delivery.');

   await new Promise<void>((resolve,reject)=>{
    let finished=false;
    const cancelReservation=async()=>{try{await fetch('/api/payments/razorpay/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({razorpayOrderId:data.razorpayOrderId})});}catch{}};
    const fail=async(message:string)=>{if(finished)return;finished=true;await cancelReservation();reject(new Error(message));};
    const gateway=new window.Razorpay!({
     key:data.keyId,amount:data.amount,currency:data.currency,name:'Durgamma Menswear',description:'Order '+data.orderNumber,order_id:data.razorpayOrderId,
     prefill:{name,email,contact:phone},theme:{color:'#b99a62'},
     modal:{ondismiss:()=>{void fail('Payment window closed. Any unpaid stock reservation has been released. You can retry checkout.');}},
     handler:async(payment:Record<string,string>)=>{
      if(finished)return;
      try{
       const verified=await fetch('/api/payments/razorpay/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payment)});
       const result=await verified.json();
       if(!verified.ok)throw new Error(result.error||'Payment verification failed. Contact support before retrying.');
       finished=true;pendingRazorpayOrderId=null;setSuccess('Payment received and verified. Order '+(result.orderNumber||data.orderNumber)+' is confirmed. Total paid: '+money(data.total)+'.');
       resolve();
      }catch(err){finished=true;reject(err instanceof Error?err:new Error('Payment verification is pending. Please contact support with order '+data.orderNumber+'.'));}
     }
    });
    gateway.on('payment.failed', (failure: any) => { void fail(failure?.error?.description || 'Payment failed. You can retry or choose Cash on Delivery.'); });
    gateway.open();
   });
  }catch(err){
   if (pendingRazorpayOrderId) {
    try { await fetch('/api/payments/razorpay/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ razorpayOrderId: pendingRazorpayOrderId }) }); } catch {}
   }
   setError(err instanceof Error?err.message:'Checkout failed. Please try again.');
  }finally{setBusy(false);}
 }

 return <div className="checkout-backdrop" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
  <section className="checkout-panel">
   <header>
    <button type="button" className="checkout-back" onClick={onClose}><ArrowLeft size={16}/> BACK TO BAG</button>
    <button type="button" className="checkout-close" onClick={onClose} aria-label="Close checkout"><X/></button>
   </header>
   <div className="checkout-content">
    <div>
     <p className="eyebrow">DURGAMMA MENSWEAR · SECURE CHECKOUT</p>
     <h2 id="checkout-title">Delivery details<span>.</span></h2>
     <p className="checkout-intro">Enter your details to place your order securely.</p>
     {catalogState==='loading'&&<p className="checkout-status"><LoaderCircle size={16}/> Loading live inventory…</p>}
     {catalogState==='error'&&<p className="checkout-error" role="alert">{error}</p>}
     {catalogState==='ready'&&missing.length>0&&<p className="checkout-error" role="alert">Live stock matching is incomplete for {missing.map(x=>x.item.product.name+' / '+x.item.size).join(', ')}. Please contact the store to sync product names, sizes and stock before checkout.</p>}
     {success?<div className="checkout-success">
      <ShieldCheck size={25}/><h3>Thank you for your order.</h3><p>{success}</p>
      {trackingUrl&&<a className="track-order-link" href={trackingUrl}>TRACK YOUR ORDER <ArrowLeft size={14}/></a>}
      <button className="gold-btn" onClick={onSuccess}>DONE</button>
     </div>:<form onSubmit={submit} className="checkout-form">
      <div className="checkout-fields">
       <label>FULL NAME<input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)} autoComplete="name"/></label>
       <label>EMAIL ADDRESS<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></label>
       <label>PHONE NUMBER<input required type="tel" minLength={10} maxLength={20} value={phone} onChange={e=>setPhone(e.target.value)} autoComplete="tel" placeholder="10-digit mobile number"/></label>
       <label>ADDRESS<input required minLength={5} maxLength={160} value={line1} onChange={e=>setLine1(e.target.value)} autoComplete="street-address" placeholder="House / street / area"/></label>
       <label>CITY<input required value={city} onChange={e=>setCity(e.target.value)} autoComplete="address-level2"/></label>
       <label>STATE<input required value={state} onChange={e=>setState(e.target.value)} autoComplete="address-level1"/></label>
       <label>PIN CODE<input required inputMode="numeric" pattern="[1-9][0-9]{5}" minLength={6} maxLength={6} value={pincode} onChange={e=>{setPincode(e.target.value.replace(/\D/g,'').slice(0,6));setDelivery(null);}} autoComplete="postal-code"/><button type="button" className="pin-check-btn" onClick={checkDelivery} disabled={checkingPin||pincode.length!==6}>{checkingPin?'CHECKING…':'CHECK DELIVERY'}</button>{delivery&&<small>{delivery.serviceable?'Delivery available'+(delivery.minDays!=null?' · '+delivery.minDays+'–'+(delivery.maxDays??delivery.minDays)+' days':''):'Delivery unavailable for this PIN code'}</small>}</label>
      </div>
      <div className="payment-choice">
       <p>PAYMENT METHOD</p>
       <label><input type="radio" name="payment" checked={paymentMethod==='cod'} onChange={()=>setPaymentMethod('cod')}/> Cash on Delivery <small>Pay when your order arrives.</small></label>
       <label><input type="radio" name="payment" checked={paymentMethod==='online'} onChange={()=>setPaymentMethod('online')}/> Pay Online <small>UPI, cards, netbanking and supported wallets via Razorpay.</small></label>
      </div>
      {error&&<p className="checkout-error" role="alert">{error}</p>}
      <button className="gold-btn checkout-submit" disabled={busy||catalogState!=='ready'||missing.length>0||!delivery?.serviceable}>
       {busy?<><LoaderCircle size={16}/> PROCESSING…</>:paymentMethod==='cod'?'PLACE COD ORDER':'CONTINUE TO SECURE PAYMENT'}
      </button>
      <small className="checkout-secure"><ShieldCheck size={13}/> The server verifies the live price, stock and payment status before order confirmation. Online payment requires configured Razorpay credentials.</small>
     </form>}
    </div>
    <aside className="checkout-summary">
     <h3>YOUR ORDER</h3>
     {items.map(i=><div className="checkout-line" key={i.variantId||i.product.id+'-'+i.size+'-'+(i.colour||'Default')}>
      <span>{i.product.name}<small>Size {i.size} · Colour {i.colour||'Default'} · Qty {i.quantity}</small></span>
      <b>{money((catalog.find(p=>i.variantId?p.product_variants.some(v=>v.id===i.variantId):clean(p.name)===clean(i.product.name))?.price_inr||i.product.price)*i.quantity)}</b>
     </div>)}
     <div className="checkout-line"><span>Subtotal</span><b>{money(subtotal)}</b></div>
     <div className="checkout-line"><span>Shipping</span><b>{shipping===0?'FREE':money(shipping)}</b></div>
     <div className="checkout-grand"><span>{paymentMethod==='cod'?'Total to pay on delivery':'Total to pay securely'}</span><b>{money(subtotal+shipping)}</b></div>
     <small>Amount cross-check: live catalogue prices × quantities + shipping. The server recalculates this total before creating the order.</small>
    </aside>
   </div>
  </section>
 </div>;
}
