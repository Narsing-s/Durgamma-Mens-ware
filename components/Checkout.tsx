'use client';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, X, ShieldCheck, LoaderCircle } from 'lucide-react';

type CartLine={product:{id:string;name:string;price:number;image:string};size:string;quantity:number;variantId?:string};
type Variant={id:string;size:string;stock:number;colour:string};
type CatalogProduct={id:string;name:string;price_inr:number;product_variants:Variant[]};
type Props={items:CartLine[];onClose:()=>void;onSuccess:()=>void};
const money=(n:number)=>'₹'+n.toLocaleString('en-IN');
const clean=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

export default function Checkout({items,onClose,onSuccess}:Props){
 const [catalog,setCatalog]=useState<CatalogProduct[]>([]);
 const [catalogState,setCatalogState]=useState<'loading'|'ready'|'error'>('loading');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState(''),[trackingUrl,setTrackingUrl]=useState('');
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[phone,setPhone]=useState('');
 const [line1,setLine1]=useState(''),[city,setCity]=useState(''),[state,setState]=useState(''),[pincode,setPincode]=useState('');

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
 const shipping=subtotal>=1999?0:99;

 async function submit(e:FormEvent){
  e.preventDefault();setError('');setSuccess('');
  if(catalogState!=='ready'){setError('The live catalogue is not ready. Please try again shortly.');return;}
  if(missing.length){setError('Some items or selected sizes are not available in the live store inventory. Please refresh your bag and try again.');return;}
  setBusy(true);
  try{
   const body={
    customerName:name,email,phone,
    shippingAddress:{line1,city,state,pincode,country:'India'},
    items:mapped.map(x=>({variantId:x.variant!.id,quantity:x.item.quantity}))
   };
   const response=await fetch('/api/orders',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...body,paymentMethod:'cod'})
   });
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||'Could not place your COD order.');
   if(!Number.isInteger(data.subtotal)||!Number.isInteger(data.shipping)||!Number.isInteger(data.total)||data.subtotal+data.shipping!==data.total){
    throw new Error('The server returned an invalid order total. Please contact support before retrying.');
   }
   const adjusted=data.subtotal!==subtotal||data.shipping!==shipping;
   setTrackingUrl(typeof data.trackingToken==='string'?'/track?token='+encodeURIComponent(data.trackingToken):'');
   setSuccess('Order '+data.orderNumber+' placed. Subtotal '+money(data.subtotal)+' + shipping '+money(data.shipping)+'. Pay '+money(data.total)+' on delivery.'+(adjusted?' The live catalogue price changed; the server-confirmed amount is shown.':''));
  }catch(err){
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
       <label>PIN CODE<input required inputMode="numeric" pattern="[1-9][0-9]{5}" minLength={6} maxLength={6} value={pincode} onChange={e=>setPincode(e.target.value.replace(/\D/g,'').slice(0,6))} autoComplete="postal-code"/></label>
      </div>
      <div className="payment-choice">
       <p>PAYMENT METHOD</p>
       <label><input type="radio" checked readOnly/> Cash on Delivery <small>Pay when your order arrives.</small></label>
      </div>
      {error&&<p className="checkout-error" role="alert">{error}</p>}
      <button className="gold-btn checkout-submit" disabled={busy||catalogState!=='ready'||missing.length>0}>
       {busy?<><LoaderCircle size={16}/> PROCESSING…</>:'PLACE COD ORDER'}
      </button>
      <small className="checkout-secure"><ShieldCheck size={13}/> Your order total and stock are verified securely before confirmation.</small>
     </form>}
    </div>
    <aside className="checkout-summary">
     <h3>YOUR ORDER</h3>
     {items.map(i=><div className="checkout-line" key={i.product.id+'-'+i.size}>
      <span>{i.product.name}<small>Size {i.size} · Qty {i.quantity}</small></span>
      <b>{money((catalog.find(p=>clean(p.name)===clean(i.product.name))?.price_inr||i.product.price)*i.quantity)}</b>
     </div>)}
     <div className="checkout-line"><span>Subtotal</span><b>{money(subtotal)}</b></div>
     <div className="checkout-line"><span>Shipping</span><b>{shipping===0?'FREE':money(shipping)}</b></div>
     <div className="checkout-grand"><span>Total to pay on delivery</span><b>{money(subtotal+shipping)}</b></div>
     <small>Amount cross-check: live catalogue prices × quantities + shipping. The server recalculates this total before creating the order.</small>
    </aside>
   </div>
  </section>
 </div>;
}
