/**
 * DULCE & BANANA — direct website preorders.
 * Public Edge Function (verify_jwt = false); use Turnstile and server-side validation.
 * Never put service_role or any secret in GitHub Pages.
 * GET reports PUBLIC availability and product prices. POST stores an order securely.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || '' } catch { return '' }
})();
const turnstileSecret = Deno.env.get('TURNSTILE_SECRET_KEY') || '';
const turnstileSiteKey = Deno.env.get('TURNSTILE_SITE_KEY') || '';
const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);
const db = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } }) : null;

function cors(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && allowedOrigins.includes(origin) ? origin : 'null',
    'Access-Control-Allow-Headers': 'apikey,authorization,content-type,x-client-info',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
  };
}
function respond(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
function shortText(s: unknown, max: number) { return typeof s === 'string' ? s.trim().slice(0, max) : ''; }

Deno.serve(async request => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (!origin || !allowedOrigins.includes(origin)) return respond({ error: 'Website origin not authorized.' }, 403, origin);
  if (!['GET','POST'].includes(request.method)) return respond({ error: 'Method not allowed.' }, 405, origin);
  if (!db) return respond({ error: 'The bakery order service has not been configured.' }, 503, origin);

  if (request.method === 'GET') {
    // Public settings and catalogue ONLY. No orders, addresses, names or contact info.
    try {
      const [settingsRes, productsRes, blockedRes] = await Promise.all([
        db.from('bakery_settings').select('accepting_orders,min_notice_hours,daily_limit,allowed_weekdays').eq('id',1).maybeSingle(),
        db.from('products').select('id,name,description,category,price,active').eq('active',true).order('sort_order', { ascending: true }),
        db.from('blocked_dates').select('day').gte('day',new Date().toISOString().slice(0,10))
      ]);
      if(settingsRes.error || productsRes.error || blockedRes.error) throw new Error('Catalog configuration unavailable');
      const configured = Boolean(turnstileSecret && turnstileSiteKey);
      const acceptingOrders = Boolean(configured && settingsRes.data?.accepting_orders);
      return respond({ accepting_orders: acceptingOrders,
        settings: settingsRes.data,
        blockedDates: (blockedRes.data || []).map((d: { day: string }) => d.day),
        products: productsRes.data || [],
        turnstileSiteKey: configured ? turnstileSiteKey : '',
        message: acceptingOrders ? 'Online preorders are open.' : 'Online preorders are currently unavailable.'
      }, 200, origin);
    } catch (e) { console.error('Public bakery availability lookup failed:', e); return respond({ error: 'Bakery ordering is temporarily unavailable.' }, 503, origin); }
  }

  if (!turnstileSecret || !turnstileSiteKey) return respond({ error:'Online ordering is not activated.' },503,origin);
  const length = Number(request.headers.get('content-length') || 0);
  if(length > 18000) return respond({ error:'Request is too large.' },413,origin);
  try {
    const raw = await request.text();
    if (raw.length > 18000) return respond({error:'Request is too large.'},413,origin);
    const input = JSON.parse(raw);
    if (!input || typeof input !== 'object' || typeof input.turnstileToken !== 'string' ||
       input.turnstileToken.length < 20 || input.turnstileToken.length > 2500) {
      return respond({error:'Please complete the security check before placing your order.'},400,origin);
    }
    const challenge = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method:'POST', body:new URLSearchParams({secret:turnstileSecret,response:input.turnstileToken}),
      signal:AbortSignal.timeout(8000)
    });
    const result = await challenge.json();
    if(!result.success) return respond({error:'Security verification failed. Refresh the challenge and try again.'},403,origin);
    const host = new URL(origin).hostname;
    if(result.hostname !== host) return respond({error:'Security verification was for another site.'},403,origin);
    if(!Array.isArray(input.items) || !input.items.length || input.items.length > 16) return respond({error:'Your basket is invalid.'},400,origin);
    for(const key of ['customerName','phone','fulfillment','preferredDate','area'])
      if(typeof input[key]!=='string')return respond({error:'Please complete all required fields.'},400,origin);
    // Resolve an optional server-issued delivery estimate. NEVER accept browser-supplied prices.
    // The quote is valid only briefly. For advance preorders, the final courier fee
    // must be reconfirmed by the bakery near the delivery date.
    let matchedQuote: {id:string,estimate_php:number,route_distance_m:number|null} | null = null;
    const token=typeof input.quoteToken==='string'&&/^[a-f0-9-]{36}$/i.test(input.quoteToken)?input.quoteToken:null;
    if(input.fulfillment==='Delivery'&&token){
      const {data:quote,error:quoteError}=await db.from('delivery_quotes')
        .select('id,dropoff_lat,dropoff_lng,dropoff_address,estimate_php,route_distance_m,expires_at')
        .eq('id',token).gt('expires_at',new Date().toISOString()).maybeSingle();
      const d=input.deliveryDestination;
      if(!quoteError&&quote&&d&&
        String(quote.dropoff_address).trim()===String(input.area).trim()&&
        Math.abs(Number(quote.dropoff_lat)-Number(d.lat))<0.00001&&
        Math.abs(Number(quote.dropoff_lng)-Number(d.lng))<0.00001){
        matchedQuote={id:quote.id,estimate_php:Number(quote.estimate_php),route_distance_m:quote.route_distance_m===null?null:Number(quote.route_distance_m)};
      }
    }
    const {data, error} = await db.rpc('create_preorder',{
      p_customer_name:shortText(input.customerName,101), p_phone:shortText(input.phone,30),
      p_email:shortText(input.email,181) || null, p_fulfillment:shortText(input.fulfillment,12),
      p_preferred_date:shortText(input.preferredDate,20),p_area:shortText(input.area,241),
      p_notes:shortText(input.notes,501),p_gift:input.gift===true,
      p_gift_message:shortText(input.giftMessage,161), p_items:input.items
    });
    if(error){
      console.warn('Bakery preorder rejected:',error.code);
      const message = String(error.message || 'Invalid preorder.');
      // Permit safe field validation errors; do not expose sensitive SQL diagnostics.
      const permitted = ['closed','Name','mobile','email','delivery','pickup','date','product','quantity','basket','order limit','topping','too large','notes','available','unavailable'];
      const safe = permitted.some(w=>message.toLowerCase().includes(w.toLowerCase()))?message:'Order submission failed. Please review your details.';
      return respond({error:safe},400,origin);
    }
    if(matchedQuote){
      const saved=await db.from('orders').update({
        delivery_quote_id:matchedQuote.id,
        delivery_estimate_php:matchedQuote.estimate_php,
        delivery_distance_m:matchedQuote.route_distance_m
      }).eq('reference',data);
      if(saved.error)console.warn('Delivery quote was not attached to the created order:', saved.error.code);
    }
    return respond({reference:data,status:'pending_review',delivery_estimate:matchedQuote?.estimate_php??null,
      message:'Your preorder was received. The delivery estimate is not a final charge, and no payment has been collected.'},201,origin);
  } catch(e) {
    console.error('Preorder request error:', e instanceof Error ? e.message : 'Unknown');
    return respond({error:'Unable to submit the order right now. Please check later or contact the bakery.'},503,origin);
  }
});
