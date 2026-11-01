import { NextRequest } from 'next/server';
import { adminJson, requireAdmin } from '../../../../../lib/admin';

export async function PATCH(request: NextRequest,{params}:{params:Promise<{id:string}>}){
 const auth=await requireAdmin(request);if('error' in auth)return auth.error;
 const {id}=await params;let b:any;try{b=await request.json();}catch{return adminJson({error:'Invalid product data.'},400);}
 const update:any={};
 if(typeof b.name==='string'&&b.name.trim().length>=2&&b.name.trim().length<=120)update.name=b.name.trim();
 if(typeof b.description==='string')update.description=b.description.slice(0,5000);
 if(typeof b.category==='string'&&b.category.trim().length>=2)update.category=b.category.trim();
 if(b.price_inr!==undefined){const n=Number(b.price_inr);if(!Number.isInteger(n)||n<0||n>10000000)return adminJson({error:'Invalid selling price.'},400);update.price_inr=n;}
 if(b.compare_at_price_inr!==undefined){const n=b.compare_at_price_inr===null||b.compare_at_price_inr===''?null:Number(b.compare_at_price_inr);if(n!==null&&(!Number.isInteger(n)||n<0||n>10000000))return adminJson({error:'Invalid MRP.'},400);update.compare_at_price_inr=n;}
 if(b.image_url!==undefined){if(b.image_url!==null&&b.image_url!==''&&!/^https:\/\//i.test(b.image_url))return adminJson({error:'Image URL must use HTTPS.'},400);update.image_url=b.image_url||null;}
 if(b.is_active!==undefined){if(typeof b.is_active!=='boolean')return adminJson({error:'Product visibility must be true or false.'},400);update.is_active=b.is_active;}
 if(b.is_active===true){const {error:variantError}=await auth.db.from('product_variants').update({is_active:true}).eq('product_id',id).gt('stock',0);if(variantError)return adminJson({error:'Product could not be published because its in-stock sizes could not be enabled.'},409);}
 if(!Object.keys(update).length)return adminJson({error:'No valid product changes provided.'},400);
 const {data:current,error:readError}=await auth.db.from('products').select('price_inr,compare_at_price_inr').eq('id',id).maybeSingle();
 if(readError)return adminJson({error:'Could not verify the current product details.'},500);
 if(!current)return adminJson({error:'Product not found.'},404);
 const selling=update.price_inr??current.price_inr;
 const mrp=update.compare_at_price_inr!==undefined?update.compare_at_price_inr:current.compare_at_price_inr;
 if(mrp!==null&&mrp!==undefined&&mrp<selling)return adminJson({error:'MRP cannot be lower than the selling price.'},400);
 const {data:updated,error}=await auth.db.from('products').update(update).eq('id',id).select('id').maybeSingle();
 if(error)return adminJson({error:'Product update failed.'},409);
 if(!updated)return adminJson({error:'Product not found.'},404);
 return adminJson({ok:true});
}