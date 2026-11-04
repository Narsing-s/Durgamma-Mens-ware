import {NextRequest} from 'next/server';
import {adminJson,requireAdmin} from '../../../../../lib/admin';
export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const auth=await requireAdmin(request);if('error' in auth)return auth.error;
 const {id}=await params;let body:Record<string,unknown>;try{body=await request.json();}catch{return adminJson({error:'Invalid request.'},400);}
 if(body.status!=='approved'&&body.status!=='rejected')return adminJson({error:'Choose approve or reject.'},400);
 const {data,error}=await auth.db.from('product_reviews').update({status:body.status,updated_at:new Date().toISOString()}).eq('id',id).eq('status','pending').select('id').maybeSingle();
 if(error)return adminJson({error:'Could not update this review.'},409);
 if(!data)return adminJson({error:'Review not found or already moderated.'},404);
 return adminJson({ok:true,status:body.status});
}