/* Authorized bakery dashboard. No placeholder customer records or fake sales. */
const $=id=>document.getElementById(id);
const cfg=window.DB_CONFIG||{};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const peso=n=>`₱${Number(n||0).toLocaleString('en-PH')}`;
const statuses=['pending_review','confirmed','preparing','ready','out_for_delivery','completed','rejected','cancelled'];
const paymentStatuses=['unpaid','awaiting_payment','paid','refunded'];
let supabase,orders=[],products=[],blocked=[],settings=null;
let messageTimer;
const notice=message=>{const box=$('flash');box.textContent=message;box.hidden=false;clearTimeout(messageTimer);messageTimer=setTimeout(()=>box.hidden=true,5200)};
function showState(name){for(const id of ['setupState','loginState','dashboard'])$(id).hidden=id!==name}
function showTab(name){document.querySelectorAll('.tab-content').forEach(el=>el.hidden=el.id!==`panel-${name}`);document.querySelectorAll('[data-tab]').forEach(el=>{const current=el.dataset.tab===name;el.classList.toggle('active',current);if(el.classList.contains('tab'))el.setAttribute('aria-current',current?'page':'false')})}
const showErr=(e,context='Operation')=>notice(`${context}: ${e.message||'Please try again.'}`);
function inputNode(tag,content){const n=document.createElement(tag);n.textContent=content;return n}
async function reload(){
 const results=await Promise.all([
 supabase.from('orders').select('*,order_items(*),payment_reports(*)').order('created_at',{ascending:false}).limit(150),
 supabase.from('products').select('*').order('sort_order',{ascending:true}),
 supabase.from('blocked_dates').select('*').order('day',{ascending:true}),
 supabase.from('bakery_settings').select('*').eq('id',1).single()
 ]);
 for(const result of results)if(result.error)throw result.error;
 [orders,products,blocked,settings]=results.map(r=>r.data);
 renderOverview();renderOrders();renderProducts();renderCalendar();renderSettings();
}
function renderOverview(){
 $('metricTotal').textContent=orders.length===150?'150+':String(orders.length);
 $('metricPending').textContent=orders.filter(o=>o.status==='pending_review').length;
 const today=new Date().toISOString().slice(0,10);
 $('metricUpcoming').textContent=orders.filter(o=>o.preferred_date>=today&&!['completed','cancelled','rejected'].includes(o.status)).length;
 $('metricSales').textContent=peso(orders.filter(o=>o.status==='completed'&&o.payment_status==='paid').reduce((n,o)=>n+o.subtotal+o.extras_total+(o.delivery_fee||0),0));
 $('ordersState').textContent=settings?.accepting_orders?'Online requests: ON':'Online requests: PAUSED';
 $('recentOrders').innerHTML=orders.length?orders.slice(0,5).map(row=>`<div class="blocked-row"><div><b>${esc(row.reference)}</b><small>${esc(row.customer_name)} · ${esc(row.preferred_date)}</small></div><span class="order-tag">${esc(row.status.replaceAll('_',' '))}</span></div>`).join(''):'<div class="empty">No online preorder requests yet.</div>';
}
function renderOrders(){
 const filter=$('statusFilter').value;const list=orders.filter(o=>filter==='all'||o.status===filter);
 $('ordersList').innerHTML=list.length?list.map(o=>{
  const total=o.subtotal+o.extras_total+(o.delivery_fee||0);
  const canPay=o.status==='confirmed'&&Number.isInteger(o.delivery_fee)&&o.payment_status!=='paid';
  const paid=o.payment_status==='paid';
  const paySection=o.paymongo_link_url&&CONFIG.paymentMode!=='manual-qr'?`<div class="paymongo-issued"><strong>PayMongo payment link</strong><a href="${esc(o.paymongo_link_url)}" rel="noopener noreferrer" target="_blank">${esc(o.paymongo_link_url)}</a><button class="tiny-btn" data-copy-link="${o.id}">Copy customer payment message</button></div>`:'';
  return `<article class="order-card" data-order="${o.id}">
  <div class="order-top"><div><strong>${esc(o.reference)} · ${esc(o.customer_name)}</strong><small>${esc(new Date(o.created_at).toLocaleString('en-PH'))}</small></div><span class="order-tag">${esc(o.status.replaceAll('_',' '))}</span></div>
  <div class="order-detail"><b>Mobile:</b> ${esc(o.phone)}${o.email?' · <b>Email:</b> '+esc(o.email):''}<br><b>Preferred date:</b> ${esc(o.preferred_date)} · <b>Method:</b> ${esc(o.fulfillment)}<br><b>Area/pickup:</b> ${esc(o.area)}${o.notes?'<br><b>Notes:</b> '+esc(o.notes):''}${o.gift?'<br><b>Gift note:</b> '+esc(o.gift_message||'Add ribbons and card'):''}</div>
  <div class="order-detail">${(o.payment_reports||[]).length?`<b>Unverified transfer reports:</b> ${(o.payment_reports||[]).map(r=>`${esc(r.method)} ${peso(r.amount)} · ${esc(r.transfer_reference)} · ${esc(r.review_status)}`).join('; ')}`:'No transfer reports submitted'}</div>
  <ul class="order-lines">${(o.order_items||[]).map(i=>`<li>${i.quantity} × ${esc(i.product_name)}${i.toppings?' + toppings':''} · ${peso(i.line_total)}</li>`).join('')}</ul>
  <div class="order-detail"><b>Products:</b> ${peso(o.subtotal)} · <b>Gift:</b> ${peso(o.extras_total)} · <b>Live Lalamove estimate (indicative):</b> ${o.delivery_estimate_php==null?'Not obtained':peso(Number(o.delivery_estimate_php))} · <b>Confirmed delivery:</b> ${o.delivery_fee===null?'Not confirmed':peso(o.delivery_fee)} · <b>Final total:</b> ${o.delivery_fee===null?'Pending review':peso(total)}</div>
  <div class="order-edit"><label>Order status<select data-order-status="${o.id}">${statuses.map(st=>`<option value="${st}" ${st===o.status?'selected':''}>${esc(st.replaceAll('_',' '))}</option>`).join('')}</select></label><label>Delivery fee (₱)<input type="number" data-delivery-fee="${o.id}" min="0" max="20000" step="1" placeholder="Quote before payment" value="${o.delivery_fee===null?'':Number(o.delivery_fee)}" /></label><div class="payment-summary"><small>Payment status</small><strong>${esc(o.payment_status.replaceAll('_',' '))}${o.payment_method!=='unselected'?' · '+esc(o.payment_method.replace('_',' ')):''}</strong></div><button type="button" class="btn btn-secondary" data-save-order="${o.id}">Save confirmation &amp; fee</button></div>
  <div class="payment-actions"><button type="button" class="btn" style="display:none" data-create-link="${o.id}" ${!canPay||!!o.paymongo_link_id?'disabled':''}>${o.paymongo_link_id?'PayMongo link created':'Create PayMongo payment link'}</button><button type="button" class="btn btn-secondary" style="display:none" data-verify-payment="${o.id}" ${!o.paymongo_link_id||paid?'disabled':''}>Verify via PayMongo</button><button type="button" class="btn btn-secondary" data-manual-verified="${o.id}" ${paid?'disabled':''}>Mark verified manual QR</button></div>
  <p class="payment-action-note">Confirm the final courier cost before accepting payment. No transfer screenshot counts as verification. ${o.payment_status==='paid'?'Funds recorded as verified.':'Do not prepare the order as paid until verified.'}</p>${paySection}
  </article>`;
 }).join(''):'<div class="empty">No orders match this filter.</div>';
}
function renderProducts(){ $('productsList').innerHTML=products.map(p=>`<div class="product-row" data-product="${esc(p.id)}"><div><b>${esc(p.name)}</b><small>${esc(p.description||'')}</small></div><label>Price (₱)<input type="number" min="0" max="200000" step="1" value="${Number(p.price)}" data-price="${esc(p.id)}" required/></label><label class="checkbox-line">Available <input type="checkbox" data-active="${esc(p.id)}" ${p.active?'checked':''}/></label></div>`).join('')}
function renderCalendar(){const today=new Date().toISOString().slice(0,10);$('blockedList').innerHTML=blocked.filter(x=>x.day>=today).map(x=>`<div class="blocked-row"><div><b>${esc(x.day)}</b><small>${esc(x.reason||'Unavailable')}</small></div><button type="button" class="tiny-btn" data-unblock="${esc(x.day)}">Unblock</button></div>`).join('')||'<p class="muted">No upcoming dates blocked.</p>'}
function renderSettings(){
 if(!settings)return;$('acceptingOrders').checked=settings.accepting_orders;$('noticeHours').value=settings.min_notice_hours;$('dailyLimit').value=settings.daily_limit;
 const week=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];$('weekdays').innerHTML=week.map((name,i)=>`<label>${name}<input type="checkbox" data-weekday="${i}" ${(settings.allowed_weekdays||[]).includes(i)?'checked':''}/></label>`).join('');
}
async function saveOrder(id){
 const status=document.querySelector(`[data-order-status="${id}"]`)?.value;
 const amount=document.querySelector(`[data-delivery-fee="${id}"]`)?.value.trim();
 const delivery_fee=amount===''?null:Number(amount);
 if(delivery_fee!==null&&(!Number.isInteger(delivery_fee)||delivery_fee<0||delivery_fee>20000))throw new Error('Enter a delivery fee between ₱0 and ₱20,000.');
 const prior=orders.find(o=>o.id===id);
 if(prior?.paymongo_link_id&&['cancelled','rejected'].includes(status)&&!['cancelled','rejected'].includes(prior.status))throw new Error('Archive the active PayMongo link in the PayMongo merchant dashboard before rejecting or cancelling the order.');
 if(prior?.paymongo_link_id&&prior?.delivery_fee!==delivery_fee)throw new Error('A PayMongo link was already issued for the original total. Do not change the amount without refunding/archiving that link first.');
 const {error}=await supabase.from('orders').update({status,delivery_fee,updated_at:new Date().toISOString()}).eq('id',id);
 if(error)throw error;await reload();notice('Order confirmation and final fee saved. Notify the customer of their approved date and total.');
}
async function callPaymentFunction(action,id){
 const {data,error}=await supabase.functions.invoke('manage-payment-link',{body:{action,order_id:id}});
 if(error)throw new Error(data?.error||error.message||'The secure payment service did not respond.');
 if(data?.error)throw new Error(data.error);
 return data;
}
async function createPaymentLink(id){
 if(!confirm('Create a payment link for the saved, confirmed order and final total? No funds will be collected until the customer uses the link.'))return;
 const data=await callPaymentFunction('create',id);
 await reload();notice(data?.message||'Payment link ready. Copy the customer message or ask the customer to track their order.');
}
async function verifyPaymongo(id){
 const data=await callPaymentFunction('verify',id);
 await reload();notice(data?.paid?'PayMongo confirmed the payment.':'No verified, matching paid transaction found yet. Do not mark this order paid.');
}
async function verifyManual(id){
 const o=orders.find(row=>row.id===id);if(!o)throw new Error('Order not found.');
 if(!['confirmed','preparing','ready'].includes(o.status))throw new Error('Confirm the order before recording manual payment.');
 if(o.delivery_fee===null)throw new Error('Confirm final delivery fee first (enter 0 for pickup).');
 if(o.paymongo_link_id)throw new Error('This order has an active PayMongo link. Verify through PayMongo or resolve the link first to prevent double payment.');
 if(!confirm(`Have you PERSONALLY checked receipt of ${peso(o.subtotal+o.extras_total+o.delivery_fee)} in the authorized GCash, Maya or MariBank account? Do not rely on screenshots or transaction IDs alone.`))return;
 const {data,error}=await supabase.from('orders').update({payment_status:'paid',payment_method:'manual_qr',payment_verified_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id).in('payment_status',['unpaid','awaiting_payment']).select('id').maybeSingle();
 if(error)throw error; if(!data)throw new Error('Payment was already verified or is not eligible for manual verification.'); await reload();notice('Manual transfer marked verified by bakery admin.');
}
async function copyCustomerLink(id){
 const o=orders.find(row=>row.id===id);if(!o?.paymongo_link_url)return;
 const text=`Dulce & Banana — Order ${o.reference}\nYour preorder is confirmed for ${o.preferred_date}.\nFinal total: ${peso(o.subtotal+o.extras_total+(o.delivery_fee||0))}.\nPay securely through your unique PayMongo link: ${o.paymongo_link_url}\nWe will verify successful payment on our end. Thank you!`;
 await navigator.clipboard.writeText(text);notice('Customer payment message copied. Send it using your approved customer communication channel.');
}
async function saveSettings(e){e.preventDefault();const days=[...document.querySelectorAll('[data-weekday]:checked')].map(x=>Number(x.dataset.weekday));if(!days.length){notice('Select at least one baking day.');return}
 const payload={accepting_orders:$('acceptingOrders').checked,min_notice_hours:Number($('noticeHours').value),daily_limit:Number($('dailyLimit').value),allowed_weekdays:days,updated_at:new Date().toISOString()};
 const {error}=await supabase.from('bakery_settings').update(payload).eq('id',1);if(error)throw error;await reload();notice('Baking availability saved. Online changes apply immediately.')}
async function saveProducts(){for(const p of products){const price=Number(document.querySelector(`[data-price="${p.id}"]`).value),active=document.querySelector(`[data-active="${p.id}"]`).checked;if(!Number.isInteger(price)||price<0){notice('Use valid whole-peso product prices.');return}const {error}=await supabase.from('products').update({price,active,updated_at:new Date().toISOString()}).eq('id',p.id);if(error)throw error}await reload();notice('Product prices and availability saved.')}
async function addBlock(e){e.preventDefault();const day=$('blockDay').value;if(!day)return;const {error}=await supabase.from('blocked_dates').upsert({day,reason:$('blockReason').value.trim()});if(error)throw error;$('blockDateForm').reset();await reload();notice('Baking date blocked.')}
async function start(){
 if(!cfg.supabaseUrl||!cfg.supabaseAnonKey){showState('setupState');return}
 try{
  const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
  supabase=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}});
  const {data}=await supabase.auth.getSession();if(data.session)await onAuthenticated();else showState('loginState');
  supabase.auth.onAuthStateChange((_event,session)=>{if(!session){showState('loginState');$('signOut').hidden=true}});
 }catch(e){showState('setupState');showErr(e,'Could not load secure login')}
}
async function onAuthenticated(){const {data:allowed,error}=await supabase.rpc('is_bakery_admin');if(error||!allowed){await supabase.auth.signOut();showState('loginState');$('loginStatus').textContent='This account is not authorized to manage the bakery.';return}
 const {data:{user}}=await supabase.auth.getUser();$('userEmail').textContent=user?.email||'';$('signOut').hidden=false;showState('dashboard');try{await reload()}catch(e){showErr(e,'Could not load dashboard')}}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginStatus').textContent='Signing in…';const {error}=await supabase.auth.signInWithPassword({email:$('adminEmail').value.trim(),password:$('adminPassword').value});if(error){$('loginStatus').textContent='Sign-in failed. Check your details.';return}$('loginStatus').textContent='';await onAuthenticated()});
$('signOut').addEventListener('click',async()=>{await supabase.auth.signOut();showState('loginState')});
document.addEventListener('click',async e=>{const tab=e.target.closest('[data-tab]');if(tab){showTab(tab.dataset.tab);return}const order=e.target.closest('[data-save-order]');if(order){try{await saveOrder(order.dataset.saveOrder)}catch(err){showErr(err,'Update order')}return}
 const create=e.target.closest('[data-create-link]');if(create){try{await createPaymentLink(create.dataset.createLink)}catch(err){showErr(err,'PayMongo link')}return}
 const verify=e.target.closest('[data-verify-payment]');if(verify){try{await verifyPaymongo(verify.dataset.verifyPayment)}catch(err){showErr(err,'PayMongo verification')}return}
 const manual=e.target.closest('[data-manual-verified]');if(manual){try{await verifyManual(manual.dataset.manualVerified)}catch(err){showErr(err,'Manual verification')}return}
 const copy=e.target.closest('[data-copy-link]');if(copy){try{await copyCustomerLink(copy.dataset.copyLink)}catch(err){showErr(err,'Copy link')}return}const unblock=e.target.closest('[data-unblock]');if(unblock){if(!confirm(`Reopen ${unblock.dataset.unblock} for preorders?`))return;const {error}=await supabase.from('blocked_dates').delete().eq('day',unblock.dataset.unblock);if(error)showErr(error,'Unblock date');else{await reload();notice('Date reopened.')}return}});
$('statusFilter').addEventListener('change',renderOrders);$('refreshOrders').addEventListener('click',async()=>{try{await reload();notice('Orders refreshed.')}catch(e){showErr(e,'Refresh')}});
$('settingsForm').addEventListener('submit',async e=>{try{await saveSettings(e)}catch(err){showErr(err,'Save settings')}});
$('blockDateForm').addEventListener('submit',async e=>{try{await addBlock(e)}catch(err){showErr(err,'Block date')}});
$('saveProducts').addEventListener('click',async()=>{try{await saveProducts()}catch(err){showErr(err,'Save catalogue')}});
start();
