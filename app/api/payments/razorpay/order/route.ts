import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
const valid=(v:unknown,min:number,max:number):v is string=>typeof v==='string'&&v.trim().length>=min&&v.trim().length<=max;
async function rateLimit(request:NextRequest){
 const url=process.env.UPSTASH_REDIS_REST_URL,token=process.env.UPSTASH_REDIS_REST_TOKEN;
 const ip=(request.headers.get('x-vercel-forwarded-for')||request.headers.get('x-forwarded-for')||'').split(',')[0].trim();
 if(!url||!token||!ip)return false;
 try{const r=await fetch(url.replace(/\/$/,'')+'/pipeline',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify([['INCR','durgamma:pay:'+ip],['EXPIRE','durgamma:pay:'+ip,60]]),cache:'no-store'});if(!r.ok)return false;const d=await r.json();return Number(d?.[0]?.result)<=5;}catch{return false;}
}
export async function POST(request:NextRequest){
 const origin=request.headers.get('origin'),site=process.env.NEXT_PUBLIC_SITE_URL;
 if(origin&&site&&new URL(origin).origin!==new URL(site).origin)return json({error:'Invalid origin.'},403);
 if(!await rateLimit(request))return json({error:'Payment protection is unavailable. Please try later.'},503);
 const key=process.env.RAZORPAY_KEY_ID,secret=process.env.RAZORPAY_KEY_SECRET,url=process.env.NEXT_PUBLIC_SUPABASE_URL,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key||!secret||!url||!service)return json({error:'Online payments are not configured.'},503);
 let b:Record<string,unknown>;try{b=await request.json();}catch{return json({error:'Invalid request.'},400);}
 if(!valid(b.customerName,2,100)||!valid(b.email,5,254)||!valid(b.phone,10,20)||!b.shippingAddress||typeof b.shippingAddress!=='object'||!Array.isArray(b.items)||b.items.length<1||b.items.length>20)return json({error:'Please enter valid delivery and cart details.'},400);
 const a=b.shippingAddress as Record<string,unknown>;
 if(!valid(a.line1,5,160)||!valid(a.city,2,80)||!valid(a.state,2,80)||!valid(a.pincode,6,6)||!/^[1-9][0-9]{5}$/.test(a.pincode as string))return json({error:'Enter a valid Indian delivery address.'},400);
 const items:{variant_id:string;quantity:number}[]=[];
 for(const raw of b.items){if(!raw||typeof raw!=='object')return json({error:'Invalid cart item.'},400);const it=raw as Record<string,unknown>;if(typeof it.variantId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(it.variantId)||!Number.isInteger(it.quantity)||Number(it.quantity)<1||Number(it.quantity)>10)return json({error:'Invalid product variant.'},400);items.push({variant_id:it.variantId,quantity:Number(it.quantity)});}
 const db=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
 const {data,error}=await db.rpc('create_store_order',{p_customer_name:b.customerName.trim(),p_email:b.email.trim().toLowerCase(),p_phone:b.phone.trim(),p_shipping_address:a,p_payment_method:'online',p_items:items});
 if(error)return json({error:'Unable to reserve the selected items. Refresh your bag and try again.'},409);
 const order=Array.isArray(data)?data[0]:data;
 if(!order?.order_id||!Number.isInteger(order.total_inr))return json({error:'Order could not be prepared.'},500);
 try{
  const auth=Buffer.from(key+':'+secret).toString('base64');
  const response=await fetch('https://api.razorpay.com/v1/orders',{method:'POST',headers:{Authorization:'Basic '+auth,'Content-Type':'application/json'},body:JSON.stringify({amount:order.total_inr*100,currency:'INR',receipt:order.order_number,notes:{store_order_id:order.order_id,order_number:order.order_number}}),cache:'no-store'});
  const payment=await response.json();
  if(!response.ok||!payment.id||payment.currency!=='INR'||payment.amount!==order.total_inr*100)throw new Error('Gateway amount did not match the server-calculated order total');
  const {error:updateError}=await db.from('orders').update({razorpay_order_id:payment.id}).eq('id',order.order_id);
  if(updateError)throw new Error('Could not link gateway order');
  return json({ok:true,orderNumber:order.order_number,orderId:order.order_id,razorpayOrderId:payment.id,subtotal:order.subtotal_inr,shipping:order.shipping_inr,total:order.total_inr,amount:payment.amount,currency:'INR',keyId:key,customer:{name:b.customerName,email:b.email,contact:b.phone}},201);
 }catch{await db.rpc('cancel_unpaid_store_order',{p_order_id:order.order_id});return json({error:'Payment setup failed and the reserved stock has been released. Please retry or choose Cash on Delivery.'},502);}
}
