/**
 * Dulce & Banana: live delivery QUOTE from Lalamove.
 * Public guest endpoint protected with Cloudflare Turnstile; no customer data is exposed to other visitors.
 * Must deploy with verify_jwt=false. Stores short-lived quote privately in Supabase.
 * Requires LALAMOVE_API_KEY, LALAMOVE_API_SECRET, LALAMOVE_PICKUP_LAT, LALAMOVE_PICKUP_LNG,
 * LALAMOVE_MODE (sandbox|production), ALLOWED_ORIGINS, TURNSTILE_SECRET_KEY.
 * NO ORDERS ARE BOOKED BY THIS FUNCTION.
 */
import {createClient} from 'npm:@supabase/supabase-js@2';
const url=Deno.env.get('SUPABASE_URL')||'';
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||(()=>{try{return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||''}catch{return ''}})();
const db=url&&serviceKey?createClient(url,serviceKey,{auth:{persistSession:false}}):null;
const origins=(Deno.env.get('ALLOWED_ORIGINS')||'').split(',').map(x=>x.trim()).filter(Boolean);
const apiKey=Deno.env.get('LALAMOVE_API_KEY')||'';
const apiSecret=Deno.env.get('LALAMOVE_API_SECRET')||'';
const pickupLat=Number(Deno.env.get('LALAMOVE_PICKUP_LAT'));
const pickupLng=Number(Deno.env.get('LALAMOVE_PICKUP_LNG'));
const turnstileSecret=Deno.env.get('TURNSTILE_SECRET_KEY')||'';
const mode=Deno.env.get('LALAMOVE_MODE')||'sandbox';
const vehicle=Deno.env.get('LALAMOVE_SERVICE_TYPE')||'MOTORCYCLE';
const ready=Boolean(db&&apiKey&&apiSecret&&turnstileSecret&&Number.isFinite(pickupLat)&&Number.isFinite(pickupLng)&&pickupLat>5&&pickupLng>116&&['sandbox','production'].includes(mode));
const cors=(origin:string|null)=>({
  'Access-Control-Allow-Origin': origin&&origins.includes(origin)?origin:'null',
  'Access-Control-Allow-Headers':'apikey,authorization,content-type,x-client-info',
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  'Vary':'Origin'
});
const json=(origin:string|null,status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:{...cors(origin),'Content-Type':'application/json','Cache-Control':'no-store'}});
const host=mode==='production'?'https://rest.lalamove.com':'https://rest.sandbox.lalamove.com';
async function verifyTurnstile(token:string,origin:string){
  const res=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
    method:'POST',body:new URLSearchParams({secret:turnstileSecret,response:token}),signal:AbortSignal.timeout(8000)
  });
  const result=await res.json();
  return Boolean(result.success&&result.hostname===new URL(origin).hostname);
}
async function quotation(dest:{lat:number,lng:number,address:string}){
 const payload={data:{serviceType:vehicle,language:'en_PH',stops:[
  {coordinates:{lat:String(pickupLat),lng:String(pickupLng)},address:'Velmont Residences, Gatchalian, Las Piñas, Metro Manila, Philippines'},
  {coordinates:{lat:String(dest.lat),lng:String(dest.lng)},address:dest.address}
 ]}};
 const body=JSON.stringify(payload),timestamp=String(Date.now()),path='/v3/quotations';
 const signatureText=`${timestamp}\r\nPOST\r\n${path}\r\n\r\n${body}`;
 const signingKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(apiSecret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const hmac=await crypto.subtle.sign('HMAC',signingKey,new TextEncoder().encode(signatureText));
 const hash=[...new Uint8Array(hmac)].map(x=>x.toString(16).padStart(2,'0')).join('');
 const response=await fetch(host+path,{method:'POST',headers:{
  'Content-Type':'application/json','Authorization':`hmac ${apiKey}:${timestamp}:${hash}`,
  'Market':'PH','Request-ID':crypto.randomUUID()
 },body,signal:AbortSignal.timeout(12000)});
 const data=await response.json();
 if(!response.ok){console.warn('Lalamove quotation HTTP',response.status,data?.message||'');throw new Error(response.status===422?'This destination or vehicle option could not be quoted.':'The courier could not supply a live quote.');}
 const quote=data?.data;
 const total=Number(quote?.priceBreakdown?.total);
 if(!quote?.quotationId||!Number.isFinite(total)||total<0||quote.priceBreakdown.currency!=='PHP')throw new Error('Unexpected courier quote format.');
 const expiresAt=String(quote.expiresAt||new Date(Date.now()+5*60000).toISOString());
 const distance=Number(quote?.distance?.value);
 return {quotationId:String(quote.quotationId),total,expiresAt,distance:Number.isFinite(distance)?distance:null};
}
Deno.serve(async req=>{
 const origin=req.headers.get('origin');
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
 if(!origin||!origins.includes(origin))return json(origin,403,{error:'Website origin not allowed.'});
 if(req.method==='GET')return json(origin,200,{configured:ready,pickup:'Velmont Residences, Las Piñas',mode:mode==='production'?'live':'test'});
 if(req.method!=='POST')return json(origin,405,{error:'Method not allowed.'});
 if(!ready)return json(origin,503,{error:'Live Lalamove pricing is not configured. The bakery will confirm delivery manually.'});
 const length=Number(req.headers.get('content-length')||0);if(length>5000)return json(origin,413,{error:'Request too large.'});
 try{
  const bodyText=await req.text();if(bodyText.length>5000)return json(origin,413,{error:'Request too large.'});
  const input=JSON.parse(bodyText),dest=input?.destination;
  const latitude=Number(dest?.lat),longitude=Number(dest?.lng),address=String(dest?.address||'').trim();
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude<5||latitude>22||longitude<116||longitude>127||address.length<10||address.length>240)
    return json(origin,400,{error:'Provide a complete delivery address and accurate Philippine delivery pin.'});
  if(typeof input.turnstileToken!=='string'||input.turnstileToken.length<20||input.turnstileToken.length>2500||!(await verifyTurnstile(input.turnstileToken,origin)))
    return json(origin,403,{error:'Please complete the security check to request a live quote.'});
  const result=await quotation({lat:latitude,lng:longitude,address});
  if(Date.parse(result.expiresAt)<=Date.now())return json(origin,503,{error:'The courier quote already expired. Try again.'});
  const {data,error}=await db!.from('delivery_quotes').insert({
   lalamove_quote_id:result.quotationId,dropoff_lat:latitude,dropoff_lng:longitude,
   dropoff_address:address,estimate_php:result.total,route_distance_m:result.distance,expires_at:result.expiresAt
  }).select('id').single();
  if(error||!data)throw new Error('The server could not store the courier quote.');
  return json(origin,201,{quoteToken:data.id,fee:result.total,currency:'PHP',distanceKm:result.distance===null?null:result.distance/1000,expiresAt:result.expiresAt,estimateOnly:true,pickup:'Velmont Residences, Las Piñas'});
 }catch(e){console.error('Lalamove quotation error',e instanceof Error?e.message:'unknown');return json(origin,503,{error:'No live courier quotation is available for this address right now. Please try again or request manual confirmation.'});}
});
