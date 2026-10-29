// Returns order status only, never personal data or line items.
// Use an API-level rate limiter if extending this endpoint.
import { createClient } from 'npm:@supabase/supabase-js@2';
const url=Deno.env.get('SUPABASE_URL')||'',service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||(() => {try{return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||''}catch{return ''}})();
const origins=(Deno.env.get('ALLOWED_ORIGINS')||'').split(',').map(o=>o.trim()).filter(Boolean);
const db=url&&service?createClient(url,service,{auth:{persistSession:false}}):null;
function cors(origin:string|null){const ok=Boolean(origin&&origins.includes(origin));return {'Access-Control-Allow-Origin':ok?origin!:'null','Vary':'Origin','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'apikey,authorization,content-type,x-client-info'}}
function json(data:unknown,status:number,origin:string|null){return new Response(JSON.stringify(data),{status,headers:{...cors(origin),'Content-Type':'application/json','Cache-Control':'no-store'}})}
Deno.serve(async req=>{
 const origin=req.headers.get('origin');
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
 if(req.method!=='POST')return json({error:'Method not allowed.'},405,origin);
 if(!origin||!origins.includes(origin))return json({error:'Origin not allowed.'},403,origin);
 if(!db)return json({error:'Tracking is not configured.'},503,origin);
 try{
  const data=await req.json();const ref=String(data.reference||'').toUpperCase().trim(),phone=String(data.phone||'').replace(/[\s-]/g,'');
  if(!/^DB-[A-Z0-9-]{10,18}$/.test(ref)||! /^(09\d{9}|\+639\d{9})$/.test(phone))return json({error:'Invalid reference or phone.'},400,origin);
  const {data:order,error}=await db.from('orders').select('reference,status,preferred_date,subtotal,extras_total,delivery_fee,payment_status,payment_method,paymongo_link_url').eq('reference',ref).eq('phone',phone).maybeSingle();
  if(error||!order)return json({error:'Order not found.'},404,origin);
  const approved=!['pending_review','cancelled','rejected'].includes(order.status);
  const paymentUrl=approved&&order.payment_status==='awaiting_payment'&&order.payment_method==='paymongo'?order.paymongo_link_url:null;
  const finalTotal=approved&&order.delivery_fee!==null?(order.subtotal+order.extras_total+order.delivery_fee):null;
  return json({reference:order.reference,status:order.status,payment_status:order.payment_status,
    final_total:finalTotal,payment_url:paymentUrl,
    message:order.payment_status==='paid'?'Payment verified by the bakery. Thank you!':paymentUrl?'Your order is approved. Open the secure payment link to pay.':approved?'The bakery has confirmed your request. Follow the agreed payment instructions.':'We are reviewing your preorder; please do not pay yet.'},200,origin);
 }catch{return json({error:'Unable to check order right now.'},503,origin)}
});
