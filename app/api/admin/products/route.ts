import { NextRequest } from 'next/server';
import { adminJson, requireAdmin } from '../../../../lib/admin';

export async function POST(request: NextRequest) {
 const auth=await requireAdmin(request); if('error' in auth)return auth.error;
 let b:any;try{b=await request.json();}catch{return adminJson({error:'Invalid product data.'},400);}
 const name=String(b.name||'').trim(),category=String(b.category||'').trim(),description=String(b.description||'').trim();
 const slug=String(b.slug||name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''));
 const price=Number(b.price_inr),compareAt=b.compare_at_price_inr===null||b.compare_at_price_inr===undefined||b.compare_at_price_inr===''?null:Number(b.compare_at_price_inr),image=String(b.image_url||'').trim();
 if(name.length<2||name.length>120||category.length<2||category.length>80||! /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))return adminJson({error:'Enter a valid product name, category and URL slug.'},400);
 if(!Number.isInteger(price)||price<0||price>10000000)return adminJson({error:'Enter a valid selling price in INR.'},400);
 if(compareAt!==null&&(!Number.isInteger(compareAt)||compareAt<price||compareAt>10000000))return adminJson({error:'MRP must be a valid amount equal to or higher than the selling price.'},400);
 if(image&&!/^https:\/\//i.test(image))return adminJson({error:'Product image must use HTTPS.'},400);
 if(!Array.isArray(b.variants)||b.variants.length<1||b.variants.length>100)return adminJson({error:'Add at least one size/colour variant.'},400);
 const variants=b.variants.map((v:any)=>({sku:String(v.sku||'').trim(),size:String(v.size||'').trim(),colour:String(v.colour||'Default').trim(),stock:Number(v.stock)}));
 const combinations=variants.map((v:any)=>v.size.toLowerCase()+'|'+v.colour.toLowerCase());
 if(variants.some((v:any)=>!v.sku||v.sku.length>80||!v.size||v.size.length>30||!v.colour||v.colour.length>50||!Number.isInteger(v.stock)||v.stock<0)||new Set(variants.map((v:any)=>v.sku.toLowerCase())).size!==variants.length||new Set(combinations).size!==variants.length)return adminJson({error:'Check variant SKU, size, colour and non-negative stock. SKUs and size/colour combinations must be unique.'},400);
 const {data:created,error}=await auth.db.from('products').insert({name,slug,description,category,price_inr:price,compare_at_price_inr:compareAt,image_url:image||null,is_active:false}).select('id').single();
 if(error)return adminJson({error:error.code==='23505'?'A product with this slug or SKU already exists.':'Product could not be created.'},409);
 const {error:variantError}=await auth.db.from('product_variants').insert(variants.map((v:any)=>({...v,product_id:created.id})));
 if(variantError){await auth.db.from('products').delete().eq('id',created.id);return adminJson({error:'Product variants could not be saved. Check SKU uniqueness.'},409);}
 return adminJson({ok:true,id:created.id},201);
}