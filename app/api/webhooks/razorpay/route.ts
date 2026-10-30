import {NextRequest,NextResponse} from 'next/server';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:NextRequest){
 const secret=process.env.RAZORPAY_WEBHOOK_SECRET,url=process.env.NEXT_PUBLIC_SUPABASE_URL,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!secret||!url||!service)return NextResponse.json({error:'Webhook is not configured.'},{status:503});
 const raw=await request.text(),signature=request.headers.get('x-razorpay-signature')||'',eventId=request.headers.get('x-razorpay-event-id')||'';
 if(!eventId||!/^[a-f0-9]{64}$/i.test(signature))return NextResponse.json({error:'Invalid webhook headers.'},{status:400});
 const expected=createHmac('sha256',secret).update(raw).digest(),provided=Buffer.from(signature,'hex');
 if(provided.length!==expected.length||!timingSafeEqual(expected,provided))return NextResponse.json({error:'Invalid webhook signature.'},{status:400});
 let event:Record<string,any>;try{event=JSON.parse(raw);}catch{return NextResponse.json({error:'Invalid payload.'},{status:400});}
 const db=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
 const entity=event.payload?.payment?.entity;
 if(entity?.order_id&&event.event==='payment.captured'){
  const {data:order,error:lookupError}=await db.from('orders').select('id,payment_status').eq('razorpay_order_id',entity.order_id).maybeSingle();
  if(lookupError||!order)return NextResponse.json({error:'Order not found for captured payment.'},{status:503});
  if(order.payment_status!=='paid'){
   const {error}=await db.from('orders').update({payment_status:'paid',razorpay_payment_id:entity.id,order_status:'confirmed'}).eq('id',order.id).eq('payment_status','pending');
   if(error)return NextResponse.json({error:'Could not confirm order.'},{status:503});
  }
 }else if(entity?.order_id&&event.event==='payment.failed'){
  const {data:order,error:lookupError}=await db.from('orders').select('id').eq('razorpay_order_id',entity.order_id).maybeSingle();
  if(lookupError)return NextResponse.json({error:'Could not locate failed payment order.'},{status:503});
  if(order){
   const {error}=await db.rpc('cancel_unpaid_store_order',{p_order_id:order.id});
   if(error)return NextResponse.json({error:'Could not release stock for failed payment.'},{status:503});
  }
 }
 const {error:insertError}=await db.from('payment_webhook_events').insert({event_id:eventId,provider:'razorpay'});
 if(insertError&&insertError.code!=='23505')return NextResponse.json({error:'Could not record event.'},{status:503});
 return NextResponse.json({ok:true,duplicate:insertError?.code==='23505'});
