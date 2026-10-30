'use client';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, X, ShieldCheck, LoaderCircle } from 'lucide-react';

type CartLine={product:{id:number;name:string;price:number;image:string};size:string;quantity:number};
type Variant={id:string;size:string;stock:number;colour:string};
type CatalogProduct={id:string;name:string;price_inr:number;product_variants:Variant[]};
type Props={items:CartLine[];onClose:()=>void;onSuccess:()=>void};
declare global { interface Window { Razorpay?: new (options:Record<string,unknown>)=>{open:()=>void}; } }
const money=(n:number)=>'₹'+n.toLocaleString('en-IN');
const clean=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export default function Checkout({items,onClose,onSuccess}:Props){
 const [catalog,setCatalog]=useState<CatalogProduct[]>([]);
 const [catalogState,setCatalogState]=useState<'loading'|'ready'|'error'>('loading');
 const [payment,setPayment]=useState<'online'|'cod'>('online');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[phone,setPhone]=useState('');
 const [line1,setLine1]=useState(''),[city,setCity]=useState(''),[state,setState]=useState(''),[pincode,setPincode]=useState('');
 useEffect(()=>{let active=true;fetch('/api/catalog',{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('The live product catalogue is unavailable.');return r.json();}).then(d=>{if(!active)return;if(!d.configured)throw new Error('Store database is not configured yet.');setCatalog(d.products||[]);setCatalogState('ready');}).catch(e=>{if(active){setError(e.message||'Could not load products.');setCatalogState('error');}});return()=>{active=false};},[]);
 const mapped=useMemo(()=>items.map(item=>{const product=catalog.find(p=>clean(p.name)===clean(item.product.name));const variants=(product?.product_variants||[]).filter(v=>v.size.toUpperCase()===item.size.toUpperCase()&&v.stock>=item.quantity);return {item,product,variant:variants[0]};}),[items,catalog]);
 const missing=mapped.filter(x=>!x.product||!x.variant);
 const subtotal=mapped.reduce((sum,x)=>sum+(x.product?.price_inr||0)*x.item.quantity,0);
 const shipping=subtotal>=1999?0:99;
 useEffect(()=>{if(payment!=='online'||typeof window==='undefined'||window.Razorpay)return;const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';script.async=true;document.body.appendChild(script);return()=>{script.remove();};},[payment]);
 async function submit(e:FormEvent){e.preventDefault();setError('');setSuccess('');
  if(catalogState!=='ready'){setError('The live catalogue is not ready. Please try again shortly.');return;}
  if(missing.length){setError('Some items or selected sizes are not available in the live store inventory. Please contact the store to sync product names, sizes and stock before checkout.');return;}
  setBusy(true);
  try{
   const body={customerName:name,email,phone,shippingAddress:{line1,city,state,pincode,country:'India'},items:mapped.map(x=>({variantId:x.variant!.id,quantity:x.item.quantity}))};
   if(payment==='cod'){
    const response=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,paymentMethod:'cod'})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not place your COD order.');
    setSuccess('Order '+data.orderNumber+' placed. Pay '+money(data.total)+' on delivery.');return;
   }
   const response=await fetch('/api/payments/razorpay/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Online payment could not be started.');
   if(!window.Razorpay)throw new Error('Secure payment window is still loading. Please try again.');
   const gateway=new window.Razorpay({key:data.keyId,amount:data.amount,currency:data.currency,order_id:data.razorpayOrderId,name:'DURGAMMA MENSWEAR',description:'Order '+data.orderNumber,prefill:data.customer,theme:{color:'#171713'},modal:{ondismiss:()=>setBusy(false)},handler:async(result:Record<string,string>)=>{
    try{const verify=await fetch('/api/payments/razorpay/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(result)});const verified=await verify.json();if(!verify.ok)throw new Error(verified.error||'Payment verification is pending.');setSuccess('Payment confirmed. Order '+verified.orderNumber+' is placed.');}catch(err){setError(err instanceof Error?err.message:'Payment verification is pending.');}finally{setBusy(false);}
   }});
   gateway.open();
  }catch(err){setError(err instanceof Error?err.message:'Checkout failed. Please try again.');setBusy(false);}
 }
 return <div className="checkout-backdrop" role="dialog" aria-modal="true" aria-labelledby="checkout-title"><section className="checkout-panel"><header><button type="button" className="checkout-back" onClick={onClose}><ArrowLeft size={16}/> BACK TO BAG</button><button type="button" className="checkout-close" onClick={onClose} aria-label="Close checkout"><X/></button></header><div className="checkout-content"><div><p className="eyebrow">DURGAMMA MENSWEAR · SECURE CHECKOUT</p><h2 id="checkout-title">Delivery details<span>.</span></h2><p className="checkout-intro">Enter your details to place your order securely.</p>
 {catalogState==='loading'&&<p className="checkout-status"><LoaderCircle size={16}/> Loading live inventory…</p>}
 {catalogState==='error'&&<p className="checkout-error">{error}</p>}
 {catalogState==='ready'&&missing.length>0&&<p className="checkout-error">Live stock matching is incomplete for {missing.map(x=>x.item.product.name+' / '+x.item.size).join(', ')}. The store owner must add matching products and available sizes in the catalogue.</p>}
 {success?<div className="checkout-success"><ShieldCheck size={25}/><h3>Thank you for your order.</h3><p>{success}</p><button className="gold-btn" onClick={onSuccess}>DONE</button></div>:<form onSubmit={submit} className="checkout-form">
 <div className="checkout-fields"><label>FULL NAME<input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)} autoComplete="name"/></label><label>EMAIL ADDRESS<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></label><label>PHONE NUMBER<input required type="tel" minLength={10} maxLength={20} value={phone} onChange={e=>setPhone(e.target.value)} autoComplete="tel" placeholder="10-digit mobile number"/></label><label>ADDRESS<input required minLength={5} maxLength={160} value={line1} onChange={e=>setLine1(e.target.value)} autoComplete="street-address" placeholder="House / street / area"/></label><label>CITY<input required value={city} onChange={e=>setCity(e.target.value)} autoComplete="address-level2"/></label><label>STATE<input required value={state} onChange={e=>setState(e.target.value)} autoComplete="address-level1"/></label><label>PIN CODE<input required inputMode="numeric" pattern="[1-9][0-9]{5}" minLength={6} maxLength={6} value={pincode} onChange={e=>setPincode(e.target.value.replace(/\D/g,'').slice(0,6))} autoComplete="postal-code"/></label></div>
 <div className="payment-choice"><p>PAYMENT METHOD</p><label><input type="radio" checked={payment==='online'} onChange={()=>setPayment('online')}/> UPI / Cards / Netbanking <small>Secure Razorpay checkout</small></label><label><input type="radio" checked={payment==='cod'} onChange={()=>setPayment('cod')}/> Cash on Delivery <small>Pay when your order arrives</small></label></div>
 {error&&<p className="checkout-error" role="alert">{error}</p>}
 <button className="gold-btn checkout-submit" disabled={busy||catalogState!=='ready'||missing.length>0}>{busy?<><LoaderCircle size={16}/> PROCESSING…</>:payment==='online'?'CONTINUE TO SECURE PAYMENT':'PLACE COD ORDER'}</button><small className="checkout-secure"><ShieldCheck size={13}/> Your payment details are handled securely by Razorpay.</small>
 </form>}</div><aside className="checkout-summary"><h3>YOUR ORDER</h3>{items.map(i=><div className="checkout-line" key={i.product.id+'-'+i.size}><span>{i.product.name}<small>Size {i.size} · Qty {i.quantity}</small></span><b>{money((catalog.find(p=>clean(p.name)===clean(i.product.name))?.price_inr||i.product.price)*i.quantity)}</b></div>)}<div className="checkout-line"><span>Shipping</span><b>{shipping===0?'FREE':money(shipping)}</b></div><div className="checkout-grand"><span>Estimated total</span><b>{money(subtotal+shipping)}</b></div><small>Final amount is calculated securely from live store prices and stock.</small></aside></div></section></div>;
}
