/**
 * DULCE & BANANA V6 — ADMIN-ONLY PayMongo Payment Link management.
 * - Requires a valid Supabase Auth user JWT and explicit admin_users membership.
 * - Requires final delivery fee and confirmed bakery order BEFORE creating link.
 * - All amounts originate from database, never from browser.
 * - Never trusts screenshots, client redirects, or unverified customer reports.
 * - Supports PayMongo API /v1/payment_links (NOT deprecated /v1/links).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || (() => {try{return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||''}catch{return ''}})();
const paymongoKey = Deno.env.get('PAYMONGO_SECRET_KEY') || '';
const paymongoMode = Deno.env.get('PAYMONGO_MODE') || 'live';
const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(x => x.trim()).filter(Boolean);
const db = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey, {auth: {persistSession:false}}) : null;

function cors(origin: string | null) {
  return { 'Access-Control-Allow-Origin': origin && allowedOrigins.includes(origin) ? origin : 'null',
    'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
    'Access-Control-Allow-Methods':'POST,OPTIONS', 'Vary':'Origin'};
}
function respond(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json','Cache-Control':'no-store',...cors(origin)}});
}
function isValidPaymongoUrl(raw: unknown): raw is string {
  try { const u = new URL(String(raw)); return u.protocol==='https:' && (u.hostname==='pm.link' || u.hostname==='paymongo.com' || u.hostname.endsWith('.paymongo.com')); } catch {return false}
}
async function callPaymongo(path: string, method='GET', body?:object) {
  const res=await fetch('https://api.paymongo.com/v1/'+path, {
    method, headers: {'Authorization':`Basic ${btoa(paymongoKey+':')}`,'Accept':'application/json', ...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}), signal:AbortSignal.timeout(15000)
  });
  const data=await res.json().catch(()=>null);
  if(!res.ok) { console.warn('PayMongo API failed',res.status); throw new Error(res.status===401?'PayMongo key is not accepted.':'PayMongo could not process this request. Confirm merchant activation and try again.'); }
  return data;
}
Deno.serve(async req=>{
  const origin=req.headers.get('origin');
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
  if(req.method!=='POST')return respond({error:'Method not allowed.'},405,origin);
  if(!origin || !allowedOrigins.includes(origin))return respond({error:'Origin not authorized.'},403,origin);
  if(!db)return respond({error:'Bakery server is not configured.'},503,origin);
  if(!paymongoKey)return respond({error:'PayMongo merchant setup is not yet connected. You may use the manual QR option after bakery confirmation.'},503,origin);
  if(!['live','test'].includes(paymongoMode)||!paymongoKey.startsWith(paymongoMode==='live'?'sk_live_':'sk_test_'))return respond({error:'PayMongo mode and key do not match. Confirm your merchant setup before issuing links.'},503,origin);
  try {
    const authorization=req.headers.get('Authorization')||'';
    const token=authorization.replace(/^Bearer\s+/i,'');
    if(!token || !/^Bearer\s+/i.test(authorization))return respond({error:'Sign in as a bakery administrator.'},401,origin);
    const {data:auth,error:authErr}=await db.auth.getUser(token);
    if(authErr || !auth?.user)return respond({error:'Your bakery session has expired. Sign in again.'},401,origin);
    const {data:admin,error:adminErr}=await db.from('admin_users').select('user_id').eq('user_id',auth.user.id).maybeSingle();
    if(adminErr || !admin)return respond({error:'You are not authorized to manage payments.'},403,origin);
    const input=await req.json();
    if(!input || !['create','verify'].includes(input.action) || !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(input.order_id||''))return respond({error:'Invalid payment request.'},400,origin);
    const {data:o,error:oErr}=await db.from('orders').select('id,reference,status,subtotal,extras_total,delivery_fee,payment_status,payment_method,paymongo_link_id,paymongo_link_url').eq('id',input.order_id).maybeSingle();
    if(oErr||!o)return respond({error:'Order not found.'},404,origin);
    if(o.payment_status==='paid')return respond({paid:true,message:'This order already has a verified paid status.'},200,origin);
    const total=o.subtotal+o.extras_total+(o.delivery_fee??0);
    if(!Number.isSafeInteger(total)||total<1||total>9999999)return respond({error:'The saved final amount is invalid.'},400,origin);
    if(input.action==='create'){
      if(o.status!=='confirmed')return respond({error:'Confirm baking availability before issuing a payment link.'},409,origin);
      if(o.delivery_fee===null)return respond({error:'Save the final delivery fee first (enter ₱0 for pickup).'},409,origin);
      if(o.paymongo_link_id&&isValidPaymongoUrl(o.paymongo_link_url))return respond({url:o.paymongo_link_url,paid:false,message:'Existing link returned. No duplicate payment link was created.'},200,origin);
      const payment=await callPaymongo('payment_links','POST',{
        amount:total*100,currency:'PHP',description:`Dulce & Banana · ${o.reference}`,
        remarks:`Bakery order ${o.reference}`,metadata:{order_reference:o.reference,order_id:o.id}
      });
      const link=payment?.data;
      if(!link?.id || !isValidPaymongoUrl(link?.url) || link.currency!=='PHP' || link.amount!==total*100 || (link.livemode!==(paymongoMode==='live')))return respond({error:'PayMongo returned an unexpected response. Check your dashboard before retrying to avoid duplicate links.'},502,origin);
      // Mark the order awaiting payment. A successful link creation is NOT a successful payment.
      const {error:saveErr}=await db.from('orders').update({paymongo_link_id:link.id,paymongo_link_url:link.url,payment_method:'paymongo',payment_status:'awaiting_payment',updated_at:new Date().toISOString()}).eq('id',o.id).eq('payment_status','unpaid');
      if(saveErr){console.error('Payment link created but could not attach to order',o.reference);return respond({error:'PayMongo link created, but saving it failed. Do not retry until you check the PayMongo dashboard.'},503,origin)}
      return respond({url:link.url,paid:false,livemode:link.livemode===true,message:'PayMongo link created. Copy the customer message or ask them to track the preorder online.'},201,origin);
    }
    if(!o.paymongo_link_id)return respond({error:'No PayMongo link exists for this order.'},409,origin);
    const payments=await callPaymongo(`payment_links/${encodeURIComponent(o.paymongo_link_id)}/payments?status=paid`);
    const records=Array.isArray(payments?.data)?payments.data:[];
    const verified=records.find((item: any)=>{
      const a=item?.attributes||item;
      return a?.status==='paid' && Number(a?.amount)===total*100 && (!a?.currency||a.currency==='PHP');
    });
    if(!verified)return respond({paid:false,message:'No matching confirmed payment was returned by PayMongo. Do not treat transfer screenshots as payment proof.'},200,origin);
    const {error:verifyErr}=await db.from('orders').update({payment_status:'paid',payment_method:'paymongo',paymongo_payment_id:String(verified.id),payment_verified_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',o.id).eq('paymongo_link_id',o.paymongo_link_id).eq('payment_status','awaiting_payment');
    if(verifyErr)throw verifyErr;
    // Best effort: archive the payment link after confirmed payment to reduce duplicate payments.
    // Even if archiving fails, retain the verified payment record and alert the bakery.
    let archived=false;
    try {await callPaymongo(`payment_links/${encodeURIComponent(o.paymongo_link_id)}`,'PATCH',{archive:true});archived=true;}
    catch {console.warn('Payment link verification succeeded; follow up to archive the link in PayMongo.');}
    return respond({paid:true,message:archived?'PayMongo payment verified and link archived.':'PayMongo payment verified. IMPORTANT: archive the still-active link from your PayMongo dashboard to prevent another payment.'},200,origin);
  }catch(e){console.error('Payment service error',e instanceof Error?e.message:e);return respond({error:'The payment service could not complete that action. Check the PayMongo dashboard before trying again.'},503,origin)}
});
