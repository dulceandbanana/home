'use strict';
/* Dulce & Banana storefront. Public only; do not add API secrets or customer data to localStorage. */
const $=id=>document.getElementById(id);
const CONFIG=window.DB_CONFIG||{};
const FB_URL=CONFIG.facebookUrl||'https://www.facebook.com/share/19aByiSkb9/';
const serviceReady=Boolean(CONFIG.supabaseUrl);
let turnstilePublicSiteKey=CONFIG.turnstileSiteKey||'';
const php=n=>`₱${Number(n).toLocaleString('en-PH',{maximumFractionDigits:0})}`;
const icon=id=>`<svg class="ico" aria-hidden="true"><use href="#i-${id}"></use></svg>`;
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const images={muffins:'assets/muffins.webp',muffinsFour:'assets/muffins-four.webp',muffinsSix:'assets/muffins-six.webp',muffinSolo:'assets/muffin-solo.webp',loaf:'assets/banana-loaf-plain.webp',loafTopped:'assets/banana-loaf-topped.webp',cookiesSolo:'assets/cookies-solo.webp',cookiesSix:'assets/cookies-six.webp',cookiesTwelve:'assets/cookies-twelve.webp'};
let products=[
{id:'m4',name:'B’ Muffins · Box of 4',price:150,category:'muffins',image:images.muffinsFour,tag:'For sharing',quantityLabel:'4 MUFFINS',photoHasBadge:true,concept:true,desc:'Four home-baked muffins, ready to share.'},
{id:'m6',name:'B’ Muffins · Box of 6',price:180,category:'muffins',image:images.muffinsSix,tag:'Family favorite',quantityLabel:'6 MUFFINS',photoHasBadge:true,concept:true,desc:'Six muffins for a sweet snack break.'},
{id:'ms',name:'B’ Muffins · Solo',price:50,category:'muffins',image:images.muffinSolo,tag:'Just for you',desc:'A little homemade pick-me-up.'},
{id:'loaf',name:'D’ Banana Loaf',price:170,category:'loaf',image:images.loaf,tag:'Comfort food',quantityLabel:'NO TOPPINGS',photoHasBadge:false,concept:true,desc:'Original banana loaf, without toppings. Add toppings for ₱20.'},
{id:'loaf-top',name:'D’ Banana Loaf + Toppings',price:190,category:'loaf',image:images.loafTopped,tag:'Extra special',quantityLabel:'WITH TOPPINGS',photoHasBadge:false,concept:true,desc:'Our original banana loaf finished with toppings (+₱20).'},
{id:'c6',name:'B’ Cookies · Box of 6',price:160,category:'cookies',image:images.cookiesSix,tag:'For sharing',desc:'Six cookies for little moments.',concept:true},
{id:'c12',name:'B’ Cookies · Box of 12',price:300,category:'cookies',image:images.cookiesTwelve,tag:'For gifting',desc:'Twelve cookies for celebrations.',concept:true},
{id:'cs',name:'B’ Cookies · Solo',price:50,category:'cookies',image:images.cookiesSolo,tag:'Just for you',desc:'One cookie for a sweet break.',concept:true}
];
const byId=()=>Object.fromEntries(products.map(p=>[p.id,p]));
const storage={get(k){try{return localStorage.getItem(k)}catch{return null}},set(k,v){try{localStorage.setItem(k,v)}catch{}}};
let cart={};
try{const saved=JSON.parse(storage.get('db-cart-v5')||'{}');for(const [k,q] of Object.entries(saved)){const id=k.split(':')[0];if(byId()[id]&&Number.isInteger(q)&&q>0&&q<=99)cart[k]=q}}catch{}
let currentFilter='all',selectedProduct=null,selectedQty=1,focusBefore=null,openDialog=null,configSettings=null,blockedDates=[],liveEnabled=false,checkoutStage='basket';
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const localPHDate=offset=>{const now=new Date(Date.now()+offset*864e5);const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${map.year}-${map.month}-${map.day}`};
const cartKey=(id,toppings=false)=>(id==='loaf-top'||(id==='loaf'&&toppings))?'loaf:toppings':id;
const itemFromKey=key=>{const id=key.split(':')[0],p=byId()[id];return p?{...p,key,toppings:key==='loaf:toppings',unitPrice:p.price+(key==='loaf:toppings'?20:0),image:key==='loaf:toppings'?images.loafTopped:p.image}:null};
let toastTimer;
function flash(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600)}
function renderProducts(){
 const selected=products.filter(p=>currentFilter==='all'||p.category===currentFilter);
 $('productGrid').innerHTML=selected.map(p=>`<article class="product-card"><div class="product-photo ${p.concept?'product-full-frame':''}"><button type="button" class="product-image-button" data-detail="${p.id}" aria-label="View ${escapeHtml(p.name)} details"><img class="product-main" src="${p.image}" alt="${p.concept?'Illustrative photo of':'Photo of'} ${escapeHtml(p.name)}" loading="lazy" decoding="async"></button>${p.photoHasBadge?'':`<span class="pill">${escapeHtml(p.tag)}</span>`}</div><div class="product-details"><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.desc)}</p><button type="button" class="view-details" data-detail="${p.id}">View details${p.id.startsWith('loaf')?' & options':''}</button><div class="product-bottom"><strong class="price">${php(p.price)}</strong><button type="button" data-add="${p.id}" class="add-button" aria-label="Add ${escapeHtml(p.name)} to basket">${icon('plus')}<span>Add to basket</span></button></div></div></article>`).join('')||'<p>No products available in this category right now.</p>';
}
function itemSubtotal(){return Object.entries(cart).reduce((sum,[k,q])=>sum+(itemFromKey(k)?.unitPrice||0)*q,0)}
function giftAmount(){return Object.keys(cart).length&&$('giftExtra').checked?10:0}
function refreshCart(){
 cart=Object.fromEntries(Object.entries(cart).filter(([k,q])=>itemFromKey(k)&&q>0));storage.set('db-cart-v5',JSON.stringify(cart));
 const n=Object.values(cart).reduce((sum,q)=>sum+q,0);$('basketCount').textContent=n;$('mobileCount').textContent=n;if($('navCartAmount'))$('navCartAmount').textContent=php(itemSubtotal()+giftAmount());if($('mobileCartAmount'))$('mobileCartAmount').textContent=php(itemSubtotal()+giftAmount());
 $('itemsSubtotal').textContent=php(itemSubtotal());$('extrasTotal').textContent=php(giftAmount());$('grandTotal').textContent=php(itemSubtotal()+giftAmount());window.DB_DELIVERY?.updateSummary();$('checkoutButton').disabled=!n||!liveEnabled;
 $('basketMiniSubtotal').textContent=php(itemSubtotal());
 $('cartItems').innerHTML=n?Object.entries(cart).map(([k,q])=>{const p=itemFromKey(k);return `<div class="cart-item"><div class="cart-line-main"><img src="${p.image}" class="cart-line-img" alt=""><div class="cart-item-inner"><h3>${escapeHtml(p.name)}</h3>${p.toppings?'<small class="smallvariant">With toppings +₱20</small>':''}<small>${php(p.unitPrice)} each</small><div class="qty-line"><button type="button" data-qty="${k}" data-delta="-1" aria-label="Reduce ${escapeHtml(p.name)} quantity">${icon('minus')}</button><strong>${q}</strong><button type="button" data-qty="${k}" data-delta="1" aria-label="Increase ${escapeHtml(p.name)} quantity">${icon('plus')}</button><button class="remove" type="button" data-remove="${k}" aria-label="Remove ${escapeHtml(p.name)}">${icon('trash')}</button></div></div></div><strong>${php(p.unitPrice*q)}</strong></div>`}).join(''):'<p class="notice">Your basket is empty. Choose a treat from the menu to start.</p>';
 $('giftNoteWrap').hidden=!$('giftExtra').checked;
 if(checkoutStage==='review' && !$('checkoutSuccess').hidden) return;
 if(checkoutStage==='review') renderReview();
}
function add(id,toppings=false,qty=1){const p=byId()[id];if(!p)return;const k=cartKey(id,toppings);cart[k]=Math.min(99,(cart[k]||0)+qty);refreshCart();flash(`${p.name} added to basket`)}
function showDrawer(open){const drawer=$('cartDrawer');if(open){focusBefore=document.activeElement;if($('checkoutSuccess').hidden) setCheckoutStage('basket',false);}drawer.classList.toggle('open',open);$('shade').classList.toggle('open',open);drawer.setAttribute('aria-hidden',String(!open));document.body.style.overflow=open?'hidden':'';$('mobileBasket').style.visibility=open?'hidden':'';if(open)$('closeBasket').focus();else if(focusBefore instanceof HTMLElement)focusBefore.focus()}
function openModal(id){const m=$(id);focusBefore=document.activeElement;m.classList.add('open');m.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';openDialog=m;const first=m.querySelector('button,input,[href]');first?.focus()}
function closeModal(){if(!openDialog)return;openDialog.classList.remove('open');openDialog.setAttribute('aria-hidden','true');openDialog=null;document.body.style.overflow='';if(focusBefore instanceof HTMLElement)focusBefore.focus()}
function showProduct(id){const p=byId()[id];if(!p)return;selectedProduct=p;selectedQty=1;$('productQty').textContent='1';const loaf=id==='loaf'||id==='loaf-top';$('toppingsCheck').checked=id==='loaf-top';$('toppingsWrap').hidden=!loaf;$('productTitle').textContent=p.name;$('productModalPrice').textContent=php(p.price);$('productModalDescription').textContent=p.desc;$('productModalImg').src=p.image;$('productModalImg').alt=p.concept?`Illustrative concept for ${p.name}`:`${p.name} product photo`;$('photoDisclosure').textContent=p.concept?'Illustrative product photo. Actual baked goods and packaging may differ.':'';openModal('productModal')}
function setTheme(dark){document.body.classList.toggle('dark',dark);$('themeButton').innerHTML=icon(dark?'sun':'moon');$('themeButton').setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');storage.set('db-theme',dark?'dark':'light')}
function closeMenu(){$('navLinks').classList.remove('open');$('mobileMenu').setAttribute('aria-expanded','false');$('mobileMenu').innerHTML=icon('menu')}
function orderPayload(){const items=Object.entries(cart).map(([k,quantity])=>({id:k.split(':')[0],quantity,toppings:k==='loaf:toppings'}));return {customerName:$('customerName').value.trim(),phone:$('mobileNumber').value.trim(),email:$('emailAddress').value.trim()||null,fulfillment:$('fulfillment').value,preferredDate:$('orderDate').value,area:$('orderArea').value.trim()||($('fulfillment').value==='Pickup'?'Pickup at arranged location':''),notes:$('orderNotes').value.trim(),gift:!!$('giftExtra').checked,giftMessage:$('giftExtra').checked?$('giftMessage').value.trim():'',items,...(window.DB_DELIVERY?.orderFields()||{}),turnstileToken:getCaptchaToken()}}
function summaryText(data=orderPayload()){
 const rows=Object.entries(cart).map(([k,q])=>{const p=itemFromKey(k);return `${q} × ${p.name}${p.toppings?' + toppings':''} — ${php(p.unitPrice*q)}`});
 return `Hello Dulce & Banana! I'd like to request a preorder:\n\n${rows.join('\n')}${data.gift?'\nRibbons and card — ₱10':''}${data.giftMessage?'\nGift note: '+data.giftMessage:''}\n\nEstimated subtotal (excludes delivery): ${php(itemSubtotal()+giftAmount())}\nName: ${data.customerName}\nMobile: ${data.phone}${data.email?'\nEmail: '+data.email:''}\nMethod: ${data.fulfillment}\nPreferred date: ${data.preferredDate}\nDelivery area or pickup notes: ${data.area}${data.notes?'\nSpecial instructions: '+data.notes:''}\n\nPlease confirm availability, delivery fees, final total and payment instructions. No payment has been made. Thank you!`;
}
async function copyText(text){try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);return true}}catch{}$('orderSummary').value=text;$('orderSummary').select();try{return document.execCommand('copy')}catch{return false}}
async function apiFetch(path,options={}){
 if(!serviceReady)throw new Error('Online ordering is not configured.');
 const url=CONFIG.supabaseUrl.replace(/\/$/,'')+path;
 const headers={...(CONFIG.supabaseAnonKey?{'apikey':CONFIG.supabaseAnonKey}:{}),...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})};
 // Public Edge Functions use verify_jwt=false and server-side Turnstile verification;
 // a browser must never hold service_role credentials.
 const resp=await fetch(url,{...options,headers,cache:'no-store'});
 let data;try{data=await resp.json()}catch{data=null}
 if(!resp.ok)throw new Error(data?.error||`Request failed (${resp.status})`);
 return data;
}
function getCaptchaToken(){
 try{
  if(window.turnstile&&captchaWidget!==null&&typeof window.turnstile.getResponse==='function'){
   const token=window.turnstile.getResponse(captchaWidget);
   if(token)return token;
  }
 }catch{}
 return document.querySelector('#captchaMount input[name="cf-turnstile-response"]')?.value||'';
}
function updateCartCheckout(){
 const active=serviceReady&&liveEnabled;
 $('checkoutButton').innerHTML=active?`Place preorder on this website ${icon('arrow')}`:`Online ordering unavailable ${icon('x')}`;
 $('checkoutButton').disabled=!active||!Object.keys(cart).length;
 $('checkoutIntro').textContent=active?'Your request goes directly to our bakery dashboard. We confirm availability and final delivery fees before you pay.':'Direct online ordering is not active right now. Your basket is saved here, but no order can be submitted until the bakery opens ordering.';
 $('availabilityMessage').textContent=active?'Online preorders open · bakery confirmation required':'Online preorder service not active · Las Piñas';
 const notice=$('directOrderNotice');if(notice){notice.hidden=active;notice.textContent='Online ordering is being connected. Orders cannot be received yet; please check back later.';}
}
const checkoutOrder=['basket','details','review'];
function setCheckoutStage(stage,focus=true){
 if(!checkoutOrder.includes(stage))return;
 checkoutStage=stage;
 const heading=$('cartDrawer').querySelector('.cart-head h2');
 if(heading)heading.textContent=stage==='basket'?'Your basket.':stage==='details'?'Your details.':'Review & confirm.';
 for(const name of checkoutOrder){const el=$('checkoutStage'+name[0].toUpperCase()+name.slice(1));el.hidden=name!==stage;}
 document.querySelectorAll('[data-checkout-step]').forEach(el=>{
  const i=checkoutOrder.indexOf(el.dataset.checkoutStep),current=checkoutOrder.indexOf(stage);
  el.classList.toggle('current',i===current);el.classList.toggle('completed',i<current);
  el.setAttribute('aria-current',i===current?'step':'false');
 });
 if(stage==='review'){renderReview();if(liveEnabled)requestAnimationFrame(()=>mountCaptcha());}
 if(stage==='details')window.DB_DELIVERY?.onDetailsOpen();
 if(focus){$('cartDrawer').querySelector('.cart-scroll').scrollTop=0;const h=$('checkoutStage'+stage[0].toUpperCase()+stage.slice(1)).querySelector('h3');h?.setAttribute('tabindex','-1');h?.focus({preventScroll:true});}
}
function detailsValid(){
 validateDate();
 const controls=[...$('checkoutStageDetails').querySelectorAll('input,select,textarea')].filter(el=>!el.closest('#giftNoteWrap[hidden]'));
 for(const el of controls){if(!el.checkValidity()){if(checkoutStage!=='details')setCheckoutStage('details',false);el.reportValidity();el.focus();return false;}}
 return true;
}
function advanceToReview(){if(!Object.keys(cart).length){setCheckoutStage('basket');flash('Add a treat before checkout');return;}if(!detailsValid())return;window.DB_DELIVERY?.updateSummary();setCheckoutStage('review');}
function renderReview(){
 if(!$('reviewItems'))return;
 $('reviewItems').innerHTML=Object.entries(cart).map(([key,qty])=>{
  const p=itemFromKey(key);return `<div class="review-line"><span>${escapeHtml(String(qty))} × ${escapeHtml(p.name)}${p.toppings?' · Toppings':''}</span><strong>${php(p.unitPrice*qty)}</strong></div>`;
 }).join('');
 window.DB_DELIVERY?.updateSummary();
 const method=$('fulfillment').value||'Delivery',date=$('orderDate').value;
 $('reviewDetails').innerHTML=`<div><span>Customer</span><strong>${escapeHtml($('customerName').value.trim()||'Not entered')}</strong></div><div><span>Fulfillment</span><strong>${escapeHtml(method)}</strong></div><div><span>Preferred date</span><strong>${escapeHtml(date||'Not selected')}</strong></div><div><span>Area / pickup</span><strong>${escapeHtml($('orderArea').value.trim()||'Not entered')}</strong></div>`;
}

async function loadBackend(){
 if(!serviceReady){liveEnabled=false;updateCartCheckout();return}
 try{
  // The public Edge Function exposes only safe catalogue and baking-date availability.
  // No publishable API key is necessary for the public customer preorder flow.
  const publicState=await apiFetch('/functions/v1/place-order',{method:'GET'});
  configSettings=publicState.settings||null;
  blockedDates=Array.isArray(publicState.blockedDates)?publicState.blockedDates:[];
  turnstilePublicSiteKey=publicState.turnstileSiteKey||CONFIG.turnstileSiteKey||'';
  liveEnabled=publicState.accepting_orders===true&&!!turnstilePublicSiteKey;
  if(Array.isArray(publicState.products)&&publicState.products.length){
   const existing=byId();
   const updated=publicState.products.filter(p=>existing[p.id]&&p.active!==false).map(p=>({...existing[p.id],name:p.name||existing[p.id].name,price:Number(p.price),desc:p.description||existing[p.id].desc}));
   const plainLoaf=updated.find(p=>p.id==='loaf');
   if(plainLoaf&&!updated.some(p=>p.id==='loaf-top'))updated.splice(updated.indexOf(plainLoaf)+1,0,{...existing['loaf-top'],price:plainLoaf.price+20});
   if(updated.length)products=updated;
   renderProducts();refreshCart();
  }
  if(configSettings?.min_notice_hours){const offset=Math.ceil(Number(configSettings.min_notice_hours)/24);$('orderDate').min=localPHDate(offset);$('dateHint').textContent=`Request at least ${configSettings.min_notice_hours} hours ahead. All dates are subject to bakery approval.`}
  updateCartCheckout();
  // Mount the security widget when the review step is visible, not while it is hidden.
  window.DB_DELIVERY?.enableQuoteCaptcha();
 }catch(err){
  console.warn('Online orders are not yet receiving submissions:',err.message);
  liveEnabled=false;updateCartCheckout();
 }
}
function validateDate(){const date=$('orderDate').value;if(!date)return true;if(date<$('orderDate').min){$('orderDate').setCustomValidity('Please choose a later date.');return false}if(liveEnabled&&configSettings){const weekday=new Date(date+'T12:00:00+08:00').getUTCDay();const actual=weekday;if(blockedDates.includes(date)||!configSettings.allowed_weekdays?.includes(actual)){$('orderDate').setCustomValidity('This date is not currently open for preorders.');return false}}$('orderDate').setCustomValidity('');return true}
let captchaWidget=null;
function mountCaptcha(){
 if(!turnstilePublicSiteKey||!serviceReady||!liveEnabled)return;
 const help=$('captchaHelp');
 const mount=()=>{
  if(!window.turnstile)return;
  if(captchaWidget!==null)return;
  try{
   captchaWidget=window.turnstile.render('#captchaMount',{
    sitekey:turnstilePublicSiteKey,theme:'auto',
    callback:()=>{if(help)help.textContent='Security check complete. You may place your preorder.';},
    'expired-callback':()=>{if(help)help.textContent='Security verification expired. Please complete it again.';},
    'error-callback':()=>{if(help)help.textContent='Security check could not load. Turn off content blockers for this page and refresh.';}
   });
   if(help)help.textContent='Please complete the security check above before placing your order.';
  }catch(error){
   if(help)help.textContent='Security check failed to initialize. Refresh the page and try again.';
   console.warn('Turnstile could not render',error);
  }
 };
 if(window.turnstile){mount();return;}
 // Avoid repeated script tags if customers revisit the Review step.
 if(document.getElementById('db-turnstile-script'))return;
 window.onDbTurnstile=mount;
 const script=document.createElement('script');
 script.id='db-turnstile-script';
 script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onDbTurnstile';
 script.async=true;script.defer=true;
 script.onerror=()=>{if(help)help.textContent='The security check could not load. Check your connection or disable script blocking, then refresh.';};
 document.head.append(script);
}
async function handleCheckout(e){
 e.preventDefault();
 if(checkoutStage!=='review'){advanceToReview();return;}
 if(!Object.keys(cart).length){setCheckoutStage('basket');return;}
 if(!detailsValid()||!$('checkoutForm').reportValidity())return;
 if(!liveEnabled){
  $('checkoutStatus').textContent='Online orders are not activated. Your request has NOT been sent or received. Please check back later.';
  return;
 }
 if(getCaptchaToken().length<20){
  $('checkoutStatus').textContent='Please complete the security check above, then place your preorder.';
  if(captchaWidget===null)mountCaptcha();
  $('captchaMount').scrollIntoView({block:'center',behavior:reducedMotion()?'auto':'smooth'});
  return;
 }
 const payload=orderPayload(),button=$('checkoutButton');
 button.disabled=true;
 $('checkoutStatus').textContent='Sending your preorder securely…';
 try{
  const result=await apiFetch('/functions/v1/place-order',{method:'POST',body:JSON.stringify(payload)});
  if(!result.reference||result.status!=='pending_review')throw new Error('The server did not confirm the preorder.');
  $('trackingRef').value=result.reference;
  $('trackingPhone').value=payload.phone;
  $('successReference').textContent=result.reference;
  $('successMessage').textContent='Preorder received! We will review your requested baking date and exact amount. The bakery will personally confirm by text message or email. Payment is not yet required.';
  cart={};refreshCart();
  $('checkoutReviewContent').hidden=true;
  $('checkoutSuccess').hidden=false;
  $('afterOrderTracking').hidden=false;
  $('checkoutStatus').textContent='';
  $('checkoutStageReview').scrollIntoView({block:'start',behavior:reducedMotion()?'auto':'smooth'});
 }catch(err){
  console.warn('Preorder submission could not be confirmed:',err.message);
  $('checkoutStatus').textContent='We could not confirm receipt of your preorder. Please do not pay or resubmit repeatedly. Check your connection, then try again. '+(err.message||'');
  if(window.turnstile&&captchaWidget!==null)try{window.turnstile.reset(captchaWidget)}catch{}
 }finally{button.disabled=!liveEnabled||!Object.keys(cart).length;}
}
async function checkOrder(e){
 e.preventDefault();
 const output=$('trackingResult'),panel=$('paymentMethods');
 panel.hidden=true;$('dbPaymentDetails').hidden=true;$('dbPaymentConfirmed').checked=false;
 const confirmationLabel=$('dbPaymentConfirmed').closest('label');
 if(confirmationLabel)confirmationLabel.style.display='';
 if(!serviceReady){output.textContent='Direct order tracking is not connected yet. If you placed an order through Facebook, please contact the bakery there.';return;}
 output.textContent='Checking your preorder…';
 try{
  const response=await apiFetch('/functions/v1/check-order',{method:'POST',body:JSON.stringify({reference:$('trackingRef').value.trim(),phone:$('trackingPhone').value.trim()})});
  const state=String(response.status||'pending_review').replaceAll('_',' ');
  const paid=String(response.payment_status||'unpaid').replaceAll('_',' ');
  const approved=['confirmed','preparing','ready','out_for_delivery','completed'].includes(response.status)&&Number.isInteger(response.final_total);
  const total=approved?`<p class="payment-due">Confirmed total: <strong>${php(response.final_total)}</strong></p>`:'';
  const paymentUrl=typeof response.payment_url==='string'&&/^https:\/\/(pm\.link|[a-z0-9.-]*paymongo\.com)\//i.test(response.payment_url)?response.payment_url:'';
  const link=(paymentUrl&&CONFIG.paymentMode!=='manual-qr')?`<a class="btn btn-gold btn-full payment-verified-link" href="${escapeHtml(paymentUrl)}" target="_blank" rel="noopener noreferrer">Pay securely via PayMongo ${icon('arrow')}</a>`:'';
  output.innerHTML=`<div class="order-status"><small>Order ${escapeHtml(response.reference||'')}</small><strong>${escapeHtml(state)}</strong><span>Payment status: <b>${escapeHtml(paid)}</b></span>${total}${link}<p>${escapeHtml(response.message||'Your request is being reviewed.')}</p></div>`;
  if(approved&&response.payment_status!=='paid'&&response.payment_status!=='refunded'){
   panel.hidden=false;
   const feature=panel.querySelector('.db-paymongo-feature');
   feature.hidden=CONFIG.paymentMode==='manual-qr'||!!paymentUrl;
   const featureButton=feature.querySelector('.db-paymongo-track');if(featureButton)featureButton.hidden=true;
   const text=panel.querySelector('.db-payment-head p');
   text.textContent=CONFIG.paymentMode==='manual-qr'?'Your order is approved. Choose GCash, Maya or MariBank, scan or save the QR, and report your transaction reference below. We will verify the actual transfer.':paymentUrl?'Your secure payment link is above. Manual QR transfer is only a backup if the bakery specifically approves it.':'Your bakery has approved this order. Request payment instructions from the bakery before transferring.';
   $('dbPayOrderRef').value=response.reference||'';
   if(Number.isInteger(response.final_total)){
    $('dbPayAmount').value=String(response.final_total);
    $('dbPaymentConfirmedTotal').textContent=php(response.final_total);
   }
   // Supabase confirms this is an approved, unpaid order with a final amount.
   // Show the QR card immediately: a second attestation checkbox is unnecessary.
   $('dbPaymentConfirmed').checked=true;
   if(confirmationLabel)confirmationLabel.style.display='none';
   $('dbPaymentConfirmed').dispatchEvent(new Event('change',{bubbles:true}));
  }
 }catch(err){output.textContent='Order not found for that reference and phone, or tracking is temporarily unavailable. Please verify your details or contact us.';}
}

function handleDelegatedClick(event){
 const addBtn=event.target.closest('[data-add]');if(addBtn){add(addBtn.dataset.add);return}
 const detail=event.target.closest('[data-detail]');if(detail){showProduct(detail.dataset.detail);return}
 const adjust=event.target.closest('[data-qty]');if(adjust){const key=adjust.dataset.qty;cart[key]=Math.min(99,Math.max(0,(cart[key]||0)+Number(adjust.dataset.delta)));refreshCart();return}
 const remove=event.target.closest('[data-remove]');if(remove){delete cart[remove.dataset.remove];refreshCart();return}
 const filter=event.target.closest('[data-filter]');if(filter){currentFilter=filter.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{const active=b===filter;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});renderProducts();return}
 const featured=event.target.closest('[data-feature]');if(featured){document.querySelector(`[data-filter="${featured.dataset.feature}"]`)?.click();$('menu').scrollIntoView({behavior:reducedMotion()?'auto':'smooth'});return}
 if(event.target.closest('[data-close-modal]')){closeModal();return}
 if(event.target.closest('.nav-links a'))closeMenu();
}
function setup(){
 $('year').textContent=String(new Date().getFullYear());$('orderDate').min=localPHDate(1);
 setTheme(storage.get('db-theme')==='dark');renderProducts();setCheckoutStage('basket',false);refreshCart();updateCartCheckout();
 $('continueToDetails').addEventListener('click',()=>Object.keys(cart).length?setCheckoutStage('details'):flash('Your basket is empty'));
 $('backToBasket').addEventListener('click',()=>setCheckoutStage('basket'));
 $('continueToReview').addEventListener('click',advanceToReview);
 $('backToDetails').addEventListener('click',()=>setCheckoutStage('details'));
 $('startAnotherOrder').addEventListener('click',()=>{ $('checkoutSuccess').hidden=true; $('checkoutReviewContent').hidden=false;setCheckoutStage('basket');showDrawer(false);$('menu').scrollIntoView({behavior:reducedMotion()?'auto':'smooth'});});
 document.querySelectorAll('[data-checkout-step]').forEach(el=>el.addEventListener('click',()=>{const stage=el.dataset.checkoutStep;if(stage==='review'){advanceToReview();return;}setCheckoutStage(stage)}));
 $('fulfillment').addEventListener('change',()=>{$('orderArea').placeholder=$('fulfillment').value==='Pickup'?'Pickup instructions (optional)':'Street, barangay and city';window.DB_DELIVERY?.methodChanged()});
 document.addEventListener('click',handleDelegatedClick);
 $('openBasket').addEventListener('click',()=>showDrawer(true));$('mobileBasket').addEventListener('click',()=>showDrawer(true));$('closeBasket').addEventListener('click',()=>showDrawer(false));$('shade').addEventListener('click',()=>showDrawer(false));
 $('afterOrderTracking').addEventListener('click',()=>{showDrawer(false);openModal('trackingModal');$('trackingForm').requestSubmit()});$('openPaymentTracking').addEventListener('click',()=>{showDrawer(false);openModal('trackingModal')});
 $('giftExtra').addEventListener('change',refreshCart);$('orderDate').addEventListener('change',()=>{$('orderDate').setCustomValidity('');validateDate();});
 $('themeButton').addEventListener('click',()=>setTheme(!document.body.classList.contains('dark')));
 $('mobileMenu').addEventListener('click',()=>{const opened=$('navLinks').classList.toggle('open');$('mobileMenu').setAttribute('aria-expanded',String(opened));$('mobileMenu').innerHTML=icon(opened?'x':'menu')});
 $('openTracking').addEventListener('click',()=>{closeMenu();openModal('trackingModal')});$('footerTracking').addEventListener('click',()=>openModal('trackingModal'));
 $('productMinus').addEventListener('click',()=>{$('productQty').textContent=selectedQty=Math.max(1,selectedQty-1)});$('productPlus').addEventListener('click',()=>{$('productQty').textContent=selectedQty=Math.min(99,selectedQty+1)});
 $('toppingsCheck').addEventListener('change',()=>{const isLoaf=['loaf','loaf-top'].includes(selectedProduct?.id);$('productModalPrice').textContent=php(isLoaf?byId().loaf.price+($('toppingsCheck').checked?20:0):selectedProduct.price);if(isLoaf){$('productModalImg').src=$('toppingsCheck').checked?images.loafTopped:images.loaf}});
 $('modalAdd').addEventListener('click',()=>{if(selectedProduct){const loaf=['loaf','loaf-top'].includes(selectedProduct.id);add(loaf?'loaf':selectedProduct.id,loaf&&$('toppingsCheck').checked,selectedQty)}closeModal();showDrawer(true)});
 $('checkoutForm').addEventListener('submit',handleCheckout);$('trackingForm').addEventListener('submit',checkOrder);


 // QR payments are manual transfers only, shown after customers confirm bakery approval.
 const paymentSources={
   gcash:{label:'GCash',src:'assets/payment-gcash-qr.png',download:'assets/payment-gcash.png'},
   maya:{label:'Maya',src:'assets/payment-maya-qr.png',download:'assets/payment-maya.png'},
   maribank:{label:'MariBank',src:'assets/payment-maribank-qr.png',download:'assets/payment-maribank.png'}
 };
 let selectedPayment='gcash';
 $('dbPaymentConfirmed').addEventListener('change',()=>{
   const confirmed=$('dbPaymentConfirmed').checked;
   $('dbPaymentDetails').hidden=!confirmed;
   $('dbPaymentReportStatus').textContent=confirmed?'Please pay only the bakery-confirmed total, then report your transaction reference below.':'Wait for our SMS or email approving your order and final amount before paying.';
 });
 document.querySelectorAll('[data-paymethod]').forEach(button=>button.addEventListener('click',()=>{
   selectedPayment=button.dataset.paymethod;
   const selected=paymentSources[selectedPayment];
   document.querySelectorAll('[data-paymethod]').forEach(b=>{
     const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))
   });
   $('dbPaymentQr').src=selected.src;
   $('dbPaymentQr').alt=`${selected.label} recipient QR code provided by Dulce & Banana`;
   $('dbPayQrCard').dataset.provider=selectedPayment;
   $('dbQrMethodTitle').textContent=selected.label;
   $('dbDownloadQr').href=selected.download||selected.src;
   $('dbDownloadQr').download=`Dulce-and-Banana-${selected.label}-QR.png`;
 }));
 // Report transfers to the bakery backend only. Never infer payment success from a reference.
 let paymentCaptchaWidget=null;
 function enablePaymentCaptcha(){
   if(paymentCaptchaWidget!==null||!turnstilePublicSiteKey)return;
   let count=0;const timer=setInterval(()=>{
     count++;
     if(window.turnstile){try{paymentCaptchaWidget=turnstile.render('#paymentReportCaptcha',{sitekey:turnstilePublicSiteKey,theme:'auto'});clearInterval(timer)}catch{}}
     if(count>80)clearInterval(timer);
   },300);
 }
 $('dbPaymentConfirmed').addEventListener('change',()=>{if($('dbPaymentConfirmed').checked)enablePaymentCaptcha()});
 $('dbCopyPaymentReport').addEventListener('click',async()=>{
   const order=$('dbPayOrderRef').value.trim(),amount=Number($('dbPayAmount').value),reference=$('dbPayTransferRef').value.trim(),phone=$('trackingPhone').value.trim();
   const token=$('paymentReportCaptcha').querySelector('input[name="cf-turnstile-response"]')?.value||'';
   const status=$('dbPaymentReportStatus');
   if(!order||!phone||!Number.isFinite(amount)||amount<=0||reference.length<5){status.textContent='Enter the confirmed order reference, mobile number, amount, and transaction reference.';return}
   if(!serviceReady||!turnstilePublicSiteKey){status.textContent='Payment reporting has not been activated. The bakery must confirm the receiving account directly.';return}
   if(token.length<20){status.textContent='Please complete the security check before reporting a payment.';enablePaymentCaptcha();return}
   const button=$('dbCopyPaymentReport');button.disabled=true;status.textContent='Submitting the transfer reference for manual verification…';
   try{
     const result=await apiFetch('/functions/v1/report-transfer',{method:'POST',body:JSON.stringify({reference:order,phone,amount,method:selectedPayment,transactionReference:reference,turnstileToken:token})});
     if(result?.status!=='awaiting_verification')throw new Error('The server did not acknowledge the report.');
     status.textContent='Transfer report received. Status: awaiting verification. Your order is NOT marked paid until the bakery confirms the funds.';
   }catch(err){status.textContent='Transfer report was not confirmed: '+(err.message||'Try again later. Do not resend funds.')}
   finally{button.disabled=false;if(window.turnstile&&paymentCaptchaWidget!==null)try{turnstile.reset(paymentCaptchaWidget)}catch{}}
 });
 $('dbReportPaymentFB').href=FB_URL;
 $('footerPayments')?.addEventListener('click',()=>openModal('trackingModal'));

 document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(openDialog)closeModal();else if($('cartDrawer').classList.contains('open'))showDrawer(false);else closeMenu()}if(event.key!=='Tab')return;
 const active=openDialog||($('cartDrawer').classList.contains('open')?$('cartDrawer'):null);if(!active)return;const focusable=[...active.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),textarea,select')].filter(el=>!el.closest('[hidden]')&&el.getClientRects().length);if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}});
 if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target)}}),{threshold:.08});document.querySelectorAll('.reveal').forEach(el=>observer.observe(el))}else document.querySelectorAll('.reveal').forEach(el=>el.classList.add('visible'));
 loadBackend();
}
setup();


/* Keep the desktop basket within view without using an overlay over product buttons. */
(() => {
  let busy=false;
  const update=()=>{document.body.classList.toggle('nav-condensed',window.scrollY>80);busy=false};
  window.addEventListener('scroll',()=>{if(!busy){busy=true;requestAnimationFrame(update)}},{passive:true});
  document.addEventListener('DOMContentLoaded',update);
})();
