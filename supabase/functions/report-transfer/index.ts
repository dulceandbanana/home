/** Customer-submitted payment reference — NOT a proof of payment.
 * The receiving account must be checked independently by an authorized bakery administrator.
 * Public, protected by Turnstile + order reference/phone match + attempt limits.
 */
import {createClient} from 'npm:@supabase/supabase-js@2';
const env=(k:string)=>Deno.env.get(k)||'';
const url=env('SUPABASE_URL');
const key=env('SUPABASE_SERVICE_ROLE_KEY')||(()=>{try{return JSON.parse(env('SUPABASE_SECRET_KEYS')||'{}').default||''}catch{return ''}})();
const db=url&&key?createClient(url,key,{auth:{persistSession:false}}):null;
const origins=env('ALLOWED_ORIGINS').split(',').map(x=>x.trim()).filter(Boolean);
const cors=(o:string|null)=>({'Access-Control-Allow-Origin':o&&origins.includes(o)?o:'null','Access-Control-Allow-Headers':'apikey,authorization,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'});
const reply=(o:string|null,status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:{...cors(o),'Content-Type':'application/json','Cache-Control':'no-store'}});
const validPhone=(x:string)=>/^(09\d{9}|\+639\d{9})$/.test(x.replace(/[\s-]/g,''));
Deno.serve(async req=>{
 const origin=req.headers.get('origin');if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
 if(!origin||!origins.includes(origin))return reply(origin,403,{error:'Site not authorized.'});
 if(req.method!=='POST')return reply(origin,405,{error:'Method not allowed.'});
 if(!db||!env('TURNSTILE_SECRET_KEY'))return reply(origin,503,{error:'Payment reporting is not yet available.'});
 try{
  const text=await req.text();if(text.length>5000)return reply(origin,413,{error:'Request too large.'});
  const input=JSON.parse(text),reference=String(input.reference||'').trim(),phone=String(input.phone||'').trim();
  const method=String(input.method||''),transferReference=String(input.transactionReference||'').trim(),amount=Number(input.amount);
  if(!/^DB-[A-Z0-9-]{5,24}$/i.test(reference)||!validPhone(phone)||!['gcash','maya','maribank'].includes(method)||!Number.isFinite(amount)||amount<=0||amount>200000||transferReference.length<5||transferReference.length>100)
   return reply(origin,400,{error:'Please check the order reference, phone number and transfer details.'});
  const token=String(input.turnstileToken||'');if(token.length<20||token.length>2500)return reply(origin,403,{error:'Complete the security check.'});
  const verification=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:env('TURNSTILE_SECRET_KEY'),response:token}),signal:AbortSignal.timeout(8000)});
  const vr=await verification.json();if(!vr.success||vr.hostname!==new URL(origin).hostname)return reply(origin,403,{error:'Security verification failed.'});
  const result=await db.from('orders').select('id,phone,status,payment_status,subtotal,extras_total,delivery_fee')
    .eq('reference',reference).maybeSingle();
  const order=result.data;
  if(result.error||!order||order.phone.replace(/[\s-]/g,'')!==phone.replace(/[\s-]/g,'')||!['confirmed','preparing','ready','out_for_delivery','completed'].includes(order.status)||order.payment_status==='paid'||order.delivery_fee===null)
    return reply(origin,404,{error:'No confirmed unpaid order matched. Check the order reference and mobile number.'});
  const expected=Number(order.subtotal)+Number(order.extras_total)+Number(order.delivery_fee);
  if(Math.abs(expected-amount)>0.005)return reply(origin,400,{error:'The reported amount does not match the bakery-confirmed total.'});
  const recent=await db.from('payment_reports').select('id',{count:'exact',head:true}).eq('order_id',order.id).gte('created_at',new Date(Date.now()-86400000).toISOString());
  if(recent.error||Number(recent.count||0)>=3)return reply(origin,429,{error:'Too many reports for this order today. Contact the bakery.'});
  const ins=await db.from('payment_reports').insert({order_id:order.id,method,amount,transfer_reference:transferReference});
  if(ins.error){if(ins.error.code==='23505')return reply(origin,200,{status:'awaiting_verification',message:'This reference was previously recorded for manual review.'});throw new Error('Could not save transfer report.');}
  return reply(origin,201,{status:'awaiting_verification',message:'Transfer details received for manual verification. This is NOT payment confirmation.'});
 }catch(e){console.error('Report failed',e instanceof Error?e.message:'unknown');return reply(origin,503,{error:'Unable to accept transfer report right now. Please contact the bakery; do not pay twice.'});}
});
