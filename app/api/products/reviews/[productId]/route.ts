import { NextRequest,NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
function db(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;return url&&key?createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}}):null;}
export async function GET(request:NextRequest,{params}:{params:Promise<{productId:string}>}){
 const {productId}=await params;
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId))return json({error:'Invalid product.'},400);
 const client=db();if(!client)return json({error:'Reviews are temporarily unavailable.'},503);
 const {data,error}=await client.from('product_reviews').select('id,rating,title,body,customer_name,created_at').eq('product_id',productId).eq('status','approved').order('created_at',{ascending:false}).limit(30);
 if(error)return json({error:'Reviews are temporarily unavailable.'},503);
 const rows=data||[],average=rows.length?Math.round(rows.reduce((s,r)=>s+r.rating,0)/rows.length*10)/10:0;
 return json({reviews:rows,average,count:rows.length});
}
export async function POST(request:NextRequest){
 const origin=request.headers.get('origin');if(origin){try{const allowed=new Set([request.nextUrl.origin,...(process.env.NEXT_PUBLIC_SITE_URL?[new URL(process.env.NEXT_PUBLIC_SITE_URL).origin]:[])]);if(!allowed.has(new URL(origin).origin))return json({error:'Invalid request origin.'},403);}catch{return json({error:'Invalid request origin.'},403);}}
 let b:Record<string,unknown>;try{b=await request.json();}catch{return json({error:'Invalid request.'},400);}
 const orderNumber=typeof b.orderNumber==='string'?b.orderNumber.trim().toUpperCase():'',email=typeof b.email==='string'?b.email.trim().toLowerCase():'',itemId=typeof b.orderItemId==='string'?b.orderItemId:'',title=typeof b.title==='string'?b.title.trim():'',body=typeof b.body==='string'?b.body.trim():'',rating=Number(b.rating);
 if(!/^DMW-[A-Z0-9]{10}$/.test(orderNumber)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(itemId)||!Number.isInteger(rating)||rating<1||rating>5||title.length<3||title.length>100||body.length<10||body.length>1500)return json({error:'Provide your order details, a 1–5 star rating, a short title and feedback.'},400);
 const client=db();if(!client)return json({error:'Feedback is temporarily unavailable.'},503);
 const ip=request.headers.get('x-vercel-forwarded-for')||request.headers.get('x-forwarded-for')||'';
 const ipHash=createHash('sha256').update(ip.split(',')[0].trim()||'unknown').digest('hex');
 const {data:attempts,error:rateError}=await client.rpc('consume_tracking_rate_limit',{p_ip_hash:ipHash});
 if(rateError||typeof attempts!=='number')return json({error:'Request protection is temporarily unavailable.'},503);
 if(attempts>20)return json({error:'Too many attempts. Please try again later.'},429);
 const {data:order,error:orderError}=await client.from('orders').select('id,order_number,customer_name,order_status,delivered_at').eq('order_number',orderNumber).eq('email',email).maybeSingle();
 if(orderError||!order)return json({error:'We could not verify that order. Check the order number and checkout email.'},404);
 if(order.order_status!=='delivered'||!order.delivered_at)return json({error:'Product feedback is available after delivery.'},409);
 const {data:item,error:itemError}=await client.from('order_items').select('id,product_id').eq('id',itemId).eq('order_id',order.id).maybeSingle();
 if(itemError||!item)return json({error:'That product is not part of this order.'},404);
 const {data:review,error}=await client.from('product_reviews').insert({order_id:order.id,order_item_id:item.id,product_id:item.product_id,customer_name:order.customer_name,rating,title,body,status:'pending'}).select('id').single();
 if(error)return json({error:error.code==='23505'?'Feedback has already been submitted for this purchased item.':'Could not save your feedback. Please try again.'},409);
 return json({ok:true,reviewId:review.id,status:'pending',message:'Thank you. Your verified-purchase feedback has been submitted and will appear after review.'},201);
}
