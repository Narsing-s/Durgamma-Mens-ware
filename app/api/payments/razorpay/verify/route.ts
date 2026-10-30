import { NextRequest,NextResponse } from 'next/server';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
export const runtime='nodejs';export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:NextRequest){
 const origin=request.headers.get('origin'),site=process.env.NEXT_PUBLIC_SITE_URL;if(origin&&site&&new URL(origin).origin!==new URL(site).origin)return json({error:'Invalid origin.'},403);
 const secret=process.env.RAZORPAY_KEY_SECRET,url=process.env.NEXT_PUBLIC_SUPABASE_URL,service=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!secret||!url||!service)return json({error:'Payment verification is not configured.'},503);
 let b:Record<string,unknown>;try{b=await request.json();}catch{return json({error:'Invalid request.'},400);}
 const orderId=b.razorpay_order_id,paymentId=b.razorpay_payment_id,signature=b.razorpay_signature;
 if(typeof orderId!=='string'||typeof paymentId!=='string'||typeof signature!=='string'||!/^[a-f0-9]{64}$/i.test(signature))return json({error:'Invalid payment response.'},400);
 const expected=createHmac('sha256',secret).update(orderId+'|'+paymentId).digest();
 const supplied=Buffer.from(signature,'hex');if(supplied.length!==expected.length||!timingSafeEqual(expected,supplied))return json({error:'Payment signature could not be verified.'},400);
 const db=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
 const {data:order,error}=await db.from('orders').select('id,order_number,payment_status,total_inr,payment_method').eq('razorpay_order_id',orderId).maybeSingle();
 if(error||!order)return json({error:'Order not found.'},404);
 if(order.payment_status==='paid')return json({ok:true,orderNumber:order.order_number,message:'Payment already confirmed.'});
 const auth=Buffer.from(process.env.RAZORPAY_KEY_ID+':'+secret).toString('base64');
 const gateway=await fetch('https://api.razorpay.com/v1/payments/'+encodeURIComponent(paymentId),{headers:{Authorization:'Basic '+auth},cache:'no-store'});
 const payment=await gateway.json();if(!gateway.ok||payment.order_id!==orderId||payment.status!=='captured'||payment.currency!=='INR'||payment.amount!==order.total_inr*100||order.payment_method!=='online')return json({error:'Payment is not captured yet. Your order remains pending.'},409);
 const {error:updateError}=await db.from('orders').update({payment_status:'paid',razorpay_payment_id:paymentId,order_status:'confirmed'}).eq('id',order.id).eq('payment_status','pending');
 if(updateError)return json({error:'Payment was received but order confirmation is pending. Contact support with order '+order.order_number+'.'},503);
 const {data:confirmed,error:confirmError}=await db.from('orders').select('payment_status').eq('id',order.id).single();
 if(confirmError||confirmed?.payment_status!=='paid')return json({error:'Payment was received but order confirmation is pending. Contact support with order '+order.order_number+'.'},503);
 return json({ok:true,orderNumber:order.order_number,message:'Payment verified and order confirmed.'});
}
