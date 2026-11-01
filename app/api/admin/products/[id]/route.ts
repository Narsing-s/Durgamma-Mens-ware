import { NextRequest } from 'next/server';
import { adminJson, requireAdmin } from '../../../../../lib/admin';

export async function PATCH(request: NextRequest,{params}:{params:Promise<{id:string}>}){
 const auth=await requireAdmin(request);if('error' in auth)return auth.error;
 const {id}=await params;let b:any;try{b=await request.json();}catch{return adminJson({error:'Invalid product data.'},400);}
 const update:any={};
 if(typeof b.name==='string'&&b.name.trim().length>=2&&b.name.trim().length<=120)update.name=b.name.trim();
 if(typeof b.description==='string')update.description=b.description.slice(0,5000);
 if(typeof b.category==='string'&&b.category.trim().length>=2)update.category=b.category.trim();
 if(b.price_inr!==undefined){const n=Number(b.price_inr);if(!Number.isInteger(n)||n<0)return adminJson({error:'Invalid price.'},400);update.price_inr=n;}
 if(b.image_url!==undefined){if(b.image_url!==null&&b.image_url!==''&&!/^https:\/\//i.test(b.image_url))return adminJson({error:'Image URL must use HTTPS.'},400);update.image_url||null;}
 if(b.is_active!==undefined)update.is_active=Boolean(b.is_active);
 if(!Object.keys(update).length)return adminJson({error:'No valid product changes provided.'},400);
 const {error}=await auth.db.from('products').update(update).eq('id',id);
 return error?adminJson({error:'Product update failed.'},409):adminJson({ok:true});
}