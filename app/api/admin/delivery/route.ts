import { NextRequest } from 'next/server';
import { adminJson, requireAdmin } from '../../../../lib/admin';

export async function GET(request: NextRequest) {
 const auth=await requireAdmin(request); if('error' in auth)return auth.error;
 const {data,error}=await auth.db.from('delivery_pincodes').select('*').order('pincode').limit(500);
 return error?adminJson({error:'Could not load delivery rules.'},500):adminJson({rules:data||[]});
}
export async function PUT(request: NextRequest) {
 const auth=await requireAdmin(request); if('error' in auth)return auth.error;
 let b:any;try{b=await request.json();}catch{return adminJson({error:'Invalid request.'},400);}
 if(!/^[1-9][0-9]{5}$/.test(String(b.pincode||'')))return adminJson({error:'Enter a valid 6-digit PIN code.'},400);
 const shipping=Number(b.shipping_inr); if(!Number.isInteger(shipping)||shipping<0)return adminJson({error:'Enter a valid shipping charge.'},400);
 const min=b.min_delivery_days==null?null:Number(b.min_delivery_days),max=b.max_delivery_days==null?null:Number(b.max_delivery_days);
 if((min!==null&&(!Number.isInteger(min)||min<0))||(max!==null&&(!Number.isInteger(max)||min===null||max<min)))return adminJson({error:'Enter valid delivery days.'},400);
 const {error}=await auth.db.from('delivery_pincodes').upsert({pincode:String(b.pincode),is_serviceable:Boolean(b.is_serviceable),shipping_inr:shipping,min_delivery_days:min,max_delivery_days:max,updated_at:new Date().toISOString()});
 return error?adminJson({error:'Delivery rule update failed.'},500):adminJson({ok:true});
}